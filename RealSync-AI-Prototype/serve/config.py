"""
Configuration for the RealSync AI Inference Service.
"""
import os

# Server
PORT = int(os.getenv("PORT", "5100"))
HOST = os.getenv("HOST", "0.0.0.0")

# Model paths (relative to RealSync-AI-Prototype/src/)
SRC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "src")
MODELS_DIR = os.path.join(SRC_DIR, "models")

# EfficientNet-B4 + SBI deepfake detection
EFFICIENTNET_INPUT_SIZE = 380  # pixels
EFFICIENTNET_WEIGHTS_PATH = os.path.join(MODELS_DIR, "efficientnet_b4_deepfake.pth")

# MobileNetV2 emotion model
EMOTION_INPUT_SIZE = 128  # pixels
EMOTION_WEIGHTS_PATH = os.path.join(MODELS_DIR, "emotion_weights.pth")

# AASIST audio deepfake detection
AASIST_WEIGHTS_PATH = os.path.join(MODELS_DIR, "aasist_weights.pth")

# Face detection
FACE_CONFIDENCE_THRESHOLD = 0.4
FACE_PADDING_PERCENT = 0.3
FACE_CROP_SIZE = 224  # pixels

# Identity tracking — FaceNet InceptionResnetV1
FACENET_INPUT_SIZE = 160  # pixels, required by InceptionResnetV1
FACENET_PRETRAINED = 'vggface2'  # pretrained weights dataset
IDENTITY_SHIFT_LOW = 0.20  # below this = low risk
IDENTITY_SHIFT_HIGH = 0.40  # above this = high risk

# Temporal analysis
TEMPORAL_WINDOW_SIZE = 15
TEMPORAL_TRUST_DROP_THRESHOLD = 0.20
TEMPORAL_IDENTITY_SWITCH_LOW = 0.15
TEMPORAL_IDENTITY_SWITCH_HIGH = 0.35
TEMPORAL_EMOTION_CHANGE_THRESHOLD = 5

# Deepfake thresholds (H9: renamed for clarity)
DEEPFAKE_AUTH_THRESHOLD_LOW_RISK = 0.85   # above → low risk
DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK = 0.70  # below → high risk

# Emotion thresholds
EMOTION_LABELS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"]
