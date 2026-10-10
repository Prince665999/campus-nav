"""
End-to-end tests for the route endpoint with indoor destinations.

These tests require the real campus data (indoor places). They
skip if the DB doesn't have an indoor place, so they don't fail on
a fresh checkout.
"""

import pytest


def _find_outdoor_place(client):
    r = client.get("/api/places?kind=outdoor&limit=1")
    if r.status_code != 200:
        return None
    items = r.json()
    return items[0] if items else None


def _find_indoor_place(client):
    r = client.get("/api/places?kind=indoor&limit=1")
    if r.status_code != 200:
        return None
    items = r.json()
    return items[0] if items else None


class TestMixedRoutePlaceToIndoor:
    def test_route_from_outdoor_to_indoor(self, client):
        from_place = _find_outdoor_place(client)
        to_place = _find_indoor_place(client)
        if not from_place or not to_place:
            pytest.skip("Need at least one outdoor and one indoor place")

        r = client.get(
            f"/api/route?from_place_id={from_place['id']}"
            f"&to_place_id={to_place['id']}"
        )
        # If they're not connected, that's a valid 404. We're
        # really checking that the composer runs and returns a
        # route when one exists.
        if r.status_code == 404:
            pytest.skip("No path between these places")
        assert r.status_code == 200

    def test_steps_have_mode_field(self, client):
        from_place = _find_outdoor_place(client)
        to_place = _find_indoor_place(client)
        if not from_place or not to_place:
            pytest.skip("Need at least one outdoor and one indoor place")

        r = client.get(
            f"/api/route?from_place_id={from_place['id']}"
            f"&to_place_id={to_place['id']}"
        )
        if r.status_code == 404:
            pytest.skip("No path between these places")

        body = r.json()
        for step in body["steps"]:
            assert "mode" in step
            assert step["mode"] in ("outdoor", "indoor")

    def test_steps_have_increasing_at_m(self, client):
        from_place = _find_outdoor_place(client)
        to_place = _find_indoor_place(client)
        if not from_place or not to_place:
            pytest.skip("Need at least one outdoor and one indoor place")

        r = client.get(
            f"/api/route?from_place_id={from_place['id']}"
            f"&to_place_id={to_place['id']}"
        )
        if r.status_code == 404:
            pytest.skip("No path between these places")

        body = r.json()
        at_ms = [s["at_m"] for s in body["steps"]]
        for i in range(1, len(at_ms)):
            assert at_ms[i] >= at_ms[i - 1], (
                f"at_m went backwards: {at_ms}"
            )

    def test_last_step_at_m_is_near_total_distance(self, client):
        from_place = _find_outdoor_place(client)
        to_place = _find_indoor_place(client)
        if not from_place or not to_place:
            pytest.skip("Need at least one outdoor and one indoor place")

        r = client.get(
            f"/api/route?from_place_id={from_place['id']}"
            f"&to_place_id={to_place['id']}"
        )
        if r.status_code == 404:
            pytest.skip("No path between these places")

        body = r.json()
        last_at_m = body["steps"][-1]["at_m"]
        total = body["distance_m"]
        # The last step should be within 1m of the total.
        assert abs(last_at_m - total) < 1.0, (
            f"last step at_m={last_at_m} but total={total}"
        )


class TestMixedRouteGpsStart:
    def test_gps_start_to_indoor_does_not_500(self, client):
        """
        The GPS-start → indoor case used to raise the composer's
        "mixed routes require both endpoints to be named places".
        It should now either succeed or return a clean 404/422.
        """
        to_place = _find_indoor_place(client)
        if not to_place:
            pytest.skip("No indoor place in the test DB")

        # Use a coordinate near the campus so the snap succeeds.
        r = client.get(
            f"/api/route?from_lat=-8.9435&from_lon=33.4190"
            f"&to_place_id={to_place['id']}"
        )
        assert r.status_code in (200, 404, 422)

    def test_gps_start_far_away_returns_422(self, client):
        """
        A GPS fix far from any path should produce a
        LocationTooFarError (422).
        """
        to_place = _find_indoor_place(client)
        if not to_place:
            pytest.skip("No indoor place in the test DB")

        # Middle of the ocean.
        r = client.get(
            f"/api/route?from_lat=0&from_lon=0"
            f"&to_place_id={to_place['id']}"
        )
        assert r.status_code == 422


class TestPureOutdoorUnchanged:
    def test_outdoor_to_outdoor_still_works(self, client):
        """The outdoor-to-outdoor path must be unchanged."""
        r = client.get("/api/places?kind=outdoor&limit=10")
        places = r.json()
        if len(places) < 2:
            pytest.skip("Need at least two outdoor places")

        for i, a in enumerate(places):
            for b in places[i + 1:]:
                r = client.get(
                    f"/api/route?from_place_id={a['id']}"
                    f"&to_place_id={b['id']}"
                )
                if r.status_code == 200:
                    body = r.json()
                    # All steps should be outdoor mode.
                    for step in body["steps"]:
                        assert step["mode"] == "outdoor"
                    # No indoor fields populated.
                    for step in body["steps"]:
                        assert step.get("level") is None
                        assert step.get("building_name") is None
                    # Legs is a single outdoor leg.
                    assert body["legs"] is not None
                    assert len(body["legs"]) == 1
                    assert body["legs"][0]["mode"] == "outdoor"
                    return

        pytest.skip("No two outdoor places are routable")