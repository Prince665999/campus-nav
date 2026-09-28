"""
Tests for the timetable API endpoints (public and admin).
"""

from backend.tests.fixtures.timetable_samples import SIMPLE_WEEK, write_csv


def _seed_timetable(tmp_path):
    """Load the simple week into the (already-created) test DB."""
    from admin.scripts.import_timetable import _import, _load_and_validate

    path = write_csv(SIMPLE_WEEK, tmp_path)
    rows = _load_and_validate(path)
    return _import(rows, replace=False, dry_run=False)


class TestPublicPrograms:
    def test_empty_programs_list(self, client, temp_db):
        r = client.get("/api/timetable/programs")
        assert r.status_code == 200
        assert r.json() == []

    def test_programs_after_import(self, client, temp_db, tmp_path):
        _seed_timetable(tmp_path)

        r = client.get("/api/timetable/programs")
        assert r.status_code == 200
        programs = r.json()
        assert len(programs) == 1
        assert programs[0]["name"] == (
            "Diploma in Electrical and Electronic Engineering"
        )


class TestPublicYears:
    def test_years_for_imported_program(self, client, temp_db, tmp_path):
        _seed_timetable(tmp_path)
        program_id = client.get("/api/timetable/programs").json()[0]["id"]

        r = client.get(f"/api/timetable/programs/{program_id}/years")
        assert r.status_code == 200
        years = r.json()
        assert len(years) == 1
        assert years[0]["year_number"] == 1

    def test_years_for_missing_program_returns_404(self, client, temp_db):
        r = client.get("/api/timetable/programs/99999999/years")
        assert r.status_code == 404


class TestPublicSchedule:
    def test_empty_schedule(self, client, temp_db):
        r = client.get("/api/timetable/schedule?program_year_id=99999999")
        assert r.status_code == 200
        body = r.json()
        assert body["entries"] == []

    def test_schedule_after_import(self, client, temp_db, tmp_path):
        _seed_timetable(tmp_path)

        program_id = client.get("/api/timetable/programs").json()[0]["id"]
        py_id = client.get(
            f"/api/timetable/programs/{program_id}/years"
        ).json()[0]["id"]

        r = client.get(f"/api/timetable/schedule?program_year_id={py_id}")
        assert r.status_code == 200
        body = r.json()
        assert body["program_year_id"] == py_id
        assert len(body["entries"]) == 2
        # Entries come back in day/time order.
        assert body["entries"][0]["start_time"] == "07:30"
        assert body["entries"][1]["start_time"] == "09:55"


class TestPublicNext:
    def test_no_class_when_empty(self, client, temp_db):
        r = client.get("/api/timetable/next?program_year_id=99999999")
        assert r.status_code == 200
        body = r.json()
        assert body["has_class"] is False


class TestAdminTimetable:
    def test_admin_can_list_programs(self, client, temp_db, tmp_path):
        _seed_timetable(tmp_path)
        r = client.get(
            "/api/admin/timetable/programs",
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_admin_guard_applies(self, client, temp_db):
        r = client.get("/api/admin/timetable/programs")
        assert r.status_code == 401

    def test_admin_can_delete_program(self, client, temp_db, tmp_path):
        _seed_timetable(tmp_path)
        program_id = client.get(
            "/api/admin/timetable/programs",
            headers={"X-Admin-Key": "test-admin-key"},
        ).json()[0]["id"]

        r = client.delete(
            f"/api/admin/timetable/programs/{program_id}",
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 204

        # Program is gone, and the public endpoint reflects that.
        r = client.get("/api/timetable/programs")
        assert r.json() == []


class TestIntentFilter:
    def test_intent_filter_matches(self, client, temp_db, tmp_path):
        """
        Setting intents on a place and filtering by one of them
        returns the place. Uses the admin place update endpoint to
        set intents first.
        """
        # Grab any place.
        places = client.get("/api/places?limit=1").json()
        if not places:
            return
        place_id = places[0]["id"]

        # Set intents on it.
        r = client.patch(
            f"/api/admin/places/{place_id}",
            json={"intents": "eat; study"},
            headers={"X-Admin-Key": "test-admin-key"},
        )
        assert r.status_code == 200
        assert r.json()["intents"] == "eat; study"

        # Filter by intent.
        r = client.get("/api/places?intent=eat")
        assert r.status_code == 200
        results = r.json()
        assert any(p["id"] == place_id for p in results)

        # Filter by a different intent that shouldn't match.
        r = client.get("/api/places?intent=printing")
        assert r.status_code == 200
        assert all(p["id"] != place_id for p in r.json())