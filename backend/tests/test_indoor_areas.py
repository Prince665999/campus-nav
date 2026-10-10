"""
Tests for the indoor-areas endpoint.

GET /api/indoor/areas?building_name=X&level=Y

Returns every room and corridor polygon on one floor of one
building, plus the list of levels the building has.

The tests depend on the ingested campus data. If the building
"Library" isn't in the DB (e.g. the ingest hasn't been run, or the
tag isn't applied yet), the tests skip rather than fail.
"""

import pytest


def _library_has_polygons(client):
    """Check whether the Library has any polygons at all."""
    r = client.get(
        "/api/indoor/areas?building_name=Library&level=0"
    )
    if r.status_code != 200:
        return False
    body = r.json()
    return len(body.get("areas", [])) > 0


class TestIndoorAreasEndpoint:
    def test_returns_200(self, client):
        r = client.get(
            "/api/indoor/areas?building_name=Library&level=0"
        )
        assert r.status_code == 200

    def test_response_shape(self, client):
        r = client.get(
            "/api/indoor/areas?building_name=Library&level=0"
        )
        body = r.json()
        assert "building_name" in body
        assert "level" in body
        assert "areas" in body
        assert "levels" in body
        assert isinstance(body["areas"], list)
        assert isinstance(body["levels"], list)

    def test_unknown_building_returns_empty_areas(self, client):
        r = client.get(
            "/api/indoor/areas?building_name=NotARealBuilding&level=0"
        )
        assert r.status_code == 200
        body = r.json()
        assert body["areas"] == []
        # No levels either, since no rows match the building.
        assert body["levels"] == []

    def test_requires_building_name(self, client):
        r = client.get("/api/indoor/areas?level=0")
        assert r.status_code == 422

    def test_requires_level(self, client):
        r = client.get("/api/indoor/areas?building_name=Library")
        assert r.status_code == 422


class TestIndoorAreasContent:
    def test_library_has_ground_floor_rooms(self, client):
        if not _library_has_polygons(client):
            pytest.skip("Library has no polygons in the test DB")
        r = client.get(
            "/api/indoor/areas?building_name=Library&level=0"
        )
        body = r.json()
        assert len(body["areas"]) > 0

        # Every area should have these fields.
        for area in body["areas"]:
            assert "id" in area
            assert "osm_id" in area
            assert "type" in area
            assert area["type"] in ("room", "corridor")
            assert "level" in area
            assert area["level"] == "0"
            assert "boundary" in area
            assert isinstance(area["boundary"], list)
            assert "centroid" in area

    def test_boundary_points_are_valid_latlon(self, client):
        if not _library_has_polygons(client):
            pytest.skip("Library has no polygons in the test DB")
        r = client.get(
            "/api/indoor/areas?building_name=Library&level=0"
        )
        body = r.json()
        for area in body["areas"][:5]:
            for point in area["boundary"]:
                assert -90 <= point["lat"] <= 90
                assert -180 <= point["lon"] <= 180

    def test_levels_array_is_sorted(self, client):
        if not _library_has_polygons(client):
            pytest.skip("Library has no polygons in the test DB")
        r = client.get(
            "/api/indoor/areas?building_name=Library&level=0"
        )
        body = r.json()
        levels = body["levels"]
        # Sort key: numeric levels first, non-numeric last.
        # For our data, levels are "-1", "0", "1". Sorted ascending
        # means "-1" < "0" < "1".
        numeric = [int(l) for l in levels if l.lstrip("-").isdigit()]
        assert numeric == sorted(numeric)


class TestCaseInsensitivity:
    def test_building_name_is_case_insensitive(self, client):
        if not _library_has_polygons(client):
            pytest.skip("Library has no polygons in the test DB")
        r1 = client.get(
            "/api/indoor/areas?building_name=Library&level=0"
        )
        r2 = client.get(
            "/api/indoor/areas?building_name=library&level=0"
        )
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert len(r1.json()["areas"]) == len(r2.json()["areas"])

    def test_whitespace_is_trimmed(self, client):
        if not _library_has_polygons(client):
            pytest.skip("Library has no polygons in the test DB")
        r = client.get(
            "/api/indoor/areas?building_name=%20Library%20&level=0"
        )
        assert r.status_code == 200
        assert len(r.json()["areas"]) > 0