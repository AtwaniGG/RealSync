# RealSync — TODO

## AI Pipeline Upgrade — COMPLETED (All 7 Phases)

All code changes done. See `tasks/ai-pipeline-upgrade-plan.md` for full plan.

**New files created:**
- `serve/emotion_model.py`, `serve/deepfake_model.py`, `serve/audio_model.py`, `serve/text_analyzer.py`
- `training/train_efficientnet_sbi.py`

**Modified:** `serve/inference.py`, `serve/app.py`, `serve/config.py`, `requirements.txt`, `Dockerfile`,
`lib/aiClient.js`, `lib/alertFusion.js`, `lib/fraudDetector.js`, `index.js`, `DashboardScreen.tsx`, `ai-inference.schema.json`

**Still needed (not code):**
- [ ] Train/download `efficientnet_b4_deepfake.pth` weights
- [ ] Download `aasist_weights.pth` from clovaai/aasist
- [ ] End-to-end testing with live Zoom session

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
