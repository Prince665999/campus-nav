"""
inspect_map_osm.py

Shows what the outdoor map will draw from map.osm, and which tagged things
have no symbol yet, so you know what to add or tag in JOSM.

Run from the repo root:

    python -m backend.pipeline.inspect_map_osm
    python -m backend.pipeline.inspect_map_osm --osm backend/data/map.osm

It only reads the file. Nothing is changed.
"""

import argparse
import math
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

from backend.api.services import basemap_service as bm

LAYER_LABELS = [
    ("landuse", "land use (campus, housing...)"),
    ("green", "grass, trees, parks"),
    ("water", "water"),
    ("waterways", "rivers and streams"),
    ("sports", "pitches and sports grounds"),
    ("parking", "parking areas"),
    ("roads", "roads"),
    ("paths", "footpaths and steps"),
    ("buildings", "buildings"),
    ("trees", "single trees"),
    ("pois", "symbols and names (points)"),
]


def tag_report(osm_path):
    """Every tagged thing with a place-like tag, grouped by key=value."""
    seen = Counter()
    named_points = []
    for _event, el in ET.iterparse(str(osm_path), events=("end",)):
        if el.tag in ("node", "way"):
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            for key in bm.POI_KEYS:
                value = tags.get(key)
                if value is not None:
                    seen[(key, value, el.tag)] += 1
            if el.tag == "node" and tags.get("name") and bm.poi_icon_for(tags) is None:
                named_points.append(tags["name"])
            el.clear()
    return seen, named_points


def main(argv=None):
    ap = argparse.ArgumentParser(description="Show what the outdoor map will draw.")
    ap.add_argument("--osm", default="backend/data/map.osm")
    args = ap.parse_args(argv)

    path = Path(args.osm)
    if not path.exists():
        print(f"Cannot find {path}. Use --osm to point at map.osm.")
        return 1

    data = bm.build_base_map(path)
    layers = data["layers"]
    print(f"\nFile: {path}  ({path.stat().st_size / 1024:.0f} KB)")
    if data["bounds"]:
        lon0, lat0, lon1, lat1 = data["bounds"]
        h = (lat1 - lat0) * 110540
        w = (lon1 - lon0) * 111320 * math.cos(math.radians((lat0 + lat1) / 2))
        print(f"Area covered: about {w:.0f} m x {h:.0f} m")

    print("\nWhat the map will draw")
    print(f"  {'layer':<34}{'drawn':>7}{'named':>8}")
    for key, label in LAYER_LABELS:
        feats = layers[key]["features"]
        named = sum(1 for f in feats if f["properties"].get("name"))
        print(f"  {label:<34}{len(feats):>7}{named:>8}")

    icons = Counter(f["properties"].get("icon") for f in layers["pois"]["features"])
    if icons:
        print("\nSymbols that will show")
        for icon, n in icons.most_common():
            print(f"  {icon or '(name only, no symbol)':<26}{n}")

    seen, named_points = tag_report(path)
    no_symbol = {
        (k, v, kind): n for (k, v, kind), n in seen.items()
        if (k, v) not in bm.POI_ICONS and (k, "*") not in bm.POI_ICONS
        and (k, v) not in bm.POI_IGNORE
        and not (k == "leisure" and v in bm.SPORTS_LEISURE | bm.GREEN_LEISURE)
        and not (k == "amenity" and v in bm.LANDUSE_AMENITY)
        and not (k == "highway")
    }
    if no_symbol:
        print("\nTagged in your file but with NO symbol yet (tell me if you want one)")
        for (k, v, kind), n in sorted(no_symbol.items()):
            print(f"  {k}={v:<24} {n} x {kind}")
    if named_points:
        print(f"\nNamed points shown as a name only: {', '.join(sorted(set(named_points))[:12])}"
              + (" ..." if len(set(named_points)) > 12 else ""))

    print("\nWhat this means")
    if not layers["landuse"]["features"]:
        print("  - No campus area. Draw a closed way around the campus tagged landuse=education"
              " to get the pale yellow ground.")
    if not layers["parking"]["features"] and icons.get("parking", 0) == 0:
        print("  - No parking. Tag car parks amenity=parking (a closed way, or a single point).")
    if not layers["buildings"]["features"]:
        print("  - No buildings found.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
