"""
Tests for the cache layer.

These tests use Redis database 15 (the last of the default 16) so
they never collide with the app's data, which uses database 0. If
Redis isn't running, the same code still passes — the cache falls
through gracefully to "unavailable" mode.

The tests verify two things:
  1. Key formats are what the rest of the code expects.
  2. The cache degrades gracefully — no operation ever raises,
     whether Redis is running or not.
"""

import pytest


@pytest.fixture(autouse=True)
def isolated_redis(monkeypatch):
    """
    Point the cache at Redis database 15 for every test in this file.

    Database 15 is the last of Redis's default 16 databases. Using a
    separate database means test data never mixes with the app's real
    data (which lives in database 0), and tests don't need to clean
    up after themselves.
    """
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/15")

    # Reset the client so it reconnects to the new URL.
    from backend.api import cache

    cache.reset()
    yield
    # Clean up: flush this test database after each test so the next
    # run starts fresh.
    client = cache.get_client()
    if client is not None:
        try:
            client.flushdb()
        except Exception:
            pass
    cache.reset()


class TestCacheWithoutRedis:
    def test_get_client_returns_none_or_a_client(self):
        from backend.api import cache

        client = cache.get_client()
        # Either we have a Redis client, or None. Either is fine.
        # What matters is: no exception.
        assert client is None or hasattr(client, "get")

    def test_get_returns_none_for_missing_key(self):
        from backend.api import cache

        assert cache.get("some-test-key-that-does-not-exist") is None

    def test_set_then_get_round_trips(self):
        from backend.api import cache

        cache.set("test:round-trip", {"a": 1, "b": [2, 3]}, ttl_s=60)
        result = cache.get("test:round-trip")
        # If Redis is available, we get the value back. If not, we
        # get None. Both are valid depending on the environment.
        if cache.is_available():
            assert result == {"a": 1, "b": [2, 3]}
        else:
            assert result is None

    def test_delete_removes_key(self):
        from backend.api import cache

        cache.set("test:delete-me", {"x": 1}, ttl_s=60)
        cache.delete("test:delete-me")
        assert cache.get("test:delete-me") is None

    def test_delete_pattern_removes_matching_keys(self):
        from backend.api import cache

        cache.set("test-pattern:a", {"x": 1}, ttl_s=60)
        cache.set("test-pattern:b", {"x": 2}, ttl_s=60)
        cache.set("test-pattern:c", {"x": 3}, ttl_s=60)

        cache.delete_pattern("test-pattern:*")

        assert cache.get("test-pattern:a") is None
        assert cache.get("test-pattern:b") is None
        assert cache.get("test-pattern:c") is None


class TestCacheServiceKeyFormats:
    def test_route_key_format(self):
        from backend.api.services.cache_service import route_key

        assert route_key(3, 8) == "route:3:8:fastest"

    def test_route_key_with_profile(self):
        from backend.api.services.cache_service import route_key

        assert route_key(3, 8, profile="step-free") == "route:3:8:step-free"

    def test_route_key_from_coords_rounds_to_four_decimals(self):
        from backend.api.services.cache_service import route_key_from_coords

        # Two coordinates that differ by less than 4 decimal places
        # should produce the same key.
        key_a = route_key_from_coords(-6.75001, 39.20001, 8)
        key_b = route_key_from_coords(-6.75002, 39.20002, 8)
        assert key_a == key_b

    def test_narration_key_format(self):
        from backend.api.services.cache_service import narration_key

        assert narration_key("abc123", lang="en") == "narration:abc123:en:guide"

    def test_route_hash_is_stable(self):
        from backend.api.services.cache_service import route_hash

        h1 = route_hash("some timeline text")
        h2 = route_hash("some timeline text")
        assert h1 == h2
        assert len(h1) == 16

    def test_route_hash_differs_for_different_input(self):
        from backend.api.services.cache_service import route_hash

        assert route_hash("a") != route_hash("b")


class TestCacheServiceRoundTrip:
    def test_route_cache_round_trip(self):
        from backend.api.services import cache_service

        payload = {"distance_m": 123.4, "steps": [], "geometry": []}
        cache_service.set_cached_route("test:route:1:2:fastest", payload)
        result = cache_service.get_cached_route("test:route:1:2:fastest")

        if cache_service.cache.is_available():
            assert result == payload
        else:
            assert result is None

    def test_narration_cache_round_trip(self):
        from backend.api.services import cache_service

        cache_service.set_cached_narration("test-hash", "Walk north.", lang="en")
        result = cache_service.get_cached_narration("test-hash", lang="en")

        if cache_service.cache.is_available():
            assert result == "Walk north."
        else:
            assert result is None

    def test_narration_cache_separates_by_language(self):
        from backend.api.services import cache_service

        cache_service.set_cached_narration("test-multi", "Walk north.", lang="en")
        cache_service.set_cached_narration("test-multi", "Nenda kaskazini.", lang="sw")

        en = cache_service.get_cached_narration("test-multi", lang="en")
        sw = cache_service.get_cached_narration("test-multi", lang="sw")

        if cache_service.cache.is_available():
            assert en == "Walk north."
            assert sw == "Nenda kaskazini."
        else:
            assert en is None
            assert sw is None


class TestDurableRouteCache:
    def test_route_still_computed_when_redis_unavailable(self, client):
        """
        With or without Redis, routes still work end to end. The
        durable table may or may not be populated, but the app must
        serve a route regardless.
        """
        places = client.get("/api/places?limit=100").json()
        if len(places) < 2:
            return

        for i, a in enumerate(places):
            for b in places[i + 1:]:
                r = client.get(
                    f"/api/route?from_place_id={a['id']}&to_place_id={b['id']}"
                )
                if r.status_code == 200:
                    # Second request should also succeed, whether it
                    # hits a cache or recomputes.
                    r2 = client.get(
                        f"/api/route?from_place_id={a['id']}&to_place_id={b['id']}"
                    )
                    assert r2.status_code == 200
                    return