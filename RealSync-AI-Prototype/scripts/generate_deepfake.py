#!/usr/bin/env python3
"""
Generate a deepfake video by swapping your face onto a target video.

Uses InsightFace's inswapper_128 model (same engine as facefusion/roop).
Produces blending artifacts that the EfficientNet-B4 SBI model is trained to detect.

Usage:
    python scripts/generate_deepfake.py \
        --source data/self_faces/face_full.jpg \
        --target data/target_videos/target.mp4 \
        --output data/generated_deepfakes/deepfake.mp4

    # Without --target, downloads a sample talking-head video:
    python scripts/generate_deepfake.py \
        --source data/self_faces/face_full.jpg \
        --output data/generated_deepfakes/deepfake.mp4

    # Add Zoom-like compression artifacts:
    python scripts/generate_deepfake.py \
        --source data/self_faces/face_full.jpg \
        --output data/generated_deepfakes/deepfake.mp4 \
        --compress
"""
import argparse
import os
import sys
import time
import urllib.request

import cv2
import numpy as np

# InsightFace for face analysis + swap
try:
    import insightface
    from insightface.app import FaceAnalysis
except ImportError:
    print("Error: insightface not installed. Run: pip install insightface onnxruntime")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "data")
MODELS_CACHE = os.path.join(os.path.expanduser("~"), ".insightface", "models")
INSWAPPER_URL = "https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx"
INSWAPPER_PATH = os.path.join(MODELS_CACHE, "inswapper_128.onnx")

# Sample target video (royalty-free talking head from Pexels)
SAMPLE_VIDEO_URL = "https://videos.pexels.com/video-files/4625518/4625518-sd_640_360_30fps.mp4"
SAMPLE_VIDEO_PATH = os.path.join(DATA_DIR, "target_videos", "sample_talking_head.mp4")


def download_file(url: str, dest: str, description: str = "file"):
    """Download a file with progress indication."""
    if os.path.isfile(dest):
        print(f"[generate] {description} already exists: {dest}")
        return True

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"[generate] Downloading {description}...")
    print(f"  URL: {url}")
    print(f"  Dest: {dest}")

    try:
        urllib.request.urlretrieve(url, dest)
        size_mb = os.path.getsize(dest) / (1024 * 1024)
        print(f"[generate] Downloaded {description} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"[generate] Download failed: {e}")
        if os.path.exists(dest):
            os.remove(dest)
        return False


def download_inswapper_model():
    """Download the inswapper_128 face-swap ONNX model if needed."""
    if os.path.isfile(INSWAPPER_PATH):
        return INSWAPPER_PATH

    print("[generate] inswapper_128.onnx model not found. Downloading (~250MB)...")
    if download_file(INSWAPPER_URL, INSWAPPER_PATH, "inswapper_128.onnx"):
        return INSWAPPER_PATH

    print("[generate] ERROR: Could not download inswapper model.")
    print(f"  Please manually download from: {INSWAPPER_URL}")
    print(f"  And place at: {INSWAPPER_PATH}")
    return None


def setup_face_analyzer():
    """Initialize InsightFace face analyzer."""
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app


def swap_face(frame: np.ndarray, source_face, swapper, analyzer) -> np.ndarray:
    """Swap the source face onto all detected faces in the frame."""
    faces = analyzer.get(frame)
    if not faces:
        return frame

    result = frame.copy()
    for face in faces:
        result = swapper.get(result, face, source_face, paste_back=True)
    return result


def apply_compression(frame: np.ndarray, quality: int = 65) -> np.ndarray:
    """Apply JPEG compression to simulate Zoom video quality."""
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    _, encoded = cv2.imencode(".jpg", frame, encode_params)
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)


def main():
    parser = argparse.ArgumentParser(description="Generate a face-swap deepfake video")
    parser.add_argument("--source", required=True, help="Path to your face image")
    parser.add_argument("--target", default=None, help="Path to target video (downloads sample if omitted)")
    parser.add_argument("--output", required=True, help="Output deepfake video path")
    parser.add_argument("--compress", action="store_true", help="Apply JPEG compression to simulate Zoom quality")
    parser.add_argument("--max-frames", type=int, default=150, help="Max frames to process (default: 150)")
    parser.add_argument("--fps", type=int, default=0, help="Output FPS (0 = same as source)")
    args = parser.parse_args()

    # Validate source image
    if not os.path.isfile(args.source):
        print(f"Error: Source image not found: {args.source}")
        sys.exit(1)

    source_img = cv2.imread(args.source)
    if source_img is None:
        print(f"Error: Could not read source image: {args.source}")
        sys.exit(1)

    # Get or download target video
    target_path = args.target
    if target_path is None:
        print("[generate] No target video specified, downloading sample...")
        if not download_file(SAMPLE_VIDEO_URL, SAMPLE_VIDEO_PATH, "sample talking-head video"):
            print("Error: Could not get target video. Please provide one with --target")
            sys.exit(1)
        target_path = SAMPLE_VIDEO_PATH

    if not os.path.isfile(target_path):
        print(f"Error: Target video not found: {target_path}")
        sys.exit(1)

    # Download inswapper model
    model_path = download_inswapper_model()
    if model_path is None:
        sys.exit(1)

    print("[generate] Initializing face analyzer (first run downloads ~300MB of models)...")
    analyzer = setup_face_analyzer()

    print("[generate] Loading inswapper model...")
    swapper = insightface.model_zoo.get_model(model_path, providers=["CPUExecutionProvider"])

    # Detect face in source image
    source_faces = analyzer.get(source_img)
    if not source_faces:
        print("Error: No face detected in source image!")
        print("  Make sure the image has a clear, well-lit face")
        sys.exit(1)

    source_face = source_faces[0]
    print(f"[generate] Source face detected (age: {source_face.age}, gender: {'M' if source_face.gender == 1 else 'F'})")

    # Open target video
    cap = cv2.VideoCapture(target_path)
    if not cap.isOpened():
        print(f"Error: Could not open target video: {target_path}")
        sys.exit(1)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    out_fps = args.fps if args.fps > 0 else int(src_fps)
    frames_to_process = min(total_frames, args.max_frames)

    print(f"[generate] Target video: {width}x{height} @ {src_fps:.1f}fps, {total_frames} frames")
    print(f"[generate] Processing {frames_to_process} frames at {out_fps} fps output")
    print(f"[generate] Estimated time: {frames_to_process * 2}-{frames_to_process * 5} seconds (CPU)")

    # Setup output
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(args.output, fourcc, out_fps, (width, height))

    # Process frames
    start_time = time.time()
    processed = 0
    swapped = 0

    for i in range(frames_to_process):
        ret, frame = cap.read()
        if not ret:
            break

        result = swap_face(frame, source_face, swapper, analyzer)

        if args.compress:
            result = apply_compression(result)

        writer.write(result)
        processed += 1

        # Check if face was actually swapped (compare with original)
        if not np.array_equal(result, frame):
            swapped += 1

        # Progress update every 10 frames
        if (i + 1) % 10 == 0:
            elapsed = time.time() - start_time
            fps_rate = processed / elapsed if elapsed > 0 else 0
            remaining = (frames_to_process - processed) / fps_rate if fps_rate > 0 else 0
            print(f"  Frame {processed}/{frames_to_process} ({fps_rate:.1f} fps, ~{remaining:.0f}s remaining)")

    cap.release()
    writer.release()

    elapsed = time.time() - start_time
    print(f"\n[generate] Done!")
    print(f"  Frames processed: {processed}")
    print(f"  Faces swapped: {swapped}/{processed}")
    print(f"  Time: {elapsed:.1f}s ({processed / elapsed:.1f} fps)")
    print(f"  Output: {args.output}")

    if swapped == 0:
        print("\n  WARNING: No faces were swapped! The target video may not contain detectable faces.")
        print("  Try a different target video with clear, front-facing faces.")


if __name__ == "__main__":
    main()
