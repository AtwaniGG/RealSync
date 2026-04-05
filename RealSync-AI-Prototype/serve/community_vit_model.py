"""
CommunityForensics ViT deepfake detection model.

ViT-Small (36M params) trained on 2.7M images from 15+ generators.
97.2% accuracy, AUC-ROC 0.992, 2.1% FPR.
Auto-downloads from HuggingFace: buildborderless/CommunityForensics-DeepfakeDet-ViT

Input: BGR face crop (any size, resized internally).
Output: {"authenticityScore": float, "riskLevel": str, "model": str}
"""
from __future__ import annotations

import threading
from typing import Optional

import cv2
import numpy as np

try:
    from serve.config import (
        DEEPFAKE_AUTH_THRESHOLD_LOW_RISK,
        DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK,
    )
except ImportError:
    DEEPFAKE_AUTH_THRESHOLD_LOW_RISK = 0.70
    DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK = 0.40

MODEL_NAME = "CommunityForensics-ViT"
HF_MODEL_ID = "buildborderless/CommunityForensics-DeepfakeDet-ViT"

# ---------------------------------------------------------------
# Lazy-loaded singleton
# ---------------------------------------------------------------

_LOAD_FAILED = object()
_pipeline = None
_lock = threading.Lock()


def get_community_vit_model():
    """Load or return the cached CommunityForensics ViT pipeline (thread-safe)."""
    global _pipeline
    if _pipeline is not None:
        return None if _pipeline is _LOAD_FAILED else _pipeline
    with _lock:
        if _pipeline is not None:
            return None if _pipeline is _LOAD_FAILED else _pipeline
        try:
            from transformers import pipeline as hf_pipeline
            import torch

            device = 0 if torch.cuda.is_available() else -1
            from transformers import AutoImageProcessor, AutoModelForImageClassification
            processor = AutoImageProcessor.from_pretrained(HF_MODEL_ID)
            # Override size to match model's expected input (384x384)
            processor.size = {"height": 384, "width": 384}
            model_obj = AutoModelForImageClassification.from_pretrained(HF_MODEL_ID)
            _pipeline = hf_pipeline(
                "image-classification",
                model=model_obj,
                image_processor=processor,
                device=device,
            )
            device_name = "cuda" if device == 0 else "cpu"
            print(f"[community_vit] {MODEL_NAME} loaded on {device_name}")
            print(f"[community_vit] Model: {HF_MODEL_ID}")
        except Exception as exc:
            print(f"[community_vit] Failed to load model: {exc}")
            _pipeline = _LOAD_FAILED
    return None if _pipeline is _LOAD_FAILED else _pipeline


# ---------------------------------------------------------------
# Public API
# ---------------------------------------------------------------

def predict_community_vit(face_crop_bgr: np.ndarray) -> dict:
    """
    Predict deepfake authenticity using CommunityForensics ViT.

    Args:
        face_crop_bgr: BGR face crop from OpenCV (any size).

    Returns:
        {"authenticityScore": float, "riskLevel": str, "model": str}
    """
    pipe = get_community_vit_model()
    if pipe is None:
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}

    try:
        from PIL import Image

        # Convert BGR numpy to RGB PIL Image, resize to 384x384 (model input size)
        face_rgb = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(face_rgb).resize((384, 384), Image.LANCZOS)

        results = pipe(pil_image)

        # Model returns labels as either human-readable or LABEL_0/LABEL_1.
        # Convention: LABEL_0 = real, LABEL_1 = ai_generated/fake.
        # Also handles: 'real', 'ai_generated', 'human', 'fake' etc.
        scores_by_label = {r["label"]: r["score"] for r in results}

        fake_score = 0.0
        real_score = 0.0
        for label, score in scores_by_label.items():
            label_lower = label.lower()
            if label == "LABEL_1" or "ai" in label_lower or "fake" in label_lower or "generated" in label_lower:
                fake_score = score
            elif label == "LABEL_0" or "real" in label_lower or "human" in label_lower:
                real_score = score

        # Authenticity = P(real)
        authenticity = real_score if real_score > 0 else (1.0 - fake_score)
        authenticity = round(max(0.0, min(1.0, authenticity)), 4)

        print(f"[community_vit] p_real={real_score:.4f} p_fake={fake_score:.4f} auth={authenticity:.4f}")

        if authenticity > DEEPFAKE_AUTH_THRESHOLD_LOW_RISK:
            risk = "low"
        elif authenticity > DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK:
            risk = "medium"
        else:
            risk = "high"

        return {
            "authenticityScore": authenticity,
            "riskLevel": risk,
            "model": MODEL_NAME,
        }

    except Exception as exc:
        print(f"[community_vit] Prediction error: {exc}")
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}
