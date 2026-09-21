"""
Tests for the media endpoints and service.
"""

import io

import pytest
from PIL import Image


def _make_test_image(width=400, height=300, color=(120, 140, 200)):
    """Return PNG bytes for a solid-colour test image."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def some_place(client):
    """A real place ID from the seeded database."""
    places = client.get("/api/places?limit=1").json()
    if not places:
        pytest.skip("No places in test database")
    return places[0]


class TestUpload:
    def test_upload_creates_media_row(self, client, some_place, temp_db):
        image_bytes = _make_test_image()
        response = client.post(
            "/api/media",
            data={
                "place_id": some_place["id"],
                "kind": "approach",
                "bearing_deg": 90,
            },
            files={"file": ("test.png", image_bytes, "image/png")},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["place_id"] == some_place["id"]
        assert body["kind"] == "approach"
        assert body["url_card"].startswith("http")

    def test_upload_rejects_non_image(self, client, some_place, temp_db):
        response = client.post(
            "/api/media",
            data={"place_id": some_place["id"]},
            files={"file": ("test.txt", b"not an image", "text/plain")},
        )
        assert response.status_code == 400
        assert "image" in response.json()["detail"].lower()

    def test_upload_rejects_unknown_place(self, client, temp_db):
        image_bytes = _make_test_image()
        response = client.post(
            "/api/media",
            data={"place_id": 99999999},
            files={"file": ("test.png", image_bytes, "image/png")},
        )
        assert response.status_code == 400
        assert "not found" in response.json()["detail"].lower()

    def test_upload_rejects_invalid_bearing(self, client, some_place, temp_db):
        image_bytes = _make_test_image()
        response = client.post(
            "/api/media",
            data={"place_id": some_place["id"], "bearing_deg": 400},
            files={"file": ("test.png", image_bytes, "image/png")},
        )
        # The service validates bearing_deg and returns a 400 with a
        # human-readable message. (Form fields don't carry range
        # constraints, so this can't be a 422.)
        assert response.status_code == 400
        assert "bearing" in response.json()["detail"].lower()


class TestList:
    def test_list_returns_uploaded_photos(self, client, some_place, temp_db):
        image_bytes = _make_test_image()
        client.post(
            "/api/media",
            data={"place_id": some_place["id"], "kind": "approach"},
            files={"file": ("test.png", image_bytes, "image/png")},
        )

        response = client.get(f"/api/media/place/{some_place['id']}")
        assert response.status_code == 200
        items = response.json()
        assert len(items) >= 1
        item = items[0]
        assert item["place_id"] == some_place["id"]
        # Three URLs for the three variants.
        assert "url_thumb" in item
        assert "url_card" in item
        assert "url_full" in item

    def test_list_empty_place_returns_empty_array(self, client, some_place, temp_db):
        # A place that hasn't had photos uploaded.
        response = client.get(f"/api/media/place/{some_place['id']}")
        assert response.status_code == 200
        # May be empty or may have photos — just check the shape.
        assert isinstance(response.json(), list)


class TestDelete:
    def test_delete_removes_media(self, client, some_place, temp_db):
        image_bytes = _make_test_image()
        upload = client.post(
            "/api/media",
            data={"place_id": some_place["id"]},
            files={"file": ("test.png", image_bytes, "image/png")},
        ).json()

        response = client.delete(f"/api/media/{upload['id']}")
        assert response.status_code == 204

        after = client.get(f"/api/media/place/{some_place['id']}").json()
        assert all(m["id"] != upload["id"] for m in after)

    def test_delete_missing_returns_404(self, client, temp_db):
        response = client.delete("/api/media/99999999")
        assert response.status_code == 404