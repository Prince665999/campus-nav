"""
cache_service.py

Higher-level cache operations specific to this app. Knows the key
formats for routes and narrations, and how to serialise the payloads.

The low-level Redis wrapper lives in cache.py. This file is about
what we cache, not how.
"""

import hashlib
import json

from backend.api import cache
from backend.api.settings import NARRATION_CACHE_TTL_S, ROUTE_CACHE_TTL_S


# ---------------------------------------------------------------------------
# Key formats
# ---------------------------------------------------------------------------

def route_key(from_place_id: int, to_place_id: int, profile: str = "fastest") -> str:
    """Redis key for a route between two places."""
    return f"route:{from_place_id}:{to_place_id}:{profile}"


def route_key_from_coords(from_lat: float, from_lon: float, to_place_id: int, profile: str = "fastest") -> str:
    """
    Redis key for a route from raw coordinates. Used for recalculation.

    Coordinates are rounded to 4 decimal places (~11m) so tiny GPS
    jitter doesn't produce a different cache key for the same walk.
    """
    lat = round(from_lat, 4)
    lon = round(from_lon, 4)
    return f"route:@{lat},{lon}:{to_place_id}:{profile}"


def narration_key(route_hash: str, lang: str = "en", style: str = "guide") -> str:
    """Redis key for a narration of a route."""
    return f"narration:{route_hash}:{lang}:{style}"


def route_hash(route_json: str) -> str:
    """
    Short hash of a route's JSON. Used as the narration cache key
    because narration depends on the route's timeline, not its place
    IDs.
    """
    return hashlib.sha256(route_json.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Route cache
# ---------------------------------------------------------------------------

def get_cached_route(key: str):
    """Return the cached route payload, or None."""
    return cache.get(key)


def set_cached_route(key: str, route_payload: dict):
    """Cache a route payload."""
    cache.set(key, route_payload, ttl_s=ROUTE_CACHE_TTL_S)


def invalidate_routes():
    """
    Delete every cached route. Called when the map changes (reimport)
    because all previously computed routes may no longer be valid.
    """
    cache.delete_pattern("route:*")


# ---------------------------------------------------------------------------
# Narration cache
# ---------------------------------------------------------------------------

def get_cached_narration(route_hash_value: str, lang: str = "en", style: str = "guide"):
    """Return the cached narration text, or None."""
    key = narration_key(route_hash_value, lang, style)
    result = cache.get(key)
    if result is None:
        return None
    return result.get("text")


def set_cached_narration(route_hash_value: str, text: str, lang: str = "en", style: str = "guide"):
    """Cache a narration."""
    key = narration_key(route_hash_value, lang, style)
    cache.set(key, {"text": text}, ttl_s=NARRATION_CACHE_TTL_S)


def invalidate_narrations():
    """Delete every cached narration."""
    cache.delete_pattern("narration:*")


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------

def stats() -> dict:
    """
    Rough stats about the cache. Used by /api/health in Phase 17.
    """
    client = cache.get_client()
    if client is None:
        return {"available": False, "keys": 0}

    try:
        # Count route and narration keys using SCAN, not KEYS.
        route_count = sum(1 for _ in client.scan_iter(match="route:*", count=100))
        narration_count = sum(1 for _ in client.scan_iter(match="narration:*", count=100))
        return {
            "available": True,
            "route_keys": route_count,
            "narration_keys": narration_count,
            "total_keys": route_count + narration_count,
        }
    except Exception:
        return {"available": False, "keys": 0}