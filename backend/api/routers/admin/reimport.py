"""
reimport.py

Admin endpoints for viewing what a re-import would change, and
running it.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...errors import BadRequestError
from ...schemas.admin import ReimportDiff, ReimportResult
from ...services import reimport_service

router = APIRouter(prefix="/reimport", tags=["admin:reimport"])


@router.get("/diff", response_model=ReimportDiff)
def get_diff(session: Session = Depends(db_session)):
    """
    Report what a re-import would change, without changing anything.

    Compares the current map.osm against the database and returns
    counts of adds/updates/unchanged for each table, plus a sample
    of the specific changes.
    """
    try:
        return reimport_service.compute_diff(session)
    except FileNotFoundError as e:
        raise BadRequestError(str(e)) from e


@router.post("", response_model=ReimportResult)
def run_reimport(session: Session = Depends(db_session)):
    """
    Run the re-import. Merge-safe — never deletes rows, only writes
    OSM-sourced columns.
    """
    try:
        result = reimport_service.run(session)
    except FileNotFoundError as e:
        raise BadRequestError(str(e)) from e

    # The map may have changed, so cached routes are stale.
    from ...services import cache_service
    from ... import cache

    if cache.is_available():
        cache_service.invalidate_routes()
        cache_service.invalidate_narrations()

    return result