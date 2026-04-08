# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RealSync is a real-time multi-modal deepfake detection system for virtual meetings. It analyzes live audio, video, and facial emotion signals to detect voice cloning, synthetic video, and behavioral inconsistencies.

## Three-Service Architecture

| Service | Directory | Port | Stack |
|---------|-----------|------|-------|
| Frontend | `Front-End/` | 3000 | React 18 + TypeScript + Vite (SWC) |
| Backend | `realsync-backend/` | 4000 | Express 5 (Node.js, CommonJS) |
| AI Service | `RealSync-AI-Prototype/` | 5100 | FastAPI (Python 3.10+) |

**Data flow:** Zoom Bot → Backend (`/ws/ingest` WebSocket) → AI Service (HTTP) → Alert Fusion → Frontend (`/ws` WebSocket) + Supabase (PostgreSQL).

The Vite dev server proxies `/api` and `/ws` to the backend at port 4000.

## Commands

### Start all services
```bash
./start.sh
```

### Individual services
```bash
# Frontend
cd Front-End && npm run dev

# Backend (no dev script — runs directly)
cd realsync-backend && node index.js

# AI Service
cd RealSync-AI-Prototype && python3 -m serve.app
```

### Build frontend
```bash
cd Front-End && npm run build   # outputs to Front-End/build/
```

### Install dependencies
```bash
cd Front-End && npm install
cd realsync-backend && npm install
cd RealSync-AI-Prototype && pip install -r requirements.txt
```

### Database schema
Apply `contracts/supabase-migration.sql` in the Supabase SQL Editor. No migration tool is used.

## Key Architecture Details

### Backend (`realsync-backend/index.js`)
The entire Express server (~840 lines) lives in `index.js`. Sessions are managed in-memory (a `Map`) with non-blocking writes to Supabase. Key library modules in `lib/`:

- **auth.js** — Supabase JWT middleware; sets `req.userId`; prototype mode skips auth
- **persistence.js** — Supabase CRUD; returns `{ok: false}` on failure; never throws
- **alertFusion.js** — Combines deepfake/identity/emotion signals; 30s cooldown between alerts
- **fraudDetector.js** — Keyword-weighted pattern matching on transcripts
- **aiClient.js** — HTTP client to Python AI service; 5s timeout; falls back to mock response
- **botManager.js** — Puppeteer-based Zoom bot lifecycle; stub mode available via `REALSYNC_BOT_MODE=stub`

### Frontend (`Front-End/src/`)
- Path alias: `@/*` → `./src/*`
- Screens in `components/screens/` — DashboardScreen is the main real-time view
- UI primitives in `components/ui/` — Radix UI wrappers styled with Tailwind
- `lib/api.ts` — `authFetch` wrapper that attaches Supabase JWT to requests
- `lib/supabaseClient.ts` — shared Supabase client instance
- `contexts/ThemeContext.tsx` — light/dark/system theme

### AI Service (`RealSync-AI-Prototype/serve/`)
- `app.py` — FastAPI entry; loads models at startup
- `inference.py` — Per-frame analysis (MesoNet-4 deepfake, FER emotion, MediaPipe face)
- `identity_tracker.py` — Cross-frame face embedding comparison

### WebSocket Protocols
Frozen contracts live in `contracts/`:
- `ingest.schema.json` — bot→backend messages (audio_pcm, frame, caption, source_status)
- `subscribe.schema.json` — backend→frontend events (metrics, transcript, alert, suggestion)
- `ai-inference.schema.json` — backend→AI HTTP request/response

### Database (Supabase PostgreSQL)
Tables: `sessions`, `transcript_lines`, `alerts`, `suggestions`, `metrics_snapshots`, `session_reports`, `profiles`. All have RLS enabled — the backend uses the service key (bypasses RLS), the frontend uses the anon key (restricted by RLS policies).

## Environment Variables

**Frontend** (`Front-End/.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PROTOTYPE_MODE`

**Backend** (`realsync-backend/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `REALSYNC_BOT_MODE` (real|stub), `AI_SERVICE_URL`, `AI_TIMEOUT_MS`, `REALSYNC_USE_GCP_STT`, `DEBUG_SCREENSHOTS`

## Git Workflow

- Branch naming: `feature/<short-name>`
- Commit format: `feat:`, `fix:`, etc. (conventional commits)
- Merge via Pull Request to main

## Domain & Deployment

### Domain & Infrastructure
- **Domain**: `real-sync.app` (Namecheap)
- **DNS/CDN**: Cloudflare (nameservers pointed, SSL/proxy active)
- **Email**: Zoho Mail on `real-sync.app`
- **DB**: Supabase Postgres (`quoanhdzcplrxnwnewct.supabase.co`)

### Deployment Targets
| Service | Platform | URL Pattern |
|---------|----------|-------------|
| Frontend | Cloudflare Pages | `real-sync.app` |
| Backend | Railway | `api.real-sync.app` (via CF proxy) |
| AI Service | Railway (internal) | Private networking from backend |

### Deploy Commands
```bash
# Frontend → Cloudflare Pages
cd Front-End && npm run build   # outputs dist/

# Backend → Railway (auto-detects Node.js)
# Start: node index.js

# AI Service → Railway (Python)
# Start: python -m serve.app
```

### Production Env Vars (beyond local dev)
- Frontend: `VITE_API_BASE_URL` must point to Railway backend public URL
- Backend: `AI_SERVICE_URL` should use Railway internal networking URL
- Bot mode: `REALSYNC_BOT_MODE=stub` for demo (real Puppeteer needs VPS with Xvfb)

## No Tests

No test framework is configured. Backend `npm test` is a stub that exits with error.
