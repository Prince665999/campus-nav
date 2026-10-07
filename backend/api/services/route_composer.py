"""
route_composer.py

Decides which engine handles a route request.

  - Both endpoints outdoor    →  outdoor engine (existing
                                  routing_service, keeps the current
                                  narration quality).
  - Any endpoint indoor       →  indoor engine on the enriched graph.

The mobile app sends `from_place_id` and `to_place_id`. Both are
rows in the `places` table. We look up each place's `kind`, and
dispatch accordingly.

For indoor endpoints, the place's `osm_id` is the door node id
in the enriched graph. For outdoor endpoints, the place's `osm_id`
is the outdoor node id — but the enriched graph uses `"o"` prefixes
for outdoor nodes, so we prefix when handing the id to the indoor
engine.

Nothing here touches the frozen files. This is the only place in the
codebase that knows both engines exist.
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
        "node_id": str,         # node id in the enriched graph
        "name": str }
    """
    kind = (place.kind or "outdoor").lower()
    if kind == "indoor":
        # Indoor door node. Its osm_id IS the node id in the
        # enriched graph (no prefix, because it came from final.osm).
        return {
            "engine": "indoor",
            "place_id": place.id,
            "kind": "indoor",
            "node_id": place.osm_id,
            "name": place.name,
        }
    else:
        # Outdoor place. The enriched graph stores outdoor nodes
        # with an "o" prefix, so we prefix here. The outdoor engine
        # still uses the raw OSM id, so we keep that separately for
        # the outdoor path.
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
    from_place_id: int,
    to_place_id: int,
):
    """
    Return an indoor-engine route for now. The outdoor path is added
    in Phase 5c once this is wired into `/api/route`.

    This function exists so we can test the indoor engine on the
    enriched graph independently of the API. When both endpoints are
    outdoor, the caller (Phase 5c) will use the outdoor engine instead;
    this function still handles the "at least one indoor" case.
    """
    from_place = _lookup_place(session, from_place_id)
    to_place = _lookup_place(session, to_place_id)

    from_ep = _classify_endpoint(from_place)
    to_ep = _classify_endpoint(to_place)

    # If neither endpoint is indoor, we still route via the indoor
    # engine here — the caller decides whether to prefer the outdoor
    # engine. This keeps the composer honest: it can always produce a
    # route, regardless of endpoint kinds.
    return _route_via_indoor_engine(from_ep, to_ep)


def _route_via_indoor_engine(from_ep, to_ep):
    """
    Route from_ep["node_id"] to to_ep["node_id"] on the enriched graph.

    Post-processes the frozen engine's steps to fix one cosmetic
    issue: the frozen engine prepends "Starting from X on the ground
    floor" to the first step, which reads wrong when X is an outdoor
    place. If the start node is outdoor, we strip the floor suffix.
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

    # Import lazily — these are the frozen indoor engine's functions.
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

    # Cosmetic fix: strip the floor suffix from the opening line if
    # the walk starts outdoors.
    start_is_outdoor = from_id not in indoor_node_ids
    steps = _fix_opening_line(
        steps,
        start_is_outdoor=start_is_outdoor,
        start_name=from_ep["name"],
    )

    geometry = [
        {"lat": nodes[nid]["lat"], "lon": nodes[nid]["lon"]}
        for nid in path
    ]

    return {
        "engine": "indoor",
        "distance_m": total,
        "steps": steps,
        "geometry": geometry,
        "from_name": from_ep["name"],
        "to_name": to_ep["name"],
    }


def _fix_opening_line(steps, start_is_outdoor, start_name):
    """
    The frozen indoor engine produces an opening line like
    "Starting from X on the ground floor". When X is an outdoor
    place, "on the ground floor" doesn't apply. Strip it.

    Only the first step is touched. Everything else is returned
    unchanged, because the rest of the steps come from the outdoor
    half and are already worded correctly by the frozen engine (the
    outdoor walkways aren't tagged corridor=yes, so the engine treats
    them as connecting paths and doesn't use corridor language).
    """
    if not start_is_outdoor:
        return steps
    if not steps:
        return steps

    opening = f"Starting from {start_name}" if start_name else "From your current position"

    fixed = list(steps)
    fixed[0] = {**fixed[0], "instruction": opening}
    return fixed