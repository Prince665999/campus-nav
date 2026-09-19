"""
Tests for /api/areas and /api/areas/{id}.

Uses the real campus map via the seeded_db fixture, so areas reflect
what the mobile map will actually render.
"""


class TestListAreas:
    def test_returns_200(self, client):
        r = client.get("/api/areas")
        assert r.status_code == 200

    def test_returns_a_list(self, client):
        data = client.get("/api/areas").json()
        assert isinstance(data, list)
        # The real map has 45 named areas.
        assert len(data) > 0

    def test_limit_is_respected(self, client):
        data = client.get("/api/areas?limit=5").json()
        assert len(data) <= 5

    def test_area_shape(self, client):
        area = client.get("/api/areas?limit=1").json()[0]
        # Every field the mobile map needs to draw a polygon.
        assert "id" in area
        assert "name" in area
        assert "boundary" in area
        assert "centroid" in area
        assert isinstance(area["boundary"], list)
        assert len(area["boundary"]) >= 3


class TestAreaBoundary:
    def test_boundary_points_are_latlon(self, client):
        area = client.get("/api/areas?limit=1").json()[0]
        for point in area["boundary"]:
            assert "lat" in point and "lon" in point
            assert -90 <= point["lat"] <= 90
            assert -180 <= point["lon"] <= 180

    def test_centroid_inside_boundary_bbox(self, client):
        """The centroid should sit inside the bounding box of the
        boundary points — sanity check on the WKT parsing."""
        areas = client.get("/api/areas?limit=20").json()
        for area in areas:
            lats = [p["lat"] for p in area["boundary"]]
            lons = [p["lon"] for p in area["boundary"]]
            assert min(lats) <= area["centroid"]["lat"] <= max(lats)
            assert min(lons) <= area["centroid"]["lon"] <= max(lons)

    def test_boundary_does_not_repeat_closing_point(self, client):
        """The first and last boundary points should not be identical
        — the parser strips the closing point."""
        area = client.get("/api/areas?limit=1").json()[0]
        first = area["boundary"][0]
        last = area["boundary"][-1]
        assert first != last


class TestGetArea:
    def test_get_by_id(self, client):
        listing = client.get("/api/areas?limit=1").json()
        area_id = listing[0]["id"]

        r = client.get(f"/api/areas/{area_id}")
        assert r.status_code == 200
        detail = r.json()
        assert detail["id"] == area_id
        assert detail["name"] == listing[0]["name"]

    def test_detail_has_more_fields_than_summary(self, client):
        listing = client.get("/api/areas?limit=1").json()
        area_id = listing[0]["id"]
        detail = client.get(f"/api/areas/{area_id}").json()
        # Detail includes fields the summary omits.
        assert "description" in detail
        assert "alt_names" in detail

    def test_missing_area_returns_404(self, client):
        r = client.get("/api/areas/99999999")
        assert r.status_code == 404
        body = r.json()
        assert "detail" in body
        assert "not found" in body["detail"].lower()


class TestLandmarkFilter:
    def test_landmark_only_filter(self, client):
        """landmark_only=true should return a subset (or all) of the
        unfiltered list, and every returned area should be a landmark."""
        all_areas = client.get("/api/areas").json()
        landmark_areas = client.get("/api/areas?landmark_only=true").json()

        assert len(landmark_areas) <= len(all_areas)
        for area in landmark_areas:
            assert area["is_landmark"] is True