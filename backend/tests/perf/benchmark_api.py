"""
benchmark_api.py

Measure the API's response times against a running instance.

Usage:
    python -m backend.tests.perf.benchmark_api
    python -m backend.tests.perf.benchmark_api --base-url http://localhost:8000

The output shows per-endpoint average and 95th-percentile times over
a fixed number of requests. Run it against a warm API on a quiet
machine for meaningful numbers.
"""

import argparse
import statistics
import time

import requests


def time_request(url, n=20):
    """Send a GET n times and return the response times in ms."""
    times = []
    for _ in range(n):
        start = time.perf_counter()
        response = requests.get(url, timeout=10)
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.raise_for_status()
        times.append(elapsed_ms)
    return times


def summarise(label, times):
    avg = statistics.mean(times)
    p95 = sorted(times)[int(len(times) * 0.95) - 1]
    lo = min(times)
    hi = max(times)
    print(f"{label:40s}  avg {avg:6.1f}ms  p95 {p95:6.1f}ms  min {lo:6.1f}ms  max {hi:6.1f}ms")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--iterations", type=int, default=20)
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    n = args.iterations

    print(f"Benchmarking {base} — {n} iterations per endpoint\n")

    # Basic endpoints.
    summarise("GET /api/health", time_request(f"{base}/api/health", n))
    summarise("GET /api/places?limit=20", time_request(f"{base}/api/places?limit=20", n))
    summarise("GET /api/places/search?q=a", time_request(f"{base}/api/places/search?q=a", n))

    # Route computation — the heaviest endpoint.
    try:
        places = requests.get(f"{base}/api/places?limit=50", timeout=10).json()
        if len(places) >= 2:
            a, b = places[0], places[1]
            route_url = f"{base}/api/route?from_place_id={a['id']}&to_place_id={b['id']}"
            # Warm up the cache.
            requests.get(route_url, timeout=10)
            summarise(f"GET /api/route (cached)", time_request(route_url, n))

            narrate_url = f"{base}/api/narrate?from_place_id={a['id']}&to_place_id={b['id']}"
            requests.get(narrate_url, timeout=30)
            summarise(f"GET /api/narrate (cached)", time_request(narrate_url, n))
    except Exception as e:
        print(f"\nSkipping route benchmarks: {e}")

    print()
    print("Targets from the roadmap:")
    print("  route computation    < 150 ms")
    print("  narration (cached)   < 100 ms")


if __name__ == "__main__":
    main()