"""
Heuristic deepfake detection for RealSync AI pipeline.

Four deterministic signal extractors that operate on 224x224 BGR face crop
images produced by MediaPipe (30% padding) from 1920x1080 Zoom screenshots
(JPEG quality 95).  No neural network weights required — pure OpenCV/numpy.

Design rationale
----------------
Inswapper, the primary deepfake engine in RealSync's threat model, operates
internally at 128px and upscales to fit the target face region.  This leaves
four measurable forensic traces:

1. Attenuated high-frequency content  (frequency_analysis)
2. Gradient discontinuity at the paste boundary  (boundary_gradient_analysis)
3. Slightly blurrier face centre vs surrounding region  (blur_consistency)
4. Subtle Lab colour mismatch at the paste edge  (color_distribution_analysis)

All functions handle degenerate inputs (tiny images, single-colour patches)
without raising exceptions, returning neutral scores when detection is not
possible.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Threshold configuration — import from serve.config when available
# ---------------------------------------------------------------------------
try:
    from serve.config import (
        HEURISTIC_HIGH_FREQ_THRESHOLD,
        HEURISTIC_BOUNDARY_RATIO_THRESHOLD,
        HEURISTIC_BLUR_DEVIATION_THRESHOLD,
        HEURISTIC_COLOR_DISTANCE_THRESHOLD,
    )
except ImportError:
    HEURISTIC_HIGH_FREQ_THRESHOLD: float = 0.15
    HEURISTIC_BOUNDARY_RATIO_THRESHOLD: float = 3.0
    HEURISTIC_BLUR_DEVIATION_THRESHOLD: float = 0.5
    HEURISTIC_COLOR_DISTANCE_THRESHOLD: float = 15.0

# Weighted contribution of each heuristic to the final realness score
_WEIGHTS: dict[str, float] = {
    "frequency": 0.30,
    "boundary": 0.25,
    "blur": 0.25,
    "color": 0.20,
}

_MIN_SIDE_PX: int = 10  # images smaller than this are skipped entirely


# ---------------------------------------------------------------------------
# Heuristic 1 — Frequency analysis
# ---------------------------------------------------------------------------

def frequency_analysis(face_crop_bgr: np.ndarray) -> dict[str, float]:
    """
    Measure high-frequency energy loss caused by Inswapper's internal 128px
    processing and subsequent upscaling.

    The 2-D DFT magnitude spectrum is split into a low-frequency core
    (inner 75% radius) and a high-frequency shell (outer 25% radius).
    Authentic faces retain sharper edges and therefore have a higher
    high-frequency energy ratio.

    A secondary DCT 8x8 block variance metric captures JPEG compression
    uniformity — swap boundaries create locally inconsistent quantisation
    patterns that inflate DCT variance.

    Parameters
    ----------
    face_crop_bgr:
        BGR ndarray, any dtype.  Expected 224x224 but tolerates other sizes.

    Returns
    -------
    dict with keys:
        ``high_freq_ratio``  — fraction of total FFT energy in the outer ring.
        ``dct_variance``     — mean variance of 8x8 DCT block coefficients.
    """
    gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = gray.shape

    if h < _MIN_SIDE_PX or w < _MIN_SIDE_PX:
        return {"high_freq_ratio": 0.0, "dct_variance": 0.0}

    # --- FFT high-frequency ratio ---
    fft = np.fft.fft2(gray)
    fft_shifted = np.fft.fftshift(fft)
    magnitude = np.abs(fft_shifted)

    cy, cx = h // 2, w // 2
    # Outer 25% radius = radius > 0.375 * min(h, w) but contained in image
    outer_radius = 0.375 * min(h, w)

    ys, xs = np.ogrid[:h, :w]
    dist = np.sqrt((ys - cy) ** 2 + (xs - cx) ** 2)

    high_mask = dist > outer_radius
    total_energy = float(np.sum(magnitude ** 2))
    high_energy = float(np.sum((magnitude * high_mask) ** 2))

    if total_energy < 1e-9:
        high_freq_ratio = 0.0
    else:
        high_freq_ratio = high_energy / total_energy

    # --- DCT 8x8 block variance ---
    # Trim to a multiple of 8 for clean block decomposition
    h8, w8 = (h // 8) * 8, (w // 8) * 8
    dct_variance = 0.0
    if h8 >= 8 and w8 >= 8:
        trimmed = gray[:h8, :w8]
        n_blocks_h, n_blocks_w = h8 // 8, w8 // 8
        variances: list[float] = []
        for bi in range(n_blocks_h):
            for bj in range(n_blocks_w):
                block = trimmed[bi * 8:(bi + 1) * 8, bj * 8:(bj + 1) * 8]
                coef = cv2.dct(block)
                variances.append(float(np.var(coef)))
        dct_variance = float(np.mean(variances)) if variances else 0.0

    return {"high_freq_ratio": high_freq_ratio, "dct_variance": dct_variance}


# ---------------------------------------------------------------------------
# Heuristic 2 — Boundary gradient analysis
# ---------------------------------------------------------------------------

def boundary_gradient_analysis(face_crop_bgr: np.ndarray) -> dict[str, float]:
    """
    Detect the gradient discontinuity that Inswapper's alpha-blending paste
    operation leaves around the face boundary.

    Sobel gradients are computed on the grayscale image.  Gradient magnitudes
    are sampled at 72 points (every 5°) along an elliptical boundary that
    approximates a typical face outline at 70% of the crop radius, with a ±2px
    ring to provide a stable estimate.  The boundary mean and standard
    deviation are compared to the interior mean.

    Inswapper faces show an elevated boundary-to-interior ratio because the
    blending boundary sharpens at the paste edge while the interior remains
    relatively smooth from upscaling.

    Parameters
    ----------
    face_crop_bgr:
        BGR ndarray.  Expected 224x224.

    Returns
    -------
    dict with keys:
        ``boundary_gradient_std``       — std of gradient magnitudes on boundary.
        ``boundary_gradient_mean``      — mean gradient magnitude on boundary.
        ``boundary_to_interior_ratio``  — boundary mean / interior mean.
    """
    gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = gray.shape

    if h < _MIN_SIDE_PX or w < _MIN_SIDE_PX:
        return {
            "boundary_gradient_std": 0.0,
            "boundary_gradient_mean": 0.0,
            "boundary_to_interior_ratio": 1.0,
        }

    sobel_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = np.sqrt(sobel_x ** 2 + sobel_y ** 2)

    cy, cx = h / 2.0, w / 2.0
    # Ellipse semi-axes at 70% of image half-dimensions
    ry = cy * 0.70
    rx = cx * 0.70
    ring_half = 2  # ±2px ring width

    boundary_values: list[float] = []
    for deg in range(0, 360, 5):
        angle = math.radians(deg)
        by = cy + ry * math.sin(angle)
        bx = cx + rx * math.cos(angle)
        for offset in range(-ring_half, ring_half + 1):
            py = int(round(by + offset * math.sin(angle)))
            px = int(round(bx + offset * math.cos(angle)))
            if 0 <= py < h and 0 <= px < w:
                boundary_values.append(float(magnitude[py, px]))

    # Interior mask: inside 50% ellipse
    ys, xs = np.ogrid[:h, :w]
    interior_mask = ((ys - cy) / (cy * 0.50)) ** 2 + ((xs - cx) / (cx * 0.50)) ** 2 <= 1.0
    interior_values = magnitude[interior_mask]

    if len(boundary_values) == 0:
        return {
            "boundary_gradient_std": 0.0,
            "boundary_gradient_mean": 0.0,
            "boundary_to_interior_ratio": 1.0,
        }

    boundary_arr = np.array(boundary_values, dtype=np.float32)
    b_mean = float(np.mean(boundary_arr))
    b_std = float(np.std(boundary_arr))
    i_mean = float(np.mean(interior_values)) if interior_values.size > 0 else 0.0

    ratio = b_mean / (i_mean + 1e-6)

    return {
        "boundary_gradient_std": b_std,
        "boundary_gradient_mean": b_mean,
        "boundary_to_interior_ratio": ratio,
    }


# ---------------------------------------------------------------------------
# Heuristic 3 — Blur consistency
# ---------------------------------------------------------------------------

def blur_consistency(face_crop_bgr: np.ndarray) -> dict[str, float]:
    """
    Measure the sharpness mismatch between the face centre and the surrounding
    border region.

    Inswapper upscales its 128px output to fill the target face crop, which
    makes the face area measurably blurrier than the surrounding image context
    (hair, neck, shoulders).  The Laplacian operator is an established
    no-reference sharpness estimator: higher variance → sharper region.

    Regions:
        Centre  — inner 60% bounding box of the image.
        Border  — outer 20% strip on each side.

    A blur_ratio near 1.0 indicates balanced sharpness (real face).
    A blur_ratio well below 1.0 indicates blurrier centre (deepfake indicator).

    Parameters
    ----------
    face_crop_bgr:
        BGR ndarray.

    Returns
    -------
    dict with keys:
        ``face_laplacian_var``   — Laplacian variance in the face centre region.
        ``border_laplacian_var`` — Laplacian variance in the border region.
        ``blur_ratio``           — face_laplacian_var / border_laplacian_var.
    """
    gray = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = gray.shape

    if h < _MIN_SIDE_PX or w < _MIN_SIDE_PX:
        return {
            "face_laplacian_var": 0.0,
            "border_laplacian_var": 0.0,
            "blur_ratio": 1.0,
        }

    laplacian = cv2.Laplacian(gray, cv2.CV_32F)

    # Centre region: inner 60% (20% margin on each side)
    margin_y = int(h * 0.20)
    margin_x = int(w * 0.20)
    # Ensure margins leave at least 1px of content
    margin_y = min(margin_y, h // 2 - 1)
    margin_x = min(margin_x, w // 2 - 1)

    centre = laplacian[margin_y: h - margin_y, margin_x: w - margin_x]
    face_var = float(np.var(centre)) if centre.size > 0 else 0.0

    # Border mask: everything outside the inner 60% region
    border_mask = np.ones((h, w), dtype=bool)
    border_mask[margin_y: h - margin_y, margin_x: w - margin_x] = False
    border_values = laplacian[border_mask]
    border_var = float(np.var(border_values)) if border_values.size > 0 else 0.0

    blur_ratio = face_var / (border_var + 1e-6)

    return {
        "face_laplacian_var": face_var,
        "border_laplacian_var": border_var,
        "blur_ratio": blur_ratio,
    }


# ---------------------------------------------------------------------------
# Heuristic 4 — Color distribution analysis
# ---------------------------------------------------------------------------

def color_distribution_analysis(face_crop_bgr: np.ndarray) -> dict[str, Any]:
    """
    Detect the perceptual colour mismatch at the Inswapper paste boundary.

    Inswapper performs an internal colour transfer that is calibrated to the
    face interior but is imperfect at the paste edge.  Converting to CIE Lab
    exposes this mismatch because Lab is perceptually uniform: Euclidean
    distance corresponds to perceived colour difference (ΔE).

    Regions:
        Centre  — inner ellipse at 50% of crop half-dimensions.
        Border  — elliptical ring between 65% and 80% of crop half-dimensions.

    A low ``color_distance`` (ΔE < threshold) suggests consistent colour
    transfer and is consistent with a real face.  A high distance suggests
    the paste boundary colour transfer is imperfect (deepfake indicator).

    Parameters
    ----------
    face_crop_bgr:
        BGR ndarray.

    Returns
    -------
    dict with keys:
        ``lab_center_mean``  — [L, a, b] mean of the centre region (list of 3).
        ``lab_border_mean``  — [L, a, b] mean of the border region (list of 3).
        ``color_distance``   — Euclidean ΔE between centre and border Lab means.
    """
    if face_crop_bgr.shape[0] < _MIN_SIDE_PX or face_crop_bgr.shape[1] < _MIN_SIDE_PX:
        return {
            "lab_center_mean": [0.0, 0.0, 0.0],
            "lab_border_mean": [0.0, 0.0, 0.0],
            "color_distance": 0.0,
        }

    lab = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2Lab).astype(np.float32)
    h, w = lab.shape[:2]
    cy, cx = h / 2.0, w / 2.0

    ys, xs = np.ogrid[:h, :w]

    # Centre ellipse: normalised distance ≤ 0.50
    norm_dist = np.sqrt(((ys - cy) / (cy + 1e-6)) ** 2 + ((xs - cx) / (cx + 1e-6)) ** 2)
    centre_mask = norm_dist <= 0.50
    border_mask = (norm_dist >= 0.65) & (norm_dist <= 0.80)

    centre_pixels = lab[centre_mask]
    border_pixels = lab[border_mask]

    if centre_pixels.size == 0 or border_pixels.size == 0:
        return {
            "lab_center_mean": [0.0, 0.0, 0.0],
            "lab_border_mean": [0.0, 0.0, 0.0],
            "color_distance": 0.0,
        }

    center_mean = centre_pixels.mean(axis=0).tolist()
    border_mean = border_pixels.mean(axis=0).tolist()

    delta = np.array(center_mean) - np.array(border_mean)
    color_distance = float(np.linalg.norm(delta))

    return {
        "lab_center_mean": [round(v, 4) for v in center_mean],
        "lab_border_mean": [round(v, 4) for v in border_mean],
        "color_distance": color_distance,
    }


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def analyze_heuristics(face_crop_bgr: np.ndarray) -> dict[str, Any]:
    """
    Run all four heuristics and compute a weighted realness score.

    Each heuristic raw value is mapped to a 0-1 realness score:

    * **frequency**  ``min(1, high_freq_ratio / threshold)``
      Higher ratio → more high-frequency content → more likely real.

    * **boundary**   ``1 - min(1, ratio / threshold)``
      Higher boundary-to-interior ratio → stronger paste boundary → more
      likely fake.

    * **blur**       ``1 - min(1, |1 - blur_ratio| / threshold)``
      Ratio near 1.0 → centre and border equally sharp → more likely real.

    * **color**      ``1 - min(1, color_distance / threshold)``
      Lower ΔE → consistent colour across face → more likely real.

    Weights: frequency 0.30, boundary 0.25, blur 0.25, color 0.20.

    Risk classification:
        ``heuristicScore > 0.70`` → "low"
        ``heuristicScore > 0.45`` → "medium"
        otherwise               → "high"

    If a heuristic raises an unexpected exception it is silently excluded from
    the weighted average so that one bad input does not block the whole pipeline.

    Parameters
    ----------
    face_crop_bgr:
        BGR ndarray (OpenCV format).  Should be 224x224 for best results.

    Returns
    -------
    dict with keys:
        ``heuristicScore``     — weighted realness score in [0, 1].
        ``heuristicRiskLevel`` — "low" | "medium" | "high".
        ``signals``            — per-heuristic raw results and realness scores.
        ``model``              — always "heuristic-ensemble".
    """
    signals: dict[str, Any] = {}
    scores: dict[str, float] = {}

    # --- Heuristic 1: frequency ---
    try:
        freq_result = frequency_analysis(face_crop_bgr)
        freq_score = min(1.0, freq_result["high_freq_ratio"] / (HEURISTIC_HIGH_FREQ_THRESHOLD + 1e-9))
        signals["frequency"] = {**freq_result, "realness": round(freq_score, 4)}
        scores["frequency"] = freq_score
    except Exception:
        logger.warning("frequency_analysis failed — skipping", exc_info=True)

    # --- Heuristic 2: boundary gradient ---
    try:
        boundary_result = boundary_gradient_analysis(face_crop_bgr)
        boundary_score = 1.0 - min(
            1.0,
            boundary_result["boundary_to_interior_ratio"] / (HEURISTIC_BOUNDARY_RATIO_THRESHOLD + 1e-9),
        )
        signals["boundary"] = {**boundary_result, "realness": round(boundary_score, 4)}
        scores["boundary"] = boundary_score
    except Exception:
        logger.warning("boundary_gradient_analysis failed — skipping", exc_info=True)

    # --- Heuristic 3: blur consistency ---
    try:
        blur_result = blur_consistency(face_crop_bgr)
        blur_deviation = abs(1.0 - blur_result["blur_ratio"])
        blur_score = 1.0 - min(1.0, blur_deviation / (HEURISTIC_BLUR_DEVIATION_THRESHOLD + 1e-9))
        signals["blur"] = {**blur_result, "realness": round(blur_score, 4)}
        scores["blur"] = blur_score
    except Exception:
        logger.warning("blur_consistency failed — skipping", exc_info=True)

    # --- Heuristic 4: color distribution ---
    try:
        color_result = color_distribution_analysis(face_crop_bgr)
        color_score = 1.0 - min(
            1.0,
            color_result["color_distance"] / (HEURISTIC_COLOR_DISTANCE_THRESHOLD + 1e-9),
        )
        signals["color"] = {**color_result, "realness": round(color_score, 4)}
        scores["color"] = color_score
    except Exception:
        logger.warning("color_distribution_analysis failed — skipping", exc_info=True)

    # --- Weighted average over available heuristics ---
    if not scores:
        # All heuristics failed — return a neutral score
        heuristic_score = 0.5
    else:
        total_weight = sum(_WEIGHTS[k] for k in scores)
        weighted_sum = sum(_WEIGHTS[k] * v for k, v in scores.items())
        heuristic_score = weighted_sum / total_weight if total_weight > 0 else 0.5

    heuristic_score = round(float(np.clip(heuristic_score, 0.0, 1.0)), 4)

    if heuristic_score > 0.70:
        risk_level = "low"
    elif heuristic_score > 0.45:
        risk_level = "medium"
    else:
        risk_level = "high"

    return {
        "heuristicScore": heuristic_score,
        "heuristicRiskLevel": risk_level,
        "signals": signals,
        "model": "heuristic-ensemble",
    }
