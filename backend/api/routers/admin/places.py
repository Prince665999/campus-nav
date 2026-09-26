"""
places.py

Admin endpoints for editing places.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ... import cache
from ...dependencies import db_session
from ...errors import NotFoundError
from ...models.place import Place
from ...schemas.admin import UpdatePlaceRequest
from ...schemas.place import PlaceDetail
from ...services import cache_service, graph_service, place_service

router = APIRouter(prefix="/places", tags=["admin:places"])


@router.patch("/{place_id}", response_model=PlaceDetail)
def update_place(
    place_id: int,
    body: UpdatePlaceRequest,
    session: Session = Depends(db_session),
):
    """
    Update a place's editable fields. Only the fields present in the
    request are changed; others keep their current value.

    If the AI description changes, the in-memory graph is reloaded and
    narration caches are invalidated — because narration reads the
    description from the graph, and cached narrations may have been
    produced from the old text.
    """
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        raise NotFoundError(f"Place {place_id} not found")

    # Only apply fields that were explicitly sent.
    updates = body.model_dump(exclude_unset=True)

    ai_description_changed = "description_ai" in updates

    for key, value in updates.items():
        setattr(place, key, value)

    session.flush()

    # If the AI description changed, the loaded graph and any cached
    # narrations are stale. Reload and invalidate.
    if ai_description_changed:
        graph_service.reset()
        if cache.is_available():
            cache_service.invalidate_narrations()

    return place_service.get_place(session, place_id)


@router.delete("/{place_id}", status_code=204)
def delete_place(place_id: int, session: Session = Depends(db_session)):
    """
    Delete a place. Media and favorites cascade; reports are kept
    with place_id set to NULL, so the report history survives.
    """
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        raise NotFoundError(f"Place {place_id} not found")
    session.delete(place)
    return None