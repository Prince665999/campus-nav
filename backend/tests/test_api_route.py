"""
Tests for /api/route.

Picks two places that actually route between each other, since the
API doesn't guarantee any two places are connected.
"""

import pytest


def _route_between_any_two(client):
    """
    Find a working pair of places and return (place_a, place_b, route_dict).

    Tries pairs until one routes. Skips the test if none do.
    """
    places = client.get("/api/places?limit=200").json()
    if len(places) < 2:
        pytest.skip("Need at least two places to route between")

    for i, a in enumerate(places):
        for b in places[i + 1:]:
            r = client.get(
                f"/api/route?from_place_id={a['id']}&to_place_id={b['id']}"
            )
            if r.status_code == 200:
                return a, b, r.json()

    pytest.skip("No two places are routable in this map")


class TestRouteRequiresEndpoints:
    def test_missing_from_returns_400(self, client):
        to = client.get("/api/places?limit=1").json()[0]
        r = client.get(f"/api/route?to_place_id={to['id']}")
        assert r.status_code == 400

    def test_missing_to_returns_400(self, client):
        from_ = client.get("/api/places?limit=1").json()[0]
        r = client.get(f"/api/route?from_place_id={from_['id']}")
        assert r.status_code == 400


class TestRouteBasic:
    def test_route_between_two_places(self, client):
        a, b, route = _route_between_any_two(client)
        assert route["distance_m"] > 0
        assert len(route["steps"]) > 0
        assert len(route["geometry"]) > 1
        assert route["from_name"] == a["name"]
        assert route["to_name"] == b["name"]
        assert route["profile"] == "fastest"

    def test_route_geometry_is_latlon_list(self, client):
        _a, _b, route = _route_between_any_two(client)
        for point in route["geometry"]:
            assert "lat" in point and "lon" in point
            assert -90 <= point["lat"] <= 90
            assert -180 <= point["lon"] <= 180

    def test_route_first_step_is_start(self, client):
        _a, _b, route = _route_between_any_two(client)
        assert route["steps"][0]["kind"] == "start"

    def test_route_last_step_is_arrive(self, client):
        _a, _b, route = _route_between_any_two(client)
        assert route["steps"][-1]["kind"] == "arrive"

    def test_steps_have_monotonic_at_m(self, client):
        _a, _b, route = _route_between_any_two(client)
        at_ms = [s["at_m"] for s in route["steps"]]
        for i in range(1, len(at_ms)):
            assert at_ms[i] >= at_ms[i - 1]


class TestRouteProfiles:
    def test_profile_is_echoed_in_response(self, client):
        a, b, _route = _route_between_any_two(client)
        r = client.get(
            f"/api/route?from_place_id={a['id']}&to_place_id={b['id']}&profile=step-free"
        )
        assert r.status_code == 200
        assert r.json()["profile"] == "step-free"

    def test_all_profiles_return_a_route_or_a_404(self, client):
        a, b, _route = _route_between_any_two(client)
        for profile in ("fastest", "step-free", "well-lit", "covered", "scenic"):
            r = client.get(
                f"/api/route?from_place_id={a['id']}&to_place_id={b['id']}&profile={profile}"
            )
            assert r.status_code in (200, 404), (
                f"Profile {profile} returned {r.status_code}: {r.text}"
            )

    def test_unknown_profile_falls_back_to_fastest(self, client):
        a, b, _route = _route_between_any_two(client)
        r = client.get(
            f"/api/route?from_place_id={a['id']}&to_place_id={b['id']}&profile=teleport"
        )
        assert r.status_code == 200
        assert r.json()["profile"] == "teleport"


class TestRouteFromCoordinates:
    def test_route_from_latlon(self, client):
        a, b, _route = _route_between_any_two(client)

        r = client.get(
            f"/api/route?from_lat={a['location']['lat']}"
            f"&from_lon={a['location']['lon']}"
            f"&to_place_id={b['id']}"
        )
        assert r.status_code == 200
        assert r.json()["from_name"] == "your current location"


class TestRouteErrors:
    def test_same_place_returns_404(self, client):
        a = client.get("/api/places?limit=1").json()[0]
        r = client.get(f"/api/route?from_place_id={a['id']}&to_place_id={a['id']}")
        assert r.status_code == 404

    def test_nonexistent_place_returns_404(self, client):
        a = client.get("/api/places?limit=1").json()[0]
        r = client.get(f"/api/route?from_place_id={a['id']}&to_place_id=99999999")
        assert r.status_code == 404