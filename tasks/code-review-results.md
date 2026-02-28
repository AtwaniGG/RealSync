# Full Codebase Review Results

**Date:** 2026-02-28
**Methodology:** 8 parallel code-review agents across 4 waves
**Files reviewed:** ~30 source files across backend, AI service, and frontend

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 12 |
| High/Important | 30 |
| Medium | 5 |
| **Total** | **47** |

Top 3 most urgent:
1. **`videoTrust` ReferenceError** (index.js:798) -- crashes trust score on every frame before audio arrives
2. **Supabase `.eq()` result discarded** (persistence.js:66,81) -- cross-user data leak
3. **Auth bypass for anonymous sessions** (auth.js:22-33) -- any unauthenticated caller can access anonymous sessions

---

## Wave 1 -- Backend Core

### Agent 1A: Server & Session Logic

| # | Sev | File:Line | Issue | Status |
|---|-----|-----------|-------|--------|
| B1 | CRIT | `index.js:798` | `ReferenceError: videoTrust is not defined` -- crashes trust score update on every frame without audio | TODO |
| B2 | CRIT | `auth.js:22-33,74` | Auth bypass: unauthenticated requests pass through even with Supabase configured; `requireSessionOwner` skipped when `userId===null` | TODO |
| B3 | CRIT | `persistence.js:66,81` | Supabase `.eq()` result discarded -- `const query` not reassigned, user filter silently dropped, returns ALL users' sessions | TODO |
| B4 | HIGH | `index.js:585-598` | Concurrent ingest sockets race on `session.stt`, leaking gRPC streams | TODO |
| B5 | HIGH | `index.js:279-318` | `rehydrateSession` TOCTOU race -- concurrent callers double-build session, second overwrites first, orphaning subscribers | TODO |
| B6 | HIGH | `index.js:1352-1366` | GC loop misses `frameInFlight` cleanup for rehydrated sessions that die without a stop call | TODO |
| B7 | HIGH | `index.js:1320` | `null !== null` is `false` -- anonymous session metrics hijackable by any unauthenticated caller | TODO |

### Agent 1B: Alert & Detection Pipeline

| # | Sev | File:Line | Issue | Status |
|---|-----|-----------|-------|--------|
| A1 | HIGH | `fraudDetector.js:239` | Cooldown key includes severity (`fraud_${ruleName}_${severity}`) -- same rule fires rapidly across severity changes | TODO |
| A2 | HIGH | `alertFusion.js:177` | Medium anger fires during high-anger cooldown (missing upper-bound guard on `else if`) | TODO |
| A3 | HIGH | `alertFusion.js:285-303` | `fuseWithTranscript` escalation bypasses cooldown, enabling critical alert spam | TODO |
| A4 | HIGH | `fraudDetector.js:229` | Window accumulation guard (`lineResult.score >= 0.1`) defeats multi-line fraud detection | TODO |
| A5 | MED | `index.js:751` | Unstable face ID ordering can cause per-face cooldown misattribution across frames | TODO |

### Agent 1C: Bot System

| # | Sev | File:Line | Issue | Status |
|---|-----|-----------|-------|--------|
| Z1 | CRIT | `ZoomBotAdapter.js:519,1772` | `leave()` during `join()` race -- browser process orphaned, intervals leak, bot status inconsistent | TODO |
| Z2 | CRIT | `botManager.js:189-195` | Chromium process orphaned on failure -- `adapter.leave()` never called before `bots.delete()` drops only reference | TODO |
| Z3 | CRIT | `ZoomBotAdapter.js:519` | Early-return on `_stopped` skips `_cleanup()`, botManager sees spurious "connected" status | TODO |
| Z4 | HIGH | `ZoomBotAdapter.js:1728-1742` | In-browser `setInterval` accumulates unlimited audio source nodes per media element | TODO |
| Z5 | HIGH | `ZoomBotAdapter.js:591` | `pwd` parameter double-encoded -- meeting join fails when password contains special chars | TODO |
| Z6 | HIGH | `botManager.js:118-153` | Stub bot join timeout fires on stale bot reference after `stopBot` | TODO |
| Z7 | HIGH | `ZoomBotAdapter.js:519-539` | 3 dangling `setInterval` handles if `leave()` races between flow and interval start | TODO |
| Z8 | HIGH | `botManager.js:338-344` | `Map` mutation during `for...of` in `cleanupAll()` | TODO |

---

## Wave 2 -- AI Service

### Agent 2A: AI Inference & App

| # | Sev | File:Line | Issue | Status |
|---|-----|-----------|-------|--------|
| I1 | CRIT | `inference.py:50,134` | Single global lock serializes all MediaPipe face detection -- use `threading.local()` for per-thread instances | TODO |
| I2 | CRIT | `identity_tracker.py:99` | `.squeeze()` without dim arg -- should be `.squeeze(0)` to only remove batch dim | TODO |
| I3 | HIGH | `inference.py:46-47,252` | `_no_face_counters` dict grows unbounded -- no eviction mechanism (memory leak) | TODO |
| I4 | HIGH | `app.py:252-271` | No payload size limit on `/api/analyze/text` endpoint (others have limits) | TODO |
| I5 | HIGH | `text_analyzer.py:54,105` | 1-worker executor + 5s timeout creates persistent backlog; no `future.cancel()` on timeout | TODO |
| I6 | HIGH | `identity_tracker.py:138` | `_evict_stale_sessions` holds lock while printing -- blocks all threads | TODO |
| I7 | HIGH | `audio_model.py:153` | `strict=False` silently accepts partially loaded weights -- no validation | TODO |
| I8 | HIGH | `app.py:274-278` | `/clear-identity` endpoint accepts unvalidated session IDs (no regex check) | TODO |

### Agent 2B: AI Models

| # | Sev | File:Line | Issue | Status |
|---|-----|-----------|-------|--------|
| M1 | HIGH | `deepfake_model.py:84-92` | Fallback to ImageNet backbone returns live model with random classifier head -- garbage predictions with no signal to consumers | TODO |
| M2 | HIGH | `temporal_analyzer.py:125-130` | EWMA formula inverted from docs -- `decay=0.85` weights OLD observations 85%, blunting anomaly detection | TODO |
| M3 | HIGH | `emotion_model.py:95-98` | `except Exception` fallback to `weights_only=False` -- enables arbitrary code execution on non-deserialization errors | TODO |

---

## Wave 3 -- Frontend

### Agent 3A: Core App & Contexts

| # | Sev | File:Line | Issue | Status |
|---|-----|-----------|-------|--------|
| F1 | HIGH | `WebSocketContext.tsx:67-81` | `setIsConnected(true)` called even when socket closed during async auth token fetch | TODO |
| F2 | HIGH | `NotificationContext.tsx:113-158` | WS subscription torn down/re-created on desktop pref changes -- alerts dropped during gap | TODO |
| F3 | HIGH | `App.tsx:64-104` | Auth init race: `initializeSession` + `INITIAL_SESSION` double-set session/loadingProfile | TODO |
| F4 | HIGH | `App.tsx:238` | Orphaned 1500ms `setTimeout` for `setBotProgress` never cancelled on session end/skip | TODO |
| F5 | HIGH | `ErrorBoundary.tsx:49` | "Try Again" causes infinite error loop for persistent render-time errors | TODO |
| F6 | MED | `WebSocketContext.tsx:72-80` | `isConnected: true` before server processes auth -- false-positive connected state | TODO |
| F7 | MED | `main.tsx:9-15` | Missing `<StrictMode>` suppresses development-time effect cleanup validation | TODO |

### Agent 3B: Dashboard & Screens

| # | Sev | File:Line | Issue | Status |
|---|-----|-----------|-------|--------|
| D1 | CRIT | `DashboardScreen.tsx:191` | `participants` WS payload cast without field validation; numeric `faceId` unbounded (tab freeze) | TODO |
| D2 | CRIT | `NotificationContext.tsx:145-150` | Raw WS strings passed unsanitized to native `Notification` API | TODO |
| D3 | HIGH | `DashboardScreen.tsx:162` | Partially-formed `metrics` payload bypasses fallback, crashes multiple `useMemo` paths | TODO |
| D4 | HIGH | `NotificationContext.tsx:49-55` | `localStorage` severity filter not shape-validated -- non-array crashes `.includes()` | TODO |
| D5 | HIGH | `ParticipantList.tsx:28-31` | `faceCount` from WS has no upper bound -- can allocate 100k+ slots, freeze tab | TODO |
| D6 | HIGH | `DashboardScreen.tsx:242` | `endingSession` in `useCallback` deps -- stale guard on rapid double-click | TODO |
| D7 | MED | `SessionsScreen.tsx:465` | Pagination shows "1--0 of 0" when history is empty | TODO |

---

## Wave 4 -- Infrastructure

### Agent 4A: Config, Deployment, Contracts

| # | Sev | File:Line | Issue | Status |
|---|-----|-----------|-------|--------|
| W1 | CRIT | `RealSync-AI-Prototype/Dockerfile:18-25` | `COPY . .` after model download risks clobbering HF cache; fix layer order | TODO |
| W2 | CRIT | `RealSync-AI-Prototype/Dockerfile:23` | `src/models/*.pth` (70+ MB) baked into every image layer; unused weights also included | TODO |
| W3 | HIGH | `start.sh:22-25` | AI startup loop silently times out -- backend starts with mock responses, no warning printed | TODO |
| W4 | HIGH | `contracts/ai-inference.schema.json:137-174` | `analyzeAudioResponse` and `analyzeTextResponse` have no `required` array -- empty `{}` is schema-valid | TODO |
| W5 | HIGH | `requirements.txt:9-10` | `transformers` and `sentencepiece` range-pinned while all other deps exact-pinned -- rebuild instability | TODO |
| W6 | HIGH | `start.sh:8-13` | PID reuse race: `kill -9` sent to original PID list after 3s regardless of process state | TODO |

---

## Fix Priority Order

### Immediate (blocks shipping)
1. **B1** -- `videoTrust` ReferenceError (guaranteed crash path)
2. **B3** -- Supabase `.eq()` data leak (cross-user exposure)
3. **B2** -- Auth bypass for anonymous sessions
4. **Z2** -- Orphaned Chromium on bot failure (resource leak)

### High Priority (before production)
5. **B7** -- Anonymous metrics hijacking
6. **Z5** -- Double-encoded pwd (bot join failure)
7. **I1** -- MediaPipe global lock (performance bottleneck)
8. **M1** -- Deepfake model fallback returns garbage
9. **M3** -- Unsafe deserialization fallback via `weights_only=False`
10. **D1** -- Participant faceId unbounded (tab freeze)
11. **D2** -- Native Notification unsanitized
12. **D3** -- Metrics payload crashes useMemo

### Important (should fix)
13-41: All remaining HIGH issues above

---

## Detailed Fixes

### B1: `videoTrust` ReferenceError
**File:** `realsync-backend/index.js:798`
```js
// BEFORE (crashes):
finalTrust = videoTrust;

// AFTER (3-signal formula matching the comment):
const videoSignal = result.aggregated.deepfake?.authenticityScore ?? result.aggregated.trustScore;
finalTrust = 0.47 * videoSignal + 0.33 * identitySignal + 0.20 * behaviorConf;
```

### B3: Supabase `.eq()` result discarded
**File:** `realsync-backend/lib/persistence.js:65-67,80-84`
```js
// BEFORE (filter silently dropped):
const query = db.from("sessions").select("*").is("ended_at", null);
if (userId) query.eq("user_id", userId);

// AFTER (reassign to capture the chained result):
let query = db.from("sessions").select("*").is("ended_at", null);
if (userId) query = query.eq("user_id", userId);
```
Same fix at line 80-84 for `getUserSessions`.

### B2: Auth bypass
**File:** `realsync-backend/lib/auth.js:30-33`
```js
// BEFORE:
if (!token) {
  req.userId = null;
  return next();
}

// AFTER:
if (!token) {
  if (client) {
    return res.status(401).json({ error: "Authorization header required" });
  }
  req.userId = null;
  return next();
}
```

### Z2: Orphaned Chromium
**File:** `realsync-backend/bot/botManager.js:189-195`
```js
// BEFORE:
.catch((err) => {
  bot.status = "disconnected";
  bots.delete(sessionId);
  startStubBot(...);
});

// AFTER:
.catch(async (err) => {
  bot.status = "disconnected";
  try { await adapter.leave(); } catch {}
  bots.delete(sessionId);
  startStubBot(...);
});
```

### I2: `.squeeze()` without dim
**File:** `RealSync-AI-Prototype/serve/identity_tracker.py:99`
```python
# BEFORE:
embedding = embedding_tensor.squeeze().numpy()

# AFTER:
embedding = embedding_tensor.squeeze(0).numpy()
```

### A1: Fraud cooldown key
**File:** `realsync-backend/lib/fraudDetector.js:239`
```js
// BEFORE:
const alertKey = `fraud_${result.ruleName}_${severity}`;

// AFTER:
const alertKey = `fraud_${result.ruleName}`;
```

### D1+D5: Unbounded WS payload values
**File:** `Front-End/src/components/screens/DashboardScreen.tsx:191`
```ts
// Validate participants before storing:
const safe = (message.participants as unknown[])
  .filter((p): p is ParticipantEntry =>
    typeof p === 'object' && p !== null &&
    typeof (p as any).faceId === 'number' &&
    Number.isFinite((p as any).faceId) &&
    (p as any).faceId >= 0 && (p as any).faceId < 20
  );
setParticipants(safe);
```

**File:** `Front-End/src/components/dashboard/ParticipantList.tsx:28`
```ts
const MAX_PARTICIPANTS = 20;
const totalSlots = Math.min(Math.max(participants.length, faceCount ?? 0), MAX_PARTICIPANTS);
```
