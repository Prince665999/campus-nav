"""
narration_service.py

Wraps narration.narrate() for /api/narrate. Checks the narration
cache before generating, since narration is expensive (either the
model call or the local timeline assembly).
"""

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
from .routing_service import _resolve_endpoint
from .graph_service import get_areas


def _build_events(path, nodes, edge_tags, graph, distance, start_name, end_name):
    steps = generate_turn_by_turn(path, nodes)
    areas = get_areas()
    areas_along = dedupe_areas(area_extents_along_route(path, nodes, areas))
    areas_along = filter_areas(areas_along, distance, start_name, end_name)
    path_notes = path_notes_along_route(path, nodes, edge_tags)
    branches = path_branches_along_route(path, nodes, graph, edge_tags, total_m=distance)
    branches = remove_branches_at_turns(branches, steps)
    dest_pos = destination_view(path, nodes, areas, end_name)
    events = build_timeline(steps, areas_along, path_notes, branches)
    return steps, events, dest_pos


def narrate_route(
    session: Session,
    graph,
    nodes,
    edge_tags,
    from_place_id: int,
    to_place_id: int,
    lang: str = "en",
    live: bool = False,
) -> NarrationResponse | None:
    """
    Compute a route and narrate it. Checks the cache first.

    The cache key includes the language, so English and Kiswahili
    narrations of the same route are cached separately.
    """
    # Compute the route first — needed either way for the
    # narration timeline and for the route hash.
    from_node, from_name = _resolve_endpoint(
        session, graph, nodes, place_id=from_place_id
    )
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

    # Compute the route hash from the event timeline, which is what
    # narration is actually based on. Two routes with the same
    # timeline get the same narration cached.
    timeline_repr = "\n".join(
        f"{round(e[0])}|{e[1]}|{e[2]}" for e in events
    )
    r_hash = cache_service.route_hash(timeline_repr)

    # ---- Cache check ----
    cached_text = cache_service.get_cached_narration(r_hash, lang=lang)
    if cached_text is not None:
        return NarrationResponse(
            text=cached_text,
            source="local",  # we can't tell which produced it, so
                             # report local — the source field is
                             # informational only
            lang=lang,
        )

    # ---- Generate ----
    text = narrate(
        start_name=from_name,
        end_name=to_name,
        distance_m=distance,
        events=events,
        destination_position=dest_pos,
        api_key=None,
        lang=lang,
    )

    # ---- Write back ----
    cache_service.set_cached_narration(r_hash, text, lang=lang)

    source = "groq" if (live and os.environ.get("GROQ_API_KEY")) else "local"

    return NarrationResponse(text=text, source=source, lang=lang)