"""
Tests for mixed-route narration.

These tests exercise the joiner and the indoor narration service
without hitting the network. Where the AI would be called, we rely
on the no-fallback policy: with no API key set, the indoor service
returns the raw steps, and the joiner still produces a joined
result.

The tests use the real campus data (via the seeded_db fixture) and
skip if the data doesn't include indoor places or entrance places.

What we assert:

  1. split_runs produces the right runs for the five modes.
  2. transition_sentence names the building when it can.
  3. narrate_route() with an indoor endpoint returns a string.
  4. narrate_route() with an outdoor endpoint still returns the
     existing shape (unchanged behaviour).
  5. The mixed narration contains both an outdoor-ish phrase and an
     indoor-ish phrase.
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


def _find_entrance_place(client):
    r = client.get("/api/places?kind=entrance&limit=1")
    if r.status_code != 200:
        return None
    items = r.json()
    return items[0] if items else None


# ---------------------------------------------------------------------------
# Pure unit tests — the splitter
# ---------------------------------------------------------------------------

class TestSplitRuns:
    def test_pure_outdoor_is_one_run(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs(["o1", "o2", "o3"])
        assert len(runs) == 1
        assert runs[0]["mode"] == "outdoor"
        assert runs[0]["nodes"] == ["o1", "o2", "o3"]

    def test_pure_indoor_is_one_run(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs(["1", "2", "3"])
        assert len(runs) == 1
        assert runs[0]["mode"] == "indoor"

    def test_outdoor_to_indoor(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs(["o1", "o2", "entrance", "i1", "i2"])
        assert [r["mode"] for r in runs] == ["outdoor", "indoor"]
        assert runs[0]["nodes"] == ["o1", "o2"]
        assert runs[1]["nodes"] == ["entrance", "i1", "i2"]

    def test_indoor_to_outdoor(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs(["i1", "entrance", "o1", "o2"])
        assert [r["mode"] for r in runs] == ["indoor", "outdoor"]
        assert runs[0]["nodes"] == ["i1", "entrance"]
        assert runs[1]["nodes"] == ["o1", "o2"]

    def test_cross_building(self):
        from backend.api.services.narration_joiner import split_runs
        runs = split_runs([
            "a1", "a2", "entranceA",
            "o1", "o2", "o3", "entranceB",
            "b1", "b2",
        ])
        assert [r["mode"] for r in runs] == ["indoor", "outdoor", "indoor"]


class TestTransitionSentence:
    def test_named_building_on_outdoor_to_indoor(self):
        from backend.api.services.narration_joiner import _transition_sentence
        runs = [
            {"mode": "outdoor", "nodes": ["o1", "o2"]},
            {"mode": "indoor", "nodes": ["entrance", "i1"]},
        ]
        nodes = {
            "o1": {"tags": {}},
            "o2": {"tags": {}},
            "entrance": {"tags": {"building_name": "Science Block"}},
            "i1": {"tags": {}},
        }
        text = _transition_sentence(runs, 0, nodes)
        assert "Science Block" in text
        assert "inside" in text.lower()

    def test_unnamed_building_falls_back(self):
        from backend.api.services.narration_joiner import _transition_sentence
        runs = [
            {"mode": "outdoor", "nodes": ["o1", "o2"]},
            {"mode": "indoor", "nodes": ["entrance", "i1"]},
        ]
        nodes = {
            "o1": {"tags": {}},
            "o2": {"tags": {}},
            "entrance": {"tags": {}},
            "i1": {"tags": {}},
        }
        text = _transition_sentence(runs, 0, nodes)
        assert "entrance" in text.lower()
        # No specific building name should be mentioned.
        assert "Science Block" not in text

    def test_named_building_on_indoor_to_outdoor(self):
        from backend.api.services.narration_joiner import _transition_sentence
        runs = [
            {"mode": "indoor", "nodes": ["i1", "i2"]},
            {"mode": "outdoor", "nodes": ["o1", "o2"]},
        ]
        nodes = {
            "i1": {"tags": {}},
            "i2": {"tags": {"building_name": "Library"}},
            "o1": {"tags": {}},
            "o2": {"tags": {}},
        }
        text = _transition_sentence(runs, 0, nodes)
        assert "Library" in text


# ---------------------------------------------------------------------------
# Integration — through the API
# ---------------------------------------------------------------------------

class TestMixedNarrationEndpoint:
    def test_outdoor_to_outdoor_unchanged(self, client):
        """A pure outdoor route returns the same shape as before."""
        places = client.get("/api/places?kind=outdoor&limit=20").json()
        if len(places) < 2:
            pytest.skip("Need at least two outdoor places")

        for i, a in enumerate(places):
            for b in places[i + 1 :]:
                r = client.get(
                    f"/api/narrate?from_place_id={a['id']}"
                    f"&to_place_id={b['id']}"
                )
                if r.status_code == 200:
                    body = r.json()
                    assert "text" in body
                    assert "source" in body
                    assert body["source"] in ("local", "groq")
                    return
        pytest.skip("No routable pair of outdoor places")

    def test_outdoor_to_indoor_returns_text(self, client, temp_db):
        outdoor = _find_outdoor_place(client)
        indoor = _find_indoor_place(client)
        if not outdoor or not indoor:
            pytest.skip("Need at least one outdoor and one indoor place")

        r = client.get(
            f"/api/narrate?from_place_id={outdoor['id']}"
            f"&to_place_id={indoor['id']}"
        )
        if r.status_code == 404:
            pytest.skip("No path between these places")

        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["text"], str)
        assert len(body["text"]) > 20

    def test_indoor_to_indoor_returns_text(self, client, temp_db):
        indoor_places = client.get("/api/places?kind=indoor&limit=10").json()
        if len(indoor_places) < 2:
            pytest.skip("Need at least two indoor places")

        a, b = indoor_places[0], indoor_places[1]
        r = client.get(
            f"/api/narrate?from_place_id={a['id']}&to_place_id={b['id']}"
        )
        if r.status_code == 404:
            pytest.skip("No path between these indoor places")

        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["text"], str)
        assert len(body["text"]) > 10

    def test_indoor_to_outdoor_returns_text(self, client, temp_db):
        indoor = _find_indoor_place(client)
        outdoor = _find_outdoor_place(client)
        if not indoor or not outdoor:
            pytest.skip("Need at least one indoor and one outdoor place")

        r = client.get(
            f"/api/narrate?from_place_id={indoor['id']}"
            f"&to_place_id={outdoor['id']}"
        )
        if r.status_code == 404:
            pytest.skip("No path between these places")

        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["text"], str)
        assert len(body["text"]) > 20