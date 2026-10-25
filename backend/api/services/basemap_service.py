"""
basemap_service.py

Builds the outdoor BASE MAP (roads, paths, buildings, grass, water) from
map.osm, so the phone can draw its own map instead of using a map picture
from a tile service.

The database keeps only named places and the walkable paths. This reads the
whole .osm file again, so everything you draw in JOSM outdoors (unnamed
buildings, roads, grass) shows up on the map. It only reads closed ways, lines and
tagged points; areas stored as OSM relations are not drawn.

The result is cached in memory and rebuilt on its own when map.osm changes.
"""

import hashlib
import json
import logging
import threading
import xml.etree.ElementTree as ET
from pathlib import Path

from ..settings import MAP_OSM_PATH

logger = logging.getLogger(__name__)

ROAD_TYPES = {
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "service", "living_street", "track", "pedestrian",
}
PATH_TYPES = {"footway", "path", "steps", "cycleway", "bridleway", "corridor"}

# Green ground. Colours by kind are in the app (constants/outdoorMapStyle.js).
GREEN_LANDUSE = {
    "grass", "forest", "meadow", "recreation_ground", "village_green",
    "farmland", "orchard", "cemetery", "greenfield", "allotments", "vineyard",
}
GREEN_NATURAL = {"wood", "scrub", "grassland", "heath", "wetland"}
GREEN_LEISURE = {"park", "garden", "nature_reserve"}

# Sports and play areas: pitches, courts, stadiums, pools.
SPORTS_LEISURE = {
    "pitch", "sports_centre", "stadium", "track", "swimming_pool", "playground",
    "golf_course", "miniature_golf",
}

# Land that is not "green": the campus itself (education), housing, shops...
EDUCATION_AMENITY = {"university", "college", "school", "kindergarten"}
LANDUSE_AMENITY = EDUCATION_AMENITY | {"hospital", "clinic"}

# ---- Symbols (points of interest) ------------------------------------------
# (tag, value) -> icon name. "*" means any value of that tag.
# The icon names match the picture files in mobile/assets/poi/.
POI_ICONS = {
    ("amenity", "parking"): "parking",
    ("amenity", "library"): "library",
    ("amenity", "clinic"): "medical",
    ("amenity", "doctors"): "medical",
    ("amenity", "hospital"): "medical",
    ("amenity", "pharmacy"): "medical",
    ("amenity", "dentist"): "medical",
    ("healthcare", "*"): "medical",
    ("amenity", "restaurant"): "food",
    ("amenity", "fast_food"): "food",
    ("amenity", "cafe"): "food",
    ("amenity", "canteen"): "food",
    ("amenity", "food_court"): "food",
    ("amenity", "ice_cream"): "food",
    ("amenity", "bar"): "food",
    ("amenity", "pub"): "food",
    ("amenity", "bank"): "bank",
    ("amenity", "atm"): "bank",
    ("amenity", "toilets"): "toilets",
    ("amenity", "place_of_worship"): "worship",
    ("amenity", "bus_station"): "bus",
    ("highway", "bus_stop"): "bus",
    ("amenity", "fuel"): "fuel",
    ("amenity", "post_office"): "post",
    ("amenity", "police"): "police",
    ("amenity", "community_centre"): "community",
    ("amenity", "social_facility"): "community",
    ("amenity", "marketplace"): "shop",
    ("shop", "*"): "shop",
    ("tourism", "hotel"): "lodging",
    ("tourism", "hostel"): "lodging",
    ("tourism", "guest_house"): "lodging",
    ("tourism", "motel"): "lodging",
    ("tourism", "apartment"): "lodging",
    ("tourism", "information"): "info",
}
# Tags that decide a thing is a place worth a symbol or a name on the map.
POI_KEYS = ("amenity", "shop", "tourism", "healthcare", "highway", "leisure", "office", "historic", "man_made")
# Things that are tagged but never worth a symbol (street furniture).
POI_IGNORE = {
    ("amenity", "bench"), ("amenity", "waste_basket"), ("amenity", "bicycle_parking"),
    ("amenity", "shelter"), ("amenity", "drinking_water"), ("amenity", "lighting"),
    ("amenity", "post_box"), ("amenity", "recycling"), ("amenity", "vending_machine"),
    ("highway", "crossing"), ("highway", "traffic_signals"), ("highway", "street_lamp"),
    ("highway", "turning_circle"), ("highway", "turning_loop"), ("highway", "give_way"),
    ("highway", "stop"), ("highway", "speed_camera"), ("highway", "milestone"),
}

LAYER_NAMES = (
    "landuse", "green", "water", "waterways", "sports", "parking",
    "roads", "paths", "buildings", "pois", "trees",
)

_cache_lock = threading.Lock()
_cache: dict = {"key": None, "payload": None, "version": None}


def poi_icon_for(tags: dict):
    """The icon for a tagged thing, or None. Looks at every tag."""
    for key in POI_KEYS:
        value = tags.get(key)
        if value is None or (key, value) in POI_IGNORE:
            continue
        icon = POI_ICONS.get((key, value)) or POI_ICONS.get((key, "*"))
        if icon:
            return icon
    return None


def _layer_for(tags: dict, closed: bool):
    """(layer, kind, is_polygon) for a way, or None when it is not drawn."""
    highway = tags.get("highway")
    if highway in ROAD_TYPES:
        return "roads", highway, False
    if highway in PATH_TYPES:
        return "paths", highway, False
    if "waterway" in tags:
        return "waterways", tags["waterway"], False
    if closed:
        if "building" in tags:
            return "buildings", tags["building"], True
        if tags.get("amenity") == "parking":
            return "parking", "parking", True
        if tags.get("leisure") in SPORTS_LEISURE:
            return "sports", tags["leisure"], True
        if tags.get("natural") == "water" or tags.get("landuse") == "reservoir":
            return "water", "water", True
        landuse = tags.get("landuse")
        natural = tags.get("natural")
        leisure = tags.get("leisure")
        if landuse in GREEN_LANDUSE or natural in GREEN_NATURAL or leisure in GREEN_LEISURE:
            return "green", landuse or natural or leisure, True
        if landuse:
            return "landuse", landuse, True
        if tags.get("amenity") in LANDUSE_AMENITY:
            return "landuse", tags["amenity"], True
    return None


def _centroid(coords):
    """
    Centre of mass of a closed ring of [lon, lat] (falls back to the average).
    Measured from the first corner: at real coordinates (33.41, -8.94) the
    sums lose their accuracy otherwise (metres off for a large building).
    """
    pts = coords[:-1] if len(coords) > 1 and coords[0] == coords[-1] else coords
    n = len(pts)
    ox, oy = pts[0]
    area2 = cx = cy = 0.0
    for i in range(n):
        x0, y0 = pts[i][0] - ox, pts[i][1] - oy
        x1, y1 = pts[(i + 1) % n][0] - ox, pts[(i + 1) % n][1] - oy
        cross = x0 * y1 - x1 * y0
        area2 += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(area2) < 1e-18:
        return [round(sum(p[0] for p in pts) / n, 6), round(sum(p[1] for p in pts) / n, 6)]
    return [round(ox + cx / (3 * area2), 6), round(oy + cy / (3 * area2), 6)]


def build_base_map(osm_path) -> dict:
    """Read map.osm and return {version, bounds, layers}."""
    nodes: dict[str, tuple[float, float]] = {}
    tagged_nodes = []  # (lon, lat, tags) for nodes that carry tags
    ways = []
    for _event, el in ET.iterparse(str(osm_path), events=("end",)):
        if el.tag == "node":
            try:
                lon = round(float(el.get("lon")), 6)
                lat = round(float(el.get("lat")), 6)
            except (TypeError, ValueError):
                el.clear()
                continue
            nodes[el.get("id")] = (lon, lat)
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            if tags:
                tagged_nodes.append((lon, lat, tags))
            el.clear()
        elif el.tag == "way":
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            refs = [nd.get("ref") for nd in el.findall("nd")]
            ways.append((el.get("id"), tags, refs))
            el.clear()

    layers = {name: [] for name in LAYER_NAMES}
    min_lon = min_lat = float("inf")
    max_lon = max_lat = float("-inf")

    def add_poi(lon, lat, tags):
        """A symbol and/or a name at a point. Unnamed things still get a symbol."""
        name = (tags.get("name") or "").strip()
        icon = poi_icon_for(tags)
        if icon is None and not name:
            return
        properties = {}
        if icon:
            properties["icon"] = icon
        if name:
            properties["name"] = name
        layers["pois"].append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
            }
        )

    for lon, lat, tags in tagged_nodes:
        if tags.get("natural") == "tree":
            layers["trees"].append(
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                }
            )
            continue
        add_poi(lon, lat, tags)

    for way_id, tags, refs in ways:
        coords = [list(nodes[r]) for r in refs if r in nodes]
        if len(coords) < 2:
            continue
        closed = len(refs) >= 4 and refs[0] == refs[-1]
        found = _layer_for(tags, closed)
        if found is None:
            continue
        layer, kind, is_polygon = found

        if is_polygon:
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            if len(coords) < 4:
                continue
            geometry = {"type": "Polygon", "coordinates": [coords]}
        else:
            geometry = {"type": "LineString", "coordinates": coords}

        properties = {"kind": kind}
        name = (tags.get("name") or "").strip()
        if name:
            properties["name"] = name
        layers[layer].append(
            {"type": "Feature", "properties": properties, "geometry": geometry}
        )

        # A building, car park or area that is also a place (library,
        # dispensary, parking...) gets its symbol at its centre, with its name
        # underneath. The polygon is marked `poi` so the app does not also
        # write the name on the shape itself.
        if is_polygon and layer in ("buildings", "parking", "sports", "landuse"):
            icon = poi_icon_for(tags)
            if icon:
                properties["poi"] = True
                lon, lat = _centroid(coords)
                poi = {"icon": icon}
                if name:
                    poi["name"] = name
                layers["pois"].append(
                    {
                        "type": "Feature",
                        "properties": poi,
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    }
                )

        for lon, lat in coords:
            min_lon, max_lon = min(min_lon, lon), max(max_lon, lon)
            min_lat, max_lat = min(min_lat, lat), max(max_lat, lat)

    collections = {
        name: {"type": "FeatureCollection", "features": feats}
        for name, feats in layers.items()
    }
    bounds = (
        [min_lon, min_lat, max_lon, max_lat] if min_lon != float("inf") else None
    )

    body = json.dumps(collections, sort_keys=True, separators=(",", ":"))
    version = hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]
    return {"version": version, "bounds": bounds, "layers": collections}


def get_base_map(osm_path=None):
    """
    The base map as (version, json_bytes), or None when map.osm is missing.
    Cached; rebuilt when the file changes.
    """
    path = Path(osm_path or MAP_OSM_PATH)
    if not path.exists():
        return None

    stat = path.stat()
    key = (str(path), stat.st_mtime_ns, stat.st_size)

    with _cache_lock:
        if _cache["key"] == key and _cache["payload"] is not None:
            return _cache["version"], _cache["payload"]

        data = build_base_map(path)
        payload = json.dumps(data, separators=(",", ":")).encode("utf-8")
        _cache.update(key=key, payload=payload, version=data["version"])
        logger.info(
            "Base map built from %s: version %s, %d KB",
            path.name, data["version"], len(payload) // 1024,
        )
        return data["version"], payload
