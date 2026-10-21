"""
place_service.py

Search and lookup against the places table. Used by /api/places and
/api/places/search.

Filters
-------
- q:      case-insensitive substring match on name, name_sw, alt_names.
- category: exact match against the category column. Case-insensitive
            and trimmed, so 'amenity=Library' and 'amenity=library '
            both match the chip's 'amenity=library'.
- intent: case-insensitive substring match on the intents column.
          A place with intents="eat; study; wifi" matches intent=eat,
          intent=study, and intent=wifi.
- kind, building_name, level: exact / case-insensitive as noted inline.
- lat/lon/radius_m: proximity filter.
"""

import math

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.media import Media
from ..models.place import Place
from ..schemas.place import PlaceDetail, PlaceSummary
from ..schemas.common import LatLon


_CATEGORY_ICON_KEYS = {
    "amenity=library": "library",
    "amenity=cafe": "food",
    "amenity=restaurant": "food",
    "amenity=fast_food": "food",
    "amenity=bank": "bank",
    "amenity=toilets": "toilet",
    "amenity=drinking_water": "water",
    "building=university": "lecture",
    "office=yes": "office",
    "tourism=hostel": "hostel",
}


def _icon_key_for_category(category):
    if not category:
        return None
    # Lookup is case-insensitive: normalise once.
    return _CATEGORY_ICON_KEYS.get(category.strip().lower())


def _primary_photo_for(session, place_id):
    """Return the URL of a place's primary photo, or None."""
    row = (
        session.query(Media)
        .filter_by(place_id=place_id)
        .order_by(Media.is_primary.desc(), Media.sort_order.asc(), Media.id.asc())
        .first()
    )
    if row is None:
        return None
    from . import media_service
    return media_service.url_for(row, "card")


def _to_summary(session, place: Place) -> PlaceSummary:
    return PlaceSummary(
        id=place.id,
        name=place.name,
        name_sw=place.name_sw,
        category=place.category,
        category_icon_key=_icon_key_for_category(place.category),
        intents=place.intents,
        kind=place.kind,
        building_name=place.building_name,
        level=place.level,
        room_name=place.room_name,
        location=LatLon(lat=place.lat, lon=place.lon),
        is_landmark=place.is_landmark,
        primary_photo_url=_primary_photo_for(session, place.id),
    )


def _to_detail(session, place: Place) -> PlaceDetail:
    return PlaceDetail(
        id=place.id,
        name=place.name,
        name_sw=place.name_sw,
        alt_names=place.alt_names,
        description=place.description,
        category=place.category,
        intents=place.intents,
        kind=place.kind,
        building_name=place.building_name,
        level=place.level,
        room_name=place.room_name,
        ref=place.ref,
        location=LatLon(lat=place.lat, lon=place.lon),
        wheelchair=place.wheelchair,
        opening_hours=place.opening_hours,
        is_landmark=place.is_landmark,
        has_wifi=place.has_wifi,
        wifi_ssid=place.wifi_ssid,
    )


def search_places(
    session: Session,
    q: str | None = None,
    category: str | None = None,
    intent: str | None = None,
    kind: str | None = None,
    building_name: str | None = None,
    level: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    radius_m: float = 500,
    limit: int = 50,
) -> list[PlaceSummary]:
    """
    Return matching places.

    - q: case-insensitive substring against name, name_sw, alt_names
    - category: case-insensitive exact match against the category column
    - intent: case-insensitive substring against the intents column
    - kind: "outdoor", "indoor", or "entrance"
    - building_name: case-insensitive exact match
    - level: exact match against the level column
    - lat/lon/radius_m: proximity filter
    """
    query = session.query(Place)

    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(Place.name).like(like),
                func.lower(func.coalesce(Place.name_sw, "")).like(like),
                func.lower(func.coalesce(Place.alt_names, "")).like(like),
            )
        )

    # QR points (category "qr") are spots on corridors, used only to start a
    # route after scanning a printed code. They are not places a student
    # searches for, so every search hides them unless "qr" is asked for.
    if not category or category.strip().lower() != "qr":
        query = query.filter(
            func.lower(func.trim(func.coalesce(Place.category, ""))) != "qr"
        )

    if category:
        # Case-insensitive, trimmed compare. The category stored in
        # the DB may have mixed case or stray whitespace; the chip
        # sends a normalised lowercase value. Compare on equal terms.
        wanted = category.strip().lower()
        query = query.filter(
            func.lower(func.trim(func.coalesce(Place.category, ""))) == wanted
        )

    if intent:
        needle = f"%{intent.lower()}%"
        query = query.filter(
            func.lower(func.coalesce(Place.intents, "")).like(needle)
        )

    if kind:
        query = query.filter(Place.kind == kind)

    if building_name:
        needle = building_name.strip().lower()
        query = query.filter(
            func.lower(func.coalesce(Place.building_name, "")) == needle
        )

    if level is not None:
        query = query.filter(Place.level == str(level))

    if lat is not None and lon is not None:
        dlat = radius_m / 111_000
        dlon = radius_m / (111_000 * max(math.cos(math.radians(lat)), 0.01))
        query = query.filter(
            Place.lat.between(lat - dlat, lat + dlat),
            Place.lon.between(lon - dlon, lon + dlon),
        )

    rows = query.limit(limit).all()

    if lat is not None and lon is not None:
        from backend.core.campus_graph import haversine_m
        rows = [
            r for r in rows
            if haversine_m(lat, lon, r.lat, r.lon) <= radius_m
        ]

    return [_to_summary(session, r) for r in rows]


def get_place(session: Session, place_id: int) -> PlaceDetail | None:
    """Look up a place by id. Returns None if not found."""
    row = session.query(Place).filter_by(id=place_id).one_or_none()
    if row is None:
        return None
    return _to_detail(session, row)


# ---------------------------------------------------------------------------
# Tag counts (for hiding empty chips)
# ---------------------------------------------------------------------------

def list_category_counts(session: Session) -> dict[str, int]:
    """
    Return {category: count} for every non-empty category, with the
    category value normalised to lowercase and trimmed so the counts
    match the chip keys the app sends.
    """
    rows = (
        session.query(
            func.lower(func.trim(Place.category)),
            func.count(Place.id),
        )
        .filter(Place.category.isnot(None))
        .filter(func.trim(Place.category) != "")
        .group_by(func.lower(func.trim(Place.category)))
        .all()
    )
    return {cat: n for cat, n in rows}


def list_intent_counts(session: Session, known_intents: list[str]) -> dict[str, int]:
    """
    Return {intent: count} for the given known intents.

    The intents column is free text, semicolon-separated:
        "eat; study; wifi"
    So we can't GROUP BY it directly the way we do with categories.
    Instead, we count with a LIKE for each known intent.

    known_intents is the fixed vocabulary the app's intent chips use.
    Only intents in that list are counted — arbitrary words a
    contributor might have typed are not surfaced as chips.
    """
    counts: dict[str, int] = {}
    for key in known_intents:
        needle = f"%{key.lower()}%"
        n = (
            session.query(func.count(Place.id))
            .filter(func.lower(func.coalesce(Place.intents, "")).like(needle))
            .scalar()
        ) or 0
        counts[key] = n
    return counts


# ---------------------------------------------------------------------------
# Building room counts (for the Explore card badge)
# ---------------------------------------------------------------------------

def list_building_counts(session: Session) -> dict[str, int]:
    """
    Return {building_name: room_count}.

    Counts indoor places grouped by their building_name. The
    comparison to a building place is done by exact string on
    building_name == building's name — see the note in
    `list_rooms_for_building` below for why the ingest keeps these
    identical.
    """
    rows = (
        session.query(
            Place.building_name,
            func.count(Place.id),
        )
        .filter(Place.kind == "indoor")
        .filter(func.lower(func.trim(func.coalesce(Place.category, ""))) != "qr")
        .filter(Place.building_name.isnot(None))
        .filter(func.trim(Place.building_name) != "")
        .group_by(Place.building_name)
        .all()
    )
    return {name: n for name, n in rows}

