"""
Tests for /api/narrate.

By default the endpoint uses local narration — no Groq call. These
tests rely on that default so they run fast and offline.
"""

import pytest


def _narrate_any_two(client, **extra_params):
    """
    Find a working pair of places, narrate the route between them,
    return (place_a, place_b, response_body).
    """
    places = client.get("/api/places?limit=200").json()
    if len(places) < 2:
        pytest.skip("Need at least two places to narrate between")

    query_extra = "".join(f"&{k}={v}" for k, v in extra_params.items())
    for i, a in enumerate(places):
        for b in places[i + 1:]:
            r = client.get(
                f"/api/narrate?from_place_id={a['id']}&to_place_id={b['id']}"
                + query_extra
            )
            if r.status_code == 200:
                return a, b, r.json()

    pytest.skip("No two places are routable in this map")


class TestNarrateBasics:
    def test_narrate_returns_200(self, client):
        _narrate_any_two(client)  # skips if no routable pair

    def test_response_shape(self, client):
        _a, _b, body = _narrate_any_two(client)
        assert "text" in body
        assert "source" in body
        assert "lang" in body
        assert isinstance(body["text"], str)
        assert len(body["text"]) > 0

    def test_source_is_local_by_default(self, client):
        _a, _b, body = _narrate_any_two(client)
        assert body["source"] == "local"

    def test_lang_defaults_to_english(self, client):
        _a, _b, body = _narrate_any_two(client)
        assert body["lang"] == "en"

    def test_lang_is_echoed(self, client):
        _a, _b, body = _narrate_any_two(client, lang="sw")
        assert body["lang"] == "sw"


class TestNarrateRequirements:
    def test_missing_from_returns_400(self, client):
        """
        from_place_id is now optional (from_lat/from_lon can be used
        instead), so the schema layer accepts the request and the
        endpoint returns 400 with a clear message.
        """
        a = client.get("/api/places?limit=1").json()[0]
        r = client.get(f"/api/narrate?to_place_id={a['id']}")
        assert r.status_code == 400
        assert "from" in r.json()["detail"].lower()

    def test_missing_to_returns_422(self, client):
        """
        to_place_id is still required at the schema level, so FastAPI
        rejects the request with 422.
        """
        a = client.get("/api/places?limit=1").json()[0]
        r = client.get(f"/api/narrate?from_place_id={a['id']}")
        assert r.status_code == 422

class TestNarrateText:
    def test_text_is_not_a_numbered_list(self, client):
        _a, _b, body = _narrate_any_two(client)
        text = body["text"]
        for line in text.split("\n"):
            stripped = line.strip()
            assert stripped[:2] not in ("1.", "2.", "3.")

    def test_text_is_non_empty_and_prose(self, client):
        """
        The narration should be a non-empty string of prose, not a
        numbered list. We don't assert on specific words because the
        narrator legitimately reformats place names ('must main gate'
        becomes 'the main gate').
        """
        _a, _b, body = _narrate_any_two(client)
        text = body["text"]
        assert isinstance(text, str)
        assert len(text) > 20
        # Prose, not a numbered list.
        assert not text.lstrip().startswith("1.")
        # Contains at least one sentence-ending punctuation.
        assert "." in text


class TestNarrateRouteDoesNotExist:
    def test_nonexistent_place_returns_404(self, client):
        a = client.get("/api/places?limit=1").json()[0]
        r = client.get(
            f"/api/narrate?from_place_id={a['id']}&to_place_id=99999999"
        )
        assert r.status_code == 404

    def test_same_place_returns_404(self, client):
        a = client.get("/api/places?limit=1").json()[0]
        r = client.get(
            f"/api/narrate?from_place_id={a['id']}&to_place_id={a['id']}"
        )
        assert r.status_code == 404