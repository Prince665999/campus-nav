"""
narration_service.py

Wraps narration.narrate() for /api/narrate.

Accepts either a place ID or coordinates for the from endpoint. When
coordinates are given, the same snap-distance check that the route
endpoint uses is applied — so a bad GPS fix can't silently narrate
from a path across campus.

Two paths:

  - Outdoor-to-outdoor: the existing behaviour, unchanged. Uses the
    outdoor graph loaded from map.osm (the `graph` / `nodes` /
    `edge_tags` arguments the router passes in).

  - Anything involving an indoor place or an entrance: delegate to
    narration_joiner. The joiner works on the MERGED graph — the
    one built by indoor_graph_builder — because the route composer
    returns a merged node path. The outdoor parameters this function
    receives are for the outdoor graph only, and must not be used
    for a mixed route.

We also expose narrate_outdoor_segment(), used by the joiner for
each outdoor run of a mixed route. That function narrates a slice of
an already-chosen path — it never re-routes.
"""

import logging
import os

from sqlalchemy.orm import Session

from backend.core.ai_navigator import (
    area_extents_along_route,
    build_timeline,
    dedupe_areas,
    destination_view,
    filter_areas,
    path_branches_along_route,
    path_notes_along_route,
    remove_branches_at_turns,
)
from backend.core.campus_graph import a_star, generate_turn_by_turn
from backend.core.narration import narrate

from ..schemas.narration import NarrationResponse
from . import cache_service
from .routing_service import (
    UnreliableLocationError,
    _resolve_endpoint,
)
from .graph_service import get_areas

logger = logging.getLogger(__name__)


__all__ = [
    "narrate_route",
    "narrate_outdoor_segment",
    "UnreliableLocationError",
]


# Minimum length of text we consider a usable narration. Anything
# shorter is treated as failure so the endpoint returns an honest 404
# instead of a one-word reply.
_MIN_USABLE_NARRATION_LEN = 20


def _build_events(path, nodes, edge_tags, graph, distance, start_name, end_name):
    """Reproduce the timeline assembly that ai_navigator.py does."""
    steps = generate_turn_by_turn(path, nodes)
    areas = get_areas()
    areas_along = dedupe_areas(area_extents_along_route(path, nodes, areas))
    areas_along = filter_areas(areas_along, distance, start_name, end_name)
    path_notes = path_notes_along_route(path, nodes, edge_tags)
    branches = path_branches_along_route(
        path, nodes, graph, edge_tags, total_m=distance
    )
    branches = remove_branches_at_turns(branches, steps)
    dest_pos = destination_view(path, nodes, areas, end_name)
    events = build_timeline(steps, areas_along, path_notes, branches)
    return steps, events, dest_pos


# ---------------------------------------------------------------------------
# Mixed-route dispatch
# ---------------------------------------------------------------------------

def _place_kind(session: Session, place_id):
    """Return the kind of a place, or None if not found."""
    if place_id is None:
        return None
    from ..models.place import Place
    row = session.query(Place).filter_by(id=place_id).one_or_none()
    if row is None:
        return None
    return row.kind or "outdoor"


def _involves_indoor(session: Session, from_place_id, to_place_id):
    """
    True if either endpoint is indoor or an entrance.

    Entrances count because the composer links them to the indoor
    graph via connectors. They behave like indoor endpoints for
    routing purposes.
    """
    indoor_kinds = {"indoor", "entrance"}
    return (
        _place_kind(session, from_place_id) in indoor_kinds
        or _place_kind(session, to_place_id) in indoor_kinds
    )


def narrate_route(
    session: Session,
    graph,
    nodes,
    edge_tags,
    from_place_id: int | None = None,
    from_lat: float | None = None,
    from_lon: float | None = None,
    from_accuracy_m: float | None = None,
    to_place_id: int = None,
    lang: str = "en",
    live: bool = False,
):
    """
    Produce narration for the route between two points.

    Outdoor-to-outdoor: existing behaviour, unchanged.

    If either endpoint is indoor or an entrance: delegate to
    narration_joiner. The joiner uses the merged graph and the
    composer's node path, so narration and steps never disagree.
    """
    # --- Mixed / indoor path ---
    if _involves_indoor(session, from_place_id, to_place_id):
        return _narrate_mixed(
            session,
            graph,
            nodes,
            edge_tags,
            from_place_id=from_place_id,
            from_lat=from_lat,
            from_lon=from_lon,
            from_accuracy_m=from_accuracy_m,
            to_place_id=to_place_id,
            lang=lang,
            live=live,
        )

    # --- Outdoor path, unchanged ---
    return _narrate_outdoor_only(
        session,
        graph,
        nodes,
        edge_tags,
        from_place_id=from_place_id,
        from_lat=from_lat,
        from_lon=from_lon,
        from_accuracy_m=from_accuracy_m,
        to_place_id=to_place_id,
        lang=lang,
        live=live,
    )


# ---------------------------------------------------------------------------
# Mixed-route narration
# ---------------------------------------------------------------------------

def _narrate_mixed(
    session,
    graph,
    nodes,
    edge_tags,
    *,
    from_place_id,
    from_lat,
    from_lon,
    from_accuracy_m,
    to_place_id,
    lang,
    live,
):
    """
    Narrate a route that touches indoor places.

    Two things to note:

      1. We call the composer to get the merged path (the same path
         /api/route uses), then hand it to narration_joiner.

      2. The `graph`, `nodes`, `edge_tags` parameters we received
         describe the OUTDOOR graph only. The composer's path is on
         the MERGED graph. So we must pass the merged graph to the
         joiner — not the outdoor one. We pull the merged bundle from
         indoor_graph_builder and use that.
    """
    from . import narration_joiner
    from . import indoor_graph_builder
    from . import route_composer

    # 1. Compose the route — same code path as /api/route. The
    #    composer internally uses the merged graph; we pass it the
    #    outdoor params only because that's its existing signature.
    try:
        composed = route_composer.compose_route(
            session, graph, nodes, edge_tags,
            from_place_id=from_place_id,
            from_lat=from_lat,
            from_lon=from_lon,
            from_accuracy_m=from_accuracy_m,
            to_place_id=to_place_id,
        )
    except route_composer.RouteCompositionError:
        return None
    except route_composer.UnreliableLocationError:
        raise UnreliableLocationError()

    if composed is None:
        return None

    # 2. Retrieve the node path from the composer.
    node_path = composed.get("node_path")
    if not node_path:
        logger.warning("composer returned a route without a node_path")
        return None

    # 3. The merged bundle — the same one the composer used. This
    #    carries the indoor node ids, edges, and door/corridor maps.
    bundle = indoor_graph_builder.get_indoor_graph()
    merged_nodes = bundle["nodes"]
    merged_graph = bundle["graph"]
    merged_edge_tags = bundle["edge_tags"]

    from_name = composed.get("from_name") or "your current location"
    to_name = composed.get("to_name") or "your destination"

    api_key = os.environ.get("GROQ_API_KEY")

    text = narration_joiner.join_runs(
        path=node_path,
        nodes=merged_nodes,
        graph=merged_graph,
        edge_tags=merged_edge_tags,
        door_node_ids=bundle.get("door_node_ids", set()),
        corridor_of_door=bundle.get("corridor_of_door", {}),
        start_name=from_name,
        end_name=to_name,
        lang=lang,
        live=live,
        api_key=api_key,
    )

    if not text or len(text.strip()) < _MIN_USABLE_NARRATION_LEN:
        logger.warning(
            "mixed narration produced no usable text (path len=%d, "
            "text len=%d)",
            len(node_path),
            len(text or ""),
        )
        return None

    source = "groq" if (live and api_key) else "local"
    return NarrationResponse(text=text, source=source, lang=lang)


# ---------------------------------------------------------------------------
# Outdoor-only narration — the existing path
# ---------------------------------------------------------------------------

def _narrate_outdoor_only(
    session,
    graph,
    nodes,
    edge_tags,
    *,
    from_place_id,
    from_lat,
    from_lon,
    from_accuracy_m,
    to_place_id,
    lang,
    live,
):
    """
    The original outdoor narration flow. Unchanged from before the
    joiner existed.
    """
    if from_place_id is not None:
        from_node, from_name = _resolve_endpoint(
            session, graph, nodes, place_id=from_place_id
        )
    elif from_lat is not None and from_lon is not None:
        from_node, from_name = _resolve_endpoint(
            session, graph, nodes,
            lat=from_lat, lon=from_lon,
            accuracy_m=from_accuracy_m,
            is_live_fix=True,
        )
    else:
        return None

    to_node, to_name = _resolve_endpoint(
        session, graph, nodes, place_id=to_place_id
    )

    if from_node is None or to_node is None:
        return None
    if from_node == to_node:
        return None

    path, distance = a_star(graph, nodes, from_node, to_node)
    if not path:
        return None

    _steps, events, dest_pos = _build_events(
        path, nodes, edge_tags, graph, distance, from_name, to_name
    )

    timeline_repr = "\n".join(
        f"{round(e[0])}|{e[1]}|{e[2]}" for e in events
    )
    r_hash = cache_service.route_hash(timeline_repr)

    cached_text = cache_service.get_cached_narration(r_hash, lang=lang)
    if cached_text is not None:
        return NarrationResponse(text=cached_text, source="local", lang=lang)

    text = narrate(
        start_name=from_name,
        end_name=to_name,
        distance_m=distance,
        events=events,
        destination_position=dest_pos,
        api_key=None,
        lang=lang,
    )

    cache_service.set_cached_narration(r_hash, text, lang=lang)

    source = "groq" if (live and os.environ.get("GROQ_API_KEY")) else "local"
    return NarrationResponse(text=text, source=source, lang=lang)


# ---------------------------------------------------------------------------
# Outdoor segment narration — used by narration_joiner for mixed routes
# ---------------------------------------------------------------------------

def narrate_outdoor_segment(
    path,
    nodes,
    graph,
    edge_tags,
    start_name,
    end_name,
    lang="en",
    live=False,
    api_key=None,
):
    """
    Narrate an already-chosen outdoor path.

    This is what narration_joiner calls for each outdoor run of a
    mixed route. It NEVER re-routes — the path is given.

    The path and its node ids are already stripped of the 'o' prefix
    by the joiner. nodes, graph, and edge_tags are the outdoor-only
    subset, keyed by the stripped ids. So this function is
    essentially the same assembly the outdoor engine does in its
    CLI, minus the routing.
    """
    if not path or len(path) < 2:
        return ""

    # Total length along the given path.
    from backend.core.campus_graph import haversine_m
    distance = 0.0
    for i in range(len(path) - 1):
        a = nodes[path[i]]
        b = nodes[path[i + 1]]
        distance += haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])

    try:
        _steps, events, dest_pos = _build_events(
            path, nodes, edge_tags, graph, distance,
            start_name or "your starting point",
            end_name or "your destination",
        )
    except Exception as e:
        logger.warning("outdoor segment event build failed: %s", e)
        return ""

    text = narrate(
        start_name=start_name or "your starting point",
        end_name=end_name or "your destination",
        distance_m=distance,
        events=events,
        destination_position=dest_pos,
        api_key=api_key if live else None,
        lang=lang,
    )
    return text or ""