"""
route.py

GET /api/route — compute a walking route between two points.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session, graph
from ..errors import (
    BadRequestError,
    LocationTooFarError,
    RouteNotFoundError,
)
from ..schemas.route import RouteResponse
from ..services import route_composer, routing_service
from ..services.graph_service import get_edge_tags, get_nodes

router = APIRouter(prefix="/api/route", tags=["route"])


@router.get("", response_model=RouteResponse)
def compute(
    from_place_id: int | None = Query(None),
    from_lat: float | None = Query(None, ge=-90, le=90),
    from_lon: float | None = Query(None, ge=-180, le=180),
    from_accuracy_m: float | None = Query(None, ge=0),
    to_place_id: int | None = Query(None),
    to_lat: float | None = Query(None, ge=-90, le=90),
    to_lon: float | None = Query(None, ge=-180, le=180),
    session: Session = Depends(db_session),
    g=Depends(graph),
):
    """
    Compute a walking route.

    Each endpoint is either a place_id OR a lat/lon pair. When both
    endpoints resolve to outdoor places, the outdoor engine is used
    (same as always). When either endpoint is an indoor place (a door
    node), the indoor engine is used and the route may include an
    entrance crossing.

    A live GPS start is also supported: from_lat/from_lon is snapped
    to the nearest outdoor node on the merged graph, and the route
    continues from there.

    Steps in the response carry a `mode` field ("outdoor" or "indoor")
    so the client knows where to switch rendering behavior. The
    response also includes a `legs` array describing the boundaries.
    """
    from_ok = from_place_id is not None or (
        from_lat is not None and from_lon is not None
    )
    to_ok = to_place_id is not None or (
        to_lat is not None and to_lon is not None
    )
    if not from_ok:
        raise BadRequestError(
            "Either from_place_id or from_lat/from_lon is required"
        )
    if not to_ok:
        raise BadRequestError(
            "Either to_place_id or to_lat/to_lon is required"
        )

    try:
        result = route_composer.compose_route(
            session, g, get_nodes(), get_edge_tags(),
            from_place_id=from_place_id,
            from_lat=from_lat,
            from_lon=from_lon,
            from_accuracy_m=from_accuracy_m,
            to_place_id=to_place_id,
            to_lat=to_lat,
            to_lon=to_lon,
        )
    except (
        routing_service.UnreliableLocationError,
        route_composer.UnreliableLocationError,
    ):
        raise LocationTooFarError()
    except route_composer.RouteCompositionError as e:
        raise RouteNotFoundError(str(e))

    if result is None:
        raise RouteNotFoundError()

    return result