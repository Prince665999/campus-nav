"""
graph_service.py

Loads the routing graph once and hands it to every caller. Without
this, every /api/route request would re-parse map.osm and rebuild the
graph, which is wasteful and slow.

Callers use get_graph() — never parse_osm directly.
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

        _nodes = nodes
        _graph = graph
        _edges = footpath_edges
        _edge_tags = edge_tags
        _areas = areas


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
    """Force the next get_graph() to reload. Used by tests only."""
    global _graph, _nodes, _edges, _edge_tags, _areas
    with _lock:
        _graph = None
        _nodes = None
        _edges = None
        _edge_tags = None
        _areas = None