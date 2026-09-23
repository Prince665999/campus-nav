"""
Tests for admin authentication.
"""

import importlib
import os

import pytest


ADMIN_KEY = "test-admin-key"


@pytest.fixture(autouse=True)
def set_auth_env(monkeypatch):
    """Set up a known admin key and JWT secret for these tests."""
    monkeypatch.setenv("ADMIN_API_KEY", ADMIN_KEY)
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret")

    import backend.api.settings as settings_module
    import backend.api.dependencies as deps_module

    importlib.reload(settings_module)
    importlib.reload(deps_module)
    yield


def _create_user(client, email, password, role="owner"):
    """Create an admin user via the admin endpoint. Requires the
    fallback admin key, which is set by the fixture."""
    return client.post(
        "/api/admin/users",
        json={"email": email, "password": password, "role": role},
        headers={"X-Admin-Key": ADMIN_KEY},
    )


class TestPasswordHashing:
    def test_hash_is_not_the_password(self):
        from backend.api.services import auth_service

        h = auth_service.hash_password("hunter2")
        assert h != "hunter2"
        assert len(h) > 20

    def test_verify_correct_password(self):
        from backend.api.services import auth_service

        h = auth_service.hash_password("hunter2")
        assert auth_service.verify_password("hunter2", h) is True

    def test_verify_wrong_password(self):
        from backend.api.services import auth_service

        h = auth_service.hash_password("hunter2")
        assert auth_service.verify_password("hunter3", h) is False

    def test_hash_is_different_each_time(self):
        """bcrypt salts automatically, so the same password hashes
        differently on each call."""
        from backend.api.services import auth_service

        h1 = auth_service.hash_password("hunter2")
        h2 = auth_service.hash_password("hunter2")
        assert h1 != h2
        # But both verify.
        assert auth_service.verify_password("hunter2", h1)
        assert auth_service.verify_password("hunter2", h2)


class TestLogin:
    def test_login_with_correct_credentials(self, client, temp_db):
        r = _create_user(client, "admin@test.com", "password123")
        assert r.status_code == 201

        r = client.post(
            "/api/admin/auth/login",
            json={"email": "admin@test.com", "password": "password123"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "token" in body
        assert body["role"] == "owner"
        assert body["expires_in_s"] > 0

    def test_login_with_wrong_password(self, client, temp_db):
        _create_user(client, "admin2@test.com", "password123")
        r = client.post(
            "/api/admin/auth/login",
            json={"email": "admin2@test.com", "password": "wrongpassword"},
        )
        assert r.status_code == 400

    def test_login_with_unknown_email(self, client, temp_db):
        r = client.post(
            "/api/admin/auth/login",
            json={"email": "nobody@test.com", "password": "password123"},
        )
        assert r.status_code == 400
        # Same message as wrong password — no account enumeration.
        assert "invalid" in r.json()["detail"].lower()

    def test_wrong_password_and_unknown_email_same_message(self, client, temp_db):
        _create_user(client, "admin3@test.com", "password123")

        r1 = client.post(
            "/api/admin/auth/login",
            json={"email": "admin3@test.com", "password": "wrong"},
        )
        r2 = client.post(
            "/api/admin/auth/login",
            json={"email": "unknown@test.com", "password": "password123"},
        )
        assert r1.json()["detail"] == r2.json()["detail"]


class TestTokenUse:
    def test_token_grants_access_to_admin_endpoints(self, client, temp_db):
        _create_user(client, "admin4@test.com", "password123")
        login = client.post(
            "/api/admin/auth/login",
            json={"email": "admin4@test.com", "password": "password123"},
        ).json()

        r = client.get(
            "/api/admin/stats",
            headers={"Authorization": f"Bearer {login['token']}"},
        )
        assert r.status_code == 200

    def test_bad_token_is_rejected(self, client, temp_db):
        r = client.get(
            "/api/admin/stats",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert r.status_code == 401

    def test_no_auth_is_rejected(self, client, temp_db):
        r = client.get("/api/admin/stats")
        assert r.status_code == 401

    def test_admin_key_still_works_as_fallback(self, client, temp_db):
        """The Phase 14 shared key still grants access, so the CLI
        scripts and pre-login tooling keep working."""
        r = client.get(
            "/api/admin/stats",
            headers={"X-Admin-Key": ADMIN_KEY},
        )
        assert r.status_code == 200


class TestWhoAmI:
    def test_whoami_with_valid_token(self, client, temp_db):
        _create_user(client, "admin5@test.com", "password123")
        login = client.post(
            "/api/admin/auth/login",
            json={"email": "admin5@test.com", "password": "password123"},
        ).json()

        r = client.get(
            "/api/admin/auth/me",
            headers={"Authorization": f"Bearer {login['token']}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "owner"

    def test_whoami_without_token(self, client, temp_db):
        r = client.get("/api/admin/auth/me")
        assert r.status_code == 400