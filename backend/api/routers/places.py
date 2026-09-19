"""
places.py

Endpoints for listing, searching, and looking up places.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..errors import NotFoundError
from ..schemas.place import PlaceDetail, PlaceSummary
from ..services import place_service

router = APIRouter(prefix="/api/places", tags=["places"])


@router.get("", response_model=list[PlaceSummary])
def list_places(
    q: str | None = Query(None, description="Substring match on name"),
    category: str | None = Query(None),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    radius_m: float = Query(500, gt=0, le=5000),
    limit: int = Query(50, gt=0, le=200),
    session: Session = Depends(db_session),
):
    """List places, optionally filtered by query, category, or
    proximity."""
    return place_service.search_places(
        session, q=q, category=category, lat=lat, lon=lon,
        radius_m=radius_m, limit=limit,
    )


@router.get("/search", response_model=list[PlaceSummary])
def search_places(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, gt=0, le=100),
    session: Session = Depends(db_session),
):
    """Search places by name. Requires a query string."""
    return place_service.search_places(session, q=q, limit=limit)


@router.get("/{place_id}", response_model=PlaceDetail)
def get_place(place_id: int, session: Session = Depends(db_session)):
    """Full detail for one place."""
    detail = place_service.get_place(session, place_id)
    if detail is None:
        raise NotFoundError(f"Place {place_id} not found")
    return detail