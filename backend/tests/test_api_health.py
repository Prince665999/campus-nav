"""
Tests for /api/health.
"""


class TestHealth:
    def test_returns_200(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200

    def test_response_shape(self, client):
        body = client.get("/api/health").json()
        assert "status" in body
        assert "graph_version" in body
        assert "node_count" in body
        assert "edge_count" in body
        assert "place_count" in body
        assert "area_count" in body
        assert "uptime_s" in body

    def test_graph_loaded(self, client):
        body = client.get("/api/health").json()
        assert body["status"] == "ok"
        assert body["node_count"] > 0
        assert body["edge_count"] > 0

    def test_counts_reflect_the_ingested_map(self, client):
        body = client.get("/api/health").json()
        # The real map has 31 places and 45 areas.
        assert body["place_count"] > 0
        assert body["area_count"] > 0

    def test_uptime_is_nonnegative(self, client):
        body = client.get("/api/health").json()
        assert body["uptime_s"] >= 0


class TestRoot:
    def test_root_returns_info(self, client):
        r = client.get("/")
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Campus Navigation API"
        assert body["docs"] == "/docs"