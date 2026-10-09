"""
route_composer.py

Decides which engine handles a route request.

  - Both endpoints outdoor    →  outdoor engine (routing_service).
  - Any endpoint indoor       →  indoor engine on the merged graph.
  - GPS start → indoor dest   →  indoor engine on the merged graph,
                                 after snapping the GPS fix to the
                                 nearest outdoor node.

The composer is the only place in the codebase that knows both
engines exist. Everything downstream — the API, the mobile app —
sees a single route response.

For mixed routes, each step carries a `mode` field ("outdoor" or
"indoor") so the client can switch rendering behavior at the
boundary.

Step distances on mixed routes
------------------------------
The outdoor engine provides real `at_m` values per step. The indoor
engine does not — it labels steps by node_id only.

For a MIXED route (which always goes through the indoor engine,
because at least one endpoint is indoor), we cannot leave `at_m`
at 0 for every step, or the phone's currentStepIndex() would fall
through its loop and jump straight to the last step ("You have
arrived"). So `_annotate_steps_and_legs` computes real cumulative
distances along the path for every step, outdoor and indoor.

Levels are stored on the *edges* in the OSM data. Corridor and walk
edges carry a single level like "0" or "-1". Stairs edges carry a
semicolon list like "0;1" or "-1;0;1", ordered bottom-to-top. See
_enrich_indoor_steps for how levels are tracked.
"""

import logging
import math

from sqlalchemy.orm import Session

from backend.api.models.place import Place

from . import indoor_graph_builder

logger = logging.getLogger(__name__)


class RouteCompositionError(Exception):
    """Raised when the request can't be routed by either engine."""


class UnreliableLocationError(Exception):
    """
    Raised when a live GPS fix can't be confidently snapped to the
    walkable network. The route endpoint catches this and returns a
    422 with a distinct error code so the client can show a specific
    message.
    """
    pass


# Same as routing_service.SNAP_MAX_DISTANCE_M — kept here so the
# composer and the outdoor engine agree on what counts as "too far".
SNAP_MAX_DISTANCE_M = 40


# ---------------------------------------------------------------------------
# Endpoint resolution
# ---------------------------------------------------------------------------

def _lookup_place(session: Session, place_id: int) -> Place:
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        raise RouteCompositionError(f"Place {place_id} not found")
    return place


def _classify_endpoint(place: Place) -> dict:
    """Return a dict describing how to hand a place endpoint to the engine."""
    kind = (place.kind or "outdoor").lower()
    if kind == "indoor":
        return {
            "engine": "indoor",
            "place_id": place.id,
            "kind": "indoor",
            "node_id": place.osm_id,
            "osm_id": place.osm_id,
            "name": place.name,
        }
    else:
        return {
            "engine": "outdoor",
            "place_id": place.id,
            "kind": "outdoor",
            "node_id": "o" + place.osm_id,
            "osm_id": place.osm_id,
            "name": place.name,
        }


def _haversine_m(lat1, lon1, lat2, lon2):
    """Local copy so we don't have to import the outdoor engine."""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    )
    return 2 * R * math.asin(math.sqrt(a))


def _resolve_coord_start(
    lat: float,
    lon: float,
    bundle: dict,
    *,
    is_live_fix: bool,
    accuracy_m: float | None = None,
) -> tuple[str | None, str]:
    """
    Snap a GPS fix to the nearest outdoor node on the merged graph.

    Returns (node_id_or_None, display_name). node_id is prefixed with
    "o" (the outdoor prefix on the merged graph).

    If is_live_fix is True and the nearest outdoor node is farther
    than SNAP_MAX_DISTANCE_M, returns (None, ...). The caller turns
    that into an UnreliableLocationError — same as the outdoor
    engine does.
    """
    nodes = bundle["nodes"]
    outdoor_node_ids = bundle["outdoor_node_ids"]

    if is_live_fix and accuracy_m is not None:
        logger.info(
            "Composer: routing from live fix at (%.5f, %.5f) accuracy %.1fm",
            lat, lon, accuracy_m,
        )

    best_id = None
    best_dist = float("inf")

    # Only search outdoor nodes. Indoor GPS is unreliable; the student
    # is outdoors, so their fix should snap to an outdoor node.
    for nid in outdoor_node_ids:
        node = nodes.get(nid)
        if node is None:
            continue
        d = _haversine_m(lat, lon, node["lat"], node["lon"])
        if d < best_dist:
            best_dist = d
            best_id = nid

    if best_id is None:
        return None, "your current location"

    if is_live_fix and best_dist > SNAP_MAX_DISTANCE_M:
        logger.info(
            "Composer: nearest outdoor node is %.1fm away — too far for a "
            "live fix (limit %dm)",
            best_dist, SNAP_MAX_DISTANCE_M,
        )
        return None, "your current location"

    return best_id, "your current location"


# ---------------------------------------------------------------------------
# Composer
# ---------------------------------------------------------------------------

def compose_route(
    session: Session,
    graph,
    nodes,
    edge_tags,
    *,
    from_place_id: int | None = None,
    from_lat: float | None = None,
    from_lon: float | None = None,
    from_accuracy_m: float | None = None,
    to_place_id: int | None = None,
    to_lat: float | None = None,
    to_lon: float | None = None,
):
    """
    Return a route response. Decides which engine to use.

    Handles four cases:
      1. Outdoor place → outdoor place: outdoor engine.
      2. GPS → outdoor place: outdoor engine (unchanged path).
      3. Place → indoor place, or indoor place → place: indoor engine.
      4. GPS → indoor place: indoor engine, after snapping GPS to a
         nearby outdoor node on the merged graph.
    """
    from_place = None
    if from_place_id is not None:
        from_place = _lookup_place(session, from_place_id)

    to_place = None
    if to_place_id is not None:
        to_place = _lookup_place(session, to_place_id)

    from_kind = from_place.kind if from_place else None
    to_kind = to_place.kind if to_place else None

    from_is_outdoor = (
        from_kind == "outdoor"
        or (from_place is None and from_lat is not None)
    )
    to_is_outdoor = (
        to_kind == "outdoor"
        or (to_place is None and to_lat is not None)
    )

    if from_is_outdoor and to_is_outdoor:
        return _route_via_outdoor_engine(
            session, graph, nodes, edge_tags,
            from_place_id=from_place_id,
            from_lat=from_lat,
            from_lon=from_lon,
            from_accuracy_m=from_accuracy_m,
            to_place_id=to_place_id,
            to_lat=to_lat,
            to_lon=to_lon,
        )

    # At least one endpoint is indoor. Route on the merged graph.
    bundle = indoor_graph_builder.get_indoor_graph()

    # Resolve the from endpoint.
    if from_place is not None:
        from_ep = _classify_endpoint(from_place)
    elif from_lat is not None and from_lon is not None:
        node_id, display_name = _resolve_coord_start(
            from_lat, from_lon, bundle,
            is_live_fix=True,
            accuracy_m=from_accuracy_m,
        )
        if node_id is None:
            raise UnreliableLocationError()
        from_ep = {
            "engine": "indoor",  # the merged engine handles both
            "place_id": None,
            "kind": "outdoor",
            "node_id": node_id,
            "osm_id": node_id[1:] if node_id.startswith("o") else node_id,
            "name": display_name,
        }
    else:
        raise RouteCompositionError(
            "Either from_place_id or from_lat/from_lon is required."
        )

    # Resolve the to endpoint.
    if to_place is not None:
        to_ep = _classify_endpoint(to_place)
    else:
        raise RouteCompositionError(
            "Mixed routes currently require the destination to be a "
            "named place."
        )

    return _route_via_indoor_engine(from_ep, to_ep)


# ---------------------------------------------------------------------------
# Outdoor engine path — the "same as before" branch
# ---------------------------------------------------------------------------

def _route_via_outdoor_engine(
    session, graph, nodes, edge_tags,
    *, from_place_id, from_lat, from_lon, from_accuracy_m,
    to_place_id, to_lat, to_lon,
):
    """
    Delegate to the existing outdoor routing_service. Same function
    the API used before the composer existed.

    The returned RouteResponse is annotated with mode="outdoor" on
    each step and a single leg spanning the whole route.
    """
    from . import routing_service
    from ..schemas.route import RouteLeg

    route = routing_service.compute_route(
        session, graph, nodes, edge_tags,
        from_place_id=from_place_id,
        from_lat=from_lat,
        from_lon=from_lon,
        from_accuracy_m=from_accuracy_m,
        to_place_id=to_place_id,
        to_lat=to_lat,
        to_lon=to_lon,
    )
    if route is None:
        return None

    for step in route.steps:
        step.mode = "outdoor"

    route.legs = [
        RouteLeg(
            mode="outdoor",
            from_m=0.0,
            to_m=route.distance_m,
            distance_m=route.distance_m,
            from_name=route.from_name,
            to_name=route.to_name,
        )
    ]
    return route


# ---------------------------------------------------------------------------
# Indoor engine path — the new branch
# ---------------------------------------------------------------------------

def _route_via_indoor_engine(from_ep, to_ep):
    """
    Route from_ep["node_id"] to to_ep["node_id"] on the enriched graph.
    Returns a dict-shaped route (not a RouteResponse object) with the
    same keys the API returns, plus a `legs` array.
    """
    bundle = indoor_graph_builder.get_indoor_graph()

    nodes = bundle["nodes"]
    graph = bundle["graph"]
    door_node_ids = bundle["door_node_ids"]
    corridor_of_door = bundle["corridor_of_door"]
    indoor_node_ids = bundle["indoor_node_ids"]

    from_id = from_ep["node_id"]
    to_id = to_ep["node_id"]

    if from_id not in graph:
        raise RouteCompositionError(
            f"'{from_ep['name']}' is not connected to the walkable network."
        )
    if to_id not in graph:
        raise RouteCompositionError(
            f"'{to_ep['name']}' is not connected to the walkable network."
        )

    from backend.core.indoor.campus_graph import (
        a_star,
        generate_turn_by_turn,
        total_distance_m,
    )

    path, distance = a_star(graph, nodes, from_id, to_id)
    if not path:
        raise RouteCompositionError(
            "No route found between those two points."
        )

    steps = generate_turn_by_turn(
        path, nodes, graph, door_node_ids, corridor_of_door
    )
    total = total_distance_m(path, nodes)

    start_is_outdoor = from_id not in indoor_node_ids
    steps = _fix_opening_line(
        steps,
        start_is_outdoor=start_is_outdoor,
        start_name=from_ep["name"],
    )

    annotated_steps, legs = _annotate_steps_and_legs(
        steps, path, nodes, indoor_node_ids, from_ep, to_ep, total
    )

    # Fill in geometry_index, level, and building_name on each step.
    _enrich_indoor_steps(annotated_steps, path, nodes, graph)

    geometry = [
        {"lat": nodes[nid]["lat"], "lon": nodes[nid]["lon"]}
        for nid in path
    ]

    return {
        "distance_m": total,
        "steps": annotated_steps,
        "geometry": geometry,
        "profile": "fastest",
        "from_name": from_ep["name"],
        "to_name": to_ep["name"],
        "legs": legs,
    }


def _fix_opening_line(steps, start_is_outdoor, start_name):
    """Strip 'on the ground floor' from the opening if the start is outdoor."""
    if not start_is_outdoor or not steps:
        return steps

    opening = (
        f"Starting from {start_name}"
        if start_name
        else "From your current position"
    )

    fixed = list(steps)
    fixed[0] = {**fixed[0], "instruction": opening}
    return fixed


def _annotate_steps_and_legs(
    steps, path, nodes, indoor_node_ids, from_ep, to_ep, total
):
    """
    Give every step a mode, a real at_m, and a real distance_m.

    The at_m values are cumulative distances along the path. Each
    step's node_id is matched to a position in the path, and the
    step's at_m is that node's cumulative distance. Steps whose node
    isn't in the path (shouldn't happen) inherit the previous step's
    at_m.

    Why real at_m matters: the mobile app's currentStepIndex() picks
    the current step by comparing distanceFromStartM to each step's
    at_m. If every at_m is 0, the comparison never matches and the
    function returns the last step — "You have arrived".

    The pointer `ptr` advances monotonically, so repeated node ids in
    the path (which happen when a step's instruction is generated
    from a mid-way node) map to the correct position.
    """
    # Cumulative distance along the path.
    cum = [0.0]
    for a, b in zip(path, path[1:]):
        cum.append(
            cum[-1]
            + _haversine_m(
                nodes[a]["lat"], nodes[a]["lon"],
                nodes[b]["lat"], nodes[b]["lon"],
            )
        )

    modes = []
    at_ms = []
    last_mode = "outdoor"
    last_at = 0.0
    ptr = 0

    for step in steps:
        nid = step.get("node_id") or ""
        if nid:
            last_mode = "outdoor" if nid.startswith("o") else "indoor"
            # Move forward until we find this node. We never go
            # backwards, so repeated nodes map in order.
            while ptr < len(path) and path[ptr] != nid:
                ptr += 1
            if ptr < len(path):
                last_at = max(last_at, cum[ptr])
            else:
                # Node not found — likely a duplicate later in the
                # path. Reset and search again from the start.
                ptr = 0
        modes.append(last_mode)
        at_ms.append(last_at)

    annotated = []
    for i, (step, mode) in enumerate(zip(steps, modes)):
        next_at = at_ms[i + 1] if i + 1 < len(at_ms) else total
        annotated.append({
            "kind": _kind_for_step(step, mode),
            "instruction": step["instruction"],
            "at_m": round(at_ms[i], 1),
            "distance_m": round(max(0.0, next_at - at_ms[i]), 1),
            "mode": mode,
        })

    # Build legs from real boundaries.
    legs = []
    start = 0
    for i in range(1, len(annotated) + 1):
        at_end = i == len(annotated)
        mode_changed = (
            not at_end
            and annotated[i]["mode"] != annotated[start]["mode"]
        )
        if at_end or mode_changed:
            from_m = annotated[start]["at_m"]
            to_m = annotated[i]["at_m"] if i < len(annotated) else total
            legs.append({
                "mode": annotated[start]["mode"],
                "from_m": from_m,
                "to_m": to_m,
                "distance_m": max(0.0, to_m - from_m),
                "from_name": from_ep["name"] if start == 0 else None,
                "to_name": to_ep["name"] if at_end else None,
            })
            start = i

    return annotated, legs


def _kind_for_step(step, mode):
    """Best-effort classification of a step for the `kind` field."""
    instr = (step.get("instruction") or "").lower()
    if instr.startswith("you have arrived"):
        return "arrive"
    if instr.startswith("starting from") or instr.startswith("from your"):
        return "start"
    if "turn " in instr or "turn around" in instr:
        return "turn"
    if "stairs" in instr:
        return "stairs"
    return "walk"


# ---------------------------------------------------------------------------
# Indoor step enrichment — geometry index, level, building name
# ---------------------------------------------------------------------------

def _edge_level_for_step(from_nid, to_nid, current_level, graph):
    """
    Return the level the walker arrives on after crossing the edge
    from_nid -> to_nid.

    - Corridor / walk edges: single level. Return it.
    - Stairs edges: semicolon list like "0;1" or "-1;0;1", bottom-to-top.
      Work out which way the walker is going from their current level.
    - No level on the edge, or no such edge: return None. Caller keeps
      the previous level.
    """
    edge_info = None
    for nb, _d, info in graph.get(from_nid, []):
        if nb == to_nid:
            edge_info = info
            break

    if edge_info is None:
        return None

    way_tags = edge_info.get("way_tags") or {}
    edge_level_raw = way_tags.get("level")
    if edge_level_raw is None:
        return None

    levels = [p.strip() for p in str(edge_level_raw).split(";") if p.strip()]
    if not levels:
        return None

    is_stairs = edge_info.get("kind") == "stairs"

    if not is_stairs:
        return levels[0]

    if len(levels) == 1:
        return levels[0]

    if current_level is None:
        return levels[-1]

    if current_level not in levels:
        return levels[-1]

    idx = levels.index(current_level)
    if idx == 0:
        return levels[1]
    if idx == len(levels) - 1:
        return levels[-2]
    return levels[idx + 1]


def _enrich_indoor_steps(annotated_steps, path, nodes, graph):
    """
    Mutate each step in place, adding geometry_index, level, and
    building_name for indoor steps.

    Level tracking is edge-based and simple:

      1. Start with current_level = None.
      2. For each step i (i > 0), look at the edge between path[i-1]
         and path[i].
      3. If the edge exists and carries a level, update current_level.
      4. If the edge has no level, hold the previous current_level.
      5. The node's own `level` tag is never consulted — the edge is
         authoritative.
      6. If current_level is still None at the first indoor node,
         default it to "0".

    Then assign level_at[i] and building_at[i] to each path node, and
    pair them up with the indoor step list in order.
    """
    level_at = [None] * len(path)
    building_at = [None] * len(path)

    current_level = None
    current_building = None

    for i, nid in enumerate(path):
        node_tags = nodes.get(nid, {}).get("tags", {}) or {}

        node_building = node_tags.get("building_name")
        if node_building:
            current_building = node_building.strip()

        if i > 0:
            prev_nid = path[i - 1]
            edge_level = _edge_level_for_step(
                prev_nid, nid, current_level, graph
            )
            if edge_level is not None:
                current_level = edge_level

        if current_level is None and not nid.startswith("o"):
            current_level = "0"

        level_at[i] = current_level
        building_at[i] = current_building

    # Pair indoor steps with indoor path nodes, in order.
    indoor_path_indices = [
        i for i, nid in enumerate(path) if not nid.startswith("o")
    ]
    indoor_step_indices = [
        i for i, s in enumerate(annotated_steps)
        if s.get("mode") == "indoor"
    ]

    for step_pos, path_i in zip(indoor_step_indices, indoor_path_indices):
        step = annotated_steps[step_pos]
        step["geometry_index"] = path_i
        step["level"] = level_at[path_i] or "0"
        step["building_name"] = building_at[path_i]

    # Safety net: any indoor step that didn't get paired still gets
    # the first indoor node's data.
    if indoor_path_indices:
        first_path_i = indoor_path_indices[0]
        fallback_level = level_at[first_path_i] or "0"
        fallback_building = building_at[first_path_i]
        for step in annotated_steps:
            if step.get("mode") != "indoor":
                continue
            if step.get("geometry_index") is None:
                step["geometry_index"] = first_path_i
                step["level"] = fallback_level
                step["building_name"] = fallback_building