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
from ...services import cache_service, graph_service

router = APIRouter(prefix="/places", tags=["admin:places"])


def _to_admin_detail(place: Place) -> dict:
    """
    Full detail for the admin editor. Unlike the public PlaceDetail
    schema, this includes `description_ai`, so an admin can see and
    edit the AI-facing text.
    """
    return {
        "id": place.id,
        "name": place.name,
        "name_sw": place.name_sw,
        "alt_names": place.alt_names,
        "description": place.description,
        "description_ai": place.description_ai,
        "intents": place.intents,
        "category": place.category,
        "ref": place.ref,
        "location": {"lat": place.lat, "lon": place.lon},
        "wheelchair": place.wheelchair,
        "opening_hours": place.opening_hours,
        "is_landmark": place.is_landmark,
        "has_wifi": place.has_wifi,
        "wifi_ssid": place.wifi_ssid,
    }


@router.get("/{place_id}")
def get_place_admin(place_id: int, session: Session = Depends(db_session)):
    """
    Full detail for one place, including the AI description.
    Used by the admin place editor.
    """
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        raise NotFoundError(f"Place {place_id} not found")
    return _to_admin_detail(place)


@router.patch("/{place_id}")
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

    updates = body.model_dump(exclude_unset=True)

    ai_description_changed = "description_ai" in updates

    for key, value in updates.items():
        setattr(place, key, value)

    session.flush()

    if ai_description_changed:
        graph_service.reset()
        if cache.is_available():
            cache_service.invalidate_narrations()

    return _to_admin_detail(place)


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