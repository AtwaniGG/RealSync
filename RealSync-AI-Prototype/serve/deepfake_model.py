"""
EfficientNet-B4 + SBI deepfake detection model — replaces MesoNet-4.

Binary classification: real (1.0) vs fake (0.0).
Uses EfficientNet-B4 backbone with a single sigmoid output.
Loads SBI-trained weights if available, falls back to ImageNet pretrained.

Input: BGR face crop (any size, resized to 380x380 internally).
Output: {"authenticityScore": float, "riskLevel": str, "model": str}
"""
import os
import threading

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models, transforms

from serve.config import (
    EFFICIENTNET_INPUT_SIZE,
    EFFICIENTNET_WEIGHTS_PATH,
    DEEPFAKE_AUTH_THRESHOLD_LOW_RISK,
    DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK,
)

MODEL_NAME = "EfficientNet-B4-SBI"


# ---------------------------------------------------------------
# Model architecture
# ---------------------------------------------------------------

class EfficientNetDeepfake(nn.Module):
    """EfficientNet-B4 with binary deepfake detection head."""

    def __init__(self):
        super().__init__()
        backbone = models.efficientnet_b4(weights=None)
        # Replace classifier: 1792 -> 1 (sigmoid)
        in_features = backbone.classifier[1].in_features
        backbone.classifier = nn.Sequential(
            nn.Dropout(p=0.4),
            nn.Linear(in_features, 1),
        )
        self.net = backbone

    def forward(self, x):
        return torch.sigmoid(self.net(x))


# ---------------------------------------------------------------
# Lazy-loaded singleton
# ---------------------------------------------------------------

_model = None
_lock = threading.Lock()

_preprocess = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((EFFICIENTNET_INPUT_SIZE, EFFICIENTNET_INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def get_deepfake_model():
    """Load or return the cached deepfake model (thread-safe)."""
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        try:
            net = EfficientNetDeepfake()

            if os.path.isfile(EFFICIENTNET_WEIGHTS_PATH):
                state = torch.load(EFFICIENTNET_WEIGHTS_PATH, map_location="cpu", weights_only=True)
                state_dict = state.get("model_state_dict", state)
                net.load_state_dict(state_dict)
                print(f"[deepfake] Loaded SBI weights from {EFFICIENTNET_WEIGHTS_PATH}")
            else:
                print(f"[deepfake] WARNING: SBI weights not found at {EFFICIENTNET_WEIGHTS_PATH}")
                print("[deepfake] Model unavailable — will return None for predictions")
                _model = None
                return _model

            net.eval()
            _model = net
            print(f"[deepfake] {MODEL_NAME} model ready")
        except Exception as exc:
            print(f"[deepfake] Failed to load model: {exc}")
    return _model


# ---------------------------------------------------------------
# Public API
# ---------------------------------------------------------------

def predict_deepfake(face_crop_bgr: np.ndarray) -> dict:
    """
    Predict deepfake authenticity from a BGR face crop.

    Returns:
        {"authenticityScore": float, "riskLevel": str, "model": str}
    """
    model = get_deepfake_model()
    if model is None:
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}

    try:
        face_rgb = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)
        tensor = _preprocess(face_rgb).unsqueeze(0)  # (1, 3, 380, 380)

        with torch.no_grad():
            raw = model(tensor)  # (1, 1)
            prediction = float(raw[0][0])

        # Model outputs P(fake). Convert to authenticity: 1 = real, 0 = fake.
        authenticity = round(1.0 - prediction, 4)

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
        print(f"[deepfake] Prediction error: {exc}")
        return {"authenticityScore": None, "riskLevel": "unknown", "model": MODEL_NAME, "available": False}
