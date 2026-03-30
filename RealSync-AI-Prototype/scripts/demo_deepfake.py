#!/usr/bin/env python3
"""
Demo injection: send deepfake video frames to the running RealSync AI service
as if they came from a live Zoom meeting. Alerts will appear on the dashboard.

Prerequisites:
    1. Generate a deepfake: python scripts/generate_deepfake.py ...
    2. Start RealSync:      DISABLE_ZOOM_CALIBRATION=true ./start.sh
    3. Run this script:     python scripts/demo_deepfake.py --video deepfake.mp4

Usage:
    python scripts/demo_deepfake.py \
        --video data/generated_deepfakes/deepfake.mp4 \
        --api-url http://localhost:4000 \
        --interval 1.0
"""
import argparse
import base64
import json
import os
import sys
import time
import uuid

import cv2

try:
    import requests
except ImportError:
    print("Error: requests not installed. Run: pip install requests")
    sys.exit(1)


def frame_to_base64(frame) -> str:
    """Encode a BGR frame as base64 JPEG."""
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buffer).decode("utf-8")


def send_frame(api_url: str, frame_b64: str, session_id: str, api_key: str = "demo"):
    """Send a frame to the AI analysis endpoint via the backend."""
    # Try the backend's frame analysis endpoint first
    url = f"{api_url}/api/analyze/frame"
    payload = {
        "sessionId": session_id,
        "frame": frame_b64,
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"  [warn] API returned {resp.status_code}: {resp.text[:200]}")
            return None
    except requests.exceptions.ConnectionError:
        return None


def send_to_ai_direct(ai_url: str, frame_b64: str, session_id: str):
    """Send directly to the AI service (port 5100) if backend is unavailable."""
    url = f"{ai_url}/api/analyze/frame"
    payload = {
        "sessionId": session_id,
        "frame": frame_b64,
    }
    headers = {"Content-Type": "application/json"}

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            return resp.json()
        return None
    except requests.exceptions.ConnectionError:
        return None


def main():
    parser = argparse.ArgumentParser(description="Inject deepfake frames into RealSync for demo")
    parser.add_argument("--video", required=True, help="Path to deepfake video")
    parser.add_argument("--api-url", default="http://localhost:4000", help="Backend API URL (default: localhost:4000)")
    parser.add_argument("--ai-url", default="http://localhost:5100", help="AI service URL (default: localhost:5100)")
    parser.add_argument("--interval", type=float, default=1.0, help="Seconds between frames (default: 1.0)")
    parser.add_argument("--max-frames", type=int, default=30, help="Max frames to send (default: 30)")
    parser.add_argument("--session-id", default=None, help="Session ID (auto-generated if omitted)")
    parser.add_argument("--sample-every", type=int, default=5, help="Send every Nth frame from video (default: 5)")
    args = parser.parse_args()

    if not os.path.isfile(args.video):
        print(f"Error: Video not found: {args.video}")
        sys.exit(1)

    session_id = args.session_id or f"demo-deepfake-{uuid.uuid4().hex[:8]}"

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"Error: Could not open video: {args.video}")
        sys.exit(1)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"[demo] Video: {args.video} ({total_frames} frames)")
    print(f"[demo] Session ID: {session_id}")
    print(f"[demo] Sending every {args.sample_every}th frame, {args.interval}s apart")
    print(f"[demo] Target: backend={args.api_url}, AI={args.ai_url}")
    print()

    # Test connectivity
    use_direct = False
    try:
        requests.get(f"{args.api_url}/health", timeout=3)
        print("[demo] Backend is reachable")
    except Exception:
        print(f"[demo] Backend not reachable at {args.api_url}, trying AI service directly...")
        try:
            requests.get(f"{args.ai_url}/health", timeout=3)
            print(f"[demo] AI service reachable at {args.ai_url}")
            use_direct = True
        except Exception:
            print(f"[demo] ERROR: Neither backend nor AI service is running!")
            print(f"  Start RealSync first: DISABLE_ZOOM_CALIBRATION=true ./start.sh")
            sys.exit(1)

    sent = 0
    frame_idx = 0
    flagged = 0

    print(f"[demo] Starting injection...\n")

    while sent < args.max_frames:
        ret, frame = cap.read()
        if not ret:
            # Loop the video
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                break

        if frame_idx % args.sample_every != 0:
            frame_idx += 1
            continue

        frame_b64 = frame_to_base64(frame)

        if use_direct:
            result = send_to_ai_direct(args.ai_url, frame_b64, session_id)
        else:
            result = send_frame(args.api_url, frame_b64, session_id)

        sent += 1

        if result:
            # Extract key info from response
            faces = result.get("faces", [])
            agg = result.get("aggregated", {})
            trust = agg.get("trustScore", "N/A")
            temporal = agg.get("temporal", {})
            smoothed = temporal.get("smoothedTrustScore", "N/A")

            for face in faces:
                df = face.get("deepfake", {})
                score = df.get("authenticityScore", "N/A")
                risk = df.get("riskLevel", "unknown")
                risk_marker = {"high": "!!!", "medium": "! ", "low": "  "}.get(risk, "? ")

                if risk in ("high", "medium"):
                    flagged += 1

                print(f"  Frame {sent:3d} | Auth: {score} | Risk: {risk:6s} {risk_marker} | Trust: {trust} | Smoothed: {smoothed}")
        else:
            print(f"  Frame {sent:3d} | No response")

        frame_idx += 1
        if sent < args.max_frames:
            time.sleep(args.interval)

    cap.release()

    print(f"\n[demo] Done!")
    print(f"  Frames sent: {sent}")
    print(f"  Flagged (medium+high): {flagged}/{sent}")
    print(f"  Session ID: {session_id}")

    if flagged >= 3:
        print(f"  Dashboard should show deepfake alerts for this session!")
    elif flagged > 0:
        print(f"  Some frames flagged but may not trigger dashboard alert (need 3+ consecutive)")
    else:
        print(f"  No frames flagged. Try with DISABLE_ZOOM_CALIBRATION=true")


if __name__ == "__main__":
    main()
