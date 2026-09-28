"""
place_service.py

Search and lookup against the places table. Used by /api/places and
/api/places/search.
"""

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.place import Place
from ..schemas.place import PlaceDetail, PlaceSummary
from ..schemas.common import LatLon


def _to_summary(place: Place) -> PlaceSummary:
    return PlaceSummary(
        id=place.id,
        name=place.name,
        name_sw=place.name_sw,
        category=place.category,
        intents=place.intents,
        location=LatLon(lat=place.lat, lon=place.lon),
        is_landmark=place.is_landmark,
    )


def _to_detail(place: Place) -> PlaceDetail:
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
      (a place with intents "eat; study" matches an intent of "eat")
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
        # Match against the free-text intents column. We use LIKE
        # rather than exact equality so that "eat" matches
        # "eat; study" without the caller needing to know the exact
        # semicolon-separated format. Word-boundary padding with
        # semicolons avoids matching "eat" inside "create".
        needle = f"%{intent.lower()}%"
        query = query.filter(
            func.lower(func.coalesce(Place.intents, "")).like(needle)
        )

    # For proximity: do a cheap bounding-box filter in SQL, then refine
    # in Python with haversine. This avoids a full scan on SQLite.
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

    return [_to_summary(r) for r in rows]


def get_place(session: Session, place_id: int) -> PlaceDetail | None:
    """Look up a place by id. Returns None if not found."""
    row = session.query(Place).filter_by(id=place_id).one_or_none()
    if row is None:
        return None
    return _to_detail(row)