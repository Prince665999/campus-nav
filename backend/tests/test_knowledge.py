"""
Tests for the knowledge base.

These tests use a small text file rather than a PDF, because a PDF
would need to be committed to the repository. The text path exercises
the same chunking and storage code that the PDF path does, minus the
table extraction.
"""

import io


def _make_text_file(content):
    """Return the bytes of a simple text file."""
    return content.encode("utf-8")


class TestUpload:
    def test_upload_text_file(self, client, temp_db):
        """
        Upload a small text file. It should extract, chunk, embed, and
        return ready with a non-zero chunk count.
        """
        content = (
            "The library is open from 8 AM to 10 PM Monday to Friday.\n\n"
            "It closes at 6 PM on Saturdays and is closed on Sundays.\n\n"
            "Late fees are 500 shillings per day."
        )

        r = client.post(
            "/api/admin/knowledge/upload",
            files={"file": ("library.txt", _make_text_file(content), "text/plain")},
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "ready"
        assert body["chunk_count"] > 0
        assert body["filename"] == "library.txt"

    def test_upload_rejects_unsupported_type(self, client, temp_db):
        r = client.post(
            "/api/admin/knowledge/upload",
            files={"file": ("image.png", b"\x89PNG", "image/png")},
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 400

    def test_upload_requires_admin(self, client, temp_db):
        r = client.post(
            "/api/admin/knowledge/upload",
            files={"file": ("x.txt", b"hello", "text/plain")},
        )
        assert r.status_code == 401


class TestList:
    def test_list_documents(self, client, temp_db):
        client.post(
            "/api/admin/knowledge/upload",
            files={"file": ("a.txt", b"Some content here.", "text/plain")},
            headers={"X-Admin-Key": "test-admin-key"},
        )
        r = client.get(
            "/api/admin/knowledge",
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) >= 1
        assert docs[0]["filename"] == "a.txt"


class TestSearch:
    def test_search_finds_relevant_chunk(self, client, temp_db):
        content = (
            "The library closes at 6 PM on Saturdays.\n\n"
            "The cafeteria serves lunch from noon to 2 PM."
        )
        client.post(
            "/api/admin/knowledge/upload",
            files={"file": ("facts.txt", _make_text_file(content), "text/plain")},
            headers={"X-Admin-Key": "test-admin-key"},
        )

        r = client.get(
            "/api/admin/knowledge/search?q=library+saturday+hours",
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 200
        results = r.json()
        assert len(results) > 0
        # The top result should mention the library.
        assert "librar" in results[0]["text"].lower()


class TestDelete:
    def test_delete_document(self, client, temp_db):
        upload = client.post(
            "/api/admin/knowledge/upload",
            files={"file": ("del.txt", b"Temporary content.", "text/plain")},
            headers={"X-Admin-Key": "test-admin-key"},
        ).json()

        r = client.delete(
            f"/api/admin/knowledge/{upload['id']}",
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 204

        docs = client.get(
            "/api/admin/knowledge",
            headers={"X-Admin-Key": "test-admin-key"},
        ).json()
        assert all(d["id"] != upload["id"] for d in docs)

    def test_delete_missing_returns_404(self, client, temp_db):
        r = client.delete(
            "/api/admin/knowledge/99999999",
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 404