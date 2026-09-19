"""
health.py

GET /api/health — reports the API's state, graph version, and counts.

Used by Docker healthchecks and the mobile app's splash screen. The
full observability version (Sentry, structured logs) arrives in
Phase 17; this is the minimum needed to know the API is alive.
"""

import time

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..dependencies import db_session, graph
from ..models.area import Area
from ..models.place import Place
from ..schemas.health import HealthResponse
from ..services.graph_service import get_edges, get_nodes

router = APIRouter(prefix="/api/health", tags=["health"])

# Captured at import time so uptime is measured from process start.
_START_TIME = time.time()


@router.get("", response_model=HealthResponse)
def health(
    session: Session = Depends(db_session),
    g=Depends(graph),
):
    """
    Return the API's health. Always returns 200 as long as the process
    is alive and can read the database — the payload says whether the
    graph loaded successfully.
    """
    nodes = get_nodes()
    edges = get_edges()

    place_count = session.query(func.count(Place.id)).scalar() or 0
    area_count = session.query(func.count(Area.id)).scalar() or 0

    return HealthResponse(
        status="ok" if g else "degraded",
        graph_version=str(len(nodes)) + "n/" + str(len(edges)) + "e",
        node_count=len(nodes) if nodes else 0,
        edge_count=len(edges) if edges else 0,
        place_count=place_count,
        area_count=area_count,
        uptime_s=round(time.time() - _START_TIME, 1),
    )