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

# AASIST audio deepfake detection (legacy)
AASIST_WEIGHTS_PATH = os.path.join(MODELS_DIR, "aasist_weights.pth")

# WavLM audio deepfake detection (replaces AASIST)
WAVLM_WEIGHTS_PATH = os.path.join(MODELS_DIR, "wavlm_audio_weights.pth")

# Face detection
FACE_CONFIDENCE_THRESHOLD = 0.4
FACE_PADDING_PERCENT = 0.3
FACE_CROP_SIZE = 224  # pixels

# Temporal analysis
TEMPORAL_WINDOW_SIZE = 30
TEMPORAL_TRUST_DROP_THRESHOLD = 0.40   # was 0.30; head movements cause 15-25% fluctuation, require 40% for real alert
TEMPORAL_EMOTION_CHANGE_THRESHOLD = 10 # was 5; normal conversation = 5-8 emotion changes per 30 frames

# Deepfake thresholds (H9: renamed for clarity)
DEEPFAKE_AUTH_THRESHOLD_LOW_RISK = 0.70   # above → low risk
DEEPFAKE_AUTH_THRESHOLD_HIGH_RISK = 0.40  # below → high risk (real faces now score ≥0.55)

# Calibration bypass for local (non-Zoom) video testing
DISABLE_ZOOM_CALIBRATION = os.getenv("DISABLE_ZOOM_CALIBRATION", "false").lower() == "true"

# --- Heuristic Analyzer Thresholds ---
# Calibrated from 5K real + 5K fake 256x256 face crops (30% MediaPipe padding)
HEURISTIC_HIGH_FREQ_THRESHOLD = 0.005   # actual high_freq_ratio range: 0.002-0.004
HEURISTIC_BOUNDARY_RATIO_THRESHOLD = 2.0  # boundary_to_interior typically 0.4-0.9
HEURISTIC_BLUR_DEVIATION_THRESHOLD = 0.6  # blur_ratio deviation from 1.0
HEURISTIC_COLOR_DISTANCE_THRESHOLD = 35.0  # face-to-border Lab distance (padded crops: 20-30 is normal)

# --- Ensemble Scoring Weights ---
ENSEMBLE_MODEL_WEIGHT_ZOOM = 0.50       # model weight when Zoom calibration is ON
ENSEMBLE_HEURISTIC_WEIGHT_ZOOM = 0.50   # heuristic weight when Zoom calibration is ON
ENSEMBLE_MODEL_WEIGHT_CLEAN = 0.65      # model weight for clean (non-Zoom) video
ENSEMBLE_HEURISTIC_WEIGHT_CLEAN = 0.35  # heuristic weight for clean video
ENSEMBLE_DISAGREEMENT_THRESHOLD = 0.35  # if |model - heuristic| exceeds this, reduce model weight

# Emotion thresholds
EMOTION_LABELS = ["Happy", "Neutral", "Angry", "Fear", "Surprise", "Sad"]

# --- Session ---
SESSION_TTL_SECONDS = 3600
SESSION_EVICTION_TRIGGER = 50

# --- Temporal Analysis ---
TEMPORAL_EWMA_DECAY = 0.90  # was 0.85; slower decay = smoother scores, fewer single-frame spikes
TEMPORAL_TREND_THRESHOLD = 0.05
TEMPORAL_SMOOTHING_MIN_FRAMES = 2

# --- Trust Score Weights ---
TRUST_WEIGHT_VIDEO = 0.55
TRUST_WEIGHT_BEHAVIOR = 0.45
BEHAVIOR_BASELINE_SCALE = 0.5

# --- No-Face Detection ---
NO_FACE_THRESHOLD = 30
NO_FACE_COUNTER_MAX = 500
NO_FACE_EVICT_BATCH = 250

# --- Audio Analysis ---
AUDIO_SAMPLE_RATE = 16000
AUDIO_TARGET_LENGTH = 64000

# --- Text Analysis ---
TEXT_ALERT_THRESHOLD = 0.65
TEXT_HIGH_SEVERITY_THRESHOLD = 0.80
TEXT_MAX_LENGTH = 2000
TEXT_EXECUTOR_WORKERS = 2
TEXT_INFERENCE_TIMEOUT = 15
