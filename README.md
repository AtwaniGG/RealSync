# RealSync

Real-time multi-modal deepfake detection for virtual meetings.

RealSync analyzes live video, audio, and behavioural signals during online meetings to detect synthetic media, voice cloning, and identity inconsistencies. It provides hosts with a real-time trust dashboard and post-session reports.

## Architecture

```
┌─────────────┐      WebSocket       ┌──────────────────┐      HTTP/REST      ┌─────────────────┐
│  Frontend    │◄────────────────────►│  Backend         │◄───────────────────►│  AI Service     │
│  React+Vite  │   subscribe/ingest   │  Node/Express    │   /api/analyze/*    │  Python FastAPI  │
│  :5173       │                      │  :4000           │                     │  :5100           │
└─────────────┘                      └────────┬─────────┘                     └─────────────────┘
                                              │                                        │
                                     ┌────────▼─────────┐               ┌──────────────▼──────┐
                                     │  Supabase        │               │  AI Models          │
                                     │  Auth + Postgres  │               │  EfficientNet-B4    │
                                     └──────────────────┘               │  AASIST (audio)     │
                                                                        │  MobileNetV2 (emo)  │
                                                                        │  FaceNet (identity) │
                                                                        └─────────────────────┘
```

**Data flow:** The Zoom bot (Puppeteer) captures video frames and audio from a meeting, streams them via WebSocket to the backend, which forwards them to the AI service for analysis. Results are fused into trust scores and broadcast to the frontend dashboard in real time.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express 5, WebSocket (ws) |
| AI Service | Python 3.10, FastAPI, PyTorch, torchvision |
| Database | Supabase (PostgreSQL + Auth) |
| Bot | Puppeteer (headless Chromium) |
| Deployment | Cloudflare Pages (FE), Railway (BE + AI) |

## AI Models

| Model | Task | Architecture |
|-------|------|-------------|
| Video deepfake detection | Detect face-swaps & synthetic video | EfficientNet-B4 + SBI |
| Audio deepfake detection | Detect voice cloning & TTS | SincConv + CNN (AASIST-style) |
| Emotion analysis | Classify facial expressions | MobileNetV2 |
| Identity tracking | Verify face consistency | FaceNet (InceptionResnetV1) |
| Temporal analysis | Detect behavioural anomalies over time | Statistical pattern analyser |

See [docs/AI_MODELS_REPORT.md](docs/AI_MODELS_REPORT.md) for training details and accuracy metrics.

## Project Structure

```
RealSync/
├── Front-End/                  # React frontend
│   └── src/
│       ├── components/
│       │   ├── screens/        # Page components (Dashboard, Settings, etc.)
│       │   ├── layout/         # Sidebar, TopBar, NotificationBell
│       │   ├── dashboard/      # Dashboard sub-components
│       │   └── ui/             # shadcn/ui primitives
│       ├── contexts/           # React contexts (WebSocket, Notifications, Theme)
│       └── lib/                # API client, utilities
├── realsync-backend/           # Node.js backend
│   ├── index.js                # Express server + WebSocket handlers
│   ├── bot/
│   │   ├── ZoomBotAdapter.js   # Puppeteer Zoom bot
│   │   └── botManager.js       # Bot lifecycle management
│   └── lib/                    # Modules: auth, persistence, AI client, fraud detection
├── RealSync-AI-Prototype/      # Python AI service
│   ├── serve/                  # FastAPI app + model modules
│   │   ├── app.py              # FastAPI entry point
│   │   ├── inference.py        # Frame analysis pipeline
│   │   ├── deepfake_model.py   # EfficientNet-B4 deepfake detector
│   │   ├── emotion_model.py    # MobileNetV2 emotion classifier
│   │   ├── audio_model.py      # AASIST audio deepfake detector
│   │   ├── identity_tracker.py # FaceNet identity verification
│   │   ├── temporal_analyzer.py# Temporal pattern analysis
│   │   └── text_analyzer.py    # Text sentiment analysis
│   └── training/               # Model training scripts
├── contracts/                  # API schema definitions (JSON Schema)
├── docs/                       # Project documentation
├── start.sh                    # Start all 3 services
└── .gitignore
```

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+ with venv
- Model weights in `RealSync-AI-Prototype/src/models/` (not tracked in git)

### Setup

```bash
# Frontend
cd Front-End && npm install

# Backend
cd realsync-backend && npm install

# AI Service
cd RealSync-AI-Prototype && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

### Run

```bash
# Start all 3 services at once:
bash start.sh

# Or start individually:
cd RealSync-AI-Prototype && source .venv/bin/activate && python -m serve.app     # :5100
cd realsync-backend && node index.js                                              # :4000
cd Front-End && npx vite --port 5173                                              # :5173
```

### Environment Variables

Each service requires a `.env` file. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full list.

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md)
- [AI Models Report](docs/AI_MODELS_REPORT.md)
- [Brand Identity](docs/BRAND_IDENTITY.md)
- [Technical Specification](docs/FINAL_RELEASE_TECH_SPEC.md)
- [API Contracts](contracts/README.md)

## Team

CSIT321 Capstone Project — University of Wollongong, 2025-2026
