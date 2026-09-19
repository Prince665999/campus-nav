"""
areas.py

Endpoints for reading area (polygon) data.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..errors import NotFoundError
from ..schemas.area import AreaDetail, AreaSummary
from ..services import area_service

router = APIRouter(prefix="/api/areas", tags=["areas"])


@router.get("", response_model=list[AreaSummary])
def list_areas(
    q: str | None = Query(None),
    category: str | None = Query(None),
    landmark_only: bool = Query(False),
    limit: int = Query(100, gt=0, le=500),
    session: Session = Depends(db_session),
):
    """List areas, optionally filtered."""
    return area_service.list_areas(
        session, q=q, category=category,
        landmark_only=landmark_only, limit=limit,
    )


@router.get("/{area_id}", response_model=AreaDetail)
def get_area(area_id: int, session: Session = Depends(db_session)):
    """Full detail for one area."""
    detail = area_service.get_area(session, area_id)
    if detail is None:
        raise NotFoundError(f"Area {area_id} not found")
    return detail