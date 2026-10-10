"""
indoor_narration_service.py

Wraps the frozen indoor narration engine for use by the API.

The indoor engine lives in backend/core/indoor/ (ai_navigator.py and
campus_graph.py) and is designed to be called from a script. This
module gives it an API-shaped entry point:

    narrate_indoor_run(
        path,             # list of indoor node ids
        nodes,            # {node_id: {lat, lon, tags}} from the merged graph
        graph,            # indoor routing adjacency from the merged graph
        door_node_ids,    # set of door node ids
        start_name,
        end_name,
        lang="en",
    ) -> str

Behaviour, honestly:

  - With a GROQ_API_KEY set, we build the prompt the frozen engine
    wants and call Groq. The returned text is the model's narration.
  - Without a key, or if the Groq call fails, we return the raw
    merged steps joined into plain sentences. No invented prose. No
    local "narration" that pretends to be more than it is.

We do NOT re-run a_star. The caller has already routed on the merged
graph and has a path. This service narrates that path — it does not
choose a different one.

We do NOT touch the frozen files. Everything imported here is read as
is.
"""

import logging

from backend.core.indoor.ai_navigator import (
    build_prompt,
    call_groq,
    corridor_notes,
    door_count_summary,
    landmarks_along_route,
    merge_steps_for_narration,
    route_door_facts,
)
from backend.core.indoor.campus_graph import (
    generate_turn_by_turn,
    level_label,
    node_display_name,
    total_distance_m,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def narrate_indoor_run(
    path,
    nodes,
    graph,
    door_node_ids,
    corridor_of_door,
    start_name,
    end_name,
    api_key=None,
    lang="en",
):
    """
    Produce narration for one indoor run (a contiguous slice of the
    merged route path where every node is indoor).

    path:           list of indoor node ids (no 'o' prefix)
    nodes:          dict {node_id: {"lat", "lon", "tags"}}
    graph:          merged adjacency — we only read indoor edges here
    door_node_ids:  set of node ids that are doors
    corridor_of_door: dict door_id -> corridor name (may be empty)
    start_name:     display name for the first node
    end_name:       display name for the last node
    api_key:        optional Groq key. If None, only the raw steps are
                    returned (no local fallback narration).

    Returns a plain string.

    Raises ValueError if the path has fewer than 2 nodes — a run of
    one node has nothing to say.
    """
    if not path or len(path) < 2:
        raise ValueError("indoor run needs at least two nodes")

    # The frozen engine wants a minimal graph that only contains the
    # run's own edges. We pass the merged graph — its indoor edges are
    # already what the engine expects, and the outdoor edges are only
    # consulted when generating turn-by-turn for indoor nodes, which
    # never happens for an indoor run.
    steps = generate_turn_by_turn(path, nodes, graph, door_node_ids, corridor_of_door)

    start_tags = nodes[path[0]].get("tags", {}) or {}
    end_tags = nodes[path[-1]].get("tags", {}) or {}

    resolved_start = node_display_name(start_tags) or start_name or "your starting point"
    resolved_end = node_display_name(end_tags) or end_name or "your destination"

    start_level = str(start_tags.get("level", "0")).split(";")[0]
    end_level = str(end_tags.get("level", "0")).split(";")[0]

    total_m = total_distance_m(path, nodes)

    # If there's no API key, the raw steps are the whole story. This
    # is the deliberate no-fallback policy: we do not invent a
    # narration. The student gets the same text the CLI tool prints.
    if not api_key:
        return _steps_to_plain_text(steps)

    # Door facts and landmarks — same as the CLI path.
    try:
        door_facts = route_door_facts(path, nodes, graph, door_node_ids)
    except Exception as e:
        logger.warning("door fact analysis failed: %s", e)
        door_facts = None

    try:
        landmarks = landmarks_along_route(path, nodes, door_node_ids, graph, door_facts)
    except Exception as e:
        logger.warning("landmark analysis failed: %s", e)
        landmarks = []

    try:
        notes = corridor_notes(path, nodes, corridor_of_door, graph)
    except Exception as e:
        logger.warning("corridor notes failed: %s", e)
        notes = []

    prompt = build_prompt(
        resolved_start,
        resolved_end,
        start_level,
        end_level,
        total_m,
        steps,
        landmarks,
        notes,
        door_facts,
    )

    try:
        text = call_groq(prompt, api_key)
    except Exception as e:
        logger.warning("indoor Groq call failed, returning raw steps: %s", e)
        return _steps_to_plain_text(steps)

    if not text or not text.strip():
        return _steps_to_plain_text(steps)

    return text.strip()


# ---------------------------------------------------------------------------
# Raw-steps fallback
# ---------------------------------------------------------------------------

def _steps_to_plain_text(steps):
    """
    Turn the frozen engine's step list into readable plain text.

    The frozen engine's merge_steps_for_narration already joins
    adjacent "turn, then walk" pairs and cancels double turn-arounds.
    We use it, then join the moves with periods.

    This is not a narration. It is the instructions, spoken plainly.
    The point is to be honest: if there is no model, there is no
    prose.
    """
    if not steps:
        return ""

    try:
        moves = merge_steps_for_narration(steps)
    except Exception:
        moves = [s.get("instruction", "") for s in steps if s.get("instruction")]

    if not moves:
        return ""

    sentences = []
    for move in moves:
        text = (move or "").strip()
        if not text:
            continue
        if not text.endswith((".", "!", "?")):
            text = text + "."
        # Capitalise the first letter of each move.
        text = text[0].upper() + text[1:]
        sentences.append(text)

    return " ".join(sentences)


def describe_door_count(door_facts):
    """
    Human-readable door-count summary. Kept here so tests and any
    debug endpoint can share the exact same wording the CLI uses.
    """
    try:
        return door_count_summary(door_facts)
    except Exception:
        return "Door count: not available"


# Re-export a couple of helpers the joiner needs without importing
# the frozen module directly.
def building_name_for_node(nodes, node_id):
    """
    Return the building_name tag on a node, or None. Used by the
    narration joiner to name the entrance in the transition sentence.
    """
    if node_id not in nodes:
        return None
    tags = nodes[node_id].get("tags", {}) or {}
    value = tags.get("building_name")
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def is_indoor_node(node_id):
    """
    Merged-graph convention: outdoor nodes are prefixed with 'o';
    everything else is indoor. This is the same convention the
    composer uses.
    """
    return not str(node_id).startswith("o")