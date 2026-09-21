"""
favorite_service.py

Logic for recent destinations and favorites.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.api.models.favorite import Favorite
from backend.api.models.place import Place
from backend.api.models.recent_destination import RecentDestination
from backend.api.schemas.common import LatLon
from backend.api.schemas.favorite import DestinationItem


# How many recents to keep per device. Pruning on write keeps the
# table from growing forever.
MAX_RECENTS_PER_DEVICE = 20


def _to_item_from_recent(recent: RecentDestination, place: Place) -> DestinationItem:
    return DestinationItem(
        place_id=place.id,
        name=place.name,
        name_sw=place.name_sw,
        category=place.category,
        location=LatLon(lat=place.lat, lon=place.lon),
        last_visited_at=recent.last_visited_at,
    )


def _to_item_from_favorite(fav: Favorite, place: Place) -> DestinationItem:
    return DestinationItem(
        place_id=place.id,
        name=place.name,
        name_sw=place.name_sw,
        category=place.category,
        location=LatLon(lat=place.lat, lon=place.lon),
        added_at=fav.created_at,
    )


# ---------------------------------------------------------------------------
# Recents
# ---------------------------------------------------------------------------

def record_recent(session: Session, session_hash: str, place_id: int) -> bool:
    """
    Record that this device visited this place. Upserts by
    (session_hash, place_id) — a place visited twice appears once
    with a fresh timestamp.

    Returns True if the place exists and was recorded, False otherwise.
    """
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        return False

    now = datetime.now(timezone.utc)

    existing = (
        session.query(RecentDestination)
        .filter_by(session_hash=session_hash, place_id=place_id)
        .one_or_none()
    )
    if existing is None:
        session.add(
            RecentDestination(
                session_hash=session_hash,
                place_id=place_id,
                last_visited_at=now,
            )
        )
    else:
        existing.last_visited_at = now

    # Prune older entries so the table doesn't grow forever.
    _prune_recents(session, session_hash)
    return True


def _prune_recents(session: Session, session_hash: str) -> None:
    """Keep only the N most recent per device."""
    keep_ids = [
        row.id
        for row in (
            session.query(RecentDestination.id)
            .filter_by(session_hash=session_hash)
            .order_by(RecentDestination.last_visited_at.desc())
            .limit(MAX_RECENTS_PER_DEVICE)
            .all()
        )
    ]
    if not keep_ids:
        return
    session.query(RecentDestination).filter(
        RecentDestination.session_hash == session_hash,
        ~RecentDestination.id.in_(keep_ids),
    ).delete(synchronize_session=False)


def list_recents(session: Session, session_hash: str, limit: int = 10) -> list[DestinationItem]:
    """The N most recently visited places for this device."""
    rows = (
        session.query(RecentDestination, Place)
        .join(Place, RecentDestination.place_id == Place.id)
        .filter(RecentDestination.session_hash == session_hash)
        .order_by(RecentDestination.last_visited_at.desc())
        .limit(limit)
        .all()
    )
    return [_to_item_from_recent(r, p) for r, p in rows]


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------

def add_favorite(session: Session, session_hash: str, place_id: int) -> bool:
    """
    Add a place to favorites. Idempotent — adding twice is a no-op.

    Returns True if the place exists, False otherwise.
    """
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        return False

    existing = (
        session.query(Favorite)
        .filter_by(session_hash=session_hash, place_id=place_id)
        .one_or_none()
    )
    if existing is None:
        session.add(Favorite(session_hash=session_hash, place_id=place_id))
    return True


def remove_favorite(session: Session, session_hash: str, place_id: int) -> bool:
    """
    Remove a place from favorites. Returns True if a row was deleted.
    """
    deleted = (
        session.query(Favorite)
        .filter_by(session_hash=session_hash, place_id=place_id)
        .delete()
    )
    return deleted > 0


def list_favorites(session: Session, session_hash: str) -> list[DestinationItem]:
    """All favorites for this device, newest first."""
    rows = (
        session.query(Favorite, Place)
        .join(Place, Favorite.place_id == Place.id)
        .filter(Favorite.session_hash == session_hash)
        .order_by(Favorite.created_at.desc())
        .all()
    )
    return [_to_item_from_favorite(f, p) for f, p in rows]


def is_favorite(session: Session, session_hash: str, place_id: int) -> bool:
    """Whether this place is a favorite for this device."""
    return (
        session.query(Favorite)
        .filter_by(session_hash=session_hash, place_id=place_id)
        .one_or_none()
        is not None
    )