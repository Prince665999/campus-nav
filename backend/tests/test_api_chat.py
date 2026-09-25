"""
Tests for the route chat endpoints.

All these tests require route context. Questions without a route
belong to the doc chat test file.
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
        assert body["matched"] is True
        assert body["place_id"] == place["id"]

    def test_unknown_text_returns_no_match(self, client):
        r = client.post(
            "/api/chat/extract-destination",
            json={"message": "zzzznotarealplacezzz"},
        )
        assert r.status_code == 200
        assert r.json()["matched"] is False


class TestChatSession:
    def test_start_session_returns_uuid(self, client):
        r = client.post("/api/chat/session")
        assert r.status_code == 200
        assert len(r.json()["session_id"]) > 20

    def test_end_session(self, client):
        session_id = client.post("/api/chat/session").json()["session_id"]
        r = client.delete(f"/api/chat/session/{session_id}")
        assert r.status_code == 204


class TestRouteChatRequiresContext:
    def test_missing_route_fields_returns_422(self, client):
        """
        The route chat endpoint requires all four route fields. A
        request without them should be rejected — the client should
        call /api/chat/doc instead.
        """
        r = client.post(
            "/api/chat",
            json={"message": "what time does the library close"},
        )
        assert r.status_code == 422

    def test_partial_route_fields_returns_422(self, client):
        a = client.get("/api/places?limit=1").json()[0]
        r = client.post(
            "/api/chat",
            json={
                "message": "what's next",
                "from_place_id": a["id"],
                "to_place_id": a["id"],
                # missing current_step_index and distance_from_start_m
            },
        )
        assert r.status_code == 422


class TestRouteChat:
    def _find_routable_pair(self, client):
        places = client.get("/api/places?limit=100").json()
        for i, a in enumerate(places):
            for b in places[i + 1 :]:
                r = client.get(
                    f"/api/route?from_place_id={a['id']}&to_place_id={b['id']}"
                )
                if r.status_code == 200:
                    return a, b
        return None, None

    def test_route_question_answers(self, client, temp_db):
        a, b = self._find_routable_pair(client)
        if not a:
            return

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

    def test_route_question_does_not_mention_documents(self, client, temp_db):
        """
        The route chat should never claim to be answering from a
        document. Even if the answer is short, it should not contain
        phrases like 'from the documents'.
        """
        a, b = self._find_routable_pair(client)
        if not a:
            return

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
        reply = r.json()["reply"].lower()
        assert "document" not in reply
        assert "handbook" not in reply
        assert "almanac" not in reply