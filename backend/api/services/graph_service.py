"""
graph_service.py

Loads the routing graph once and hands it to every caller. Without
this, every /api/route request would re-parse map.osm and rebuild the
graph, which is wasteful and slow.

Callers use get_graph() — never parse_osm directly.

Description bridge
------------------
The frozen core (campus_graph.py, ai_navigator.py) reads descriptions
from the OSM tags. That means an admin edit to a place's description
in the database wouldn't affect narration — a real disconnect we fix
here.

After loading areas and edges from map.osm, we look up each one's
`description_ai` in the database and override the in-memory text. The
frozen files see the same dict keys they always have ("description"
on the area dict, "description" in the edge tags dict), so nothing in
backend/core/ needs to change.
"""

import threading

from backend.core.campus_graph import build_graph, parse_osm
from backend.api.settings import MAP_OSM_PATH


_lock = threading.Lock()
_graph = None
_nodes = None
_edges = None
_edge_tags = None
_areas = None


def _load():
    """Parse map.osm and build the graph once, under a lock."""
    global _graph, _nodes, _edges, _edge_tags, _areas

    if _graph is not None:
        return

    with _lock:
        if _graph is not None:
            return

        nodes, ways = parse_osm(str(MAP_OSM_PATH))
        graph, footpath_edges, edge_tags = build_graph(nodes, ways)

        from backend.core.campus_graph import named_areas
        areas = named_areas(nodes, ways)

        # Bridge: replace the OSM-sourced description with the DB's
        # `description_ai`, so admin edits are actually reflected in
        # narration. If a row has no DB value, the OSM text is kept.
        _apply_ai_descriptions(areas, edge_tags)

        _nodes = nodes
        _graph = graph
        _edges = footpath_edges
        _edge_tags = edge_tags
        _areas = areas


def _apply_ai_descriptions(areas, edge_tags):
    """
    Override in-memory descriptions with the DB's `description_ai`.

    Areas are matched by `osm_id`. Edges are matched by (node_a, node_b)
    pair. Only values that exist in the DB are applied — a missing row
    or a NULL value leaves the OSM text in place.
    """
    # Imported here to avoid a circular import at module load time.
    from backend.api.db.session import session_scope
    from backend.api.models.area import Area
    from backend.api.models.path_edge import PathEdge

    try:
        with session_scope() as session:
            area_descriptions = {
                row.osm_id: row.description_ai
                for row in session.query(Area).all()
                if row.description_ai
            }
            edge_descriptions = {}
            for row in session.query(PathEdge).all():
                if not row.description_ai:
                    continue
                # Match either direction — the tag dict is keyed by
                # a frozenset, but this table stores a canonical pair.
                a, b = sorted((row.node_a_osm, row.node_b_osm))
                edge_descriptions[(a, b)] = row.description_ai
    except Exception:
        # If the DB isn't ready yet (e.g. first ever boot before the
        # migration has run), skip the bridge silently. The OSM text
        # stays, and narration works as it did before.
        return

    # Areas: `area["id"]` is the OSM way id.
    for area in areas:
        ai_text = area_descriptions.get(str(area["id"]))
        if ai_text:
            area["description"] = ai_text

    # Edges: the tag dict is keyed by frozenset({a, b}). We only
    # override the "description" key inside the existing tag dict,
    # which is exactly what ai_navigator.path_notes_along_route reads.
    for pair_key, tags in edge_tags.items():
        a, b = sorted(pair_key)
        ai_text = edge_descriptions.get((a, b))
        if ai_text:
            tags["description"] = ai_text


def get_graph():
    """Return the loaded graph. Loads on first call."""
    _load()
    return _graph


def get_nodes():
    _load()
    return _nodes


def get_edge_tags():
    _load()
    return _edge_tags


def get_areas():
    _load()
    return _areas


def get_edges():
    _load()
    return _edges


def reset():
    """Force the next get_graph() to reload. Used by tests and by the
    admin places endpoint after an AI description is edited, so the
    change takes effect without restarting the API."""
    global _graph, _nodes, _edges, _edge_tags, _areas
    with _lock:
        _graph = None
        _nodes = None
        _edges = None
        _edge_tags = None
        _areas = None