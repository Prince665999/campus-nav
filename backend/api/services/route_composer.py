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

Step geometry_index
-------------------
Each step carries a `geometry_index` field — the position in the
route's `geometry` array where that step's node sits. The mobile
app uses it to place the blue dot when a student taps "Next step"
in indoor mode.

The index is captured in _annotate_steps_and_legs, where the code
already walks the path to find each step's node_id. Before this,
_enrich_indoor_steps paired the Nth indoor *step* with the Nth
indoor *path node*. Those are not the same thing: the indoor engine
merges short moves into fewer instructions, so a 20 m corridor can
have one step but five path nodes. Pairing by position put each
step's dot partway along the previous instruction, which is why
tapping Next jumped the dot into the middle of a corridor.

Now every step carries the actual path index it belongs to, and
_enrich_indoor_steps just reads it.

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
semicolon list like "0;1" or "-1;0;1", ordered bottom-to-top.

Step anchoring (_prospective_indoor_steps)
------------------------------------------
The indoor engine pins "Walk N m, then turn left" to the node where
the walk ENDS — the turn node. The app switches to a step when the
walker reaches its `at_m`, so the walk text isn't shown until after
the walk. This is the same off-by-one as the pure-outdoor engine
had, fixed there by `step_merge.merge_opening_step`.

`_prospective_indoor_steps` fixes it here for mixed and indoor
routes: it moves each "Walk …" / "Continue for …" line back to where
the walk STARTS, and folds the opening line ("Starting from X") into
the first walk so there's no separate zero-length opening step.

The steps at this stage have NO "kind" field. The "kind" on the API
response is added later by _annotate_steps_and_legs. So this
function must not rely on step["kind"].

`_annotate_steps_and_legs` runs after this and reads `at_m` and
`geometry_index` from each step's (now moved) node, so both follow
the corrected anchors automatically.
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
    elif kind == "entrance":
        return {
            "engine": "indoor",
            "place_id": place.id,
            "kind": "entrance",
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
    """Snap a GPS fix to the nearest outdoor node on the merged graph."""
    nodes = bundle["nodes"]
    outdoor_node_ids = bundle["outdoor_node_ids"]

    if is_live_fix and accuracy_m is not None:
        logger.info(
            "Composer: routing from live fix at (%.5f, %.5f) accuracy %.1fm",
            lat, lon, accuracy_m,
        )

    best_id = None
    best_dist = float("inf")

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
    """Return a route response. Decides which engine to use."""
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

    bundle = indoor_graph_builder.get_indoor_graph()

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
            "engine": "indoor",
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

    if to_place is not None:
        to_ep = _classify_endpoint(to_place)
    elif to_lat is not None and to_lon is not None:
        node_id, display_name = _resolve_coord_start(
            to_lat, to_lon, bundle,
            is_live_fix=False,
        )
        if node_id is None:
            raise RouteCompositionError(
                "Could not snap the destination to the walkable network."
            )
        to_ep = {
            "engine": "indoor",
            "place_id": None,
            "kind": "outdoor",
            "node_id": node_id,
            "osm_id": node_id[1:] if node_id.startswith("o") else node_id,
            "name": display_name,
        }
    else:
        raise RouteCompositionError(
            "Either to_place_id or to_lat/to_lon is required."
        )

    return _route_via_indoor_engine(from_ep, to_ep)


# ---------------------------------------------------------------------------
# Outdoor engine path
# ---------------------------------------------------------------------------

def _route_via_outdoor_engine(
    session, graph, nodes, edge_tags,
    *, from_place_id, from_lat, from_lon, from_accuracy_m,
    to_place_id, to_lat, to_lon,
):
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

    node_path = _resolve_path_for_outdoor_route(
        session, graph, nodes, route,
        from_place_id=from_place_id,
        from_lat=from_lat,
        from_lon=from_lon,
        to_place_id=to_place_id,
        to_lat=to_lat,
        to_lon=to_lon,
    )
    route.node_path = node_path

    return route


def _resolve_path_for_outdoor_route(
    session, graph, nodes, route,
    *, from_place_id, from_lat, from_lon,
    to_place_id, to_lat, to_lon,
):
    from .routing_service import _resolve_endpoint
    from backend.core.campus_graph import a_star

    from_node, _ = _resolve_endpoint(
        session, graph, nodes,
        place_id=from_place_id,
        lat=from_lat, lon=from_lon,
        is_live_fix=(from_place_id is None and from_lat is not None),
    )
    to_node, _ = _resolve_endpoint(
        session, graph, nodes,
        place_id=to_place_id,
        lat=to_lat, lon=to_lon,
        is_live_fix=False,
    )
    if from_node is None or to_node is None:
        return []
    path, _ = a_star(graph, nodes, from_node, to_node)
    if not path:
        return []
    return ["o" + n for n in path]


# ---------------------------------------------------------------------------
# Indoor engine path
# ---------------------------------------------------------------------------

def _route_via_indoor_engine(from_ep, to_ep):
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

    # Move "Walk …" lines back to where their walk starts, and fold
    # the opening line into the first walk. This is the same fix that
    # `step_merge.merge_opening_step` applies to the pure-outdoor
    # engine, and it addresses the same off-by-one: the indoor engine
    # pins "Walk N m, then turn" to the turn node, so the text isn't
    # shown until the walker has already reached the turn.
    steps = _prospective_indoor_steps(steps, path, total)

    annotated_steps, legs = _annotate_steps_and_legs(
        steps, path, nodes, indoor_node_ids, from_ep, to_ep, total
    )

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
        "node_path": path,
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


# ---------------------------------------------------------------------------
# Prospective step re-anchoring (mixed / indoor routes)
# ---------------------------------------------------------------------------

# Instruction prefixes that begin a "walk" step. These are the ones
# whose anchor the engine placed at the END of the leg, and which we
# need to move to the start.
_LEG_PREFIXES = ("walk", "continue for")


def _lower_first(text):
    """Lowercase the first character, leaving the rest alone."""
    if not text:
        return text
    return text[:1].lower() + text[1:]


def _is_opening_instruction(text):
    """
    True when the instruction is the engine's opening line.

    _fix_opening_line() rewrites steps[0] to one of two forms:
      "Starting from <name>"
      "From your current position"
    This helper recognises both.
    """
    if not text:
        return False
    lowered = text.strip().lower()
    return (
        lowered.startswith("starting from")
        or lowered.startswith("from your current position")
    )


def _prospective_indoor_steps(steps, path, total_m):
    """
    Move each walk-style step back to where its walk starts, and fold
    the opening line into the first walk.

    The indoor engine produces steps in this shape:

        {"instruction": "Starting from the main gate", "node_id": <start>}
        {"instruction": "Walk about 90 metres, then turn left", "node_id": <turn>}
        {"instruction": "Turn left", "node_id": <turn>}
        {"instruction": "Walk about 20 metres along the corridor, then turn right", "node_id": <turn>}
        ...

    Note: these steps have no "kind" field at this stage. The "kind"
    on the API response is added later by _annotate_steps_and_legs's
    _kind_for_step. So this function must not rely on step["kind"].

    The "Walk N m, then turn X" line is anchored at the TURN node,
    which is the end of the walk. From the walker's point of view,
    that means the instruction to walk N metres only appears once
    they've already walked them.

    This function moves each such step back to the node where the
    walk starts, so the instruction is current from the moment the
    walker begins the leg.

    It also handles two adjacent "walk" steps that the engine emits
    separately (a bare "Walk a short distance" followed by "Walk N m,
    then turn X") by joining them into a single instruction.

    Finally, if the opening line ("Starting from X") is immediately
    followed by a walk that now starts at the same node, the opening
    is folded into the walk as a lead-in.
    """
    if len(steps) < 2 or not path:
        return steps

    # ---- 1. Join adjacent walk-only + walk-and-turn pairs ----
    #
    # The engine sometimes emits:
    #   "Walk a short distance"                     (no node_id)
    #   "Walk about 20 metres, then turn right"     (node_id = turn)
    # as two separate steps. Merge them into one.
    merged = []
    carry = None
    for s in steps:
        nid = s.get("node_id") or ""
        walkish = s["instruction"].lower().startswith(_LEG_PREFIXES)
        if walkish and not nid:
            if carry is None:
                carry = s
            else:
                carry = {
                    **carry,
                    "instruction": (
                        carry["instruction"]
                        + ", then "
                        + _lower_first(s["instruction"])
                    ),
                }
            continue
        if carry is not None:
            if walkish and nid:
                s = {
                    **s,
                    "instruction": (
                        carry["instruction"]
                        + ", then "
                        + _lower_first(s["instruction"])
                    ),
                }
            else:
                merged.append(carry)
            carry = None
        merged.append(s)
    if carry is not None:
        merged.append(carry)

    # ---- 2. Re-anchor each walk-and-turn step at the start of its walk ----
    #
    # Walk the merged list. Remember the node id where the previous
    # action really happened; that's where the current walk begins.
    # When a step is a walk-style step with a node_id, rewrite its
    # node_id to point at the *previous* action's node.
    out = []
    last_action_node = path[0]
    for s in merged:
        nid = s.get("node_id") or ""
        is_leg = bool(nid) and s["instruction"].lower().startswith(_LEG_PREFIXES)
        if is_leg:
            out.append({**s, "node_id": last_action_node})
        else:
            out.append(s)
        if nid:
            last_action_node = nid

    # ---- 3. Fold the opening line into the first walk ----
    #
    # After re-anchoring, the opening step ("Starting from X" or
    # "From your current position") and the first walk both sit at
    # path[0]. Merge them so the walker sees one instruction.
    #
    # Detection is by content, not by a "kind" field, because at this
    # stage the steps have no "kind".
    if (
        len(out) >= 2
        and out[0].get("node_id") == path[0]
        and out[1].get("node_id") == path[0]
        and _is_opening_instruction(out[0]["instruction"])
    ):
        opener = out[0]["instruction"]
        first = out[1]["instruction"]
        merged_text = f"{opener} — {_lower_first(first)}"
        out[1] = {**out[1], "instruction": merged_text}
        del out[0]

    return out


# ---------------------------------------------------------------------------
# Step annotation
# ---------------------------------------------------------------------------

def _annotate_steps_and_legs(
    steps, path, nodes, indoor_node_ids, from_ep, to_ep, total
):
    """
    Give every step a mode, a real at_m, a real distance_m, and a real
    geometry_index.

    geometry_index is the position in `path` where this step's node
    sits. The mobile app uses it to place the blue dot when the
    student taps "Next step" in indoor mode.

    Why geometry_index matters and how it's computed:

      The step list from the indoor engine is a merged view of the
      path. A 20 m corridor can be one instruction covering five
      path nodes. Before this fix, _enrich_indoor_steps paired the
      Nth indoor step with the Nth indoor path node, which put each
      step's dot partway along an earlier instruction — the "quarter
      way through the previous turn" bug.

      Here, we walk the path with a forward-only `ptr` and, for each
      step, find that step's node. The index we land on is the step's
      real geometry_index.
    """
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
    geometry_indices = []
    last_mode = "outdoor"
    last_at = 0.0
    last_gi = 0
    ptr = 0

    for step in steps:
        nid = step.get("node_id") or ""
        if nid:
            last_mode = "outdoor" if nid.startswith("o") else "indoor"
            while ptr < len(path) and path[ptr] != nid:
                ptr += 1
            if ptr < len(path):
                last_at = max(last_at, cum[ptr])
                last_gi = ptr
            else:
                ptr = 0
        modes.append(last_mode)
        at_ms.append(last_at)
        geometry_indices.append(last_gi)

    annotated = []
    for i, (step, mode) in enumerate(zip(steps, modes)):
        next_at = at_ms[i + 1] if i + 1 < len(at_ms) else total
        annotated.append({
            "kind": _kind_for_step(step, mode),
            "instruction": step["instruction"],
            "at_m": round(at_ms[i], 1),
            "distance_m": round(max(0.0, next_at - at_ms[i]), 1),
            "mode": mode,
            "geometry_index": geometry_indices[i],
        })

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
# Indoor step enrichment — level and building name
# ---------------------------------------------------------------------------

def _edge_level_for_step(from_nid, to_nid, current_level, graph):
    """Return the level the walker arrives on after crossing the edge."""
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
    Add `level` and `building_name` to each indoor step.

    geometry_index is already set by _annotate_steps_and_legs, so
    this function no longer pairs steps with path nodes by position.
    It just reads the index that's already on the step.

    Levels are tracked per edge (see _edge_level_for_step), because
    the OSM data stores level on the ways, not the nodes.
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

    for step in annotated_steps:
        if step.get("mode") != "indoor":
            continue
        gi = step.get("geometry_index")
        if gi is None or gi < 0 or gi >= len(path):
            continue
        step["level"] = level_at[gi] or "0"
        step["building_name"] = building_at[gi]