"""
indoor.py

Endpoints for indoor floor plans.

  GET /api/indoor/areas?building_name=X&level=Y

Returns every room and corridor polygon on one floor of one
building, plus the list of levels the building has. The phone uses
this to draw the floor plan when the student is walking inside, and
to show a floor switcher.

Public (no admin guard) — the mobile app calls it directly, just
like the outdoor /api/areas endpoint.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..schemas.indoor import IndoorAreasResponse
from ..services import indoor_area_service

router = APIRouter(prefix="/api/indoor", tags=["indoor"])


@router.get("/areas", response_model=IndoorAreasResponse)
def get_indoor_areas(
    building_name: str = Query(..., min_length=1),
    level: str = Query(..., min_length=1),
    session: Session = Depends(db_session),
):
    """
    Every room and corridor polygon on one floor of one building.

    Also returns `levels`, the list of floors this building has
    polygons on. The phone uses it to show a floor switcher.

    Returns an empty `areas` list if the building or level has no
    polygons yet. The mobile app falls back to the indoor
    placeholder in that case.
    """
    return indoor_area_service.list_areas_for_floor(
        session, building_name=building_name, level=level
    )