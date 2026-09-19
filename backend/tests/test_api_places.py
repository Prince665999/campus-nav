"""
Tests for the /api/places endpoints.

Uses the real campus map so search results reflect what students will
actually see.
"""


class TestListPlaces:
    def test_returns_200(self, client):
        r = client.get("/api/places")
        assert r.status_code == 200

    def test_returns_a_list(self, client):
        r = client.get("/api/places")
        data = r.json()
        assert isinstance(data, list)
        # Your map has 31 named places, so 0 would mean ingest failed.
        assert len(data) > 0

    def test_limit_is_respected(self, client):
        r = client.get("/api/places?limit=5")
        data = r.json()
        assert len(data) <= 5

    def test_place_shape(self, client):
        r = client.get("/api/places?limit=1")
        place = r.json()[0]
        # Every field the mobile app's PlaceCard needs.
        assert "id" in place
        assert "name" in place
        assert "location" in place
        assert "lat" in place["location"]
        assert "lon" in place["location"]


class TestSearch:
    def test_search_requires_q(self, client):
        # /search without q should fail validation, not silently
        # return everything.
        r = client.get("/api/places/search")
        assert r.status_code == 422

    def test_search_finds_a_known_place(self, client):
        # First get any place name, then search for it.
        all_places = client.get("/api/places?limit=1").json()
        name = all_places[0]["name"]
        # Use the first four characters so we don't depend on exact
        # spelling at the tail.
        fragment = name[:4]

        r = client.get(f"/api/places/search?q={fragment}")
        assert r.status_code == 200
        results = r.json()
        assert any(name == p["name"] for p in results)

    def test_search_is_case_insensitive(self, client):
        all_places = client.get("/api/places?limit=1").json()
        name = all_places[0]["name"]

        r_lower = client.get(f"/api/places/search?q={name.lower()}")
        r_upper = client.get(f"/api/places/search?q={name.upper()}")
        assert r_lower.status_code == 200
        assert r_upper.status_code == 200
        assert len(r_lower.json()) > 0
        assert len(r_upper.json()) > 0

    def test_search_no_match_returns_empty(self, client):
        r = client.get("/api/places/search?q=zzzznotarealplacezzzz")
        assert r.status_code == 200
        assert r.json() == []


class TestPlaceDetail:
    def test_get_by_id(self, client):
        first = client.get("/api/places?limit=1").json()[0]
        r = client.get(f"/api/places/{first['id']}")
        assert r.status_code == 200
        detail = r.json()
        assert detail["id"] == first["id"]
        assert detail["name"] == first["name"]

    def test_detail_has_more_fields_than_summary(self, client):
        first = client.get("/api/places?limit=1").json()[0]
        detail = client.get(f"/api/places/{first['id']}").json()
        # Detail includes fields the summary omits.
        assert "description" in detail
        assert "opening_hours" in detail
        assert "has_wifi" in detail

    def test_missing_id_returns_404(self, client):
        r = client.get("/api/places/99999999")
        assert r.status_code == 404
        body = r.json()
        assert "detail" in body
        assert "not found" in body["detail"].lower()


class TestCategoryFilter:
    def test_category_filter_returns_only_that_category(self, client):
        # Get the category of the first place that has one.
        all_places = client.get("/api/places").json()
        categories = {p["category"] for p in all_places if p.get("category")}
        if not categories:
            # Skip if no place has a category — nothing to filter on.
            return
        category = next(iter(categories))

        r = client.get(f"/api/places?category={category}")
        assert r.status_code == 200
        for p in r.json():
            assert p["category"] == category