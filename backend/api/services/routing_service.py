"""
routing_service.py

Wraps campus_graph.a_star and generate_turn_by_turn for the /api/route
endpoint. Checks the cache first, then computes if needed, then writes
the result back.

Cache layers, in order:
  1. Redis, if available. Fastest.
  2. The route_cache table, if the route is popular and was written
     by a previous request.
  3. Live computation via A*, if neither hit.
"""

import json
import math

from sqlalchemy.orm import Session

from backend.core.campus_graph import (
    a_star,
    generate_turn_by_turn,
    haversine_m,
)

from ..models.place import Place
from ..models.route_cache import RouteCache
from ..schemas.common import LatLon
from ..schemas.route import RouteResponse, TurnStep
from . import cache_service


def _find_nearest_node(graph, nodes, lat, lon):
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


def _compute_route_uncached(
    session, graph, nodes, edge_tags,
    from_place_id, from_lat, from_lon,
    to_place_id, to_lat, to_lon,
) -> RouteResponse | None:
    """Compute a route without touching the cache."""
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

    path, distance = a_star(graph, nodes, from_node, to_node)
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


def _route_to_dict(route: RouteResponse) -> dict:
    """Serialise a RouteResponse to the dict shape the cache stores."""
    return route.model_dump(mode="json")


def _dict_to_route(data: dict) -> RouteResponse:
    """Deserialise the cached dict back into a RouteResponse."""
    return RouteResponse.model_validate(data)


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
    Compute a route, checking the cache first.

    Only routes between two place IDs are cached. Coordinate-based
    routes (used for recalculation) fall straight through to
    computation, because the coordinate varies and caching per
    coordinate would create too many keys.
    """
    cacheable = (
        from_place_id is not None
        and to_place_id is not None
        and from_lat is None
        and from_lon is None
        and to_lat is None
        and to_lon is None
    )

    if not cacheable:
        return _compute_route_uncached(
            session, graph, nodes, edge_tags,
            from_place_id, from_lat, from_lon,
            to_place_id, to_lat, to_lon,
        )

    # ---- Redis cache check ----
    key = cache_service.route_key(from_place_id, to_place_id)
    cached = cache_service.get_cached_route(key)
    if cached is not None:
        try:
            return _dict_to_route(cached)
        except Exception:
            # Cached data doesn't match the current schema. Ignore
            # it and recompute.
            pass

    # ---- Durable cache check ----
    row = (
        session.query(RouteCache)
        .filter_by(
            start_place_id=from_place_id,
            end_place_id=to_place_id,
            profile="fastest",
        )
        .one_or_none()
    )
    if row is not None:
        try:
            route = _dict_to_route(json.loads(row.path_json))
            # Refresh the Redis copy so the next request hits the
            # fast layer.
            cache_service.set_cached_route(key, _route_to_dict(route))
            return route
        except Exception:
            # Corrupt or stale row. Fall through to computation.
            pass

    # ---- Compute ----
    route = _compute_route_uncached(
        session, graph, nodes, edge_tags,
        from_place_id, from_lat, from_lon,
        to_place_id, to_lat, to_lon,
    )
    if route is None:
        return None

    # ---- Write back ----
    route_dict = _route_to_dict(route)
    cache_service.set_cached_route(key, route_dict)
    _upsert_durable_cache(session, from_place_id, to_place_id, route_dict)

    return route


def _upsert_durable_cache(
    session: Session,
    from_place_id: int,
    to_place_id: int,
    route_dict: dict,
):
    """
    Write a row to route_cache, or increment its hit_count if the
    row exists.
    """
    existing = (
        session.query(RouteCache)
        .filter_by(
            start_place_id=from_place_id,
            end_place_id=to_place_id,
            profile="fastest",
        )
        .one_or_none()
    )

    if existing is None:
        session.add(
            RouteCache(
                start_place_id=from_place_id,
                end_place_id=to_place_id,
                profile="fastest",
                path_json=json.dumps(route_dict),
                distance_m=route_dict["distance_m"],
                hit_count=1,
            )
        )
    else:
        existing.path_json = json.dumps(route_dict)
        existing.hit_count += 1