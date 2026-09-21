"""
Tests for /api/destinations — recent and favorites.
"""


def _device_headers(device_id="test-device-1"):
    return {"X-Device-Id": device_id}


class TestRecents:
    def test_missing_device_id_returns_400(self, client):
        r = client.get("/api/destinations/recent")
        assert r.status_code == 400
        assert "device" in r.json()["detail"].lower()

    def test_empty_recents_returns_empty_list(self, client):
        r = client.get("/api/destinations/recent", headers=_device_headers())
        assert r.status_code == 200
        assert r.json() == []

    def test_record_recent_then_list(self, client):
        place = client.get("/api/places?limit=1").json()[0]

        r = client.post(
            "/api/destinations/recent",
            json={"place_id": place["id"]},
            headers=_device_headers(),
        )
        assert r.status_code == 204

        listed = client.get(
            "/api/destinations/recent", headers=_device_headers()
        ).json()
        assert len(listed) == 1
        assert listed[0]["place_id"] == place["id"]
        assert listed[0]["name"] == place["name"]

    def test_recording_twice_updates_timestamp_not_duplicates(self, client):
        place = client.get("/api/places?limit=1").json()[0]

        for _ in range(2):
            client.post(
                "/api/destinations/recent",
                json={"place_id": place["id"]},
                headers=_device_headers(),
            )

        listed = client.get(
            "/api/destinations/recent", headers=_device_headers()
        ).json()
        assert len(listed) == 1

    def test_recents_are_per_device(self, client):
        place = client.get("/api/places?limit=1").json()[0]

        client.post(
            "/api/destinations/recent",
            json={"place_id": place["id"]},
            headers=_device_headers("device-a"),
        )

        listed_a = client.get(
            "/api/destinations/recent", headers=_device_headers("device-a")
        ).json()
        listed_b = client.get(
            "/api/destinations/recent", headers=_device_headers("device-b")
        ).json()

        assert len(listed_a) == 1
        assert len(listed_b) == 0

    def test_record_nonexistent_place_returns_404(self, client):
        r = client.post(
            "/api/destinations/recent",
            json={"place_id": 99999999},
            headers=_device_headers(),
        )
        assert r.status_code == 404


class TestFavorites:
    def test_empty_favorites_returns_empty_list(self, client):
        r = client.get("/api/destinations/favorites", headers=_device_headers())
        assert r.status_code == 200
        assert r.json() == []

    def test_add_then_list(self, client):
        place = client.get("/api/places?limit=1").json()[0]

        r = client.post(
            "/api/destinations/favorites",
            json={"place_id": place["id"]},
            headers=_device_headers(),
        )
        assert r.status_code == 204

        listed = client.get(
            "/api/destinations/favorites", headers=_device_headers()
        ).json()
        assert len(listed) == 1
        assert listed[0]["place_id"] == place["id"]

    def test_add_twice_is_idempotent(self, client):
        place = client.get("/api/places?limit=1").json()[0]

        for _ in range(2):
            client.post(
                "/api/destinations/favorites",
                json={"place_id": place["id"]},
                headers=_device_headers(),
            )

        listed = client.get(
            "/api/destinations/favorites", headers=_device_headers()
        ).json()
        assert len(listed) == 1

    def test_remove_favorite(self, client):
        place = client.get("/api/places?limit=1").json()[0]

        client.post(
            "/api/destinations/favorites",
            json={"place_id": place["id"]},
            headers=_device_headers(),
        )
        client.delete(
            f"/api/destinations/favorites/{place['id']}",
            headers=_device_headers(),
        )

        listed = client.get(
            "/api/destinations/favorites", headers=_device_headers()
        ).json()
        assert len(listed) == 0

    def test_exists_endpoint(self, client):
        place = client.get("/api/places?limit=1").json()[0]

        before = client.get(
            f"/api/destinations/favorites/{place['id']}/exists",
            headers=_device_headers(),
        ).json()
        assert before["is_favorite"] is False

        client.post(
            "/api/destinations/favorites",
            json={"place_id": place["id"]},
            headers=_device_headers(),
        )

        after = client.get(
            f"/api/destinations/favorites/{place['id']}/exists",
            headers=_device_headers(),
        ).json()
        assert after["is_favorite"] is True

    def test_favorites_are_per_device(self, client):
        place = client.get("/api/places?limit=1").json()[0]

        client.post(
            "/api/destinations/favorites",
            json={"place_id": place["id"]},
            headers=_device_headers("device-a"),
        )

        listed_b = client.get(
            "/api/destinations/favorites", headers=_device_headers("device-b")
        ).json()
        assert listed_b == []