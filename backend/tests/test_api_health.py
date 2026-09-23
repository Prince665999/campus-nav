"""
Tests for /api/health and the root endpoint.
"""


class TestHealth:
    def test_returns_200(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200

    def test_response_shape(self, client):
        body = client.get("/api/health").json()

        # Core fields
        assert "status" in body
        assert "version" in body
        assert "environment" in body
        assert "uptime_s" in body

        # Graph info
        assert "graph_version" in body
        assert "node_count" in body
        assert "edge_count" in body

        # Counts
        assert "place_count" in body
        assert "area_count" in body

        # Dependencies
        assert "dependencies" in body
        assert isinstance(body["dependencies"], list)

    def test_status_is_valid(self, client):
        body = client.get("/api/health").json()
        assert body["status"] in ("ok", "degraded", "down")

    def test_database_dependency_reports_ok(self, client):
        body = client.get("/api/health").json()
        db = next(
            (d for d in body["dependencies"] if d["name"] == "database"), None
        )
        assert db is not None
        assert db["ok"] is True

    def test_graph_dependency_reports_ok(self, client):
        body = client.get("/api/health").json()
        graph = next(
            (d for d in body["dependencies"] if d["name"] == "graph"), None
        )
        assert graph is not None
        assert graph["ok"] is True

    def test_redis_dependency_is_reported(self, client):
        body = client.get("/api/health").json()
        redis_dep = next(
            (d for d in body["dependencies"] if d["name"] == "redis"), None
        )
        assert redis_dep is not None
        # Whether it's ok depends on whether Redis is running, but
        # it should be present either way.

    def test_graph_is_loaded(self, client):
        body = client.get("/api/health").json()
        assert body["node_count"] > 0
        assert body["edge_count"] > 0

    def test_counts_reflect_the_ingested_map(self, client):
        body = client.get("/api/health").json()
        assert body["place_count"] > 0
        assert body["area_count"] > 0

    def test_uptime_is_nonnegative(self, client):
        body = client.get("/api/health").json()
        assert body["uptime_s"] >= 0

    def test_version_is_present(self, client):
        body = client.get("/api/health").json()
        assert body["version"]
        # Should look like a version number.
        assert "." in body["version"]


class TestRoot:
    def test_root_returns_info(self, client):
        r = client.get("/")
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Campus Navigation API"
        assert body["docs"] == "/docs"