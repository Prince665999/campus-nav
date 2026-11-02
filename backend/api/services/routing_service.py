"""
routing_service.py

Wraps campus_graph.a_star and generate_turn_by_turn for the /api/route
endpoint. Checks the cache first, then computes.
"""

import json
import logging
import math

from sqlalchemy.orm import Session

from backend.core.campus_graph import (
    VIRTUAL_START_ID,
    a_star,
    generate_turn_by_turn,
    haversine_m,
    nearest_point_on_graph,
    with_virtual_start,
)

from ..models.place import Place
from ..models.route_cache import RouteCache
from ..schemas.common import LatLon
from ..schemas.route import RouteResponse, TurnStep
from . import cache_service
from .step_merge import anchor_steps_to_leg_start

logger = logging.getLogger(__name__)


# The maximum distance, in metres, a live GPS fix is allowed to be
# from the nearest path node before we refuse to route from it.
#
# A campus footpath network is dense — a student standing anywhere on
# or beside a path is within 20-30 m of a node. Beyond 60 m, the fix
# is either genuinely off-network or is a bad estimate (network-based
# location, indoors, under cover). In both cases, the honest answer
# is "we can't confidently place you," not "route from across campus."
SNAP_MAX_DISTANCE_M = 40

# A live fix is snapped to the nearest POINT ON A PATH (not the nearest
# node), so the distance that matters is fix -> path. When the phone
# itself says its accuracy is worse than SNAP_MAX_DISTANCE_M (rain, tree
# cover), a fix that far from the path can still be a student standing
# on it, so the limit widens to the reported accuracy, up to this cap.
SNAP_MAX_DISTANCE_CAP_M = 75

# Bump this whenever the shape of a cached route changes. The Redis key
# and the durable RouteCache rows are both keyed on it, so old routes
# (with the old step anchors) are simply never read again.
#   fastest    : steps anchored to the END of each leg (one step late)
#   fastest-v2 : steps anchored to the START of each leg
ROUTE_CACHE_PROFILE = "fastest-v2"


class UnreliableLocationError(Exception):
    """
    Raised when a live GPS fix is too far from any path node to trust.
    The route endpoint catches this and returns a distinct error code
    so the client can show a specific message.
    """
    pass


def _find_nearest_node(graph, nodes, lat, lon, max_distance_m=None):
    """
    Return the node_id closest to (lat, lon). If max_distance_m is
    given and the nearest node is further than that, return None.
    """
    best_id = None
    best_dist = math.inf
    for node_id in graph:
        node = nodes[node_id]
        d = haversine_m(lat, lon, node["lat"], node["lon"])
        if d < best_dist:
            best_dist = d
            best_id = node_id

    if max_distance_m is not None and best_dist > max_distance_m:
        return None
    return best_id


def _snap_limit_m(accuracy_m):
    if accuracy_m is None:
        return SNAP_MAX_DISTANCE_M
    return min(SNAP_MAX_DISTANCE_CAP_M, max(SNAP_MAX_DISTANCE_M, accuracy_m))


def _snap_live_fix(graph, nodes, lat, lon, accuracy_m):
    """
    Snap a live GPS fix to the nearest point on a path edge.

    Returns (graph, nodes, start_id): a graph in which the snapped
    point exists as a node. Raises UnreliableLocationError if the fix
    is too far from every path to trust.
    """
    if accuracy_m is not None:
        logger.info(
            "Routing from live fix at (%.5f, %.5f) accuracy %.1fm",
            lat, lon, accuracy_m,
        )
    snap = nearest_point_on_graph(graph, nodes, lat, lon)
    if snap is None or snap["distance_m"] > _snap_limit_m(accuracy_m):
        raise UnreliableLocationError()
    return with_virtual_start(graph, nodes, snap)


def _resolve_endpoint(
    session,
    graph,
    nodes,
    place_id=None,
    lat=None,
    lon=None,
    accuracy_m=None,
    is_live_fix=False,
):
    """
    Return (node_id, display_name) for one endpoint.

    When place_id is given, the coordinates come from the database —
    an admin placed them deliberately, so no snap-distance limit is
    applied.

    When lat/lon are given and is_live_fix is True, this is a live
    GPS position. A snap-distance limit is applied, and a fix that
    can't be confidently placed raises UnreliableLocationError.
    """
    if place_id is not None:
        place = session.query(Place).filter_by(id=place_id).one_or_none()
        if place is None:
            return None, None
        node_id = _find_nearest_node(graph, nodes, place.lat, place.lon)
        return node_id, place.name

    if lat is not None and lon is not None:
        if is_live_fix:
            if accuracy_m is not None:
                logger.info(
                    "Routing from live fix at (%.5f, %.5f) accuracy %.1fm",
                    lat, lon, accuracy_m,
                )
            node_id = _find_nearest_node(
                graph, nodes, lat, lon, max_distance_m=SNAP_MAX_DISTANCE_M
            )
            if node_id is None:
                raise UnreliableLocationError()
        else:
            node_id = _find_nearest_node(graph, nodes, lat, lon)
        return node_id, "your current location"

    return None, None


def _compute_route_uncached(
    session,
    graph,
    nodes,
    edge_tags,
    from_place_id,
    from_lat,
    from_lon,
    from_accuracy_m,
    to_place_id,
    to_lat,
    to_lon,
):
    is_live_start = from_place_id is None and from_lat is not None

    if is_live_start:
        # Start from the point on the path nearest the student, not the
        # nearest junction. See nearest_point_on_graph.
        route_graph, route_nodes, from_node = _snap_live_fix(
            graph, nodes, from_lat, from_lon, from_accuracy_m
        )
        from_name = "your current location"
    else:
        route_graph, route_nodes = graph, nodes
        from_node, from_name = _resolve_endpoint(
            session,
            graph,
            nodes,
            place_id=from_place_id,
            lat=from_lat,
            lon=from_lon,
            accuracy_m=from_accuracy_m,
            is_live_fix=False,
        )

    to_node, to_name = _resolve_endpoint(
        session,
        graph,
        nodes,
        place_id=to_place_id,
        lat=to_lat,
        lon=to_lon,
        is_live_fix=False,
    )

    if from_node is None or to_node is None:
        return None
    if from_node == to_node:
        return None

    path, distance = a_star(route_graph, route_nodes, from_node, to_node)
    if not path:
        return None

    steps = generate_turn_by_turn(path, route_nodes)
    # Anchor every instruction to where its leg STARTS, so it is shown
    # as soon as the walker makes the previous turn. Before this only
    # the first step was corrected and every later one appeared a full
    # leg late. See step_merge.anchor_steps_to_leg_start.
    steps = anchor_steps_to_leg_start(steps)

    geometry = [
        LatLon(lat=route_nodes[nid]["lat"], lon=route_nodes[nid]["lon"])
        for nid in path
    ]

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
        # Real graph nodes only: the virtual start is not in the OSM
        # data, and narration looks every node up there.
        node_path=["o" + n for n in path if n != VIRTUAL_START_ID],
    )


def _route_to_dict(route):
    return route.model_dump(mode="json")


def _dict_to_route(data):
    return RouteResponse.model_validate(data)


def compute_route(
    session,
    graph,
    nodes,
    edge_tags,
    from_place_id=None,
    from_lat=None,
    from_lon=None,
    from_accuracy_m=None,
    to_place_id=None,
    to_lat=None,
    to_lon=None,
):
    """
    Compute a route. Shortest distance.

    Live GPS fixes are checked against SNAP_MAX_DISTANCE_M — a fix
    too far from any path node raises UnreliableLocationError.
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
            from_place_id, from_lat, from_lon, from_accuracy_m,
            to_place_id, to_lat, to_lon,
        )

    key = cache_service.route_key(
        from_place_id, to_place_id, ROUTE_CACHE_PROFILE
    )
    cached = cache_service.get_cached_route(key)
    if cached is not None:
        try:
            return _dict_to_route(cached)
        except Exception:
            pass

    row = (
        session.query(RouteCache)
        .filter_by(
            start_place_id=from_place_id,
            end_place_id=to_place_id,
            profile=ROUTE_CACHE_PROFILE,
        )
        .one_or_none()
    )
    if row is not None:
        try:
            route = _dict_to_route(json.loads(row.path_json))
            cache_service.set_cached_route(key, _route_to_dict(route))
            return route
        except Exception:
            pass

    route = _compute_route_uncached(
        session, graph, nodes, edge_tags,
        from_place_id, from_lat, from_lon, from_accuracy_m,
        to_place_id, to_lat, to_lon,
    )
    if route is None:
        return None

    route_dict = _route_to_dict(route)
    cache_service.set_cached_route(key, route_dict)
    _upsert_durable_cache(session, from_place_id, to_place_id, route_dict)

    return route


def _upsert_durable_cache(
    session,
    from_place_id,
    to_place_id,
    route_dict,
):
    existing = (
        session.query(RouteCache)
        .filter_by(
            start_place_id=from_place_id,
            end_place_id=to_place_id,
            profile=ROUTE_CACHE_PROFILE,
        )
        .one_or_none()
    )

    if existing is None:
        session.add(
            RouteCache(
                start_place_id=from_place_id,
                end_place_id=to_place_id,
                profile=ROUTE_CACHE_PROFILE,
                path_json=json.dumps(route_dict),
                distance_m=route_dict["distance_m"],
                hit_count=1,
            )
        )
    else:
        existing.path_json = json.dumps(route_dict)
        existing.hit_count += 1