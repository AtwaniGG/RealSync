#!/usr/bin/env python
"""
Benchmark all RealSync AI endpoints.

Usage:
    python -m serve.app &   # start service first
    python scripts/benchmark.py
    python scripts/benchmark.py --runs 20 --warmup 3
"""
import argparse
import base64
import json
import statistics
import struct
import time

import httpx

BASE_URL = "http://localhost:5100"
SESSION_ID = "00000000-0000-0000-0000-000000000001"


def _make_jpeg_b64(width=64, height=64):
    """Create a minimal JPEG and return base64."""
    import cv2
    import numpy as np
    img = np.zeros((height, width, 3), dtype=np.uint8)
    # Add face-like features for more realistic test
    cv2.ellipse(img, (32, 32), (20, 25), 0, 0, 360, (190, 170, 150), -1)
    cv2.circle(img, (26, 28), 3, (40, 30, 20), -1)
    cv2.circle(img, (38, 28), 3, (40, 30, 20), -1)
    _, buf = cv2.imencode(".jpg", img)
    return base64.b64encode(buf.tobytes()).decode()


def _make_audio_b64(seconds=4):
    """Create PCM16 mono 16kHz silence, return base64."""
    n = 16000 * seconds
    pcm = struct.pack(f"<{n}h", *([0] * n))
    return base64.b64encode(pcm).decode()


ENDPOINTS = {
    "health": {
        "method": "GET",
        "url": "/api/health",
    },
    "frame": {
        "method": "POST",
        "url": "/api/analyze/frame",
        "json": lambda: {"sessionId": SESSION_ID, "frameB64": _make_jpeg_b64()},
    },
    "audio": {
        "method": "POST",
        "url": "/api/analyze/audio",
        "json": lambda: {"sessionId": SESSION_ID, "audioB64": _make_audio_b64()},
    },
}


def benchmark_endpoint(client, name, spec, runs, warmup):
    """Run benchmark for a single endpoint."""
    url = BASE_URL + spec["url"]
    method = spec["method"]
    payload = spec.get("json", lambda: None)()

    timings = []
    for i in range(runs + warmup):
        t0 = time.perf_counter()
        if method == "GET":
            resp = client.get(url)
        else:
            resp = client.post(url, json=payload)
        elapsed = (time.perf_counter() - t0) * 1000  # ms

        if i >= warmup:
            timings.append(elapsed)

        status = resp.status_code
        if status not in (200, 429, 500):
            # 429 = rate limited, 500 = model unavailable — skip but note
            pass

    if not timings:
        return None

    timings.sort()
    return {
        "name": name,
        "runs": len(timings),
        "mean": statistics.mean(timings),
        "p50": timings[len(timings) // 2],
        "p95": timings[int(len(timings) * 0.95)],
        "min": timings[0],
        "max": timings[-1],
        "last_status": status,
    }


def main():
    parser = argparse.ArgumentParser(description="Benchmark RealSync AI endpoints")
    parser.add_argument("--runs", type=int, default=10, help="Number of timed runs per endpoint")
    parser.add_argument("--warmup", type=int, default=1, help="Warmup runs (discarded)")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of table")
    args = parser.parse_args()

    # Check service is up
    try:
        httpx.get(f"{BASE_URL}/api/health", timeout=5)
    except httpx.ConnectError:
        print(f"ERROR: Service not reachable at {BASE_URL}")
        print("Start it first: python -m serve.app &")
        return

    client = httpx.Client(timeout=60)
    results = []

    print(f"\nBenchmarking {len(ENDPOINTS)} endpoints ({args.runs} runs + {args.warmup} warmup each)\n")

    for name, spec in ENDPOINTS.items():
        print(f"  {name}...", end="", flush=True)
        result = benchmark_endpoint(client, name, spec, args.runs, args.warmup)
        if result:
            print(f" {result['mean']:.0f}ms (p95: {result['p95']:.0f}ms)")
            results.append(result)
        else:
            print(" SKIPPED (no successful runs)")

    client.close()

    if args.json:
        print(json.dumps(results, indent=2))
        return

    # Print table
    print(f"\n{'Endpoint':<12} {'Status':<8} {'Mean':>8} {'P50':>8} {'P95':>8} {'Min':>8} {'Max':>8}")
    print("-" * 68)
    for r in results:
        print(
            f"{r['name']:<12} {r['last_status']:<8} "
            f"{r['mean']:>7.1f}ms {r['p50']:>7.1f}ms {r['p95']:>7.1f}ms "
            f"{r['min']:>7.1f}ms {r['max']:>7.1f}ms"
        )
    print()


if __name__ == "__main__":
    main()
