"""
Standalone evaluation script for heuristic_analyzer.py.

Loads up to 50 real and 50 fake face crop images from the project data
directories, runs analyze_heuristics() on each, and prints:

    - Per-category descriptive stats (mean, std, min, max of heuristicScore)
    - Separation analysis: real mean vs fake mean and the gap between them
    - A second pass with JPEG quality=65 re-compression to simulate the
      additional Zoom codec degradation before screenshots are taken

Usage
-----
    cd RealSync-AI-Prototype
    python scripts/test_heuristics.py

The script resolves the serve/ package relative to this file's location so it
works without installing the package.
"""

from __future__ import annotations

import io
import os
import random
import sys
from pathlib import Path
from typing import NamedTuple

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Path bootstrap — allow `from serve.heuristic_analyzer import ...` without
# installing the package, regardless of where the script is invoked from.
# ---------------------------------------------------------------------------
_SCRIPT_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _SCRIPT_DIR.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from serve.heuristic_analyzer import analyze_heuristics  # noqa: E402


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DATA_DIR = _PROJECT_ROOT / "data"
REAL_DIR = DATA_DIR / "deepfake_real"
FAKE_DIR = DATA_DIR / "deepfake_fake"
SAMPLE_SIZE = 50
JPEG_QUALITY = 65  # Simulated Zoom codec re-compression quality
RANDOM_SEED = 42

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

class CategoryStats(NamedTuple):
    mean: float
    std: float
    minimum: float
    maximum: float
    count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_image_paths(directory: Path, n: int, seed: int) -> list[Path]:
    """Return up to *n* image paths sampled randomly from *directory*."""
    all_paths = [
        p for p in directory.iterdir()
        if p.suffix.lower() in _IMAGE_EXTENSIONS
    ]
    if not all_paths:
        return []
    rng = random.Random(seed)
    return rng.sample(all_paths, min(n, len(all_paths)))


def _jpeg_recompress(image_bgr: np.ndarray, quality: int) -> np.ndarray:
    """
    Simulate Zoom codec degradation by encoding to JPEG at *quality* and
    decoding back to a BGR ndarray.
    """
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    success, buffer = cv2.imencode(".jpg", image_bgr, encode_params)
    if not success:
        return image_bgr
    return cv2.imdecode(np.frombuffer(buffer.tobytes(), dtype=np.uint8), cv2.IMREAD_COLOR)


def _run_batch(
    paths: list[Path],
    label: str,
    recompress: bool = False,
) -> list[float]:
    """
    Run analyze_heuristics on each image in *paths*.

    Parameters
    ----------
    paths:
        List of image file paths.
    label:
        Human-readable category name for progress output.
    recompress:
        If True, re-encode each image at JPEG_QUALITY before analysis.

    Returns
    -------
    List of heuristicScore values (one per image that loaded successfully).
    """
    scores: list[float] = []
    for path in paths:
        img = cv2.imread(str(path))
        if img is None:
            print(f"  [WARN] Could not load {path.name} — skipping")
            continue
        if recompress:
            img = _jpeg_recompress(img, JPEG_QUALITY)
        result = analyze_heuristics(img)
        scores.append(result["heuristicScore"])
    return scores


def _compute_stats(scores: list[float]) -> CategoryStats:
    arr = np.array(scores, dtype=np.float64)
    return CategoryStats(
        mean=float(np.mean(arr)),
        std=float(np.std(arr)),
        minimum=float(np.min(arr)),
        maximum=float(np.max(arr)),
        count=len(arr),
    )


def _print_stats_table(
    real_stats: CategoryStats,
    fake_stats: CategoryStats,
    pass_label: str,
) -> None:
    """Pretty-print a comparison table for one evaluation pass."""
    sep = "-" * 60
    print(f"\n{sep}")
    print(f"  Pass: {pass_label}")
    print(sep)
    print(f"  {'Category':<12} {'Mean':>8} {'Std':>8} {'Min':>8} {'Max':>8} {'N':>6}")
    print(f"  {'-'*12} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*6}")
    for label, st in [("REAL", real_stats), ("FAKE", fake_stats)]:
        print(
            f"  {label:<12} {st.mean:>8.4f} {st.std:>8.4f} "
            f"{st.minimum:>8.4f} {st.maximum:>8.4f} {st.count:>6}"
        )
    print(sep)

    gap = real_stats.mean - fake_stats.mean
    direction = "real > fake" if gap >= 0 else "fake > real"
    print(f"  Separation gap  : {abs(gap):.4f}  ({direction})")

    # Simple rule-of-thumb: gap > 0.10 indicates useful signal
    if abs(gap) >= 0.10:
        print("  Signal quality  : GOOD  (gap >= 0.10)")
    elif abs(gap) >= 0.05:
        print("  Signal quality  : MARGINAL  (0.05 <= gap < 0.10)")
    else:
        print("  Signal quality  : WEAK  (gap < 0.05) — thresholds may need tuning")
    print(sep)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("  RealSync Heuristic Analyzer — Evaluation Script")
    print("=" * 60)

    # Validate data directories
    for directory, name in [(REAL_DIR, "deepfake_real"), (FAKE_DIR, "deepfake_fake")]:
        if not directory.exists():
            print(f"\n[ERROR] Data directory not found: {directory}")
            print("        Run this script from RealSync-AI-Prototype/")
            sys.exit(1)

    # Load paths
    real_paths = _load_image_paths(REAL_DIR, SAMPLE_SIZE, RANDOM_SEED)
    fake_paths = _load_image_paths(FAKE_DIR, SAMPLE_SIZE, RANDOM_SEED)

    print(f"\n  Loaded {len(real_paths)} real images from  {REAL_DIR.name}/")
    print(f"  Loaded {len(fake_paths)} fake images from  {FAKE_DIR.name}/")

    if not real_paths and not fake_paths:
        print("\n[ERROR] No images found in either data directory.")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Pass 1 — Raw images (simulating screenshot JPEG quality 95)
    # ------------------------------------------------------------------
    print("\n  Running Pass 1: raw images ...")
    real_scores_raw = _run_batch(real_paths, "REAL")
    fake_scores_raw = _run_batch(fake_paths, "FAKE")

    if real_scores_raw and fake_scores_raw:
        _print_stats_table(
            _compute_stats(real_scores_raw),
            _compute_stats(fake_scores_raw),
            "Raw images (JPEG q95 equivalent)",
        )
    else:
        print("  [WARN] Not enough results for Pass 1 stats.")

    # ------------------------------------------------------------------
    # Pass 2 — JPEG re-compressed (simulate Zoom codec degradation)
    # ------------------------------------------------------------------
    print(f"\n  Running Pass 2: JPEG re-compressed at quality={JPEG_QUALITY} ...")
    real_scores_compressed = _run_batch(real_paths, "REAL", recompress=True)
    fake_scores_compressed = _run_batch(fake_paths, "FAKE", recompress=True)

    if real_scores_compressed and fake_scores_compressed:
        _print_stats_table(
            _compute_stats(real_scores_compressed),
            _compute_stats(fake_scores_compressed),
            f"JPEG re-compressed (quality={JPEG_QUALITY}, simulates Zoom)",
        )
    else:
        print("  [WARN] Not enough results for Pass 2 stats.")

    # ------------------------------------------------------------------
    # Score delta: how much does Zoom compression affect each category?
    # ------------------------------------------------------------------
    if real_scores_raw and real_scores_compressed:
        real_delta = np.mean(real_scores_compressed) - np.mean(real_scores_raw)
        fake_delta = np.mean(fake_scores_compressed) - np.mean(fake_scores_raw)
        print("\n  Compression impact (Pass2 mean - Pass1 mean):")
        print(f"    REAL : {real_delta:+.4f}")
        print(f"    FAKE : {fake_delta:+.4f}")
        print(
            "  A larger negative delta on FAKE than REAL suggests heuristics "
            "are\n  sensitive to compression in the expected direction.\n"
        )

    print("=" * 60)
    print("  Evaluation complete.")
    print("=" * 60)


if __name__ == "__main__":
    main()
