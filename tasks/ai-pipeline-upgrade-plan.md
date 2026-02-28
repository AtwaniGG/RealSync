# RealSync AI Detection Pipeline Upgrade Plan

## Context

RealSync's AI models are outdated and incomplete. MesoNet-4 (2018) produces 48% authenticity on real Zoom video. The audio deepfake model is trained but not integrated (`audio_conf = None`). FER emotion detection is broken. Fraud detection is regex-only. There's no camera-off handling. This plan upgrades every detection model to state-of-the-art, adds behavioral text analysis, and completes the multi-modal pipeline for cloud deployment on a 4-core 8GB VM.

## Final Model Stack

| Component | Current | Upgrade | Source |
|-----------|---------|---------|--------|
| Video Deepfake | MesoNet-4 (400K params) | **EfficientNet-B4 + SBI** (19M) | [DeepfakeBench](https://github.com/SCLBD/DeepfakeBench) |
| Audio Deepfake | AudioDeepfakeNet (NOT integrated) | **AASIST** (85K-220K) | [clovaai/aasist](https://github.com/clovaai/aasist) |
| Text Analysis | Regex keywords | **DeBERTa-v3 zero-shot NLI** (86M) | [HuggingFace](https://huggingface.co/MoritzLaurer/deberta-v3-base-zeroshot-v2.0) |
| Emotion | FER library (broken) | **Custom MobileNetV2** (already trained) | `src/models/emotion_weights.pth` |
| Identity | FaceNet (>99% LFW) | **Keep as-is** | Already working |

## Dependency Graph

```
Phase 1 (Emotion)  ──┐
Phase 2 (Video)    ──┤── independent, any order
Phase 3 (Temporal) ──┤
Phase 4 (Audio)    ──┤
Phase 5 (Text)     ──┘
                      ↓
Phase 6 (Trust Score) ── depends on Phase 4 (needs audio signal)
                      ↓
Phase 7 (Camera-Off) ── depends on Phase 6 (needs weighted formula)
```

---

## Phase 1: Replace FER with Custom MobileNetV2 Emotion Model

**Why**: FER is broken (setuptools issue). Your trained weights already exist, just unused.

### New File: `RealSync-AI-Prototype/serve/emotion_model.py`
- Build MobileNetV2 backbone + custom head (1280→256→7 classes, matching `train_emotion.py` architecture)
- Lazy-load with double-checked locking (same pattern as identity_tracker.py)
- Load weights from `src/models/emotion_weights.pth` (checkpoint format — extract `model_state_dict` key)
- Input: 128x128 RGB, ImageNet-normalized
- Output: 7 classes (angry, disgust, fear, happy, sad, surprise, neutral)
- Map disgust→angry for the 6-class public API (existing convention)
- Export `predict_emotion(face_crop_bgr)` → `{label, confidence, scores}`

### Modify: `serve/inference.py`
- Remove `_fer_detector`, `_fer_lock`, `_get_fer()` (lines 42, 49, 73-87)
- Remove `analyze_emotion()` body (lines 251-326)
- Import and call `predict_emotion()` from new module
- Keep the same return shape `{label, confidence, scores}`

### Modify: `serve/app.py`
- Replace FER warmup in `lifespan()` with `get_emotion_model()` call
- Update health endpoint: check emotion model instead of FER

### Modify: `serve/config.py`
- Add `EMOTION_INPUT_SIZE = 128`, `EMOTION_WEIGHTS_PATH`

### Modify: `requirements.txt`
- Remove `fer==22.5.1`
- Keep `tensorflow==2.17.1` for now (MesoNet still needs it until Phase 2)

### Verify
- `curl http://localhost:5100/api/health` — emotion: "loaded"
- Send test frame, confirm emotion scores in response with 6-class labels

---

## Phase 2: Replace MesoNet-4 with EfficientNet-B4 + SBI

**Why**: MesoNet-4 is a 2018 model. EfficientNet-B4+SBI achieves ~94% AUC with best cross-dataset generalization.

### Weight Acquisition
- Download EfficientNet-B4 ImageNet pretrained: `torchvision.models.efficientnet_b4(weights="IMAGENET1K_V1")`
- For SBI fine-tuning: clone [DeepfakeBench](https://github.com/SCLBD/DeepfakeBench), use their SBI training config with FF++ + Celeb-DF v2
- Save fine-tuned weights to `src/models/efficientnet_b4_deepfake.pth`

### New File: `RealSync-AI-Prototype/serve/deepfake_model.py`
- Build EfficientNet-B4 with binary head (1792→1, sigmoid)
- Lazy-load with double-checked locking
- Load SBI-trained weights; fallback to ImageNet pretrained if not found
- Input: 380x380 RGB, ImageNet-normalized (EfficientNet-B4 default size)
- Output: `{authenticityScore, riskLevel, model: "EfficientNet-B4-SBI"}`
- Same risk thresholds: >0.85=low, >0.70=medium, ≤0.70=high

### New File: `RealSync-AI-Prototype/training/train_efficientnet_sbi.py`
- SBI training script adapted from DeepfakeBench
- Self-blended image augmentation on FF++ + Celeb-DF v2
- Binary cross-entropy loss, AdamW optimizer
- Saves to `src/models/efficientnet_b4_deepfake.pth`

### Modify: `serve/inference.py`
- Remove `_mesonet_model`, `_mesonet_lock`, `_get_mesonet()` (lines 41, 47, 56-70)
- Remove `from video_model import get_model` import
- Replace `analyze_deepfake()` (lines 203-248) with call to `predict_deepfake()`
- **Critical**: Face crops need different sizes per model. Modify `detect_faces()` to store original-size crop alongside the 224x224 resized one:
  ```python
  faces.append({
      ...existing fields...,
      "crop": crop_resized,           # 224x224 (backward compat)
      "crop_original": crop,          # original size, each model resizes as needed
  })
  ```

### Modify: `serve/config.py`
- Add `EFFICIENTNET_INPUT_SIZE = 380`, `EFFICIENTNET_WEIGHTS_PATH`
- Remove `MESONET_INPUT_SIZE`, `WEIGHTS_PATH` (MesoNet paths)

### Modify: `serve/app.py`
- Replace MesoNet warmup with `get_deepfake_model()`
- Update health endpoint

### Modify: `requirements.txt`
- Remove `tensorflow==2.17.1` (was only for MesoNet/Keras)
- `torch`, `torchvision` already present

### Verify
- Health check shows deepfake: "loaded"
- Test frame returns `model: "EfficientNet-B4-SBI"`, authenticity in reasonable range
- Latency ~300ms/frame on CPU (vs ~50ms for MesoNet — acceptable for 2fps)

---

## Phase 3: Wire Temporal Data into Backend Alert Fusion

**Why**: AI service already computes temporal anomalies. Backend ignores them. Zero new dependencies.

### Modify: `realsync-backend/lib/alertFusion.js`
- Add `evaluateTemporal(session, result)` method
- Check `result.aggregated.temporal.anomalies[]` for:
  - `sudden_trust_drop` → high severity deepfake alert
  - `identity_switch` → critical severity identity alert
  - `emotion_instability` → low severity emotion alert (60s cooldown)
- Use existing `_canEmit()` cooldown mechanism

### Modify: `realsync-backend/index.js` (in `handleFrame()`, after line ~556)
- After `evaluateVisual()`, call `evaluateTemporal()`
- Process temporal alerts same way: add recommendation, push, broadcast, persist

### Verify
- Send rapid frames with varying trust scores
- Confirm temporal anomaly alerts fire with `model: "temporal-analyzer"`

---

## Phase 4: Audio Extraction Pipeline + AASIST Audio Deepfake Detection

**Why**: Audio deepfake model exists but isn't integrated. AASIST (0.83% EER) replaces the basic CNN. The audio extraction pipeline from Zoom bot to AI service must be built end-to-end.

### Audio Extraction Pipeline (currently missing)

**Current flow** (audio only goes to transcription):
```
ZoomBotAdapter (ScriptProcessorNode, 48kHz→16kHz PCM16, 500ms chunks)
  → WS message {type: "audio_pcm", dataB64, sampleRate: 16000, channels: 1}
  → backend index.js audio_pcm handler (line ~443)
  → session.stt.write(audioBuffer)  ← ONLY goes to GCP STT
  → (end — audio never reaches AI service)
```

**New flow** (audio goes to BOTH transcription AND deepfake detection):
```
ZoomBotAdapter (same capture — no changes needed)
  → WS message {type: "audio_pcm", dataB64, sampleRate: 16000, channels: 1}
  → backend index.js audio_pcm handler
  → FORK:
      ├─ session.stt.write(audioBuffer)           ← transcription (unchanged)
      └─ session.audioAnalysisBuffer.push(dataB64) ← NEW: accumulate for AI
          └─ every 4s: combine chunks → POST /api/analyze/audio → AASIST
              └─ result stored in session.audioAuthenticityScore
```

**Key details for the audio extraction**:
- ZoomBotAdapter already captures and downsamples audio (48kHz→16kHz). No changes needed there.
- Backend `audio_pcm` handler receives 500ms PCM16 chunks (~16000 samples each). We accumulate 8 chunks (4 seconds = 64000 samples) before sending to AI service.
- Audio buffer management: ring buffer per session, cleared after each AI call. If AI call is in-flight, keep accumulating (don't drop chunks).
- `combineAudioChunks()` helper: `Buffer.concat(chunks.map(b64 => Buffer.from(b64, "base64"))).toString("base64")`

### Weight Acquisition
- Clone [clovaai/aasist](https://github.com/clovaai/aasist)
- Download pretrained weights from repo releases
- Save to `src/models/aasist_weights.pth`

### New File: `RealSync-AI-Prototype/serve/aasist_arch.py`
- Copy AASIST model architecture from official repo (MIT licensed)
- Key components: RawNet2 encoder + graph attention network + readout

### New File: `RealSync-AI-Prototype/serve/audio_model.py`
- Lazy-load AASIST with double-checked locking
- Input: raw PCM16 waveform (16kHz mono), pad/truncate to 4 seconds (64000 samples)
- Convert int16 → float32 [-1,1]
- Output: `{authenticityScore, riskLevel, model: "AASIST"}`
- Same risk thresholds as video

### New Endpoint: `POST /api/analyze/audio` in `serve/app.py`
- Request: `{sessionId, audioB64 (base64 PCM16 mono 16kHz), durationMs?}`
- Response: `{sessionId, processedAt, audio: {authenticityScore, riskLevel, model}}`

### Modify: `realsync-backend/lib/aiClient.js`
- Add `analyzeAudio({sessionId, audioB64, durationMs})` function
- Same timeout/fallback pattern as `analyzeFrame()`
- Export it

### Modify: `realsync-backend/index.js`
- In `audio_pcm` handler (line ~443): after `session.stt.write()`, accumulate audio chunks
- Every 4 seconds, combine accumulated chunks and call `analyzeAudio()`
- Store result in `session.audioAuthenticityScore`
- Update `session.metrics.confidenceLayers.audio`
- Add to session state: `audioAnalysisBuffer: []`, `audioAnalysisInFlight: false`, `lastAudioAnalysisAt: 0`
- Add helper: `combineAudioChunks(chunks)` — concatenate base64 PCM buffers

### Modify: `contracts/ai-inference.schema.json`
- Add `analyzeAudioRequest` and `analyzeAudioResponse` schemas

### Verify
- `curl -X POST /api/analyze/audio` with base64 PCM data → response has authenticityScore
- Full pipeline: Zoom bot audio flows to both GCP STT and AI service
- Dashboard Audio confidence layer shows non-null value

---

## Phase 5: Text Extraction/Transcription Pipeline + DeBERTa-v3 Zero-Shot NLI Text Analysis

**Why**: Catches contextual scams that regex misses. No training data needed. Must also ensure the transcription pipeline feeds DeBERTa reliably.

### Text Extraction/Transcription Pipeline

**Current flow** (transcription → keyword matching only):
```
ZoomBotAdapter (2 sources):
  ├─ Audio capture (PCM) → backend audio_pcm handler → GCP STT → transcript
  └─ DOM caption scraping (1s interval) → backend caption handler → transcript
      ↓
handleTranscript(session, {text, isFinal, confidence, speaker, ts})
  → persist to Supabase (if isFinal)
  → fraudDetector.evaluate(text, metrics)  ← regex/keyword only
  → (end — no semantic analysis)
```

**New flow** (transcription → keyword matching + DeBERTa behavioral analysis):
```
Same transcription sources (no changes to capture)
      ↓
handleTranscript(session, {text, isFinal, confidence, speaker, ts})
  → persist to Supabase (unchanged)
  → fraudDetector.evaluate(text, metrics)           ← regex (fast, instant)
  → FORK (throttled every 15s, on isFinal only):
      └─ collect 60s rolling window text from fraudDetector.recentLines
      └─ POST /api/analyze/text {sessionId, text}   ← NEW: DeBERTa analysis
      └─ process behavioral signals → alerts
```

### New File: `RealSync-AI-Prototype/serve/text_analyzer.py`
- Lazy-load `MoritzLaurer/deberta-v3-base-zeroshot-v2.0` pipeline
- Behavioral hypotheses:
  - "This person is pressuring someone to act urgently"
  - "This person is requesting sensitive personal information"
  - "This person is impersonating an authority figure"
  - "This person is using emotional manipulation"
  - "This person is trying to isolate the listener from external advice"
- Input: transcript text (60s window, truncated to ~2000 chars)
- Output: `{signals: [{hypothesis, category, score, severity}], highestScore, model}`
- Thresholds: >=0.65 = alert, >=0.80 = high severity

### New Endpoint: `POST /api/analyze/text` in `serve/app.py`
- Request: `{sessionId, text}`
- Response: `{sessionId, processedAt, behavioral: {signals, highestScore, model}}`

### Modify: `realsync-backend/lib/aiClient.js`
- Add `analyzeText({sessionId, text})` function, same pattern

### Modify: `realsync-backend/lib/fraudDetector.js`
- Add `evaluateBehavioral(behavioralSignals, sessionMetrics)` method
- Apply visual risk boost to DeBERTa scores (same boost formula as keyword detection)
- Map categories: social_engineering→scam, credential_theft→scam, impersonation→scam, etc.
- Respect cooldowns per category (60s)

### Modify: `realsync-backend/index.js` (in `handleTranscript()`, after line ~367)
- After keyword fraud detection, throttled every 15s:
  - Collect 60s transcript window text
  - Call `analyzeText()` with the window
  - Process returned signals through `evaluateBehavioral()`
  - Fuse with alertFusion, add recommendations, broadcast, persist
- Add `session.lastBehavioralAnalysisAt` for throttling

### Modify: `requirements.txt`
- Add `transformers>=4.35.0`
- Add `sentencepiece>=0.1.99`

### Verify
- `curl -X POST /api/analyze/text` with scam text → signals with high scores
- Live meeting with social engineering script → behavioral alerts in dashboard

---

## Phase 6: Redesign Trust Score Formula

**Why**: Simple average of 3 signals → weighted composite of 4 signals.

### New Formula

**Camera on (all signals available):**
```
trust = 0.35 * video + 0.25 * audio + 0.25 * (1-identityShift) + 0.15 * behavior
```

**Audio unavailable (no audio data yet):**
```
trust = 0.47 * video + 0.33 * (1-identityShift) + 0.20 * behavior
```

### Modify: `serve/inference.py` (lines 398-412)
- Compute partial trust (video + identity + behavior) with proportional weights
- Audio is handled separately by backend (comes from different endpoint)
- Still apply temporal smoothing after 3+ frames

### Modify: `realsync-backend/index.js` (in `handleFrame()`)
- After receiving AI result AND having `session.audioAuthenticityScore`:
  - If audio available: 4-signal weighted composite
  - If audio null: 3-signal redistributed weights
- Override `session.metrics.trustScore` with final composite

### Modify: `realsync-backend/lib/aiClient.js`
- Update `generateMockResponse()` to use weighted formula and include non-null audio

### Verify
- Trust score changes when audio signal is present vs absent
- Dashboard shows all 3 confidence layer bars populated

---

## Phase 7: Camera-Off Mode

**Why**: When participant has camera off, system must degrade gracefully to audio+text analysis.

### Modify: `serve/inference.py`
- Track consecutive no-face frames per session: `_no_face_counters = {}`
- After 5 consecutive frames with no face → return `cameraOff: true` response
- Camera-off response: `trustScore: null`, `deepfake.model: "camera-off"`, video signals null
- Reset counter when face detected again

### Modify: `realsync-backend/index.js` (in `handleFrame()`)
- When `result.aggregated.cameraOff === true`:
  - Compute audio-only trust: `trust = 0.60 * audio + 0.40 * behavior`
  - Set `session.metrics.cameraOff = true`
  - Set video confidence layer to null
  - Broadcast metrics, skip visual alert evaluation

### Modify: `Front-End/src/components/screens/DashboardScreen.tsx`
- Add `cameraOff?: boolean` to Metrics type
- When `cameraOff`: show "Camera off — Audio-only analysis" indicator in deepfake panel
- Grey out Video confidence layer bar
- This is the **only frontend change** across all 7 phases

### Verify
- Cover camera → after ~10s, dashboard shows camera-off indicator
- Trust score still computed from audio + behavior
- Uncover camera → seamlessly returns to full analysis

---

## Updated requirements.txt (Final State)

```
opencv-python==4.10.0.84
numpy==1.26.4
mediapipe==0.10.18
torch==2.4.1
torchvision==0.19.1
torchaudio==2.4.1
facenet-pytorch==2.6.0
scikit-learn==1.5.2
transformers>=4.35.0
sentencepiece>=0.1.99
fastapi==0.115.6
uvicorn[standard]==0.32.1
pydantic==2.10.3
```

**Removed**: `fer==22.5.1`, `tensorflow==2.17.1`, `moviepy==1.0.3`

## Model Weights to Obtain

| Model | File | Size | How |
|-------|------|------|-----|
| EfficientNet-B4 SBI | `src/models/efficientnet_b4_deepfake.pth` | ~80MB | Train via DeepfakeBench or download pretrained |
| AASIST | `src/models/aasist_weights.pth` | ~5-10MB | Download from [clovaai/aasist](https://github.com/clovaai/aasist) releases |
| MobileNetV2 Emotion | `src/models/emotion_weights.pth` | ~10MB | **Already exists** |
| DeBERTa-v3-base | HF cache (~/.cache/huggingface) | ~350MB | Auto-downloaded by `transformers` on first use |
| FaceNet | Torch Hub cache | ~100MB | **Already working** |

## Docker Update (`RealSync-AI-Prototype/Dockerfile`)

Add DeBERTa pre-download during build to avoid runtime download:
```dockerfile
RUN python -c "from transformers import pipeline; pipeline('zero-shot-classification', model='MoritzLaurer/deberta-v3-base-zeroshot-v2.0')"
```

## Breaking Changes

- **None for frontend** (except Phase 7 adding optional `cameraOff` field)
- **None for backend API** (new endpoints added, existing unchanged)
- `deepfake.model` field changes from `"MesoNet-4"` to `"EfficientNet-B4-SBI"` (informational only)
- Mock/fallback behavior preserved for all endpoints

## End-to-End Verification

1. Start AI service: `cd RealSync-AI-Prototype && python -m serve.app`
2. Check health: `curl http://localhost:5100/api/health` — all models "loaded"
3. Start backend: `cd realsync-backend && npm start`
4. Start frontend: `cd Front-End && npm run dev`
5. Create a session with a Zoom meeting URL
6. Verify:
   - Dashboard trust score uses weighted formula
   - Audio confidence layer shows non-null value
   - Deepfake model shows "EfficientNet-B4-SBI"
   - Emotion scores are non-zero
   - Scam transcript triggers behavioral alerts (not just keyword alerts)
   - Cover camera → dashboard shows "Audio-only analysis"
   - Uncover camera → full analysis resumes
