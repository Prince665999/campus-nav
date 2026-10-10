"""
narration_joiner.py

Split a merged route path into contiguous runs and narrate each one
with the engine that understands it.

The merged graph uses a prefix convention: outdoor nodes are prefixed
with 'o', indoor nodes are not. Splitting on that prefix gives the
runs we need, exactly:

    [outdoor, ...]                         → one outdoor run
    [indoor, ...]                          → one indoor run
    [outdoor, ..., indoor, ...]            → outdoor run, indoor run
    [indoor, ..., outdoor, ...]            → indoor run, outdoor run
    [indoor, ..., outdoor, ..., indoor, ...] → three runs

Between runs we insert a single template sentence naming the
building, if the boundary node carries a building_name tag. We never
call the AI for the transition — the sentence is deterministic.

Rules applied to each run's text:
  - The "you have arrived" line is kept only on the last run.
  - The "starting from ..." line is kept only on the first run.
  - Runs are joined with a single space.

Outdoor runs reuse the existing outdoor narration pipeline. The
merged graph's outdoor edges carry the same tags as map.osm's, so
the outdoor engine sees exactly what it would for an outdoor-only
route. The only difference is that we pass a slice of the path
instead of a full route.

IMPORTANT — id conventions
--------------------------

  - The merged graph keys everything by prefixed outdoor ids
    ("o27836") and unprefixed indoor ids ("-27836").
  - The frozen outdoor engine expects UNPREFIXED ids everywhere:
    nodes keyed by "27836", edge_tags keyed by
    frozenset({"27836", "27837"}), path entries "27836".
  - So for every outdoor run, we strip the 'o' prefix from the path
    AND from the keys of the nodes/graph/edge_tags subset we build.
    We do that once, at the boundary, so the outdoor engine never
    sees a prefixed id.
  - For an indoor run, no prefix stripping happens — indoor ids
    have no prefix to begin with.
"""

import logging
import re

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def join_runs(
    path,
    nodes,
    graph,
    edge_tags,
    door_node_ids,
    corridor_of_door,
    start_name,
    end_name,
    lang="en",
    live=False,
    api_key=None,
):
    """
    Narrate a merged route by splitting it into runs and calling the
    right engine for each.

    path:            list of node ids on the merged graph
    nodes:           {node_id: {"lat", "lon", "tags"}} for the merged graph
    graph:           merged adjacency (outdoor + indoor edges)
    edge_tags:       {frozenset({a,b}): tags} for the merged graph
    door_node_ids:   set of indoor door node ids
    corridor_of_door: dict door_id -> corridor name
    start_name:      display name for the first node
    end_name:        display name for the last node
    lang:            language code, passed to the outdoor pipeline
    live:            if True and a key exists, use the outdoor AI path
    api_key:         Groq key, or None

    Returns the joined narration text.

    Raises ValueError if the path is empty.
    """
    if not path:
        raise ValueError("cannot narrate an empty route")

    runs = split_runs(path)
    if not runs:
        raise ValueError("cannot narrate a route with no runs")

    parts = []
    for index, run in enumerate(runs):
        is_first = index == 0
        is_last = index == len(runs) - 1

        if run["mode"] == "indoor":
            text = _narrate_indoor_run(
                run=run,
                nodes=nodes,
                graph=graph,
                door_node_ids=door_node_ids,
                corridor_of_door=corridor_of_door,
                is_first=is_first,
                is_last=is_last,
                start_name=start_name,
                end_name=end_name,
                api_key=api_key,
            )
        else:
            text = _narrate_outdoor_run(
                run=run,
                nodes=nodes,
                graph=graph,
                edge_tags=edge_tags,
                is_first=is_first,
                is_last=is_last,
                start_name=start_name,
                end_name=end_name,
                lang=lang,
                live=live,
                api_key=api_key,
            )

        text = _strip_arrival(text) if not is_last else text
        text = _strip_opening(text) if not is_first else text

        parts.append(text.strip())

        if not is_last:
            parts.append(_transition_sentence(runs, index, nodes))

    return " ".join(p for p in parts if p)


# ---------------------------------------------------------------------------
# Path splitting
# ---------------------------------------------------------------------------

def split_runs(path):
    """
    Split a merged path into contiguous runs by node prefix.

    Returns a list of dicts:
        {"mode": "outdoor"|"indoor",
         "nodes": [node_id, ...],
         "start_index": int, "end_index": int}

    A run has at least one node. Consecutive runs are always of
    different modes because the split only happens on prefix change.
    """
    if not path:
        return []

    runs = []
    current_nodes = [path[0]]
    current_mode = "outdoor" if str(path[0]).startswith("o") else "indoor"
    current_start = 0

    for i in range(1, len(path)):
        node = path[i]
        mode = "outdoor" if str(node).startswith("o") else "indoor"
        if mode == current_mode:
            current_nodes.append(node)
        else:
            runs.append({
                "mode": current_mode,
                "nodes": current_nodes,
                "start_index": current_start,
                "end_index": i - 1,
            })
            current_nodes = [node]
            current_mode = mode
            current_start = i

    runs.append({
        "mode": current_mode,
        "nodes": current_nodes,
        "start_index": current_start,
        "end_index": len(path) - 1,
    })
    return runs


# ---------------------------------------------------------------------------
# Outdoor run
# ---------------------------------------------------------------------------

def _narrate_outdoor_run(
    run,
    nodes,
    graph,
    edge_tags,
    is_first,
    is_last,
    start_name,
    end_name,
    lang,
    live,
    api_key,
):
    """
    Narrate one outdoor run.

    The outdoor engine expects UNPREFIXED node ids everywhere. The
    merged graph uses 'o'-prefixed ids for outdoor nodes. So we
    rename every key we hand to the engine:

      - path nodes:  "o27836" → "27836"
      - nodes dict:  keys "o27836" → "27836"
      - graph dict:  keys and neighbour entries stripped
      - edge_tags:   frozenset keys stripped
    """
    from . import narration_service as _outdoor

    stripped_path = [_strip_o(n) for n in run["nodes"]]

    # Build a stripped-id view of nodes for just this run.
    outdoor_nodes = {}
    for node_id in run["nodes"]:
        if node_id in nodes:
            outdoor_nodes[_strip_o(node_id)] = nodes[node_id]

    # Adjacency keyed by stripped ids, entries stripped.
    run_set = set(run["nodes"])
    outdoor_graph = {}
    for node_id in run["nodes"]:
        neighbours = graph.get(node_id, []) or []
        kept = []
        for entry in neighbours:
            if not entry:
                continue
            neighbour = entry[0]
            length = entry[1] if len(entry) > 1 else 0.0
            if neighbour in run_set:
                kept.append((_strip_o(neighbour), length))
        outdoor_graph[_strip_o(node_id)] = kept

    # Edge tags: only edges whose both endpoints are o-prefixed, and
    # only those within this run. Re-key with stripped ids.
    outdoor_edge_tags = {}
    for key, value in edge_tags.items():
        parts = list(key)
        if len(parts) != 2:
            continue
        a, b = parts[0], parts[1]
        if not (str(a).startswith("o") and str(b).startswith("o")):
            continue
        if a not in run_set or b not in run_set:
            continue
        stripped_key = frozenset((_strip_o(a), _strip_o(b)))
        outdoor_edge_tags[stripped_key] = value

    run_start_name = start_name if is_first else ""
    run_end_name = end_name if is_last else ""

    try:
        text = _outdoor.narrate_outdoor_segment(
            path=stripped_path,
            nodes=outdoor_nodes,
            graph=outdoor_graph,
            edge_tags=outdoor_edge_tags,
            start_name=run_start_name,
            end_name=run_end_name,
            lang=lang,
            live=live,
            api_key=api_key,
        )
    except Exception as e:
        logger.warning("outdoor run narration failed: %s", e)
        return ""

    return text or ""


# ---------------------------------------------------------------------------
# Indoor run
# ---------------------------------------------------------------------------

def _narrate_indoor_run(
    run,
    nodes,
    graph,
    door_node_ids,
    corridor_of_door,
    is_first,
    is_last,
    start_name,
    end_name,
    api_key,
):
    """
    Narrate one indoor run with the indoor engine.

    The indoor engine expects the merged indoor graph (it reads
    levels, door nodes, and corridor tags from `way_tags`, all of
    which are already present on the merged graph's edges for indoor
    ways).

    We pass the run's nodes as they are — no prefix stripping,
    because indoor nodes have no prefix in the first place.

    Note: the `nodes` and `graph` we receive here are the merged
    graph — the same dicts the indoor engine was built against. So
    the door ids, node ids, and way tags all line up.
    """
    from . import indoor_narration_service as _indoor

    run_start_name = start_name if is_first else ""
    run_end_name = end_name if is_last else ""

    try:
        return _indoor.narrate_indoor_run(
            path=run["nodes"],
            nodes=nodes,
            graph=graph,
            door_node_ids=door_node_ids,
            corridor_of_door=corridor_of_door,
            start_name=run_start_name,
            end_name=run_end_name,
            api_key=api_key,
        )
    except Exception as e:
        logger.warning("indoor run narration failed: %s", e)
        return ""


# ---------------------------------------------------------------------------
# Transition sentence
# ---------------------------------------------------------------------------

_ENTRANCE_RE = re.compile(r"\bentrance\b", re.IGNORECASE)


def _transition_sentence(runs, index, nodes):
    """
    One handover sentence between run `index` and run `index + 1`.

    If the boundary node belongs to an entrance and carries a
    building_name, we name it. Otherwise we fall back to a generic
    sentence that mentions "the entrance" without naming a building.

    The sentence is chosen from a small template set, based on the
    mode pair. It is deterministic. No AI is called.
    """
    current = runs[index]
    following = runs[index + 1]

    from_mode = current["mode"]
    to_mode = following["mode"]

    # The boundary node is the last node of `current` (for
    # indoor→outdoor, the building we're leaving) or the first node
    # of `following` (for outdoor→indoor, the building we're
    # entering). We check both.
    boundary_candidates = [current["nodes"][-1], following["nodes"][0]]
    building = None
    for node_id in boundary_candidates:
        if node_id not in nodes:
            continue
        tags = nodes[node_id].get("tags", {}) or {}
        name = tags.get("building_name")
        if name:
            name = str(name).strip()
            if name:
                building = name
                break

    if from_mode == "outdoor" and to_mode == "indoor":
        if building:
            return f"When you reach the entrance of {building}, go inside."
        return "When you reach the entrance, go inside."

    if from_mode == "indoor" and to_mode == "outdoor":
        if building:
            return f"When you leave {building}, head outside."
        return "When you leave the building, head outside."

    # Any other combination (shouldn't happen with prefix-based
    # splitting — runs alternate modes) — fall back to a generic
    # sentence so the narration never breaks mid-flow.
    return "Keep going."


# ---------------------------------------------------------------------------
# Text cleanup
# ---------------------------------------------------------------------------

_ARRIVAL_PATTERNS = [
    re.compile(r"\byou have arrived\b.*?(?=\.|$)", re.IGNORECASE),
    re.compile(r"\byou'?ve arrived\b.*?(?=\.|$)", re.IGNORECASE),
    re.compile(r"\band (?:there it is|that'?s it)\b.*?(?=\.|$)", re.IGNORECASE),
]

_OPENING_PATTERNS = [
    re.compile(r"\bstarting from [^.]*\.\s*", re.IGNORECASE),
    re.compile(r"\bfrom your current position[,.]?\s*", re.IGNORECASE),
    re.compile(r"\balright, from [^.]*\.\s*", re.IGNORECASE),
]


def _strip_arrival(text):
    """Remove the arrival sentence from a non-final run."""
    if not text:
        return text
    for pattern in _ARRIVAL_PATTERNS:
        text = pattern.sub("", text)
    return _tidy(text)


def _strip_opening(text):
    """Remove the opening sentence from a non-first run."""
    if not text:
        return text
    for pattern in _OPENING_PATTERNS:
        text = pattern.sub("", text)
    return _tidy(text)


def _tidy(text):
    """Collapse extra whitespace and fix stray punctuation after
    sentence removal."""
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\s+\.", ".", text)
    text = re.sub(r"\.\s*\.", ".", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Small helper
# ---------------------------------------------------------------------------

def _strip_o(node_id):
    """Remove the 'o' prefix from an outdoor node id if present."""
    s = str(node_id)
    if s.startswith("o"):
        return s[1:]
    return s