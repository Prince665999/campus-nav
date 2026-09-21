"""
Tests for /api/reports.
"""


def _device_headers(device_id="test-device-1"):
    return {"X-Device-Id": device_id}


class TestCreateReport:
    def test_missing_device_id_returns_400(self, client):
        r = client.post("/api/reports", json={"kind": "wrong_direction"})
        assert r.status_code == 400

    def test_create_problem_report(self, client):
        place = client.get("/api/places?limit=1").json()[0]
        r = client.post(
            "/api/reports",
            json={
                "kind": "wrong_direction",
                "body": "The turn at the corner was wrong.",
                "place_id": place["id"],
            },
            headers=_device_headers(),
        )
        assert r.status_code == 201
        body = r.json()
        assert body["kind"] == "wrong_direction"
        assert body["status"] == "new"
        assert "id" in body

    def test_feedback_report_is_auto_resolved(self, client):
        r = client.post(
            "/api/reports",
            json={"kind": "helpful"},
            headers=_device_headers(),
        )
        assert r.status_code == 201
        assert r.json()["status"] == "resolved"

    def test_unknown_kind_returns_400(self, client):
        r = client.post(
            "/api/reports",
            json={"kind": "not_a_real_kind"},
            headers=_device_headers(),
        )
        assert r.status_code == 400
        assert "unknown report kind" in r.json()["detail"].lower()

    def test_report_without_place_or_edge(self, client):
        """A report can be about the app in general, not a specific place."""
        r = client.post(
            "/api/reports",
            json={"kind": "other", "body": "The app keeps crashing."},
            headers=_device_headers(),
        )
        assert r.status_code == 201