"""
narrate.py

GET /api/narrate — produce spoken narration for a route.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session, graph
from ..errors import RouteNotFoundError
from ..schemas.narration import NarrationResponse
from ..services import narration_service
from ..services.graph_service import get_edge_tags, get_nodes

router = APIRouter(prefix="/api/narrate", tags=["narrate"])


@router.get("", response_model=NarrationResponse)
def narrate(
    from_place_id: int = Query(..., description="Place ID to start from"),
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
    Produce narration for the route between two places.
    """
    result = narration_service.narrate_route(
        session, g, get_nodes(), get_edge_tags(),
        from_place_id=from_place_id,
        to_place_id=to_place_id,
        lang=lang,
        live=live,
    )

    if result is None:
        raise RouteNotFoundError("No route found to narrate between those places")

    return result