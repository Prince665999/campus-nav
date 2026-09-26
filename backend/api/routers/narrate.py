"""
narrate.py

GET /api/narrate — produce spoken narration for a route.

Accepts either a place ID or coordinates for the from endpoint. When
coordinates are given, the same snap-distance limit that /api/route
applies is applied here too.
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from ..dependencies import db_session, graph
from ..errors import (
    BadRequestError,
    LocationTooFarError,
    RouteNotFoundError,
)
from ..rate_limit import limiter
from ..schemas.narration import NarrationResponse
from ..services import narration_service
from ..services.graph_service import get_edge_tags, get_nodes
from ..settings import RATE_LIMIT_NARRATE

router = APIRouter(prefix="/api/narrate", tags=["narrate"])


@router.get("", response_model=NarrationResponse)
@limiter.limit(RATE_LIMIT_NARRATE)
def narrate(
    request: Request,
    from_place_id: int | None = Query(None, description="Place ID to start from"),
    from_lat: float | None = Query(None, ge=-90, le=90),
    from_lon: float | None = Query(None, ge=-180, le=180),
    from_accuracy_m: float | None = Query(None, ge=0),
    to_place_id: int = Query(..., description="Place ID to end at"),
    lang: str = Query("en", description="Language code: en or sw"),
    live: bool = Query(
        False,
        description=(
            "If true, call the model. If false (default), use the "
            "deterministic local narration."
        ),
    ),
    session: Session = Depends(db_session),
    g=Depends(graph),
):
    """
    Produce narration for the route between two points.

    The from endpoint is either a place ID or a lat/lon pair. The to
    endpoint is always a place ID.
    """
    from_ok = from_place_id is not None or (
        from_lat is not None and from_lon is not None
    )
    if not from_ok:
        raise BadRequestError(
            "Either from_place_id or from_lat/from_lon is required"
        )

    try:
        result = narration_service.narrate_route(
            session, g, get_nodes(), get_edge_tags(),
            from_place_id=from_place_id,
            from_lat=from_lat,
            from_lon=from_lon,
            from_accuracy_m=from_accuracy_m,
            to_place_id=to_place_id,
            lang=lang,
            live=live,
        )
    except narration_service.UnreliableLocationError:
        raise LocationTooFarError()

    if result is None:
        raise RouteNotFoundError(
            "No route found to narrate between those points"
        )

    return result