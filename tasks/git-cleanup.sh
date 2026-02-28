#!/bin/bash
# =============================================================================
# RealSync Git Cleanup Script
# =============================================================================
# This script removes files from git tracking WITHOUT deleting them from disk.
# Review each section, then run: bash tasks/git-cleanup.sh
#
# After running, commit with: git add -A && git commit -m "chore: remove bloat from git tracking"
# =============================================================================

set -e
echo "=== RealSync Git Cleanup ==="

# --- 1. Remove node_modules from tracking (14,207 files) ---
echo "[1/7] Removing Front-End/node_modules/ from git tracking..."
git rm -r --cached Front-End/node_modules/

# --- 2. Remove .DS_Store files ---
echo "[2/7] Removing .DS_Store files from git tracking..."
git rm --cached .DS_Store 2>/dev/null || true
git rm --cached Front-End/.DS_Store 2>/dev/null || true
git rm --cached Front-End/src/.DS_Store 2>/dev/null || true

# --- 3. Remove model weight files ---
echo "[3/7] Removing model weight files from git tracking..."
git rm --cached RealSync-AI-Prototype/src/models/audio_deepfake_weights.pth 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/models/emotion_weights.pth 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/models/mesonet4_weights.h5 2>/dev/null || true

# --- 4. Remove large binary media ---
echo "[4/7] Removing large binary media from git tracking..."
git rm --cached realsync-backend/bot/avatar-feed.y4m 2>/dev/null || true
git rm --cached realsync-backend/bot/baymax-base.png 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/input/meeting.mp4 2>/dev/null || true
git rm --cached "demo pptx.pptx" 2>/dev/null || true
git rm --cached "demo terminal code.txt" 2>/dev/null || true

# --- 5. Remove .pyc / __pycache__ ---
echo "[5/7] Removing .pyc files from git tracking..."
git rm --cached RealSync-AI-Prototype/src/__pycache__/extract_frames.cpython-310.pyc 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/__pycache__/face_detection.cpython-310.pyc 2>/dev/null || true

# --- 6. Remove deleted stale source files from tracking ---
echo "[6/7] Removing deleted stale files from git tracking..."
# Stale training scripts (replaced by training/ directory)
git rm --cached RealSync-AI-Prototype/train_audio.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/train_emotion.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/train_mesonet.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/faceforensics_download_v3.py 2>/dev/null || true

# Legacy src/ Python files (replaced by serve/ modules)
git rm --cached RealSync-AI-Prototype/src/video_model.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/emotion_model.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/face_detection.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/extract_frames.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/audio_extract.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/download_weights.py 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/src/run_pipeline.py 2>/dev/null || true

# Frontend generator scripts (one-time brand asset generators)
git rm --cached Front-End/generate-brand-book.cjs 2>/dev/null || true
git rm --cached Front-End/generate-light-logo-sheet.cjs 2>/dev/null || true
git rm --cached Front-End/generate-light-logo.py 2>/dev/null || true
git rm --cached Front-End/generate-sample-report.cjs 2>/dev/null || true

# Bot dev/test/demo files
git rm --cached realsync-backend/bot/testBot.js 2>/dev/null || true
git rm --cached realsync-backend/bot/avatar-preview.html 2>/dev/null || true
git rm --cached realsync-backend/bot/avatar-video.html 2>/dev/null || true
git rm --cached realsync-backend/bot/crop-logo.html 2>/dev/null || true
git rm --cached realsync-backend/bot/crop-logo.js 2>/dev/null || true
git rm --cached realsync-backend/bot/find-eyes.html 2>/dev/null || true
git rm --cached realsync-backend/bot/find-eyes.js 2>/dev/null || true
git rm --cached realsync-backend/bot/prepare-avatar.html 2>/dev/null || true
git rm --cached realsync-backend/bot/preview-anim.js 2>/dev/null || true
git rm --cached realsync-backend/bot/preview.js 2>/dev/null || true
git rm -r --cached realsync-backend/bot/screenshots/ 2>/dev/null || true

# Stale docs
git rm --cached README2.md 2>/dev/null || true
git rm --cached RealSync-AI-Prototype/readme.md 2>/dev/null || true

# --- 7. Summary ---
echo "[7/7] Done! Summary:"
echo "  Tracked files: $(git ls-files | wc -l | tr -d ' ')"
echo "  node_modules:  $(git ls-files | grep -c 'node_modules/' || echo 0)"
echo "  .DS_Store:     $(git ls-files | grep -c '.DS_Store' || echo 0)"
echo "  .pth/.h5:      $(git ls-files | grep -cE '\.(pth|h5)$' || echo 0)"
echo ""
echo "Next step: git add -A && git commit -m 'chore: remove bloat from git tracking'"
