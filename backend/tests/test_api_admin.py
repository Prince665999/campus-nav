"""
Tests for the admin endpoints.

Every request needs the X-Admin-Key header. The conftest fixture
sets ADMIN_API_KEY so the tests have a known value.
"""

import os

import pytest


# Ensure the admin key is set for the whole module.
ADMIN_KEY = "test-admin-key"


@pytest.fixture(autouse=True)
def set_admin_key(monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", ADMIN_KEY)
    # Reload settings so the change is picked up.
    import importlib
    import backend.api.settings as settings_module
    import backend.api.dependencies as deps_module

    importlib.reload(settings_module)
    importlib.reload(deps_module)
    yield


def _h():
    return {"X-Admin-Key": ADMIN_KEY}


class TestAdminGuard:
    def test_no_key_returns_401(self, client):
        r = client.get("/api/admin/stats")
        assert r.status_code == 401

    def test_wrong_key_returns_401(self, client):
        r = client.get("/api/admin/stats", headers={"X-Admin-Key": "wrong"})
        assert r.status_code == 401

    def test_correct_key_succeeds(self, client):
        r = client.get("/api/admin/stats", headers=_h())
        assert r.status_code == 200


class TestAdminStats:
    def test_stats_shape(self, client):
        r = client.get("/api/admin/stats", headers=_h())
        assert r.status_code == 200
        body = r.json()
        for field in (
            "place_count",
            "area_count",
            "edge_count",
            "media_count",
            "report_count",
            "reports_new",
            "reports_in_progress",
            "reports_resolved",
        ):
            assert field in body
            assert isinstance(body[field], int)


class TestAdminPlaces:
    def test_update_place_description(self, client):
        place = client.get("/api/places?limit=1").json()[0]
        r = client.patch(
            f"/api/admin/places/{place['id']}",
            json={"description": "Edited by admin test"},
            headers=_h(),
        )
        assert r.status_code == 200
        assert r.json()["description"] == "Edited by admin test"

    def test_update_nonexistent_returns_404(self, client):
        r = client.patch(
            "/api/admin/places/99999999",
            json={"description": "x"},
            headers=_h(),
        )
        assert r.status_code == 404


class TestAdminReports:
    def test_list_reports(self, client):
        r = client.get("/api/admin/reports", headers=_h())
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_filter_by_status(self, client):
        r = client.get(
            "/api/admin/reports?status=new", headers=_h()
        )
        assert r.status_code == 200
        for report in r.json():
            assert report["status"] == "new"


class TestAdminMapHealth:
    def test_returns_checks(self, client):
        r = client.get("/api/admin/map-health", headers=_h())
        assert r.status_code == 200
        body = r.json()
        assert "total_issues" in body
        assert "checks" in body
        assert len(body["checks"]) == 5


class TestAdminReimport:
    def test_diff_returns_counts(self, client):
        r = client.get("/api/admin/reimport/diff", headers=_h())
        assert r.status_code == 200
        body = r.json()
        assert "places_added" in body
        assert "places_updated" in body
        # The diff should have identical counts (no map change since ingest).
        # We don't assert exact values because test ordering can vary.