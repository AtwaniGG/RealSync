# RealSync — Lessons Learned

## Session: 2026-02-27

### 1. Correct project directory
- **Mistake**: Created files in `/RealSync New/` instead of `/RealSync/`
- **Rule**: The active project is at `/Users/ahmed/Desktop/CSIT321/term2_files/RealSync/` — always use this path. `RealSync New` is a stale copy.

### 2. Verify before assuming work is needed
- **Mistake**: Tried to re-implement a plan that was already done (`.env` files + `DEPLOYMENT.md`)
- **Rule**: Before creating files, check if they already exist in the correct directory first.

### 3. Bug: Session checkbox doesn't select the session
- **Issue**: The checkmark in the Session History table does not actually select/activate the session
- **Location**: `Front-End/src/components/screens/SessionsScreen.tsx`
- **Status**: FIXED — quick win

### 4. Bug: No "End Session" button on dashboard while session is active
- **Issue**: When a session is active, the dashboard shows session info but no way to end it
- **Location**: `Front-End/src/components/screens/DashboardScreen.tsx`
- **Status**: FIXED — End Session button added to DashboardScreen

### 5. Bug: Sessions lost on backend restart
- **Issue**: Sessions screen shows 0 sessions after backend restarts because sessions are stored in-memory only. Supabase has the data but the frontend/backend don't reload from it.
- **Status**: TODO — fix later

### 6. Bug: "Connecting to Meeting" overlay is broken
- **Issue**: The overlay shows on top of the dashboard but the dashboard is still visible and updating behind it. The overlay should fully cover the screen with a clean loading state. The progress steps (Creating session → Bot joining → Streaming) don't update — stays on "Creating session" even though the bot is joining. Auto-dismisses after 15s timeout instead of responding to actual bot status.
- **Location**: `Front-End/src/components/screens/DashboardScreen.tsx` (overlay), `App.tsx` (botConnecting state)
- **Status**: TODO — fix later

### 7. Bug: Bot joins Zoom but dashboard stays on "simulated" data
- **Issue**: The Puppeteer bot successfully joins the Zoom meeting (logs confirm "Meeting view detected — we're in!") but the dashboard never switches from "simulated" to "model server" / "external". No frame processing logs appear after bot joins.
- **Debug progress**: Added console.log to `processIngestMessage` and `handleFrame` in `index.js`. Confirmed frames ARE flowing (`type=frame dataLen=60216`). The issue is between `handleFrame` and the AI service response. Debug logs added at lines ~514-527 will show if AI service responds or times out. Also check `realsync-backend/lib/aiClient.js` for the actual HTTP call to `http://localhost:5100/api/analyze/frame`.
- **Key files**: `realsync-backend/index.js` (processIngestMessage ~line 749, handleFrame ~line 514), `realsync-backend/lib/aiClient.js`, `RealSync-AI-Prototype/serve/app.py`
- **Next step**:
  1. Run `cd /Users/ahmed/Desktop/CSIT321/term2_files/RealSync && bash start.sh` to start all services
  2. Create session with Zoom URL
  3. Check `/tmp/realsync-backend.log` or terminal output for `[handleFrame]` lines
  4. If `source=mock` → AI service call failing (check `realsync-backend/lib/aiClient.js` timeout/URL)
  5. If `SKIPPED (in-flight)` → first frame never completes (AI service hanging)
  6. If no `[handleFrame]` at all → `processIngestMessage` not routing frames (check frameInFlight map)
  7. REMOVE debug console.logs from index.js after fixing
- **Key finding**: Sessions API returns `[]` even though dashboard shows session a2df47d9. This means the backend process serving requests was started by `start.sh` BEFORE debug logs were added to index.js. The running backend has OLD code without debug logs.
- **To reproduce next session**:
  1. Kill all: `lsof -ti:5173,4000,5100 | xargs kill -9`
  2. Run `cd /Users/ahmed/Desktop/CSIT321/term2_files/RealSync && bash start.sh`
  3. This will pick up the NEW index.js with debug logs
  4. Create session with Zoom URL, wait for bot to join
  5. Check terminal output for `[handleFrame]` and `[ingest]` lines
  6. Also: sessions returning `[]` while dashboard shows data = possible auth mismatch (requireSessionOwner filtering)
- **Root cause**: MediaPipe `model_selection=1` (full-range, 2-5m faces) can't detect close-up faces in Zoom video. Zoom also shows popup dialogs ("Floating reactions", "meeting chats") that cover faces.
- **Fix**:
  1. Changed `model_selection=0` (short-range, <2m — correct for webcam/Zoom faces) in `serve/inference.py`
  2. Lowered `FACE_CONFIDENCE_THRESHOLD` from 0.65 to 0.4 in `serve/config.py`
  3. Added `_dismissZoomPopups()` method to `ZoomBotAdapter.js` — dismisses OK/Got it/Close buttons and removes overlay elements after joining
  4. Added periodic popup dismissal every ~30s during frame capture
- **Status**: FIXED

### 8. Bug: "Connecting to Meeting" overlay renders inside dashboard instead of fullscreen
- **Issue**: The overlay is not covering the full screen — it renders as a small floating box inside the dashboard content area, partially covering the Meeting Summary card. Should be a proper fullscreen overlay with backdrop blur.
- **Location**: `App.tsx` (botConnecting overlay, lines ~242-296)
- **Status**: FIXED — quick win, overlay now renders fullscreen

### 10. Bug: Orphaned bot stays in Zoom after session/backend killed
- **Issue**: When the backend is killed (e.g., `kill -9` or `start.sh` restart), the Puppeteer bot process may survive and stay in the Zoom meeting as a ghost participant. New session creates a second bot — now there are duplicate "RealSync Bot" entries in the meeting.
- **Root cause**: `kill -9` doesn't trigger graceful shutdown — the bot's Puppeteer browser isn't closed, and Zoom session remains. The `start.sh` trap only handles `INT`/`TERM`, not orphaned child processes.
- **Affected files**: `start.sh`, `realsync-backend/bot/botManager.js`, `realsync-backend/bot/ZoomBotAdapter.js`
- **Status**: TODO — fix later

### 11. Bug: Bot Status shows "idle" on dashboard even when bot is connected
- **Issue**: Meeting Summary card shows "Bot Status: idle" even after the bot has joined and is streaming frames.
- **Root cause**: The `/api/sessions/:id/join` endpoint never set `session.botStatus = "joining"`. And if the dashboard WS connects after the `sourceStatus` broadcast, it misses it — initial WS handshake only sent metrics, not bot status.
- **Fix**: Set `session.botStatus = "joining"` + broadcast `sourceStatus` in join endpoint. Also send current `botStatus` on WS subscribe handshake so late-connecting clients get the right state.
- **Status**: FIXED

### 12. FER emotion model fails to load — `No module named 'pkg_resources'`
- **Issue**: Emotion detection shows 0% across all emotions because FER can't import `pkg_resources` (removed from `setuptools` in recent Python versions).
- **Fix needed**: `pip install setuptools` in the AI service venv, or pin a compatible FER version.
- **Status**: TODO — fix later

### 13. MesoNet-4 false positives on real webcam video
- **Issue**: MesoNet-4 reports ~48% authenticity / "high risk" on a real person's webcam feed through Zoom. This is a false positive — the model was trained on specific datasets and Zoom's video compression (low quality JPEG, re-encoding artifacts) triggers it.
- **Possible fixes**: Calibrate thresholds for webcam/Zoom context, add pre-processing to reduce compression artifacts, or retrain on Zoom-quality video.
- **Status**: Known limitation — note for later

### 14. Feature: Add user notifications system
- **Issue**: No notification system for alerting users about important events (e.g., deepfake detected, session ended, bot disconnected).
- **Scope**: In-app notifications, possibly email/push. Should cover alert events from sessions, system status changes, and session lifecycle events.
- **Status**: FIXED — Fully implemented: NotificationBell with category filters, NotificationContext, desktop notifications, actionable recommendations, Supabase persistence

### 9. ThemeProvider missing from React tree
- **Bug**: `useTheme must be used within ThemeProvider` — `LoginScreen` calls `useTheme()` but `main.tsx` didn't wrap `App` in `<ThemeProvider>`.
- **Fix**: Added `ThemeProvider` import and wrapper in `main.tsx`.
- **Rule**: When adding context-dependent hooks to components, always verify the provider exists in the component tree above them.
- **Status**: FIXED

### 15. Feature: Multi-participant detection (planned, not yet implemented)
- **Issue**: AI already analyzes ALL faces in each frame but backend only uses the primary (first) face for metrics/alerts. Non-speaking deepfake participants go completely undetected.
- **Plan**: Iterate `result.faces[]` in alertFusion with per-face cooldowns, use worst-case face for dashboard metrics, add "Participant N" labels to alerts.
- **Files**: `alertFusion.js`, `index.js`, `aiClient.js`, `DashboardScreen.tsx`
- **Practical limit**: 2-6 participants for reliable real-time detection
- **Status**: TODO — planned for future implementation

### 16. Future: Full participant tracking with names
- **Issue**: Alerts have no participant identifier. Speaker name exists in transcripts but is dropped before alert creation. Visual alerts only have an ephemeral face_id index.
- **Plan**: Build participant registry mapping face embeddings to Zoom participant names. Thread speaker name from transcripts into fraud/scam alerts. Requires new DB table for participants, `participant` column on alerts table, API + UI for name assignment.
- **Status**: TODO — future enhancement

### 17. AI Model Upgrade: FaceNet Identity + Temporal Analysis
- **What was done**: Replaced random-projection identity tracker (60-75% accuracy) with FaceNet InceptionResnetV1 pretrained on VGGFace2 (>99% LFW accuracy). Added temporal analysis module to smooth trust scores across frames and reduce MesoNet-4 false positives.
- **Files modified**:
  - `RealSync-AI-Prototype/requirements.txt` — added `facenet-pytorch==2.6.0`
  - `serve/config.py` — `IDENTITY_EMBEDDING_DIM` 128→512, added `FACENET_INPUT_SIZE=160`, `FACENET_PRETRAINED='vggface2'`, temporal constants
  - `serve/identity_tracker.py` — full rewrite: FaceNet model with lazy loading + `threading.Lock` (double-checked locking), 512-dim L2-normalized embeddings, same API surface/thresholds/EMA/TTL
  - `serve/temporal_analyzer.py` — NEW: `TemporalAnalyzer` class with per-session circular buffer (15 frames), EWMA smoothing (decay=0.85), trend detection, volatility, 3 anomaly detectors (sudden_trust_drop, identity_switch, emotion_instability)
  - `serve/inference.py` — imported `TemporalAnalyzer`, integrated into `analyze_frame()` (smoothed trust score after 3+ frames), added `temporal` to response and `_empty_response`
  - `serve/app.py` — FaceNet warmup in lifespan, real model check in health endpoint, temporal buffer cleanup in clear-identity endpoint
  - `contracts/ai-inference.schema.json` — added optional `temporal` property to `aggregated`
- **Bug caught during implementation**: EWMA had a second backward-pass that would have inverted the weighting (oldest frames highest weight). Removed the erroneous pass.
- **Backward compatible**: `temporal` is null when no faces detected, object otherwise. Backend spreads `aggregated` automatically. Frontend ignores unknown fields.
- **Verification needed**: `pip install facenet-pytorch==2.6.0`, start AI service, confirm FaceNet warmup log + health check `identity: "loaded"` + `aggregated.temporal` in frame responses.
- **Status**: IMPLEMENTED — changes saved locally, not committed

### 18. Rule: NEVER run git commands — only provide them for the user to copy
- **Rule**: Do NOT run `git add`, `git commit`, `git push`, or any git command via the Bash tool. Only output the commands as text for the user to copy-paste themselves.
- **Mistake**: Ran `git add && git commit` directly when the user asked for "the commands" — they wanted text to copy, not execution.
- **Applies to**: All files under `/Users/ahmed/Desktop/CSIT321/term2_files/RealSync/`
- **Exception**: `git status`, `git diff`, and `git log` are OK for reading state during planning.

### 19. Audit false positives — always verify before fixing
- **Mistake**: Audit report flagged 3 "critical" issues that were actually correct code:
  - CRIT-1: `persistence.isAvailable()` was claimed missing — it existed at line 518
  - CRIT-3: `models.mobilenet_v2(weights=None)` flagged as "blank weights" — intentional; full checkpoint loaded from file
  - HIGH-1: WebSocket auth race condition — message handler was registered AFTER `await` completed
- **Rule**: Always read the actual code before implementing a fix. Audit reports can be wrong. Verify each issue independently.

## Session: 2026-03-06

### 20. AI inference timeout — profile before increasing
- **Mistake**: Set AI_TIMEOUT_MS=5000 which is too short for EfficientNet-B4+B2+FaceNet on CPU (takes 7-10s). Backend silently fell back to mock data.
- **Rule**: Always profile real inference time before setting timeouts. EfficientNet models on CPU are slow; use MPS on Apple Silicon for 10-45x speedup.

### 21. Bot join timeout must exceed actual join time
- **Mistake**: JOIN_TIMEOUT_MS=90s but Puppeteer+Zoom page load+audio setup takes ~93s. Timeout fired 3s early, triggered stub fallback while real bot was still joining.
- **Rule**: Measure actual bot join time and set timeout with 50%+ margin. Also set `bot.cancelled = true` on timeout to prevent race with .then() handler.

### 22. Frame pile-up kills the AI service
- **Mistake**: Frames arrive every 2s, inference takes 7s on CPU. FastAPI threadpool queued hundreds of frames, each spawning new MediaPipe instances, causing 16-minute backlog.
- **Rule**: Use a semaphore to limit concurrent frame analyses. Return 429 when busy. Backend should skip (not mock) on 429.

### 23. Use MPS for PyTorch inference on Apple Silicon
- **Fix**: Added `model.to("mps")` + `tensor.to(device)` for deepfake and emotion models. Inference: 7000ms → 150-770ms.
- **Rule**: Always check `torch.backends.mps.is_available()` and use MPS for local inference. Note: Railway (production) is CPU-only.

### 24. Parallelize independent model calls
- **Fix**: Used ThreadPoolExecutor(3) to run deepfake, emotion, identity analysis concurrently instead of sequentially.
- **Rule**: When models are independent (same input, no shared state), run them in parallel.

### 25. Python stdout buffering hides training logs
- **Mistake**: `python script.py > log.file 2>&1` buffers stdout. Log file appears empty for minutes.
- **Rule**: Use `PYTHONUNBUFFERED=1 python ...` or `python -u ...` when redirecting output to files for real-time monitoring.
