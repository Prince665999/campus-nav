"""
health.py

GET /api/health — reports the state of every dependency the API
relies on.

Used by:
  - Docker healthchecks
  - The mobile app's splash screen (optional)
  - Monitoring tools
  - A human checking whether the API is alive
"""

import time

from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..cache import get_client as get_redis_client
from ..dependencies import db_session, graph
from ..models.area import Area
from ..models.place import Place
from ..schemas.health import DependencyStatus, HealthResponse
from ..services.graph_service import get_edges, get_nodes
from ..settings import ENVIRONMENT

router = APIRouter(prefix="/api/health", tags=["health"])

_START_TIME = time.time()
_API_VERSION = "0.17.0"


def _check_database(session: Session) -> DependencyStatus:
    try:
        session.execute(text("SELECT 1"))
        return DependencyStatus(name="database", ok=True)
    except Exception as e:
        return DependencyStatus(name="database", ok=False, detail=str(e))


def _check_redis() -> DependencyStatus:
    client = get_redis_client()
    if client is None:
        # Not having Redis isn't an error — the app falls through to
        # live computation. It's "degraded" rather than "down".
        return DependencyStatus(
            name="redis",
            ok=False,
            detail="Redis not connected. Caching disabled, app still works.",
        )
    try:
        client.ping()
        return DependencyStatus(name="redis", ok=True)
    except Exception as e:
        return DependencyStatus(name="redis", ok=False, detail=str(e))


def _check_graph() -> DependencyStatus:
    try:
        nodes = get_nodes()
        if not nodes:
            return DependencyStatus(
                name="graph", ok=False, detail="Graph loaded but empty"
            )
        return DependencyStatus(name="graph", ok=True)
    except Exception as e:
        return DependencyStatus(name="graph", ok=False, detail=str(e))


@router.get("", response_model=HealthResponse)
def health(
    session: Session = Depends(db_session),
    g=Depends(graph),
):
    """
    Report the API's health.

    Always returns 200 as long as the process is alive. The payload
    says whether each dependency is fine. A "degraded" status means
    the API works but something is missing — usually Redis.
    """
    nodes = get_nodes() or {}
    edges = get_edges() or []

    place_count = session.query(func.count(Place.id)).scalar() or 0
    area_count = session.query(func.count(Area.id)).scalar() or 0

    dependencies = [
        _check_database(session),
        _check_graph(),
        _check_redis(),
    ]

    # Overall status:
    #   - "down" if the database or graph is unusable — the app
    #     can't serve routes without them.
    #   - "degraded" if only Redis is missing.
    #   - "ok" if everything is fine.
    db_ok = next(d.ok for d in dependencies if d.name == "database")
    graph_ok = next(d.ok for d in dependencies if d.name == "graph")
    redis_ok = next(d.ok for d in dependencies if d.name == "redis")

    if not db_ok or not graph_ok:
        status = "down"
    elif not redis_ok:
        status = "degraded"
    else:
        status = "ok"

    return HealthResponse(
        status=status,
        version=_API_VERSION,
        environment=ENVIRONMENT,
        uptime_s=round(time.time() - _START_TIME, 1),
        graph_version=f"{len(nodes)}n/{len(edges)}e",
        node_count=len(nodes),
        edge_count=len(edges),
        place_count=place_count,
        area_count=area_count,
        dependencies=dependencies,
    )