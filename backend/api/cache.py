"""
cache.py

Redis client and a safe wrapper.

The `Redis` client is created lazily on first use. If Redis isn't
running, the connection fails, and every cache operation returns
None as if there were a miss. This means the app works with Redis
absent — it's just slower.
"""

import json
import logging

from backend.api.settings import CACHE_ENABLED, REDIS_URL

logger = logging.getLogger(__name__)

_client = None
_unavailable = False


def get_client():
    """
    Return the Redis client, creating it on first call.

    Returns None if Redis isn't available. Callers must handle None
    by treating it as a cache miss.
    """
    global _client, _unavailable

    if not CACHE_ENABLED:
        return None
    if _unavailable:
        return None
    if _client is not None:
        return _client

    try:
        import redis

        _client = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        # Verify the connection works. If it doesn't, mark Redis as
        # unavailable for this process and stop trying — a warning
        # once is better than a warning on every request.
        _client.ping()
        logger.info("Redis connected at %s", REDIS_URL)
    except Exception as e:
        logger.warning(
            "Redis not available at %s (%s). Caching is disabled for this process.",
            REDIS_URL,
            e,
        )
        _unavailable = True
        _client = None

    return _client


def get(key: str):
    """
    Get a value by key. Returns None on miss or if Redis is
    unavailable. Deserialises JSON.
    """
    client = get_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.warning("Cache get failed for %s: %s", key, e)
        return None


def set(key: str, value, ttl_s: int):
    """
    Set a value by key with a TTL. Silently fails if Redis is
    unavailable.
    """
    client = get_client()
    if client is None:
        return
    try:
        client.setex(key, ttl_s, json.dumps(value))
    except Exception as e:
        logger.warning("Cache set failed for %s: %s", key, e)


def delete(key: str):
    """Delete a key. Silent if Redis is unavailable."""
    client = get_client()
    if client is None:
        return
    try:
        client.delete(key)
    except Exception as e:
        logger.warning("Cache delete failed for %s: %s", key, e)


def delete_pattern(pattern: str):
    """
    Delete every key matching a glob pattern. Uses SCAN rather than
    KEYS so it doesn't block Redis on a large keyspace.
    """
    client = get_client()
    if client is None:
        return
    try:
        for key in client.scan_iter(match=pattern, count=100):
            client.delete(key)
    except Exception as e:
        logger.warning("Cache pattern delete failed for %s: %s", pattern, e)


def is_available() -> bool:
    """Whether Redis is connected and usable."""
    return get_client() is not None


def reset():
    """Forget the cached client. Used by tests."""
    global _client, _unavailable
    _client = None
    _unavailable = False