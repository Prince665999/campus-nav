"""
prewarm_routes.py

Populate the Redis cache with the most-requested routes.

Reads the route_cache table (sorted by hit_count) and for each of the
top N, recomputes the route and writes it to Redis. Run this after a
Redis restart, or on a schedule (cron, systemd timer, GitHub Actions)
so popular routes are warm before students ask for them.

Usage:
    python -m backend.pipeline.prewarm_routes
    python -m backend.pipeline.prewarm_routes --top 20
"""

import argparse
import json

from backend.api.cache import is_available
from backend.api.db.session import session_scope
from backend.api.models.route_cache import RouteCache
from backend.api.services import cache_service

def prewarm(top_n: int = 10) -> int:
    """
    Rewarm the top N routes. Returns the count of routes warmed.
    """
    if not is_available():
        print("Redis is not available. Nothing to prewarm.")
        return 0

    with session_scope() as session:
        rows = (
            session.query(RouteCache)
            .order_by(RouteCache.hit_count.desc())
            .limit(top_n)
            .all()
        )

        if not rows:
            print("No cached routes to prewarm.")
            return 0

        print(f"Prewarming {len(rows)} route(s)...")
        warmed = 0
        for row in rows:
            key = cache_service.route_key(
                row.start_place_id, row.end_place_id, row.profile
            )
            import json
            payload = json.loads(row.path_json)
            cache_service.set_cached_route(key, payload)
            warmed += 1
            print(f"  route {row.start_place_id} -> {row.end_place_id} "
                  f"(hits={row.hit_count})")

    return warmed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=10)
    args = parser.parse_args()
    n = prewarm(top_n=args.top)
    print(f"\nPrewarmed {n} route(s).")


if __name__ == "__main__":
    main()