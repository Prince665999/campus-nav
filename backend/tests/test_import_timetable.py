"""
Tests for the timetable CSV import.

Two halves:
  - validation: bad CSVs are caught before anything is written
  - import: good CSVs create programs / years / entries, and
    re-imports update rather than duplicate
"""

import pytest

from backend.tests.fixtures.timetable_samples import (
    BAD_DAY,
    BAD_TIME,
    BAD_YEAR,
    BLANK_PROGRAM,
    MISSING_COLUMN,
    SIMPLE_WEEK,
    TWO_PROGRAMS,
    TWO_YEARS,
    write_csv,
)


# ---------------------------------------------------------------------------
# Validation — the parser itself
# ---------------------------------------------------------------------------

class TestValidation:
    def test_simple_week_parses(self, tmp_path):
        from admin.scripts.import_timetable import _load_and_validate

        path = write_csv(SIMPLE_WEEK, tmp_path)
        rows = _load_and_validate(path)
        assert len(rows) == 2
        assert rows[0]["day_of_week"] == 0            # Monday
        assert rows[0]["start_time"] == "07:30"
        assert rows[0]["module_code"] == "EP 6111"

    def test_bad_time_rejected(self, tmp_path):
        from admin.scripts.import_timetable import _load_and_validate

        path = write_csv(BAD_TIME, tmp_path)
        with pytest.raises(ValueError) as exc:
            _load_and_validate(path)
        assert "start_time" in str(exc.value) or "end_time" in str(exc.value)

    def test_bad_day_rejected(self, tmp_path):
        from admin.scripts.import_timetable import _load_and_validate

        path = write_csv(BAD_DAY, tmp_path)
        with pytest.raises(ValueError) as exc:
            _load_and_validate(path)
        assert "Blursday" in str(exc.value)

    def test_bad_year_rejected(self, tmp_path):
        from admin.scripts.import_timetable import _load_and_validate

        path = write_csv(BAD_YEAR, tmp_path)
        with pytest.raises(ValueError) as exc:
            _load_and_validate(path)
        assert "integer" in str(exc.value).lower()

    def test_blank_program_rejected(self, tmp_path):
        from admin.scripts.import_timetable import _load_and_validate

        path = write_csv(BLANK_PROGRAM, tmp_path)
        with pytest.raises(ValueError) as exc:
            _load_and_validate(path)
        assert "program" in str(exc.value).lower()

    def test_missing_column_rejected(self, tmp_path):
        from admin.scripts.import_timetable import _load_and_validate

        path = write_csv(MISSING_COLUMN, tmp_path)
        with pytest.raises(ValueError) as exc:
            _load_and_validate(path)
        assert "end_time" in str(exc.value)


# ---------------------------------------------------------------------------
# Import — writing to the database
# ---------------------------------------------------------------------------

class TestImport:
    def test_creates_program_year_and_entries(self, temp_db, tmp_path):
        from admin.scripts.import_timetable import _import, _load_and_validate
        from backend.api.db.session import session_scope
        from backend.api.models.program import Program
        from backend.api.models.program_year import ProgramYear
        from backend.api.models.timetable_entry import TimetableEntry

        path = write_csv(SIMPLE_WEEK, tmp_path)
        rows = _load_and_validate(path)
        report = _import(rows, replace=False, dry_run=False)

        assert report["programs_created"] == 1
        assert report["program_years_created"] == 1
        assert report["entries_created"] == 2

        with session_scope() as session:
            assert session.query(Program).count() == 1
            assert session.query(ProgramYear).count() == 1
            assert session.query(TimetableEntry).count() == 2

    def test_two_years_creates_two_program_years(self, temp_db, tmp_path):
        from admin.scripts.import_timetable import _import, _load_and_validate
        from backend.api.db.session import session_scope
        from backend.api.models.program_year import ProgramYear

        path = write_csv(TWO_YEARS, tmp_path)
        rows = _load_and_validate(path)
        report = _import(rows, replace=False, dry_run=False)

        assert report["programs_created"] == 1
        assert report["program_years_created"] == 2

        with session_scope() as session:
            assert session.query(ProgramYear).count() == 2

    def test_two_programs_creates_two_programs(self, temp_db, tmp_path):
        from admin.scripts.import_timetable import _import, _load_and_validate
        from backend.api.db.session import session_scope
        from backend.api.models.program import Program

        path = write_csv(TWO_PROGRAMS, tmp_path)
        rows = _load_and_validate(path)
        report = _import(rows, replace=False, dry_run=False)

        assert report["programs_created"] == 2

        with session_scope() as session:
            assert session.query(Program).count() == 2

    def test_dry_run_writes_nothing(self, temp_db, tmp_path):
        from admin.scripts.import_timetable import _import, _load_and_validate
        from backend.api.db.session import session_scope
        from backend.api.models.program import Program
        from backend.api.models.timetable_entry import TimetableEntry

        path = write_csv(SIMPLE_WEEK, tmp_path)
        rows = _load_and_validate(path)
        report = _import(rows, replace=False, dry_run=True)

        # The report still says what *would* have happened.
        assert report["programs_created"] == 1
        assert report["entries_created"] == 2

        # But nothing is in the DB.
        with session_scope() as session:
            assert session.query(Program).count() == 0
            assert session.query(TimetableEntry).count() == 0

    def test_reimport_updates_not_duplicates(self, temp_db, tmp_path):
        """Re-importing the same CSV should leave the counts unchanged."""
        from admin.scripts.import_timetable import _import, _load_and_validate
        from backend.api.db.session import session_scope
        from backend.api.models.program import Program
        from backend.api.models.program_year import ProgramYear
        from backend.api.models.timetable_entry import TimetableEntry

        path = write_csv(SIMPLE_WEEK, tmp_path)
        rows = _load_and_validate(path)
        _import(rows, replace=False, dry_run=False)

        # Second run.
        rows = _load_and_validate(path)
        report = _import(rows, replace=False, dry_run=False)

        assert report["programs_created"] == 0
        assert report["program_years_created"] == 0
        assert report["entries_created"] == 0
        assert report["entries_unchanged"] == 2

        with session_scope() as session:
            assert session.query(Program).count() == 1
            assert session.query(ProgramYear).count() == 1
            assert session.query(TimetableEntry).count() == 2

    def test_replace_mode_wipes_and_reinserts(self, temp_db, tmp_path):
        from admin.scripts.import_timetable import _import, _load_and_validate
        from backend.api.db.session import session_scope
        from backend.api.models.timetable_entry import TimetableEntry

        path = write_csv(SIMPLE_WEEK, tmp_path)
        rows = _load_and_validate(path)
        _import(rows, replace=False, dry_run=False)

        # Second import with --replace.
        rows = _load_and_validate(path)
        report = _import(rows, replace=True, dry_run=False)

        assert report["program_years_wiped"] == 1
        assert report["entries_created"] == 2

        with session_scope() as session:
            assert session.query(TimetableEntry).count() == 2