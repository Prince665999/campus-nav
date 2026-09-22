"""
Tests for map_health_service.

Every check is informational — no check raises for a data issue.
These tests verify that: a map with problems still produces a
report, and the report says what's wrong.
"""


class TestReportShape:
    def test_run_all_checks_returns_a_report(self, client):
        from backend.api.db.session import session_scope
        from backend.api.services.map_health_service import run_all_checks

        with session_scope() as session:
            report = run_all_checks(session)

        # Five checks in the current implementation.
        assert len(report.checks) == 5
        # Every check has a key, a label, and a non-negative count.
        for c in report.checks:
            assert c.key
            assert c.label
            assert c.count >= 0
            assert c.ok is True  # informational only

    def test_report_has_expected_check_keys(self, client):
        from backend.api.db.session import session_scope
        from backend.api.services.map_health_service import run_all_checks

        with session_scope() as session:
            report = run_all_checks(session)

        keys = {c.key for c in report.checks}
        assert "disconnected_places" in keys
        assert "missing_name_sw" in keys
        assert "missing_category" in keys
        assert "missing_surface" in keys
        assert "short_way_polygons" in keys

    def test_summary_lines_are_strings(self, client):
        from backend.api.db.session import session_scope
        from backend.api.services.map_health_service import run_all_checks

        with session_scope() as session:
            report = run_all_checks(session)

        lines = report.summary_lines()
        assert len(lines) == len(report.checks)
        for line in lines:
            assert isinstance(line, str)


class TestChecksNeverRaise:
    def test_checks_run_on_real_map(self, client):
        """
        The real map has places without name_sw and probably some
        disconnected places. Running the checks must not raise.
        """
        from backend.api.db.session import session_scope
        from backend.api.services import map_health_service

        with session_scope() as session:
            # Call each check individually. None should raise.
            map_health_service.check_disconnected_places(session)
            map_health_service.check_missing_swahili_names(session)
            map_health_service.check_missing_category(session)
            map_health_service.check_missing_surface(session)
            map_health_service.check_short_way_polygons(session)

    def test_missing_name_sw_count_matches_data(self, client):
        """
        Cross-check the count against a direct query. This catches a
        check that reports the wrong number.
        """
        from sqlalchemy import func

        from backend.api.db.session import session_scope
        from backend.api.models.place import Place
        from backend.api.services import map_health_service

        with session_scope() as session:
            direct_count = (
                session.query(func.count(Place.id))
                .filter((Place.name_sw.is_(None)) | (Place.name_sw == ""))
                .scalar()
            )
            check = map_health_service.check_missing_swahili_names(session)

        assert check.count == direct_count