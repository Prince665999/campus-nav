"""
Tests for the chat endpoints.

These tests run without a GROQ_API_KEY, so they exercise the local
fallbacks. The LLM path is exercised manually when a key is set.
"""


class TestExtractDestination:
    def test_empty_message_returns_422(self, client):
        r = client.post("/api/chat/extract-destination", json={"message": ""})
        assert r.status_code == 422

    def test_known_place_name_matches(self, client):
        place = client.get("/api/places?limit=1").json()[0]
        r = client.post(
            "/api/chat/extract-destination",
            json={"message": f"take me to the {place['name']}"},
        )
        assert r.status_code == 200
        body = r.json()
        # The local matcher should find this since the name appears
        # in the message.
        assert body["matched"] is True
        assert body["place_id"] == place["id"]

    def test_unknown_text_returns_no_match(self, client):
        r = client.post(
            "/api/chat/extract-destination",
            json={"message": "zzzznotarealplacezzz"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["matched"] is False
        assert body["place_id"] is None

    def test_response_has_confidence(self, client):
        place = client.get("/api/places?limit=1").json()[0]
        r = client.post(
            "/api/chat/extract-destination",
            json={"message": place["name"]},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["confidence"] in ("high", "medium", "low")


class TestChatSession:
    def test_start_session_returns_uuid(self, client):
        r = client.post("/api/chat/session")
        assert r.status_code == 200
        body = r.json()
        assert "session_id" in body
        # Basic UUID shape check.
        assert len(body["session_id"]) > 20

    def test_end_session_returns_204(self, client):
        session_id = client.post("/api/chat/session").json()["session_id"]
        r = client.delete(f"/api/chat/session/{session_id}")
        assert r.status_code == 204

    def test_end_nonexistent_session_is_ok(self, client):
        # Deleting an unknown session should be a no-op, not an error.
        r = client.delete("/api/chat/session/does-not-exist")
        assert r.status_code == 204


class TestChat:
    def test_no_context_returns_prompt_to_start_walk(self, client):
        r = client.post("/api/chat", json={"message": "hello"})
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["reply"], str)
        assert len(body["reply"]) > 0

    def test_context_with_route_answers(self, client):
        # Find a routable pair.
        places = client.get("/api/places?limit=100").json()
        pair = None
        for i, a in enumerate(places):
            for b in places[i + 1 :]:
                r = client.get(
                    f"/api/route?from_place_id={a['id']}&to_place_id={b['id']}"
                )
                if r.status_code == 200:
                    pair = (a, b)
                    break
            if pair:
                break

        if not pair:
            return  # no routable pair in this map

        a, b = pair
        r = client.post(
            "/api/chat",
            json={
                "message": "what's next?",
                "from_place_id": a["id"],
                "to_place_id": b["id"],
                "current_step_index": 0,
                "distance_from_start_m": 0,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["reply"], str)
        assert len(body["reply"]) > 0

    def test_empty_message_returns_422(self, client):
        r = client.post("/api/chat", json={"message": ""})
        assert r.status_code == 422