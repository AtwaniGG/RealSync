#!/usr/bin/env python3
"""
Create a simple deepfake video using SBI-style self-blending on your own photos.

This replicates the exact augmentation technique used to TRAIN the EfficientNet-B4
SBI model (see training/finetune_deepfake_head.py:create_self_blend), so the model
is guaranteed to recognize these artifacts.

No extra models or downloads needed — just OpenCV + numpy.

Usage:
    python scripts/make_simple_deepfake.py \
        --photos "/path/to/your/photos/" \
        --output data/generated_deepfakes/deepfake_simple.mp4

    # Single photo mode:
    python scripts/make_simple_deepfake.py \
        --photos "/path/to/selfie.jpg" \
        --output data/generated_deepfakes/deepfake_simple.mp4
"""
import argparse
import glob
import io
import os
import random
import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter


def create_self_blend(image_np_bgr: np.ndarray) -> np.ndarray:
    """
    Apply SBI-style self-blending to create a detectable deepfake frame.

    Mirrors the exact technique from training/finetune_deepfake_head.py:create_self_blend:
    1. Color jitter on a copy of the face
    2. Gaussian blur (deepfake hallmark)
    3. JPEG compression artifacts
    4. Sub-pixel geometric shift
    5. Alpha-blend via elliptical mask with soft edges
    """
    h, w = image_np_bgr.shape[:2]
    img_rgb = cv2.cvtColor(image_np_bgr, cv2.COLOR_BGR2RGB).astype(np.float32)

    # Strong color jitter (range 0.65-1.35, matching training)
    jitter = np.random.uniform(0.65, 1.35, size=(1, 1, 3)).astype(np.float32)
    aug = np.clip(img_rgb * jitter, 0, 255).astype(np.uint8)

    # Gaussian blur (radius 2-5, matching training)
    aug_pil = Image.fromarray(aug)
    radius = random.choice([2, 3, 4, 5])
    aug_pil = aug_pil.filter(ImageFilter.GaussianBlur(radius=radius))

    # JPEG compression artifacts (quality 15-40, matching training)
    buf = io.BytesIO()
    quality = random.randint(15, 40)
    aug_pil.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    aug_pil = Image.open(buf).copy()

    aug = np.array(aug_pil).astype(np.float32)

    # Sub-pixel geometric shift (matching training)
    shift_x = random.randint(-3, 3)
    shift_y = random.randint(-3, 3)
    aug = np.roll(aug, shift_x, axis=1)
    aug = np.roll(aug, shift_y, axis=0)

    # Elliptical blend mask (matching training)
    mask = np.zeros((h, w), dtype=np.float32)
    cx = w // 2 + random.randint(-w // 8, w // 8)
    cy = h // 2 + random.randint(-h // 8, h // 8)
    rx = random.randint(w // 4, w // 3)
    ry = random.randint(h // 4, h // 3)
    y, x = np.ogrid[:h, :w]
    ellipse = ((x - cx) ** 2 / max(rx ** 2, 1)) + ((y - cy) ** 2 / max(ry ** 2, 1))
    mask[ellipse <= 1.0] = 1.0

    # Gaussian-smooth mask edges (matching training)
    mask_pil = Image.fromarray((mask * 255).astype(np.uint8))
    mask_pil = mask_pil.filter(ImageFilter.GaussianBlur(radius=max(w // 30, 2)))
    mask = np.array(mask_pil).astype(np.float32) / 255.0

    # Blend
    mask_3d = mask[:, :, np.newaxis]
    blended = img_rgb * (1 - mask_3d) + aug * mask_3d
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    return cv2.cvtColor(blended, cv2.COLOR_RGB2BGR)


def load_photos(path: str) -> list:
    """Load photos from a directory or a single file."""
    if os.path.isfile(path):
        img = cv2.imread(path)
        if img is None:
            print(f"Error: Could not read image: {path}")
            sys.exit(1)
        return [img]

    if os.path.isdir(path):
        patterns = ["*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"]
        files = []
        for p in patterns:
            files.extend(glob.glob(os.path.join(path, p)))
        files = sorted(set(files))

        if not files:
            print(f"Error: No image files found in {path}")
            sys.exit(1)

        imgs = []
        for f in files:
            img = cv2.imread(f)
            if img is not None:
                imgs.append(img)
                print(f"  Loaded: {os.path.basename(f)} ({img.shape[1]}x{img.shape[0]})")
        return imgs

    print(f"Error: Path not found: {path}")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Create SBI-style deepfake video from your photos")
    parser.add_argument("--photos", required=True, help="Path to photo(s) — directory or single file")
    parser.add_argument("--output", required=True, help="Output video path")
    parser.add_argument("--fps", type=int, default=15, help="Output FPS (default: 15)")
    parser.add_argument("--duration", type=float, default=10.0, help="Video duration in seconds (default: 10)")
    parser.add_argument("--size", type=int, default=640, help="Output width in pixels (default: 640)")
    args = parser.parse_args()

    print("[deepfake-gen] Loading photos...")
    photos = load_photos(args.photos)
    print(f"[deepfake-gen] Loaded {len(photos)} photo(s)")

    # Resize all to same dimensions
    target_w = args.size
    resized = []
    for img in photos:
        h, w = img.shape[:2]
        scale = target_w / w
        new_h = int(h * scale)
        resized.append(cv2.resize(img, (target_w, new_h)))

    # Use the first photo's height as reference
    target_h = resized[0].shape[0]
    resized = [cv2.resize(img, (target_w, target_h)) for img in resized]

    total_frames = int(args.fps * args.duration)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(args.output, fourcc, args.fps, (target_w, target_h))

    # Also create a "real" (unmodified) version for comparison
    real_output = args.output.replace(".mp4", "_real.mp4")
    writer_real = cv2.VideoWriter(real_output, fourcc, args.fps, (target_w, target_h))

    print(f"[deepfake-gen] Generating {total_frames} frames ({args.duration}s @ {args.fps}fps)...")

    for i in range(total_frames):
        # Cycle through photos, with smooth blending transitions
        photo_idx = i % len(resized)
        base_frame = resized[photo_idx].copy()

        # Write unmodified frame to "real" video
        writer_real.write(base_frame)

        # Apply SBI self-blending to create the "fake" frame
        fake_frame = create_self_blend(base_frame)
        writer.write(fake_frame)

        if (i + 1) % 30 == 0 or i == total_frames - 1:
            print(f"  Frame {i + 1}/{total_frames}")

    writer.release()
    writer_real.release()

    print(f"\n[deepfake-gen] Done!")
    print(f"  Deepfake video: {args.output}")
    print(f"  Real video:     {real_output}")
    print(f"  Frames: {total_frames}, Size: {target_w}x{target_h}")
    print(f"\nNext steps:")
    print(f"  Test frames against the CLIP deepfake detector via /api/analyze/frame")


if __name__ == "__main__":
    main()
