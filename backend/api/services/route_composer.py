"""
route_composer.py

Decides which engine handles a route request.

  - Both endpoints outdoor    →  outdoor engine (routing_service).
                                 Same code path as before this file
                                 existed. Same output shape.
  - Any endpoint indoor       →  indoor engine on the enriched graph.

The composer is the only place in the codebase that knows both
engines exist. Everything downstream — the API, the mobile app —
sees a single route response.

For mixed routes, each step carries a `mode` field ("outdoor" or
"indoor") so the client can switch rendering behavior at the
boundary.

Step distances (at_m, distance_m)
---------------------------------
The frozen indoor engine doesn't provide per-step distances — it
embeds them in the instruction text. Rather than parse the text or
modify the frozen file, we leave `at_m` and `distance_m` at 0.0 for
indoor steps. The mobile app in indoor mode advances by step index
rather than by distance, so this is fine.
"""

import logging

from sqlalchemy.orm import Session

from backend.api.models.place import Place

from . import indoor_graph_builder

logger = logging.getLogger(__name__)


class RouteCompositionError(Exception):
    """Raised when the request can't be routed by either engine."""


# ---------------------------------------------------------------------------
# Endpoint resolution
# ---------------------------------------------------------------------------

def _lookup_place(session: Session, place_id: int) -> Place:
    place = session.query(Place).filter_by(id=place_id).one_or_none()
    if place is None:
        raise RouteCompositionError(f"Place {place_id} not found")
    return place


def _classify_endpoint(place: Place) -> dict:
    """
    Return a dict describing how to hand this endpoint to the engine:

      { "engine": "outdoor"|"indoor",
        "place_id": int,
        "kind": "outdoor"|"indoor",
        "node_id": str,
        "osm_id": str,
        "name": str }
    """
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

    See module docstring for the decision rules.
    """
    from_place = None
    if from_place_id is not None:
        from_place = _lookup_place(session, from_place_id)

    to_place = None
    if to_place_id is not None:
        to_place = _lookup_place(session, to_place_id)

    from_kind = (from_place.kind if from_place else "outdoor").lower()
    to_kind = (to_place.kind if to_place else "outdoor").lower()

    both_outdoor = (from_kind == "outdoor" and to_kind == "outdoor")

    if both_outdoor:
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

    # At least one endpoint is indoor. Currently require both to be
    # named places (the composer can't yet resolve a GPS-start indoor
    # destination).
    if from_place is None or to_place is None:
        raise RouteCompositionError(
            "Mixed indoor/outdoor routes currently require both "
            "endpoints to be named places."
        )

    from_ep = _classify_endpoint(from_place)
    to_ep = _classify_endpoint(to_place)
    return _route_via_indoor_engine(from_ep, to_ep)


# ---------------------------------------------------------------------------
# Outdoor engine path — the "same as before" branch
# ---------------------------------------------------------------------------

def _route_via_outdoor_engine(
    session, graph, nodes, edge_tags,
    *,
    from_place_id, from_lat, from_lon, from_accuracy_m,
    to_place_id, to_lat, to_lon,
):
    """
    Delegate to the existing outdoor routing_service. Same function
    the API used before the composer existed.

    The returned RouteResponse is annotated with mode="outdoor" on
    each step and a single leg spanning the whole route.
    """
    from . import routing_service

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
        {
            "mode": "outdoor",
            "from_m": 0.0,
            "to_m": route.distance_m,
            "distance_m": route.distance_m,
            "from_name": route.from_name,
            "to_name": route.to_name,
        }
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
        steps, path, indoor_node_ids, from_ep, to_ep, total
    )

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


def _annotate_steps_and_legs(steps, path, indoor_node_ids, from_ep, to_ep, total):
    """
    Tag steps with mode; classify each step's kind; build a legs
    array by grouping contiguous same-mode steps.
    """
    # --- Assign mode to each step ---
    modes = []
    last_mode = "outdoor"
    for step in steps:
        node_id = step.get("node_id") or ""
        if node_id:
            mode = "outdoor" if node_id.startswith("o") else "indoor"
            last_mode = mode
        else:
            mode = last_mode
        modes.append(mode)

    # --- Build the step dicts ---
    annotated = []
    for step, mode in zip(steps, modes):
        annotated.append({
            "kind": _kind_for_step(step, mode),
            "instruction": step["instruction"],
            "at_m": 0.0,
            "distance_m": 0.0,
            "mode": mode,
        })

    # --- Build legs by grouping contiguous modes ---
    legs = []
    if annotated:
        current_mode = annotated[0]["mode"]
        segment_start_idx = 0
        for i in range(1, len(annotated)):
            if annotated[i]["mode"] != current_mode:
                legs.append({
                    "mode": current_mode,
                    "from_m": 0.0,
                    "to_m": 0.0,
                    "distance_m": 0.0,
                    "from_name": from_ep["name"] if segment_start_idx == 0 else None,
                    "to_name": None,
                })
                current_mode = annotated[i]["mode"]
                segment_start_idx = i
        legs.append({
            "mode": current_mode,
            "from_m": 0.0,
            "to_m": total,
            "distance_m": total,
            "from_name": from_ep["name"] if segment_start_idx == 0 else None,
            "to_name": to_ep["name"],
        })

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