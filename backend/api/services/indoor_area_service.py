"""
indoor_area_service.py

Read indoor polygons (rooms and corridors) for the floor plan.

Reuses the WKT parser from area_service.py so the shapes come back
in exactly the same form as outdoor areas — the phone's parsing code
works the same for both.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.indoor_area import IndoorArea
from ..schemas.indoor import IndoorAreaItem, IndoorAreasResponse

# Reuse the outdoor area WKT parser so both area types come back in
# the same shape. If the WKT format ever changes, it changes in one
# place.
from .area_service import _centroid, _parse_wkt_polygon


def _to_item(area: IndoorArea) -> IndoorAreaItem:
    boundary = _parse_wkt_polygon(area.geometry_wkt)
    return IndoorAreaItem(
        id=area.id,
        osm_id=area.osm_id,
        name=area.name,
        ref=area.ref,
        type=area.type,
        level=area.level,
        door_node_id=area.door_node_id,
        boundary=boundary,
        centroid=_centroid(boundary),
    )


def _levels_for_building(session: Session, building_name: str) -> list[str]:
    """
    Every level this building has polygons on, sorted ascending.

    Building name is matched case-insensitively, same as the areas
    query. Levels are sorted with a numeric comparison so "-1" comes
    before "0", which lexical sort gets wrong. Non-numeric levels are
    sorted last, as strings.
    """
    needle = building_name.strip().lower()
    rows = (
        session.query(IndoorArea.level)
        .filter(func.lower(IndoorArea.building_name) == needle)
        .filter(IndoorArea.level.isnot(None))
        .distinct()
        .all()
    )

    levels = [r[0] for r in rows if r[0] is not None and r[0] != ""]

    def _sort_key(lvl: str):
        try:
            return (0, int(lvl))
        except (TypeError, ValueError):
            return (1, lvl)

    return sorted(levels, key=_sort_key)


def list_areas_for_floor(
    session: Session,
    building_name: str,
    level: str,
) -> IndoorAreasResponse:
    """
    Return every room and corridor on one floor of one building, plus
    the list of levels this building has.

    building_name is matched case-insensitively — the phone sends
    whatever string it read from the route step, and the tag in JOSM
    might not match character-for-character. Case-insensitive is the
    forgiving choice without being sloppy.
    """
    needle = building_name.strip().lower()

    rows = (
        session.query(IndoorArea)
        .filter(func.lower(IndoorArea.building_name) == needle)
        .filter(IndoorArea.level == level)
        .order_by(IndoorArea.type.asc(), IndoorArea.name.asc())
        .all()
    )

    levels = _levels_for_building(session, building_name)

    return IndoorAreasResponse(
        building_name=building_name,
        level=level,
        areas=[_to_item(a) for a in rows],
        levels=levels,
    )