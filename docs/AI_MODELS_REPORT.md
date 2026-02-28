# RealSync AI Models — Accuracy & Capabilities Report

## Overview

RealSync uses five AI components in a multi-modal pipeline to detect deepfakes, analyze emotions, detect faces, track identity consistency, and smooth trust signals across frames during live Zoom meetings. All models run in a FastAPI service on port 5100 and process video frames in real-time.

**Recent upgrades (Feb 2026):** Replaced the random-projection identity tracker with FaceNet InceptionResnetV1 (>99% LFW accuracy) and added a temporal analysis layer to smooth trust scores and detect anomalies across frames.

---

## 1. MesoNet-4 — Deepfake Detection

### What It Is
A lightweight CNN designed specifically for detecting face manipulation artifacts at the mesoscopic (mid-level) scale. It looks for compression artifacts and inconsistencies that deepfake generation introduces.

### Architecture
- 4 convolutional blocks (Conv2D + BatchNorm + MaxPool)
- Input: 256x256 RGB
- Output: single sigmoid value (0 = real, 1 = fake)
- ~28K parameters — very lightweight

### Realistic Accuracy Assessment

| Metric | Value | Context |
|--------|-------|---------|
| **Published accuracy** | ~95% on FaceForensics++ | Controlled dataset, specific GAN types |
| **Real-world estimate** | 65–80% | Depends heavily on compression, lighting, GAN quality |
| **Strengths** | Fast inference, low compute, good on older/lower-quality deepfakes | Works well on Face2Face, FaceSwap |
| **Weaknesses** | Struggles with modern high-quality deepfakes (StyleGAN3, wav2lip), degrades on heavy JPEG compression | Not state-of-the-art |

### What's Working vs Not
- **Works well**: Detecting obvious face swaps, low-quality deepfakes, compressed manipulations
- **Doesn't work well**: High-quality neural face synthesis, partial face manipulations, novel GAN architectures not in training data
- **Key limitation**: The model uses pre-trained weights (`mesonet4_weights.h5`) — it cannot adapt to new deepfake techniques without retraining
- **Mitigation**: The new temporal analysis layer smooths MesoNet-4 scores across frames, reducing single-frame false positives

### Risk Thresholds (in RealSync)
- Authenticity > 85% → **Low risk**
- 70–85% → **Medium risk**
- Below 70% → **High risk**

---

## 2. FER — Facial Emotion Recognition

### What It Is
The `fer` Python package, using MTCNN for face detection + a pre-trained CNN for emotion classification. Classifies into 7 base emotions, which RealSync maps to 6 labels (disgust → Angry).

### Emotion Labels
Happy, Neutral, Angry, Fear, Surprise, Sad (disgust is merged into Angry)

### Realistic Accuracy Assessment

| Metric | Value | Context |
|--------|-------|---------|
| **Published accuracy** | ~66% on FER2013 | The FER2013 dataset itself has ~65% human agreement |
| **Real-world estimate** | 50–65% | Webcam quality, varying lighting, partial faces |
| **Strengths** | Fast, easy to deploy, handles multiple faces | Good enough for gross emotion categorization |
| **Weaknesses** | Poor on subtle emotions, biased toward frontal faces, cultural bias in training data | Not reliable for security-critical decisions |

### What's Working vs Not
- **Works well**: Distinguishing happy vs neutral, detecting strong emotional expressions (anger, surprise)
- **Doesn't work well**: Subtle emotions, micro-expressions, non-frontal faces, dark/uneven lighting
- **Key limitation**: FER2013 is a noisy dataset with low inter-annotator agreement. The model inherits this noise. Should NOT be used as a primary trust signal — it's supplementary.

### How RealSync Uses It
- Emotion feeds into the behavior confidence layer: `behavior_conf = 0.55 + emotion_confidence * 0.4`
- Higher emotion confidence → higher behavior confidence (range: 0.55–0.95)
- Rapid emotion changes (>5 in 15 frames) trigger an `emotion_instability` anomaly via temporal analysis

---

## 3. MediaPipe Face Detection

### What It Is
Google's MediaPipe Face Detection (lightweight model, `model_selection=0`). Detects face bounding boxes in real-time.

### Realistic Accuracy Assessment

| Metric | Value | Context |
|--------|-------|---------|
| **Published accuracy** | ~97% mAP on WIDER FACE (easy subset) | Google's benchmark |
| **Real-world estimate** | 90–95% | Webcam feeds, single-face scenarios |
| **Strengths** | Extremely fast (<5ms), handles multiple faces, works on CPU | Production-grade quality |
| **Weaknesses** | Less accurate on small/distant faces, partial occlusion, extreme angles | model_selection=0 is the lightweight variant |

### What's Working vs Not
- **Works well**: Webcam-distance faces, frontal to ~30 degree angles, good lighting. This is the most reliable model in the pipeline.
- **Doesn't work well**: Extreme side profiles, very small faces, heavy occlusion (masks, hands covering face)
- **Configuration**: Minimum detection confidence set to 40% with 30% padding around detected faces

### Role in Pipeline
- **Gatekeeper**: If MediaPipe detects no faces, the entire analysis returns a "no face detected" response
- Face crops (224x224) are fed to MesoNet-4, FER, and FaceNet identity tracker

---

## 4. FaceNet InceptionResnetV1 — Identity Tracking (UPGRADED)

### What It Is
A deep metric learning model (InceptionResnetV1) pretrained on the VGGFace2 dataset. Produces 512-dimensional face embeddings for identity verification. **Replaced the previous random-projection approach** which was a Phase 1 placeholder.

### How It Works
1. Resize face crop to 160x160 (FaceNet input requirement)
2. Normalize pixels to [-1, 1] range
3. Run InceptionResnetV1 inference (torch, eval mode, no_grad)
4. Output: 512-dim L2-normalized embedding
5. Compare against per-session baseline via cosine similarity
6. Exponential moving average updates baseline (alpha=0.1)

### Realistic Accuracy Assessment

| Metric | Value | Context |
|--------|-------|---------|
| **Published accuracy** | 99.65% on LFW (Labeled Faces in the Wild) | Standard face verification benchmark |
| **Real-world estimate** | 95–99% | Webcam quality, same-session consistency tracking |
| **Strengths** | State-of-the-art face embeddings, robust to lighting/angle variation, pretrained on 3.3M images | Production-grade identity verification |
| **Weaknesses** | ~40ms per face on CPU (vs <1ms for random projection), requires ~111MB model weights | Heavier than the previous approach |
| **Previous approach** | Random projection: 60–75% accuracy, 128-dim embeddings | Replaced — was a placeholder |

### Test Results (Verified Feb 2026)
- Embedding shape: 512-dim, L2-normalized (norm=1.0)
- **Same face across frames**: embeddingShift = 0.0, samePerson = true (perfect consistency)
- **Different face**: embeddingShift detected, triggers identity alerts
- **Deterministic**: Same input always produces identical embeddings (cosine sim = 1.000000)
- **Inference time**: ~30-40ms per face on Apple Silicon CPU (first call ~1100ms for model load)
- **Lazy loading**: Thread-safe double-checked locking, model loaded on first use

### Risk Thresholds
- Embedding shift < 20% → **Low risk** (same person)
- 20–40% → **Medium risk**
- Above 40% → **High risk** (likely different person)
- `samePerson` flag: shift < 25%

---

## 5. Temporal Analysis — Cross-Frame Smoothing & Anomaly Detection (NEW)

### What It Is
A sliding-window analyzer that tracks trust scores, identity shifts, and emotion labels across the last 15 frames per session. Reduces MesoNet-4 single-frame false positives and detects multi-frame anomaly patterns.

### How It Works
- Per-session circular buffer of 15 frame snapshots
- Each snapshot stores: trustScore, authenticityScore, embeddingShift, emotionLabel, timestamp
- Computes EWMA-smoothed trust score (decay=0.85) — recent frames weighted highest
- After 3+ frames of history, the smoothed score replaces the raw trust score in the API response
- TTL eviction (3600s) for inactive sessions

### Outputs

| Field | Type | Description |
|-------|------|-------------|
| `smoothedTrustScore` | float (0-1) | EWMA of trust scores across buffer |
| `trendDirection` | string | "stable", "improving", or "declining" (compares first 5 vs last 5 frames) |
| `volatility` | float (0-1) | Standard deviation of trust scores in buffer |
| `frameCount` | int | Number of frames in the buffer |
| `anomalies` | array | List of detected anomalies with type, description, severity |

### Anomaly Detection Rules

| Anomaly | Trigger | Severity | Description |
|---------|---------|----------|-------------|
| `sudden_trust_drop` | Current trust > 0.20 below buffer mean | High | Single frame trust plummets — possible deepfake activation |
| `identity_switch` | Avg shift < 0.15 then current shift > 0.35 | High | Sudden change in face identity — person may have swapped |
| `emotion_instability` | Emotion changed > 5 times in window | Medium | Unnatural rapid emotion cycling — possible synthetic face |

### Test Results (Verified Feb 2026)
- **Stable sequence**: 5 frames at trust ~0.85 → smoothed=0.850, trend="stable", volatility=0.010, no anomalies
- **Improving sequence**: Trust rising from 0.83 to 0.96 → trend="improving", smoothed tracks upward
- **Sudden drop**: Trust drops from avg 0.88 to 0.40 → `sudden_trust_drop` anomaly fired (severity: high)
- **Identity switch**: Shift jumps from avg 0.05 to 0.55 → `identity_switch` anomaly fired (severity: high)
- **Emotion instability**: 7 emotion changes in 8 frames → `emotion_instability` anomaly fired (severity: medium)
- **Session cleanup**: `clear_session()` resets buffer, next frame starts fresh (frameCount=1)

### Impact on Trust Score
The smoothed trust score stabilizes noisy MesoNet-4 outputs. For example, if MesoNet-4 incorrectly flags one frame as 48% authentic (high risk) in a sequence of 85%+ frames, the EWMA dampens this to ~80% instead of showing a misleading spike on the dashboard.

---

## 6. Trust Score Computation

The aggregated trust score combines all model outputs:

```
raw_trust = average(
    authenticity_score,          # MesoNet-4 (0-1)
    1 - embedding_shift,         # FaceNet identity (0-1)
    0.55 + emotion_conf * 0.4    # FER-derived behavior (0.55-0.95)
)

# After 3+ frames, replaced by temporal EWMA:
trust_score = temporal.smoothedTrustScore   # if frameCount >= 3
```

### Confidence Layers
| Layer | Source | Weight | Realistic Reliability |
|-------|--------|--------|----------------------|
| **Video** | MesoNet-4 authenticity | 1/3 | Medium — good baseline, not SOTA |
| **Identity** | 1 - FaceNet embedding shift | 1/3 | **High** — FaceNet >99% on LFW (upgraded from Low-Medium) |
| **Behavior** | Emotion confidence | 1/3 | Low — FER accuracy is limited |
| **Temporal** | EWMA smoothing | Replaces raw after 3 frames | Medium-High — reduces false positives significantly |
| **Audio** | Not yet integrated | N/A | Planned for future |

### Overall Assessment
- The trust score is now a **stronger prototype metric** thanks to FaceNet identity accuracy and temporal smoothing
- Identity layer upgraded from "placeholder" to production-grade face verification
- Temporal smoothing eliminates single-frame noise from MesoNet-4 false positives
- Still should NOT be treated as a definitive security verdict (MesoNet-4 and FER have known ceilings)
- Audio analysis (planned but not implemented) would be the next major accuracy improvement

---

## 7. Known Limitations & Upgrade Path

### Current Limitations
1. **No audio deepfake detection** — the audio confidence layer is always `null`
2. **MesoNet-4 is dated** — published 2018, newer GAN techniques can fool it
3. **FER accuracy ceiling** — ~65% even in ideal conditions
4. ~~**Identity tracking is a placeholder**~~ — **RESOLVED**: Now uses FaceNet (>99% accuracy)
5. ~~**Single-frame analysis**~~ — **RESOLVED**: Temporal analysis smooths across 15 frames with anomaly detection
6. **No adversarial robustness** — none of the models are hardened against adversarial attacks

### Recommended Upgrades (Priority Order)
1. ~~**Replace IdentityTracker** with FaceNet/ArcFace~~ — **DONE** (Feb 2026)
2. **Add audio deepfake detection** (e.g., RawNet2, AASIST) → fills the missing confidence layer
3. **Upgrade MesoNet-4** to EfficientNet-B4 or Xception-based detector → better on modern deepfakes
4. ~~**Add temporal analysis**~~ — **DONE** (Feb 2026)
5. **Ensemble deepfake models** — combine multiple detectors for higher confidence

---

## 8. Summary Table

| Model | Purpose | Input | Real-World Accuracy | Status |
|-------|---------|-------|-------------------|--------|
| **MesoNet-4** | Deepfake detection | 256x256 RGB | 65–80% | Functional, dated |
| **FER** | Emotion recognition | BGR image | 50–65% | Functional, noisy |
| **MediaPipe** | Face detection | RGB image | 90–95% | Reliable, production-grade |
| **FaceNet** | Identity consistency | 160x160 RGB | 95–99% | **Upgraded** — production-grade |
| **Temporal Analyzer** | Cross-frame smoothing | Frame history | N/A (meta-layer) | **New** — reduces false positives |
| **Trust Score** | Aggregate metric | All models | Improved over v1 | Smoothed, stronger identity signal |

### Dependency Notes
- `facenet-pytorch==2.6.0` installed with `--no-deps` flag to avoid torch version conflict (requires torch<2.3 but project uses torch==2.4.1). **Verified working** with torch 2.4.1 — no runtime issues.
- MediaPipe requires `tensorflow==2.17.1` and `protobuf==4.25.3` (not newer versions). Pin these in requirements.txt if environment conflicts arise.
