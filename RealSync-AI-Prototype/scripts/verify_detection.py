#!/usr/bin/env python3
"""
Verify that the EfficientNet-B4 SBI model detects a generated deepfake video.

Extracts frames, runs face detection + deepfake prediction, and prints a report
showing per-frame scores and risk distribution.

Usage:
    python scripts/verify_detection.py --video data/generated_deepfakes/deepfake.mp4

    # Compare deepfake vs real:
    python scripts/verify_detection.py \
        --video data/generated_deepfakes/deepfake.mp4 \
        --real data/target_videos/target.mp4

    # Use raw scores (bypass Zoom calibration):
    DISABLE_ZOOM_CALIBRATION=true python scripts/verify_detection.py --video deepfake.mp4
"""
import argparse
import os
import sys

import cv2
import numpy as np

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from serve.deepfake_model import predict_deepfake, get_deepfake_model
from serve.config import (
    DEEPFAKE_AUTH_THRESHOLD_LOW_RISK,
    DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK,
    DISABLE_ZOOM_CALIBRATION,
)


def detect_faces_simple(img_bgr: np.ndarray):
    """Lightweight face detection using MediaPipe (standalone, no server needed)."""
    import mediapipe as mp

    model_path = os.path.join(
        os.path.dirname(__file__), "..", "src", "models", "blaze_face_short_range.tflite"
    )

    if not os.path.isfile(model_path):
        # Fallback: use the whole image as a single face
        return [img_bgr]

    options = mp.tasks.vision.FaceDetectorOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
        min_detection_confidence=0.4,
    )
    detector = mp.tasks.vision.FaceDetector.create_from_options(options)

    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    results = detector.detect(mp_image)
    detector.close()

    if not results.detections:
        return []

    h, w = img_bgr.shape[:2]
    crops = []
    for det in results.detections:
        box = det.bounding_box
        pad = 0.3
        pw, ph = int(box.width * pad), int(box.height * pad)
        x1 = max(0, box.origin_x - pw)
        y1 = max(0, box.origin_y - ph)
        x2 = min(w, box.origin_x + box.width + pw)
        y2 = min(h, box.origin_y + box.height + ph)
        crop = img_bgr[y1:y2, x1:x2]
        if crop.size > 0 and crop.shape[0] >= 20 and crop.shape[1] >= 20:
            crops.append(crop)

    return crops


def analyze_video(video_path: str, sample_every: int = 3, max_frames: int = 100):
    """Analyze a video and return per-frame deepfake scores."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video: {video_path}")
        return []

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    results = []
    frame_idx = 0

    while len(results) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_every == 0:
            faces = detect_faces_simple(frame)
            for face_crop in faces:
                result = predict_deepfake(face_crop)
                if result.get("authenticityScore") is not None:
                    results.append({
                        "frame": frame_idx,
                        "score": result["authenticityScore"],
                        "risk": result["riskLevel"],
                    })

        frame_idx += 1

    cap.release()
    return results


def print_report(label: str, results: list):
    """Print a detection report for a video."""
    if not results:
        print(f"\n  {label}: No faces detected in video!")
        return

    scores = [r["score"] for r in results]
    high = sum(1 for r in results if r["risk"] == "high")
    medium = sum(1 for r in results if r["risk"] == "medium")
    low = sum(1 for r in results if r["risk"] == "low")
    total = len(results)

    print(f"\n  === {label} ===")
    print(f"  Frames analyzed: {total}")
    print(f"  Scores: mean={np.mean(scores):.4f}, min={np.min(scores):.4f}, max={np.max(scores):.4f}, std={np.std(scores):.4f}")
    print(f"  Risk distribution:")
    print(f"    High risk  (<{DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK}): {high:3d}/{total} ({100*high/total:.1f}%)")
    print(f"    Medium risk:              {medium:3d}/{total} ({100*medium/total:.1f}%)")
    print(f"    Low risk   (>{DEEPFAKE_AUTH_THRESHOLD_LOW_RISK}): {low:3d}/{total} ({100*low/total:.1f}%)")

    if high + medium > total * 0.5:
        print(f"  VERDICT: DEEPFAKE DETECTED ({100*(high+medium)/total:.0f}% of frames flagged)")
    elif high + medium > 0:
        print(f"  VERDICT: SUSPICIOUS ({100*(high+medium)/total:.0f}% of frames flagged)")
    else:
        print(f"  VERDICT: APPEARS REAL (no frames flagged)")


def main():
    parser = argparse.ArgumentParser(description="Verify deepfake detection on generated video")
    parser.add_argument("--video", required=True, help="Path to deepfake video to test")
    parser.add_argument("--real", default=None, help="Path to a real (non-deepfake) video for comparison")
    parser.add_argument("--sample-every", type=int, default=3, help="Analyze every Nth frame (default: 3)")
    parser.add_argument("--max-frames", type=int, default=100, help="Max frames to analyze (default: 100)")
    args = parser.parse_args()

    # Ensure model loads
    print("[verify] Loading EfficientNet-B4 SBI model...")
    model = get_deepfake_model()
    if model is None:
        print("Error: Could not load deepfake detection model!")
        print("  Ensure weights exist at: src/models/efficientnet_b4_deepfake.pth")
        sys.exit(1)

    calibration_mode = "DISABLED (raw scores)" if DISABLE_ZOOM_CALIBRATION else "ENABLED (Zoom sigmoid)"
    print(f"[verify] Zoom calibration: {calibration_mode}")
    print(f"[verify] Thresholds: low_risk>{DEEPFAKE_AUTH_THRESHOLD_LOW_RISK}, high_risk<{DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK}")

    # Analyze deepfake video
    print(f"\n[verify] Analyzing deepfake video: {args.video}")
    deepfake_results = analyze_video(args.video, args.sample_every, args.max_frames)
    print_report("DEEPFAKE VIDEO", deepfake_results)

    # Optionally analyze real video for comparison
    if args.real:
        print(f"\n[verify] Analyzing real video: {args.real}")
        real_results = analyze_video(args.real, args.sample_every, args.max_frames)
        print_report("REAL VIDEO (comparison)", real_results)

        if deepfake_results and real_results:
            df_mean = np.mean([r["score"] for r in deepfake_results])
            real_mean = np.mean([r["score"] for r in real_results])
            separation = real_mean - df_mean
            print(f"\n  === SEPARATION ANALYSIS ===")
            print(f"  Real mean score:     {real_mean:.4f}")
            print(f"  Deepfake mean score: {df_mean:.4f}")
            print(f"  Score separation:    {separation:.4f}")
            if separation > 0.2:
                print(f"  Model discrimination: GOOD (clear separation)")
            elif separation > 0.1:
                print(f"  Model discrimination: FAIR (some separation)")
            else:
                print(f"  Model discrimination: POOR (insufficient separation)")

    print("\n[verify] Done!")


if __name__ == "__main__":
    main()
