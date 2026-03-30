#!/usr/bin/env python3
"""
Prepare a face source image for deepfake generation.

Validates that the image contains a detectable face, crops it,
and saves a clean version to data/self_faces/face.jpg.

Usage:
    python scripts/prepare_face.py --source path/to/your_selfie.jpg
"""
import argparse
import os
import sys

import cv2
import numpy as np

# Add project root to path so we can import serve modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from serve.config import FACE_CONFIDENCE_THRESHOLD, FACE_PADDING_PERCENT

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "self_faces")


def detect_face_mediapipe(img_bgr: np.ndarray):
    """Detect the largest face in an image using MediaPipe."""
    import mediapipe as mp

    model_path = os.path.join(
        os.path.dirname(__file__), "..", "src", "models", "blaze_face_short_range.tflite"
    )

    if not os.path.isfile(model_path):
        print(f"[prepare] MediaPipe model not found at {model_path}")
        print("[prepare] Falling back to full-image crop (no face detection)")
        return None

    options = mp.tasks.vision.FaceDetectorOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
        min_detection_confidence=FACE_CONFIDENCE_THRESHOLD,
    )
    detector = mp.tasks.vision.FaceDetector.create_from_options(options)

    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    results = detector.detect(mp_image)
    detector.close()

    if not results.detections:
        return None

    # Pick highest-confidence detection
    best = max(results.detections, key=lambda d: d.categories[0].score if d.categories else 0)
    confidence = best.categories[0].score if best.categories else 0.0
    box = best.bounding_box
    return {
        "x": box.origin_x,
        "y": box.origin_y,
        "w": box.width,
        "h": box.height,
        "confidence": confidence,
    }


def crop_face(img: np.ndarray, det: dict, padding: float = FACE_PADDING_PERCENT) -> np.ndarray:
    """Crop face with padding from the image."""
    h, w = img.shape[:2]
    pad_w = int(det["w"] * padding)
    pad_h = int(det["h"] * padding)
    x1 = max(0, det["x"] - pad_w)
    y1 = max(0, det["y"] - pad_h)
    x2 = min(w, det["x"] + det["w"] + pad_w)
    y2 = min(h, det["y"] + det["h"] + pad_h)
    return img[y1:y2, x1:x2]


def main():
    parser = argparse.ArgumentParser(description="Prepare face source image for deepfake generation")
    parser.add_argument("--source", required=True, help="Path to your face photo (JPG/PNG)")
    parser.add_argument("--output", default=None, help="Output path (default: data/self_faces/face.jpg)")
    args = parser.parse_args()

    if not os.path.isfile(args.source):
        print(f"Error: Source image not found: {args.source}")
        sys.exit(1)

    img = cv2.imread(args.source)
    if img is None:
        print(f"Error: Could not read image: {args.source}")
        sys.exit(1)

    print(f"[prepare] Loaded image: {args.source} ({img.shape[1]}x{img.shape[0]})")

    det = detect_face_mediapipe(img)
    if det is None:
        print("[prepare] WARNING: No face detected! Using full image as fallback.")
        face_crop = img
    else:
        print(f"[prepare] Face detected: bbox=({det['x']}, {det['y']}, {det['w']}, {det['h']}), confidence={det['confidence']:.4f}")
        face_crop = crop_face(img, det)

    # Save both cropped and original
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = args.output or os.path.join(OUTPUT_DIR, "face.jpg")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Save the full original image (facefusion needs the full image, not just the crop)
    full_path = os.path.join(OUTPUT_DIR, "face_full.jpg")
    cv2.imwrite(full_path, img)
    print(f"[prepare] Saved full image: {full_path}")

    # Save the cropped face for reference
    cv2.imwrite(output_path, face_crop)
    print(f"[prepare] Saved face crop: {output_path} ({face_crop.shape[1]}x{face_crop.shape[0]})")
    print("[prepare] Done! Use the full image (face_full.jpg) as --source for generate_deepfake.py")


if __name__ == "__main__":
    main()
