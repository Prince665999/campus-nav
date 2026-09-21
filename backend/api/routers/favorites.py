"""
favorites.py

Endpoints for recent destinations and favorites.

Both are keyed by the anonymous device ID the app sends in the
X-Device-Id header. No login required.
"""

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..errors import BadRequestError, NotFoundError
from ..schemas.favorite import (
    AddFavoriteRequest,
    DestinationItem,
    RecordRecentRequest,
)
from ..security import hash_device_id
from ..services import favorite_service

router = APIRouter(prefix="/api/destinations", tags=["destinations"])


def _require_device_id(x_device_id: str | None = Header(None)) -> str:
    """
    Extract and hash the device ID from the request header.

    Every endpoint in this router needs it, so it's a dependency
    rather than repeated code.
    """
    if not x_device_id:
        raise BadRequestError(
            "X-Device-Id header is required. The app generates one on first launch."
        )
    return hash_device_id(x_device_id)


@router.get("/recent", response_model=list[DestinationItem])
def list_recent(
    limit: int = Query(10, gt=0, le=50),
    session: Session = Depends(db_session),
    session_hash: str = Depends(_require_device_id),
):
    """The N most recently visited places for this device."""
    return favorite_service.list_recents(session, session_hash, limit=limit)


@router.post("/recent", status_code=204)
def record_recent(
    body: RecordRecentRequest,
    session: Session = Depends(db_session),
    session_hash: str = Depends(_require_device_id),
):
    """Record that this device just visited a place."""
    ok = favorite_service.record_recent(session, session_hash, body.place_id)
    if not ok:
        raise NotFoundError(f"Place {body.place_id} not found")
    return None


@router.get("/favorites", response_model=list[DestinationItem])
def list_favorites(
    session: Session = Depends(db_session),
    session_hash: str = Depends(_require_device_id),
):
    """All favorites for this device."""
    return favorite_service.list_favorites(session, session_hash)


@router.post("/favorites", status_code=204)
def add_favorite(
    body: AddFavoriteRequest,
    session: Session = Depends(db_session),
    session_hash: str = Depends(_require_device_id),
):
    """Add a place to favorites. Idempotent."""
    ok = favorite_service.add_favorite(session, session_hash, body.place_id)
    if not ok:
        raise NotFoundError(f"Place {body.place_id} not found")
    return None


@router.delete("/favorites/{place_id}", status_code=204)
def remove_favorite(
    place_id: int,
    session: Session = Depends(db_session),
    session_hash: str = Depends(_require_device_id),
):
    """Remove a place from favorites. Idempotent."""
    favorite_service.remove_favorite(session, session_hash, place_id)
    return None


@router.get("/favorites/{place_id}/exists")
def is_favorite(
    place_id: int,
    session: Session = Depends(db_session),
    session_hash: str = Depends(_require_device_id),
):
    """Whether this place is a favorite for this device."""
    return {"is_favorite": favorite_service.is_favorite(session, session_hash, place_id)}