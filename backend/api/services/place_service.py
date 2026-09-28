"""
place_service.py

Search and lookup against the places table. Used by /api/places and
/api/places/search.
"""

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.media import Media
from ..models.place import Place
from ..schemas.place import PlaceDetail, PlaceSummary
from ..schemas.common import LatLon


# Maps OSM category values to icon keys the mobile app understands.
# The mobile side has an ICONS map with matching keys. Anything not
# listed falls back to the default "place" icon.
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
    return _CATEGORY_ICON_KEYS.get(category)


def _primary_photo_for(session, place_id):
    """
    Return the URL of a place's primary photo, or None. Uses the card
    variant, which is what the app shows in grids.
    """
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
    lat: float | None = None,
    lon: float | None = None,
    radius_m: float = 500,
    limit: int = 50,
) -> list[PlaceSummary]:
    """
    Return matching places.

    - q: case-insensitive substring against name, name_sw, alt_names
    - category: exact match against the category column
    - intent: case-insensitive substring against the intents column
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

    if category:
        query = query.filter(Place.category == category)

    if intent:
        needle = f"%{intent.lower()}%"
        query = query.filter(
            func.lower(func.coalesce(Place.intents, "")).like(needle)
        )

    if lat is not None and lon is not None:
        import math
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