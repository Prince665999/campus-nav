"""
Tests for the document chat endpoints.

These upload a small text file to the knowledge base, then ask
questions about it.
"""

import pytest


@pytest.fixture(autouse=True)
def clean_knowledge_base(client):
    """
    Wipe the knowledge base before each test so tests don't leak
    documents into each other.

    Chroma persists between test runs and between fixtures, so a
    document uploaded in one test is still present in the next.
    This fixture makes each test start from a clean collection.
    """
    # Delete all documents before the test runs.
    docs = client.get(
        "/api/admin/knowledge",
        headers={"X-Admin-Key": "test-admin-key"},
    ).json()
    for d in docs:
        client.delete(
            f"/api/admin/knowledge/{d['id']}",
            headers={"X-Admin-Key": "test-admin-key"},
        )
    yield


def _upload_knowledge(client, filename, content):
    return client.post(
        "/api/admin/knowledge/upload",
        files={"file": (filename, content.encode("utf-8"), "text/plain")},
        headers={"X-Admin-Key": "test-admin-key"},
    )


class TestDocChatSession:
    def test_start_session(self, client):
        r = client.post("/api/chat/doc/session")
        assert r.status_code == 200
        assert len(r.json()["session_id"]) > 20

    def test_end_session(self, client):
        session_id = client.post("/api/chat/doc/session").json()["session_id"]
        r = client.delete(f"/api/chat/doc/session/{session_id}")
        assert r.status_code == 204


class TestDocChatRequiresNoRoute:
    def test_chat_does_not_accept_route_fields(self, client, temp_db):
        """
        The doc chat endpoint has no route fields. Sending them should
        either be ignored or rejected — but the request should still
        work.
        """
        _upload_knowledge(
            client,
            "hours.txt",
            "The library is open from 8 AM to 10 PM on weekdays.",
        )

        r = client.post(
            "/api/chat/doc",
            json={
                "message": "when is the library open",
                # Some clients might send route fields by mistake.
                # The endpoint should still work.
                "from_place_id": 1,
                "to_place_id": 2,
            },
        )
        assert r.status_code == 200


class TestDocChatWithKnowledge:
    def test_knowledge_question_uses_documents(self, client, temp_db):
        _upload_knowledge(
            client,
            "rules.txt",
            "The library closes at 6 PM on Saturdays. "
            "Late fees are 500 shillings per day.",
        )

        r = client.post(
            "/api/chat/doc",
            json={"message": "what time does the library close on Saturdays"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["used_knowledge"] is True

    def test_unrelated_question_returns_not_found_message(self, client, temp_db):
        _upload_knowledge(
            client,
            "narrow.txt",
            "The library has 200 study seats.",
        )

        r = client.post(
            "/api/chat/doc",
            json={"message": "what is the capital of France"},
        )
        assert r.status_code == 200
        body = r.json()
        # The knowledge base should either not retrieve anything
        # relevant, or retrieve chunks that don't answer the question.
        # Either way, the reply should indicate uncertainty.
        reply = body["reply"].lower()
        assert any(
            phrase in reply
            for phrase in [
                "don't know",
                "dont know",
                "not sure",
                "check the",
                "don't have",
                "dont have",
                "no information",
            ]
        ) or body["used_knowledge"] is False

    def test_chat_with_no_documents_says_so(self, client, temp_db):
        r = client.post(
            "/api/chat/doc",
            json={"message": "anything at all"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["used_knowledge"] is False


class TestDocSearch:
    def test_search_returns_chunks(self, client, temp_db):
        _upload_knowledge(
            client,
            "facts.txt",
            "The university was founded in 1988.",
        )

        r = client.get("/api/chat/doc/search?q=founded")
        assert r.status_code == 200
        results = r.json()
        assert len(results) > 0
        assert any("1988" in r["text"] for r in results)

    def test_search_requires_query(self, client):
        r = client.get("/api/chat/doc/search")
        assert r.status_code == 422