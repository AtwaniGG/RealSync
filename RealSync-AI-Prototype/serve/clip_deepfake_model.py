"""
GenD CLIP ViT-L/14 deepfake detection model.

Replaces EfficientNet-B4-SBI for Zoom-compressed video. CLIP encodes semantic
features (identity coherence, facial geometry, lighting consistency) that survive
H.264 compression, unlike pixel-level blending artifacts.

Model: yermandy/deepfake-detection (WACV 2026, MIT license)
Input: BGR face crop (any size, resized to 224x224)
Output: {"authenticityScore": float, "riskLevel": str, "model": str}
"""
import threading

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms

from serve.config import (
    DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK,
    DEEPFAKE_AUTH_THRESHOLD_LOW_RISK,
)

MODEL_NAME = "GenD-CLIP-ViT-L14"

_model = None
_LOAD_FAILED = object()
_lock = threading.Lock()

# CLIP standard preprocessing (ImageNet normalization used by CLIP ViT-L/14)
_preprocess = transforms.Compose([
    transforms.Resize((224, 224), interpolation=transforms.InterpolationMode.BICUBIC),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.48145466, 0.4578275, 0.40821073],
        std=[0.26862954, 0.26130258, 0.27577711],
    ),
])


def get_clip_deepfake_model():
    """Load GenD CLIP ViT-L/14 TorchScript model (thread-safe singleton)."""
    global _model
    if _model is not None:
        return None if _model is _LOAD_FAILED else _model

    with _lock:
        if _model is not None:
            return None if _model is _LOAD_FAILED else _model
        try:
            from huggingface_hub import hf_hub_download

            print(f"[clip-deepfake] Downloading GenD CLIP ViT-L/14 from HuggingFace...")
            model_path = hf_hub_download(
                repo_id="yermandy/deepfake-detection",
                filename="model.torchscript",
            )

            _device = (
                "cuda" if torch.cuda.is_available()
                else "mps" if torch.backends.mps.is_available()
                else "cpu"
            )

            net = torch.jit.load(model_path, map_location=_device)
            net.eval()
            net._device = _device
            _model = net

            print(f"[clip-deepfake] {MODEL_NAME} loaded on {_device}")
            print(f"[clip-deepfake] Model ready")
        except Exception as exc:
            print(f"[clip-deepfake] Failed to load: {exc}")
            _model = _LOAD_FAILED

    return None if _model is _LOAD_FAILED else _model


def predict_clip_deepfake(face_crop_bgr: np.ndarray) -> dict:
    """
    Predict deepfake authenticity from a BGR face crop using CLIP.

    Returns:
        {"authenticityScore": float, "riskLevel": str, "model": str}
        authenticityScore: 1.0 = definitely real, 0.0 = definitely fake
    """
    model = get_clip_deepfake_model()
    if model is None:
        return {
            "authenticityScore": None,
            "riskLevel": "unknown",
            "model": MODEL_NAME,
            "available": False,
        }

    try:
        # BGR -> RGB -> PIL Image
        face_rgb = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(face_rgb)

        device = getattr(model, "_device", "cpu")
        tensor = _preprocess(pil_img).unsqueeze(0).to(device)

        with torch.no_grad():
            output = model(tensor).float()  # bfloat16 → float32

            # GenD outputs [1, 2]: [real_logit, fake_logit]
            if output.shape[-1] == 2:
                probs = torch.softmax(output, dim=-1).cpu()
                prob_real = float(probs[0][0])
            else:
                logit = float(output.squeeze())
                prob_real = 1.0 - torch.sigmoid(torch.tensor(logit)).item()

        authenticity = round(max(0.0, min(1.0, prob_real)), 4)

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
        print(f"[clip-deepfake] Prediction error: {exc}")
        return {
            "authenticityScore": None,
            "riskLevel": "unknown",
            "model": MODEL_NAME,
            "available": False,
        }
