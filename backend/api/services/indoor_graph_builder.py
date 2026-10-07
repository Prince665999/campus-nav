"""
indoor_graph_builder.py

Builds an enriched routing graph that contains both indoor and
outdoor nodes, so a single A* run can route across the two worlds.

Reads:
  - final.osm (indoor) via the frozen indoor engine.
  - map.osm   (outdoor) via the outdoor engine.

Produces (in memory):
  - nodes: dict of node_id -> {"lat", "lon", "tags"}
    Indoor node ids are as-is from final.osm.
    Outdoor node ids are prefixed with "o" so they can never collide
    with indoor ids.
  - graph: dict of node_id -> [(neighbor_id, distance_m, edge_info)]
    Combines the indoor graph from the frozen engine with outdoor
    walkable edges and synthetic "connector" edges between indoor
    entrances and nearby outdoor nodes.
  - door_node_ids, corridor_of_door, stair_ways: taken straight from
    the frozen indoor engine's build_graph.
  - entrance_to_outdoor: dict mapping indoor entrance node id ->
    outdoor node id (the link the builder created).

Cached in memory after first build. Call reset() to force a rebuild
(used by tests and by admin actions that change the maps).
"""

import logging
import threading
from pathlib import Path

from backend.api.settings import INDOOR_OSM_PATH, MAP_OSM_PATH
from backend.core import campus_graph as outdoor_graph
from backend.core.indoor import campus_graph as indoor_graph

logger = logging.getLogger(__name__)

_lock = threading.Lock()

# The enriched graph is a tuple of everything the composer and the
# indoor engine need.
_built = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_indoor_graph():
    """
    Return the enriched indoor+outdoor graph bundle. Builds on first
    call, caches forever after.

    Returns a dict with keys:
      nodes, graph, edge_tags, door_node_ids, entrance_node_ids,
      corridor_of_door, rooms, stair_ways,
      entrance_to_outdoor (dict of indoor_entrance_id -> outdoor_node_id),
      outdoor_node_ids (set)
    """
    global _built
    if _built is not None:
        return _built

    with _lock:
        if _built is not None:
            return _built
        _built = _build()
        return _built


def reset():
    """Force the next get_indoor_graph() to rebuild."""
    global _built
    with _lock:
        _built = None


def is_indoor_node(node_id, bundle=None) -> bool:
    """True if the node id came from the indoor map (no 'o' prefix)."""
    if bundle is None:
        bundle = get_indoor_graph()
    if not isinstance(node_id, str):
        node_id = str(node_id)
    return node_id in bundle["nodes"] and not node_id.startswith("o")


def is_outdoor_node(node_id, bundle=None) -> bool:
    """True if the node id came from the outdoor map ('o' prefix)."""
    if bundle is None:
        bundle = get_indoor_graph()
    if not isinstance(node_id, str):
        node_id = str(node_id)
    return node_id.startswith("o") and node_id in bundle["nodes"]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def _build():
    """Read both maps, merge, link. Returns the bundle dict."""
    indoor_path = Path(INDOOR_OSM_PATH)
    outdoor_path = Path(MAP_OSM_PATH)

    if not indoor_path.exists():
        raise FileNotFoundError(f"indoor map not found at {indoor_path}")
    if not outdoor_path.exists():
        raise FileNotFoundError(f"outdoor map not found at {outdoor_path}")

    logger.info("Building indoor graph from %s", indoor_path)
    indoor_nodes, indoor_ways = indoor_graph.parse_osm(str(indoor_path))
    (
        graph,
        edge_tags,
        door_node_ids,
        entrance_node_ids,
        corridor_of_door,
        rooms,
        stair_ways,
    ) = indoor_graph.build_graph(indoor_nodes, indoor_ways)

    # The frozen engine's `nodes` dict is what we'll extend with
    # outdoor nodes. Keep the indoor node tags as they are.
    nodes = indoor_nodes

    logger.info("Reading outdoor map %s", outdoor_path)
    outdoor_nodes_raw, outdoor_ways = outdoor_graph.parse_osm(str(outdoor_path))
    outdoor_walkable_ids, outdoor_edges = _extract_outdoor_walkable(
        outdoor_nodes_raw, outdoor_ways
    )

    # Add outdoor nodes to the merged `nodes` dict, prefixed with "o".
    for oid in outdoor_walkable_ids:
        node = outdoor_nodes_raw[oid]
        nodes["o" + oid] = {
            "lat": node["lat"],
            "lon": node["lon"],
            "tags": node["tags"],
        }

    # Add outdoor edges to the merged graph, prefixed on both ends.
    for a, b, distance, tags in outdoor_edges:
        edge_info = {
            "kind": "walk",
            "level": "0",
            "way_tags": tags,
            "outdoor": True,
        }
        graph.setdefault("o" + a, []).append(("o" + b, distance, edge_info))
        graph.setdefault("o" + b, []).append(("o" + a, distance, edge_info))
        edge_tags[frozenset(("o" + a, "o" + b))] = tags

    # Link indoor entrances to nearest outdoor nodes.
    entrance_to_outdoor = _link_entrances(
        indoor_ways, nodes, graph, edge_tags, outdoor_walkable_ids,
        outdoor_nodes_raw,
    )

    logger.info(
        "Indoor graph built: %d total nodes, %d outdoor nodes, %d entrances linked",
        len(nodes),
        len(outdoor_walkable_ids),
        len(entrance_to_outdoor),
    )

    return {
        "nodes": nodes,
        "graph": graph,
        "edge_tags": edge_tags,
        "door_node_ids": door_node_ids,
        "entrance_node_ids": entrance_node_ids,
        "corridor_of_door": corridor_of_door,
        "rooms": rooms,
        "stair_ways": stair_ways,
        "entrance_to_outdoor": entrance_to_outdoor,
        "outdoor_node_ids": {"o" + oid for oid in outdoor_walkable_ids},
        "indoor_node_ids": set(indoor_nodes.keys()),
    }


# ---------------------------------------------------------------------------
# Outdoor extraction
# ---------------------------------------------------------------------------

# Highway types we treat as walkable outdoors. Matches the outdoor
# engine's own set (footway, path, pedestrian, etc.).
_OUTDOOR_WALKABLE_HIGHWAYS = {
    "footway",
    "path",
    "pedestrian",
    "steps",
    "track",
    "living_street",
    "service",
}

# Highway types we deliberately skip even if they're not in the skip
# list, because they're not walkable.
_OUTDOOR_SKIP_HIGHWAYS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "construction",
    "proposed",
    "raceway",
}


def _extract_outdoor_walkable(nodes, ways):
    """
    Walk the outdoor ways, keep only walkable ones, and return:
      walkable_node_ids: set of OSM ids that appear on a walkable way
      edges: list of (a, b, distance_m, tags)
    """
    walkable_ids = set()
    edges = []

    for way in ways:
        tags = way.get("tags", {})
        hw = tags.get("highway")
        if not hw:
            continue
        if hw in _OUTDOOR_SKIP_HIGHWAYS:
            continue
        if hw not in _OUTDOOR_WALKABLE_HIGHWAYS:
            continue
        if tags.get("foot") == "no":
            continue
        if tags.get("access") in ("private", "no"):
            continue

        refs = way.get("refs", [])
        for i in range(len(refs) - 1):
            a, b = refs[i], refs[i + 1]
            if a not in nodes or b not in nodes:
                continue
            distance = outdoor_graph.haversine_m(
                nodes[a]["lat"], nodes[a]["lon"],
                nodes[b]["lat"], nodes[b]["lon"],
            )
            edges.append((a, b, distance, tags))
            walkable_ids.add(a)
            walkable_ids.add(b)

    return walkable_ids, edges


# ---------------------------------------------------------------------------
# Entrance linking
# ---------------------------------------------------------------------------

# A connector's outdoor end must be within this many metres of an
# outdoor walkable node for the link to be made. If it's further,
# something is misaligned and we skip rather than guess.
CONNECTOR_SNAP_TOLERANCE_M = 5.0


def _link_entrances(
    indoor_ways, nodes, graph, edge_tags, outdoor_walkable_ids, outdoor_nodes_raw
):
    """
    Walk the indoor ways looking for `indoor=connector`. For each:

      - One end is an entrance node (has an `entrance` tag).
      - The other end is a placeholder sitting at (or near) an outdoor
        node's coordinates.

    Snap the outdoor end to the nearest outdoor walkable node within
    CONNECTOR_SNAP_TOLERANCE_M and add a synthetic edge between the
    entrance node and that outdoor node.

    Returns a dict: indoor_entrance_id -> outdoor_node_id (prefixed "o").
    """
    entrance_to_outdoor = {}

    for way in indoor_ways:
        tags = way.get("tags", {})
        if tags.get("indoor") != "connector":
            continue

        refs = way.get("refs", [])
        if len(refs) < 2:
            continue

        # Look at both ends. Whichever is tagged as an entrance is
        # the indoor side; the other is the outdoor attachment point.
        a, b = refs[0], refs[-1]

        a_is_entrance = (
            a in nodes and bool(nodes[a]["tags"].get("entrance"))
        )
        b_is_entrance = (
            b in nodes and bool(nodes[b]["tags"].get("entrance"))
        )

        if a_is_entrance and not b_is_entrance:
            entrance_id, attach_id = a, b
        elif b_is_entrance and not a_is_entrance:
            entrance_id, attach_id = b, a
        else:
            # Neither or both tagged. Skip with a warning — the data
            # needs attention.
            logger.warning(
                "Connector way %s has %s entrance-tagged ends; skipping",
                way.get("id"),
                "two" if a_is_entrance else "no",
            )
            continue

        if attach_id not in nodes:
            logger.warning(
                "Connector way %s references missing node %s",
                way.get("id"), attach_id,
            )
            continue

        attach = nodes[attach_id]
        nearest = _nearest_outdoor_node(
            attach["lat"], attach["lon"],
            outdoor_walkable_ids, outdoor_nodes_raw,
            CONNECTOR_SNAP_TOLERANCE_M,
        )

        if nearest is None:
            logger.warning(
                "Connector way %s: no outdoor node within %.0fm of "
                "(%.5f, %.5f). Is the connector's far end positioned "
                "correctly?",
                way.get("id"),
                CONNECTOR_SNAP_TOLERANCE_M,
                attach["lat"], attach["lon"],
            )
            continue

        outdoor_node_id = "o" + nearest
        distance = outdoor_graph.haversine_m(
            attach["lat"], attach["lon"],
            outdoor_nodes_raw[nearest]["lat"],
            outdoor_nodes_raw[nearest]["lon"],
        )

        # Synthetic edge in both directions.
        edge_info_out = {
            "kind": "walk",
            "level": "0",
            "way_tags": {"highway": "footway", "indoor": "connector"},
            "connector": True,
        }
        edge_info_in = dict(edge_info_out)

        graph.setdefault(entrance_id, []).append(
            (outdoor_node_id, distance, edge_info_out)
        )
        graph.setdefault(outdoor_node_id, []).append(
            (entrance_id, distance, edge_info_in)
        )
        edge_tags[frozenset((entrance_id, outdoor_node_id))] = (
            edge_info_out["way_tags"]
        )

        entrance_to_outdoor[entrance_id] = outdoor_node_id
        logger.info(
            "Linked entrance %s -> outdoor node %s (%.1fm)",
            entrance_id, nearest, distance,
        )

    return entrance_to_outdoor


def _nearest_outdoor_node(lat, lon, candidates, outdoor_nodes_raw, max_distance_m):
    """Return the nearest candidate OSM id within max_distance_m, or None."""
    best_id = None
    best_dist = float("inf")
    for oid in candidates:
        node = outdoor_nodes_raw.get(oid)
        if node is None:
            continue
        d = outdoor_graph.haversine_m(lat, lon, node["lat"], node["lon"])
        if d < best_dist:
            best_dist = d
            best_id = oid
    if best_id is None or best_dist > max_distance_m:
        return None
    return best_id