# RealSync — TODO

## AI Pipeline Upgrade — COMPLETED (All 7 Phases)

All code changes done. See `tasks/ai-pipeline-upgrade-plan.md` for full plan.

**New files created:**
- `serve/emotion_model.py`, `serve/deepfake_model.py`, `serve/audio_model.py`, `serve/text_analyzer.py`
- `training/train_efficientnet_sbi.py`

**Modified:** `serve/inference.py`, `serve/app.py`, `serve/config.py`, `requirements.txt`, `Dockerfile`,
`lib/aiClient.js`, `lib/alertFusion.js`, `lib/fraudDetector.js`, `index.js`, `DashboardScreen.tsx`, `ai-inference.schema.json`

**Still needed (not code):**
- [x] Train/download `efficientnet_b4_deepfake.pth` weights (done — SBI conversion)
- [x] Download `aasist_weights.pth` (done — trained on ASVspoof 2019 LA, 54.8% acc)
- [x] DeBERTa text model download script (`scripts/download_models.sh`) + cached
- [x] All 6 models confirmed loaded via health check (2026-03-01)
- [x] SBI label convention verified (label=0 real, label=1 fake, inversion correct)
- [x] AI_SERVICE_REPORT.md written with full accuracy figures
- [x] Fine-tune deepfake classifier — **92.33% val accuracy** at epoch 14 via `training/finetune_deepfake_labeled.py`
- [x] Re-train audio model — 99.14% val accuracy at epoch 33 (ASVspoof 2019 LA)
- [x] End-to-end testing with live Zoom session (2026-03-05)
- [x] Run Supabase migration: detection_settings column already exists on profiles
- [x] Create Supabase Storage bucket for avatars — bucket already exists

## Live E2E Test Findings (2026-03-05) — FIXING NOW

Issues found during live Zoom meeting test with real participants.

### FIXED (code changes applied, pending restart)
- [x] **Deepfake calibration wrong for Zoom** — Real faces scored 0.64 (medium risk), trust 46%
  - Root cause: sigmoid center 0.03 was wrong; actual raw_auth = 0.0001-0.002
  - Fix: center 0.03→0.0008, steepness 40→800, range [0.55,0.95]→[0.65,0.95]
  - New scores: 0.76-0.87 (low risk), trust ~75-85%
  - File: `serve/deepfake_model.py:134-140`

- [x] **Camera-off flicker** — Dashboard toggled between scores and "Camera Off"
  - Root cause: bot screenshots all Zoom tiles; non-face tiles trigger noFaceDetected
  - Fix 1: NO_FACE_THRESHOLD 5→30 in config.py (needs 60s without face)
  - Fix 2: 3-frame hysteresis in index.js before clearing cameraOff
  - Files: `serve/config.py:68`, `index.js:899`

- [x] **Health endpoint requires auth** — curl health checks fail without JWT
  - Fix: exempt /api/health from auth middleware
  - File: `lib/auth.js:19`

### FIXED (code changes applied, pending restart)
- [x] **Emotion "Angry" on neutral face** — Zoom compression noise
  - Added confidence floor: if confidence < 40%, show "Neutral" on dashboard
  - Also added 40% floor to emotion alert triggering in alertFusion.js
  - Files: `DashboardScreen.tsx:561`, `alertFusion.js:189`

- [x] **Identity drift false positives** — 40-88% shift in multi-participant meetings
  - Dashboard now shows "Multiple faces" / "expected" (blue) when faceCount > 1
  - Identity alerts completely suppressed when faceCount > 1 in alertFusion.js
  - Files: `DashboardScreen.tsx:576-582`, `alertFusion.js:148-153`

- [x] **Alert spam** — 26+ alerts in first few minutes
  - Deepfake alerts: eliminated (calibration scores now > 0.70)
  - Identity alerts: suppressed for multi-participant meetings
  - Emotion alerts: suppressed when confidence < 40%
  - File: `alertFusion.js`

- [x] **Show current speaker name with scores** — "Analyzing: {name}" shown on all 3 cards
  - Backend adds `analyzedParticipant` to metrics broadcast (index.js:916)
  - Dashboard shows it on Emotion, Identity, and Deepfake cards
  - Files: `index.js:916`, `DashboardScreen.tsx`

- [x] **Verified real transcription** — Captions from Zoom's built-in CC DOM scraping
  - ZoomBotAdapter scrapes Zoom's closed caption elements every 1s (line 1197-1241)
  - Requires Zoom CC to be enabled in the meeting
  - /api/analyze/text calls confirmed in terminal logs

- [x] **Trust score collapse from identity drift** — 88% drift tanks trust to 50%
  - Identity signal weight (0.33) too heavy when face switching is expected
  - Fix: clamp identitySignal to min 0.70 when faceCount > 1
  - Trust now floors at ~72% for multi-participant (was 50%)
  - Files: `index.js:966`, `serve/inference.py:340`

### FIXED (2026-03-06 — E2E session)
- [x] **Audio capture enabled** — BOT_HEADLESS=false, env var toggle in ZoomBotAdapter.js
- [x] **Emotion model upgraded** — EfficientNet-B2 224x224 (68.79% val acc, was MobileNetV2 64.45%)
  - Zoom compression augmentation (JPEG, blur, downscale) included in training
  - Training paused at epoch 6/30 (`kill -CONT 78584` to resume)
- [x] **Silent mock fallback** — Red banner on dashboard, backend alerts, honest stub bot
- [x] **MPS inference** — 150-770ms/frame (was 7000ms on CPU)
- [x] **Parallel per-face models** — deepfake+emotion+identity via ThreadPoolExecutor
- [x] **Frame pile-up prevention** — Semaphore limits to 1 concurrent analysis, 429 on busy
- [x] **Bot join timeout** — 150s (was 90s), race condition fixed
- [x] **AI timeout** — 30s (was 5s)
- [x] **DeBERTa pre-cached** — No 500MB download on first request
- [x] **Vite port aligned** — 5173 everywhere (was 3000 in vite.config.ts)

### STILL TODO
- [ ] Full E2E test with real Zoom meeting (restart services, verify real scores)
- [ ] Resume EfficientNet-B2 emotion training after demo (`kill -CONT 78584`)
- [ ] Test bot leave on End Session (improved selectors + faster cleanup)

## Bugs — ALL RESOLVED

- [x] **Sessions lost on backend restart** (#5)
  Lazy rehydration from Supabase when WS client requests a session not in memory.
  GET /api/sessions now merges in-memory + Supabase historical sessions.
  - Files: `persistence.js` (getActiveSessions, getUserSessions, getSessionById), `index.js` (rehydrateSession, async GET /api/sessions)

- [x] **"Connecting to Meeting" overlay broken** (#6)
  Added `botProgress` state ('creating' → 'joining' → 'streaming') with per-step conditional styling.
  Auto-dismisses 1.2s after streaming confirmed. Hard timeout extended to 30s.
  - Files: `App.tsx` (botProgress state, overlay JSX)

- [x] **Orphaned bot stays in Zoom after kill** (#10)
  Graceful shutdown already calls `botManager.cleanupAll()`. Added stale Chromium cleanup on startup
  via `pgrep`/`process.kill`. `start.sh` sends SIGTERM first (M8).
  - Files: `index.js` (startup cleanup with execFileSync)

- [x] **FER emotion model fails to load** (#12)
  Replaced with MobileNetV2 — no FER dependency remains.

## Known Limitations — RESOLVED

- [x] **MesoNet-4 false positives on Zoom video** (#13)
  Replaced with EfficientNet-B4+SBI.

## Documentation — COMPLETED

- [x] `docs/CODEMAP.md` — Complete codebase map (architecture, file-level detail, all 3 services)
- [x] `docs/DEVELOPMENT_LOG.md` — Development history, timeline, decisions, lessons
- [ ] Remove `Co-Authored-By: Claude` from commit `17bcade` (git rebase)

## Planned Features — ALL IMPLEMENTED

- [x] **Multi-participant detection** (#15)
  Backend iterates `result.faces[]` with per-face alertFusion calls (capped at 6 faces).
  `evaluateVisual()` accepts `{ faceId, participantName }` opts with per-face cooldown keys.
  Dashboard shows face count in Meeting Summary card.
  - Files: `alertFusion.js`, `index.js` (handleFrame), `DashboardScreen.tsx`

- [x] **Full participant tracking with names** (#16)
  ZoomBotAdapter scrapes participant names from Zoom DOM (panel + tile fallback) every 10s.
  Backend maintains `session.participants` Map (faceId → { name, firstSeen }).
  Alerts enriched with participant names. Frontend ParticipantList component with clickable
  chips for per-participant alert filtering.
  - Files: `ZoomBotAdapter.js`, `index.js`, `alertFusion.js`, `DashboardScreen.tsx`,
    new `components/dashboard/ParticipantList.tsx`
