"""
Ensemble scorer for RealSync deepfake detection.

Combines multiple model scores (EfficientNet-B4-SBI, CommunityForensics ViT)
with heuristic analyzer scores using adaptive weighted averaging.
Zoom-captured video defaults to heuristic-heavy weighting because double
compression makes raw CNN model scores unreliable.
"""
from __future__ import annotations

from typing import Optional

try:
    from serve.config import (
        ENSEMBLE_MODEL_WEIGHT_ZOOM,
        ENSEMBLE_HEURISTIC_WEIGHT_ZOOM,
        ENSEMBLE_MODEL_WEIGHT_CLEAN,
        ENSEMBLE_HEURISTIC_WEIGHT_CLEAN,
        ENSEMBLE_DISAGREEMENT_THRESHOLD,
        DEEPFAKE_AUTH_THRESHOLD_LOW_RISK,
        DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK,
    )
except ImportError:
    ENSEMBLE_MODEL_WEIGHT_ZOOM = 0.30
    ENSEMBLE_HEURISTIC_WEIGHT_ZOOM = 0.70
    ENSEMBLE_MODEL_WEIGHT_CLEAN = 0.55
    ENSEMBLE_HEURISTIC_WEIGHT_CLEAN = 0.45
    ENSEMBLE_DISAGREEMENT_THRESHOLD = 0.30
    DEEPFAKE_AUTH_THRESHOLD_LOW_RISK = 0.70
    DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK = 0.40

_ENSEMBLE_MODEL_LABEL = "EfficientNet-B4-SBI+heuristic"


def compute_ensemble_score(
    model_result: dict,
    heuristic_result: dict,
    zoom_mode: bool = True,
    vit_result: Optional[dict] = None,
) -> dict:
    """
    Merge a model prediction and a heuristic analysis into a single score.

    Args:
        model_result: Output of ``predict_deepfake()``.  Must contain
            ``"authenticityScore"`` (float | None).
        heuristic_result: Output of the heuristic analyzer.  Must contain
            ``"heuristicScore"`` (float | None).
        zoom_mode: ``True`` (default) for Zoom-captured video — applies
            heuristic-heavy weights to compensate for double compression.
            ``False`` for clean / locally-generated video.

    Returns:
        A dict with the same shape as ``predict_deepfake()``::

            {
                "authenticityScore": float,          # clamped to [0.0, 1.0]
                "riskLevel": "low" | "medium" | "high",
                "model": "EfficientNet-B4-SBI+heuristic",
            }

    Fallback behaviour:
        - If *model_score* is ``None``, returns a heuristic-only result
          (``model`` field set to ``"heuristic-only"``).
        - If *heuristic_score* is ``None``, returns *model_result* unchanged.
    """
    model_score: float | None = model_result.get("authenticityScore")
    heuristic_score: float | None = heuristic_result.get("heuristicScore")

    # --- Fallback: model unavailable ---
    if model_score is None:
        score = heuristic_score if heuristic_score is not None else 0.5
        score = round(max(0.0, min(1.0, score)), 4)
        risk = _risk_level(score)
        return {
            "authenticityScore": score,
            "riskLevel": risk,
            "model": "heuristic-only",
        }

    # --- Fallback: heuristic unavailable ---
    if heuristic_score is None:
        return model_result

    # --- Adaptive confidence weighting ---
    # When the model is highly confident (score very high or very low),
    # it has strong discriminative signal — trust it more regardless of mode.
    # When uncertain (mid-range), fall back to mode-based defaults.
    model_confident = model_score > 0.85 or model_score < 0.20

    if model_confident:
        # Model has a strong opinion — let it dominate
        model_weight = 0.80
        heuristic_weight = 0.20
    elif zoom_mode:
        model_weight = ENSEMBLE_MODEL_WEIGHT_ZOOM
        heuristic_weight = ENSEMBLE_HEURISTIC_WEIGHT_ZOOM
    else:
        model_weight = ENSEMBLE_MODEL_WEIGHT_CLEAN
        heuristic_weight = ENSEMBLE_HEURISTIC_WEIGHT_CLEAN

    # --- Disagreement handling (only when model is NOT confident) ---
    # When model and heuristic diverge strongly and model is uncertain,
    # reduce model trust further.
    if not model_confident and abs(model_score - heuristic_score) > ENSEMBLE_DISAGREEMENT_THRESHOLD:
        model_weight = model_weight / 2.0
        heuristic_weight = 1.0 - model_weight

    # --- Incorporate ViT signal if available ---
    vit_score = vit_result.get("authenticityScore") if vit_result else None
    if vit_score is not None:
        # Blend ViT into the ensemble: take 20% from both model and heuristic, give to ViT
        vit_weight = 0.20
        model_weight *= 0.80
        heuristic_weight *= 0.80
        # Renormalize
        total = model_weight + heuristic_weight + vit_weight
        model_weight /= total
        heuristic_weight /= total
        vit_weight /= total
        combined = model_weight * model_score + heuristic_weight * heuristic_score + vit_weight * vit_score
    else:
        combined = model_weight * model_score + heuristic_weight * heuristic_score

    combined = round(max(0.0, min(1.0, combined)), 4)

    return {
        "authenticityScore": combined,
        "riskLevel": _risk_level(combined),
        "model": _ENSEMBLE_MODEL_LABEL,
    }


def _risk_level(score: float) -> str:
    """Map an authenticity score to a risk level string."""
    if score > DEEPFAKE_AUTH_THRESHOLD_LOW_RISK:
        return "low"
    if score > DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK:
        return "medium"
    return "high"
