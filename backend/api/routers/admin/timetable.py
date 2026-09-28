"""
timetable.py (admin)

Admin endpoints for managing timetable data. Used by the admin site
(Phase 3) and by tooling. Guarded by the same admin dependency as
every other admin route.

The CSV import endpoint lives here too, but its parsing logic is
shared with the CLI script — the admin endpoint just accepts a file
upload and calls the same `_load_and_validate` function.
"""

import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...errors import BadRequestError, NotFoundError
from ...models.program import Program
from ...models.program_year import ProgramYear
from ...models.timetable_entry import TimetableEntry
from ...schemas.timetable import (
    ProgramItem,
    ProgramYearItem,
    TimetableEntryItem,
)
from ...services import timetable_service

router = APIRouter(prefix="/timetable", tags=["admin:timetable"])


# ---------------------------------------------------------------------------
# Reads (mirror the public endpoints, but available behind the guard too)
# ---------------------------------------------------------------------------

@router.get("/programs", response_model=list[ProgramItem])
def list_programs(session: Session = Depends(db_session)):
    return timetable_service.list_programs(session)


@router.get(
    "/programs/{program_id}/years",
    response_model=list[ProgramYearItem],
)
def list_years(program_id: int, session: Session = Depends(db_session)):
    program = session.query(Program).filter_by(id=program_id).one_or_none()
    if program is None:
        raise NotFoundError(f"Program {program_id} not found")
    return timetable_service.list_years_for_program(session, program_id)


@router.get("/schedule")
def get_schedule(program_year_id: int, session: Session = Depends(db_session)):
    return timetable_service.get_week(session, program_year_id)


# ---------------------------------------------------------------------------
# Deletes (creating and updating is done via the CSV import for now)
# ---------------------------------------------------------------------------

@router.delete("/programs/{program_id}", status_code=204)
def delete_program(program_id: int, session: Session = Depends(db_session)):
    """
    Delete a program and, by cascade, its years and their entries.
    """
    program = session.query(Program).filter_by(id=program_id).one_or_none()
    if program is None:
        raise NotFoundError(f"Program {program_id} not found")
    session.delete(program)
    return None


@router.delete("/program-years/{program_year_id}", status_code=204)
def delete_program_year(program_year_id: int, session: Session = Depends(db_session)):
    py = (
        session.query(ProgramYear)
        .filter_by(id=program_year_id)
        .one_or_none()
    )
    if py is None:
        raise NotFoundError(f"ProgramYear {program_year_id} not found")
    session.delete(py)
    return None


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, session: Session = Depends(db_session)):
    entry = (
        session.query(TimetableEntry)
        .filter_by(id=entry_id)
        .one_or_none()
    )
    if entry is None:
        raise NotFoundError(f"Entry {entry_id} not found")
    session.delete(entry)
    return None


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------

@router.post("/import")
async def import_csv(
    file: UploadFile = File(...),
    replace: bool = False,
    session: Session = Depends(db_session),
):
    """
    Import a timetable CSV. Same parser the CLI script uses, so the
    formats are guaranteed to stay in sync.

    Returns a report dict with counts of what was created/updated/
    unchanged. Any validation error returns 400 with the details.
    """
    # Local import — the CLI script imports from the backend, so we
    # avoid a circular import at module load time.
    import sys
    from pathlib import Path as _Path
    _REPO_ROOT = _Path(__file__).resolve().parents[4]
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))

    from admin.scripts.import_timetable import _load_and_validate, _import

    contents = await file.read()

    # The parser reads from a path, so write to a temp file.
    with tempfile.NamedTemporaryFile(
        mode="wb", suffix=".csv", delete=False
    ) as tmp:
        tmp.write(contents)
        tmp_path = Path(tmp.name)

    try:
        try:
            rows = _load_and_validate(tmp_path)
        except ValueError as e:
            raise BadRequestError(str(e)) from e

        report = _import(rows, replace=replace, dry_run=False)
        return report
    finally:
        try:
            tmp_path.unlink()
        except OSError:
            pass