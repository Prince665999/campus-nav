"""
timetable.py

Public timetable endpoints:

  GET /api/timetable/programs
  GET /api/timetable/programs/{program_id}/years
  GET /api/timetable/schedule?program_year_id=X
  GET /api/timetable/next?program_year_id=X

These are read-only and don't require a session cookie. The mobile
app calls them directly. Writing is done through the admin endpoints
(Phase 3) and the CLI import script (Phase 1).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..errors import NotFoundError
from ..models.program import Program
from ..schemas.timetable import (
    NextClassResponse,
    ProgramItem,
    ProgramYearItem,
    TimetableWeekResponse,
)
from ..services import timetable_service

router = APIRouter(prefix="/api/timetable", tags=["timetable"])


@router.get("/programs", response_model=list[ProgramItem])
def list_programs(session: Session = Depends(db_session)):
    """Every program, alphabetical. Used by the onboarding picker."""
    return timetable_service.list_programs(session)


@router.get(
    "/programs/{program_id}/years",
    response_model=list[ProgramYearItem],
)
def list_years(program_id: int, session: Session = Depends(db_session)):
    """Year-levels available for one program."""
    program = session.query(Program).filter_by(id=program_id).one_or_none()
    if program is None:
        raise NotFoundError(f"Program {program_id} not found")
    return timetable_service.list_years_for_program(session, program_id)


@router.get("/schedule")
def get_schedule(
    program_year_id: int,
    raw: bool = False,
    session: Session = Depends(db_session),
):
    """
    Full week for a program-year. By default, adjacent rows that
    represent the same continuing period are merged. Pass raw=true
    to see the unmerged rows.
    """
    return timetable_service.get_week(
        session, program_year_id, merge_adjacent=not raw
    )


@router.get("/next", response_model=NextClassResponse)
def get_next(
    program_year_id: int = Query(...),
    session: Session = Depends(db_session),
):
    """
    The next class within the next 90 minutes, if any.
    Used by the home screen's banner.
    """
    return timetable_service.get_next_class(session, program_year_id)