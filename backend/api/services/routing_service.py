"""
routing_service.py

Wraps campus_graph.a_star and generate_turn_by_turn for the /api/route
endpoint.

Profiles are locked to "fastest" and are not exposed anywhere. The
concept exists in routing_profiles.py as a hook for future cost
adjustments, but callers cannot select one and the API does not
mention it.
"""

import math

from sqlalchemy.orm import Session

from backend.core.campus_graph import (
    a_star,
    generate_turn_by_turn,
    haversine_m,
)
from backend.core.routing_profiles import get_profile

from ..models.place import Place
from ..schemas.common import LatLon
from ..schemas.route import RouteResponse, TurnStep


# The only profile that exists in practice. Not exposed anywhere.
_ACTIVE_PROFILE = "fastest"


def _find_nearest_node(graph, nodes, lat, lon):
    """Return the node_id closest to (lat, lon) that is in the graph."""
    best_id = None
    best_dist = math.inf
    for node_id in graph:
        node = nodes[node_id]
        d = haversine_m(lat, lon, node["lat"], node["lon"])
        if d < best_dist:
            best_dist = d
            best_id = node_id
    return best_id


def _resolve_endpoint(session, graph, nodes, place_id=None, lat=None, lon=None):
    """
    Return (node_id, display_name) for one endpoint of a route.

    If place_id is given, look up the place and use its coordinates —
    then find the nearest graph node (which may be a footpath connector
    the place's entrance sits on).
    If lat/lon is given, find the nearest graph node directly.
    """
    if place_id is not None:
        place = session.query(Place).filter_by(id=place_id).one_or_none()
        if place is None:
            return None, None
        node_id = _find_nearest_node(graph, nodes, place.lat, place.lon)
        return node_id, place.name
    if lat is not None and lon is not None:
        node_id = _find_nearest_node(graph, nodes, lat, lon)
        return node_id, "your current location"
    return None, None


def _apply_profile(graph, edge_tags):
    """
    Return a new adjacency dict where each edge weight is
    length * profile.cost(tags).

    Currently the active profile is "fastest", whose cost function
    returns 1.0 — so this is mathematically a no-op and the returned
    graph has the same weights as the input. The hook exists so a
    future cost adjustment is a change to routing_profiles.py, not to
    this file.
    """
    profile = get_profile(_ACTIVE_PROFILE)
    out = {}
    for node_id, neighbours in graph.items():
        adjusted = []
        for neighbour_id, length in neighbours:
            key = frozenset((node_id, neighbour_id))
            tags = edge_tags.get(key, {})
            cost = profile.cost(tags)
            adjusted.append((neighbour_id, length * cost))
        out[node_id] = adjusted
    return out


def compute_route(
    session: Session,
    graph,
    nodes,
    edge_tags,
    from_place_id=None,
    from_lat=None,
    from_lon=None,
    to_place_id=None,
    to_lat=None,
    to_lon=None,
) -> RouteResponse | None:
    """
    Compute a walking route. Shortest distance.

    Returns None if either endpoint can't be resolved or if no path
    exists. Does not accept a profile — the profile is fixed.
    """
    from_node, from_name = _resolve_endpoint(
        session, graph, nodes, from_place_id, from_lat, from_lon
    )
    to_node, to_name = _resolve_endpoint(
        session, graph, nodes, to_place_id, to_lat, to_lon
    )

    if from_node is None or to_node is None:
        return None
    if from_node == to_node:
        return None

    costed = _apply_profile(graph, edge_tags)
    path, distance = a_star(costed, nodes, from_node, to_node)
    if not path:
        return None

    steps = generate_turn_by_turn(path, nodes)
    geometry = [LatLon(lat=nodes[nid]["lat"], lon=nodes[nid]["lon"]) for nid in path]

    return RouteResponse(
        distance_m=distance,
        steps=[
            TurnStep(
                kind=s["kind"],
                instruction=s["instruction"],
                at_m=s["at_m"],
                distance_m=s["distance_m"],
            )
            for s in steps
        ],
        geometry=geometry,
        from_name=from_name,
        to_name=to_name,
    )