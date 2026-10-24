"""
inspect_map_osm.py

Tells you what is inside map.osm, so you can see whether it holds enough to
draw the whole outdoor map yourself (roads, paths, buildings, grass, water,
names) or only the routing paths and named places.

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

# What a base map needs, and the tag that says a way belongs to it.
ROAD_TYPES = {"motorway", "trunk", "primary", "secondary", "tertiary",
              "unclassified", "residential", "service", "living_street", "track"}
PATH_TYPES = {"footway", "path", "pedestrian", "steps", "cycleway", "corridor"}


def read(osm_path):
    nodes, ways = {}, []
    for _event, el in ET.iterparse(str(osm_path), events=("end",)):
        if el.tag == "node":
            nodes[el.get("id")] = (float(el.get("lat")), float(el.get("lon")))
            el.clear()
        elif el.tag == "way":
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            refs = [nd.get("ref") for nd in el.findall("nd")]
            ways.append((tags, refs))
            el.clear()
    return nodes, ways


def classify(tags):
    """Which base-map layer a way would be drawn in, or None."""
    highway = tags.get("highway")
    if highway in ROAD_TYPES:
        return "roads"
    if highway in PATH_TYPES:
        return "paths"
    if "building" in tags:
        return "buildings"
    if tags.get("natural") == "water" or "waterway" in tags or tags.get("landuse") == "reservoir":
        return "water"
    if tags.get("landuse") in {"grass", "forest", "meadow", "recreation_ground",
                               "village_green", "farmland", "orchard", "cemetery"} \
            or tags.get("natural") in {"wood", "scrub", "grassland", "heath"} \
            or tags.get("leisure") in {"park", "garden", "pitch", "playground",
                                       "sports_centre", "stadium"}:
        return "green / sports"
    if "landuse" in tags:
        return "other land use"
    if "barrier" in tags:
        return "walls / fences"
    return None


def main(argv=None):
    ap = argparse.ArgumentParser(description="Show what map.osm contains.")
    ap.add_argument("--osm", default="backend/data/map.osm")
    args = ap.parse_args(argv)

    path = Path(args.osm)
    if not path.exists():
        print(f"Cannot find {path}. Use --osm to point at map.osm.")
        return 1

    nodes, ways = read(path)
    layers = Counter()
    named = Counter()
    highway_kinds = Counter()
    unclassified = 0
    for tags, _refs in ways:
        layer = classify(tags)
        if layer is None:
            unclassified += 1
            continue
        layers[layer] += 1
        if tags.get("name"):
            named[layer] += 1
        if "highway" in tags:
            highway_kinds[tags["highway"]] += 1

    lats = [p[0] for p in nodes.values()]
    lons = [p[1] for p in nodes.values()]
    print(f"\nFile: {path}  ({path.stat().st_size / 1024:.0f} KB)")
    print(f"Nodes: {len(nodes)}   Ways: {len(ways)}")
    if lats:
        h = (max(lats) - min(lats)) * 110540
        w = (max(lons) - min(lons)) * 111320 * math.cos(math.radians(sum(lats) / len(lats)))
        print(f"Area covered: about {w:.0f} m x {h:.0f} m")

    print("\nWhat could be drawn on a base map")
    print(f"  {'layer':<18}{'ways':>7}{'named':>8}")
    for layer in ["roads", "paths", "buildings", "green / sports", "water",
                  "other land use", "walls / fences"]:
        print(f"  {layer:<18}{layers[layer]:>7}{named[layer]:>8}")
    print(f"  (ways not in any of these: {unclassified})")
    if highway_kinds:
        print("\n  highway types: " + ", ".join(f"{k} {v}" for k, v in highway_kinds.most_common()))

    print("\nWhat this means")
    if layers["buildings"] == 0:
        print("  - No buildings. A base map would need you to draw the building outlines.")
    elif layers["buildings"] < 5:
        print(f"  - Only {layers['buildings']} buildings. Likely not every building is drawn.")
    else:
        print(f"  - {layers['buildings']} buildings: enough to draw them on the map.")
    if layers["roads"] == 0:
        print("  - No roads, only paths. Roads and parking would be missing from the map.")
    else:
        print(f"  - {layers['roads']} roads: they can be drawn.")
    if layers["green / sports"] + layers["water"] == 0:
        print("  - No grass, trees or water areas. The map would be plain between paths and buildings.")
    else:
        print(f"  - {layers['green / sports']} green areas and {layers['water']} water areas can be drawn.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
