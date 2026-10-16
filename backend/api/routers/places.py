"""
places.py

Endpoints for listing, searching, and looking up places.

Route ordering note
-------------------
FastAPI matches routes in declaration order. `/search`, `/tags`, and
`/buildings` are declared before `/{place_id}` so a request for
`/api/places/search` doesn't get interpreted as `place_id="search"`.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import db_session
from ..errors import NotFoundError
from ..schemas.place import PlaceDetail, PlaceSummary
from ..services import place_service

router = APIRouter(prefix="/api/places", tags=["places"])


# Fixed vocabulary of intents the app's chips use. Keep in sync with
# mobile/constants/intents.js. Only these are counted for the tags
# endpoint — arbitrary words a contributor might have typed are not
# surfaced as chips.
KNOWN_INTENTS = [
    "eat",
    "study",
    "print",
    "wifi",
    "sports",
    "meet",
    "toilet",
    "prayer",
]


@router.get("", response_model=list[PlaceSummary])
def list_places(
    q: str | None = Query(None, description="Substring match on name"),
    category: str | None = Query(None),
    intent: str | None = Query(None, description="Substring match on intents"),
    kind: str | None = Query(
        None,
        description="Filter by kind: 'outdoor', 'indoor', or 'entrance'",
    ),
    building_name: str | None = Query(
        None,
        description="Filter by building name (indoor and entrance places)",
    ),
    level: str | None = Query(
        None,
        description="Filter by level (indoor places)",
    ),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    radius_m: float = Query(500, gt=0, le=5000),
    limit: int = Query(50, gt=0, le=2000),
    session: Session = Depends(db_session),
):
    """
    List places, optionally filtered by query, category, intent, kind,
    building, level, or proximity.
    """
    return place_service.search_places(
        session,
        q=q,
        category=category,
        intent=intent,
        kind=kind,
        building_name=building_name,
        level=level,
        lat=lat,
        lon=lon,
        radius_m=radius_m,
        limit=limit,
    )


@router.get("/search", response_model=list[PlaceSummary])
def search_places(
    q: str = Query(..., min_length=1),
    kind: str | None = Query(None),
    building_name: str | None = Query(None),
    limit: int = Query(20, gt=0, le=2000),
    session: Session = Depends(db_session),
):
    """Search places by name. Requires a query string."""
    return place_service.search_places(
        session,
        q=q,
        kind=kind,
        building_name=building_name,
        limit=limit,
    )


@router.get("/tags")
def list_tags(session: Session = Depends(db_session)):
    """
    Return the counts of each category and each known intent.

    The mobile app uses this to hide chips whose count is zero, so a
    student never taps a chip that returns "No places found".
    """
    return {
        "categories": place_service.list_category_counts(session),
        "intents": place_service.list_intent_counts(session, KNOWN_INTENTS),
    }


@router.get("/buildings")
def list_buildings(session: Session = Depends(db_session)):
    """
    Return every building with its room count.

    A building here means an outdoor place whose name matches the
    `building_name` tag on one or more indoor places. The count is
    the number of indoor rooms/doors with that tag.

    The mobile app uses this on Explore to show "Library · 14 rooms"
    on the building card.

    Response shape:
        [
            {"id": 12, "name": "Dr. Magufuli Library", "room_count": 14},
            ...
        ]
    """
    from ..models.place import Place

    counts = place_service.list_building_counts(session)
    if not counts:
        return []

    # Match each count to a place by name. Exact match, case
    # insensitive, trimmed — the ingest guarantees they're identical,
    # but this makes the endpoint robust against a slight case or
    # whitespace difference.
    from sqlalchemy import func as sa_func

    normalised = {k.strip().lower(): (k, v) for k, v in counts.items()}
    outdoor_rows = (
        session.query(Place)
        .filter(Place.kind == "outdoor")
        .filter(Place.name.isnot(None))
        .all()
    )

    out = []
    for place in outdoor_rows:
        key = place.name.strip().lower()
        if key in normalised:
            _original, room_count = normalised[key]
            out.append({
                "id": place.id,
                "name": place.name,
                "room_count": room_count,
            })

    # Sort by name for a stable order the app can rely on.
    out.sort(key=lambda b: b["name"].lower())
    return out


@router.get("/{place_id}", response_model=PlaceDetail)
def get_place(place_id: int, session: Session = Depends(db_session)):
    """Full detail for one place."""
    detail = place_service.get_place(session, place_id)
    if detail is None:
        raise NotFoundError(f"Place {place_id} not found")
    return detail