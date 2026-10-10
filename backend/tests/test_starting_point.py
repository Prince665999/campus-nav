"""
Tests for the 5F-1 endpoints: entrances and building-filtered places.

These tests use the real campus data. They skip if the relevant
data isn't present (e.g. no entrances tagged yet).
"""

import pytest


class TestEntrancesEndpoint:
    def test_entrances_list_returns_200(self, client):
        r = client.get("/api/places?kind=entrance")
        assert r.status_code == 200

    def test_entrances_have_correct_kind(self, client):
        r = client.get("/api/places?kind=entrance&limit=50")
        items = r.json()
        if not items:
            pytest.skip("No entrance places in the test DB")
        for place in items:
            assert place["kind"] == "entrance"

    def test_entrances_have_lat_lon(self, client):
        r = client.get("/api/places?kind=entrance&limit=5")
        items = r.json()
        if not items:
            pytest.skip("No entrance places in the test DB")
        for place in items:
            assert "location" in place
            assert "lat" in place["location"]
            assert "lon" in place["location"]


class TestIndoorPlacesByBuilding:
    def test_filter_by_building_name(self, client):
        r = client.get(
            "/api/places?kind=indoor&building_name=Library&limit=50"
        )
        assert r.status_code == 200
        items = r.json()
        # If there are items, they must all belong to Library.
        for place in items:
            assert place["kind"] == "indoor"
            assert place["building_name"] == "Library"

    def test_filter_by_building_and_level(self, client):
        r = client.get(
            "/api/places?kind=indoor"
            "&building_name=Library&level=0&limit=50"
        )
        assert r.status_code == 200
        items = r.json()
        for place in items:
            assert place["kind"] == "indoor"
            assert place["building_name"] == "Library"
            assert place["level"] == "0"

    def test_unknown_building_returns_empty(self, client):
        r = client.get(
            "/api/places?kind=indoor&building_name=NotARealBuilding"
        )
        assert r.status_code == 200
        assert r.json() == []


class TestBuildingNameIsNullable:
    def test_outdoor_places_have_null_building_name(self, client):
        r = client.get("/api/places?kind=outdoor&limit=10")
        items = r.json()
        for place in items:
            # Outdoor places should never have a building_name.
            assert place.get("building_name") is None

    def test_outdoor_response_shape_includes_building_name_field(self, client):
        r = client.get("/api/places?kind=outdoor&limit=1")
        items = r.json()
        if not items:
            pytest.skip("No outdoor places")
        assert "building_name" in items[0]


class TestExistingFiltersStillWork:
    def test_kind_outdoor_unchanged(self, client):
        r = client.get("/api/places?kind=outdoor&limit=5")
        assert r.status_code == 200
        for place in r.json():
            assert place["kind"] == "outdoor"

    def test_kind_indoor_unchanged(self, client):
        r = client.get("/api/places?kind=indoor&limit=5")
        assert r.status_code == 200
        for place in r.json():
            assert place["kind"] == "indoor"

    def test_place_detail_has_building_name(self, client):
        r = client.get("/api/places?kind=indoor&limit=1")
        items = r.json()
        if not items:
            pytest.skip("No indoor places")
        detail = client.get(f"/api/places/{items[0]['id']}").json()
        assert "building_name" in detail