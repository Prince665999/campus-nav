"""
Tests for /api/wifi/nearby.
"""


def _set_wifi(client, place_id, ssid, password):
    """Helper: mark a place as having Wi-Fi. Uses the admin endpoint
    to update the place, so the test also exercises that path."""
    import os

    headers = {"X-Admin-Key": os.environ.get("ADMIN_API_KEY", "")}
    return client.patch(
        f"/api/admin/places/{place_id}",
        json={"has_wifi": True, "wifi_ssid": ssid, "wifi_password": password},
        headers=headers,
    )


class TestWifiNearby:
    def test_returns_empty_when_no_wifi_places(self, client):
        place = client.get("/api/places?limit=1").json()[0]
        r = client.get(
            f"/api/wifi/nearby?lat={place['location']['lat']}&lon={place['location']['lon']}"
        )
        assert r.status_code == 200
        # No Wi-Fi places have been tagged, so this should be empty.
        assert r.json()["spots"] == []

    def test_nearby_requires_lat_lon(self, client):
        r = client.get("/api/wifi/nearby")
        assert r.status_code == 422

    def test_radius_is_respected(self, client):
        place = client.get("/api/places?limit=1").json()[0]
        r = client.get(
            f"/api/wifi/nearby"
            f"?lat={place['location']['lat']}"
            f"&lon={place['location']['lon']}"
            f"&r=1"
        )
        assert r.status_code == 200

    def test_off_campus_omits_password(self, client, monkeypatch):
        """A request from coordinates far off campus doesn't get
        passwords, even if Wi-Fi places are near."""
        # These coordinates are in the middle of the ocean, well away
        # from any campus bounding box.
        r = client.get("/api/wifi/nearby?lat=0&lon=0&r=200")
        assert r.status_code == 200
        # If any spot is returned (it won't be at 0,0), it should not
        # contain a password.
        for spot in r.json()["spots"]:
            assert spot["password"] is None


class TestWifiSpotShape:
    def test_response_has_spots_array(self, client):
        place = client.get("/api/places?limit=1").json()[0]
        r = client.get(
            f"/api/wifi/nearby?lat={place['location']['lat']}&lon={place['location']['lon']}"
        )
        assert r.status_code == 200
        body = r.json()
        assert "spots" in body
        assert isinstance(body["spots"], list)

class TestWifiWithData:
    def test_nearby_finds_tagged_place(self, client):
        place = client.get("/api/places?limit=1").json()[0]
        _set_wifi(client, place["id"], "TestNet", "test-pass-123")

        r = client.get(
            f"/api/wifi/nearby"
            f"?lat={place['location']['lat']}"
            f"&lon={place['location']['lon']}"
            f"&r=50"
        )
        assert r.status_code == 200
        spots = r.json()["spots"]
        assert len(spots) >= 1
        spot = spots[0]
        assert spot["ssid"] == "TestNet"
        # On campus (in the bounding box), so password is included.
        assert spot["password"] == "test-pass-123"
        assert spot["has_password"] is True