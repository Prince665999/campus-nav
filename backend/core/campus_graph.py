"""
campus_graph.py

Shared logic for the campus navigation project:
- Parses a map.osm export
- Builds a routable graph using ALL nodes that sit on footpaths
  (junctions can be unnamed - they're just geometry)
- Lets you route between NAMED points only (as requested)
- A* shortest path + turn-by-turn instruction generation

Both turn_by_turn.py and ai_navigator.py import this file, so keep
it in the same folder as those scripts.

What changed in this version
----------------------------
1. Direction is no longer only "left or right". Anything can now be
   straight ahead, ahead-and-to-one-side, beside you, or behind you.
   That is what was making a building sitting directly in front of the
   walker get announced as being on the left or the right.
2. Turns are detected with both a cumulative-drift check AND a
   per-segment check, so a long gentle bend is reported as "the path
   curves left" instead of a hard "turn left", and a real corner is
   pinned to the node where the corner actually is (not to the node
   where the drift finally crossed the threshold).
3. Distances are rounded the way a person speaks them.
4. A* now uses a real priority queue and a closed set.
5. Added point_in_polygon so we can tell when the route goes THROUGH
   an area rather than past it.
"""

import xml.etree.ElementTree as ET
import math
import heapq
import difflib

EARTH_RADIUS_M = 6371000

# How wide the "cones" are when describing where something sits relative
# to the way you are walking. Tune these if descriptions feel off.
AHEAD_CONE_DEG = 25      # within this of dead ahead -> "straight ahead"
DIAGONAL_CONE_DEG = 70   # within this -> "ahead on your left/right"
ABREAST_CONE_DEG = 115   # within this -> "on your left/right"
                         # beyond this -> it is behind you


# ---------- Parsing ----------

def parse_osm(osm_path):
    tree = ET.parse(osm_path)
    root = tree.getroot()

    nodes = {}  # id -> {"lat":..., "lon":..., "tags": {...}}
    ways = []

    for elem in root:
        if elem.tag == "node":
            node_id = elem.get("id")
            lat = float(elem.get("lat"))
            lon = float(elem.get("lon"))
            tags = {tag.get("k"): tag.get("v") for tag in elem.findall("tag")}
            nodes[node_id] = {"lat": lat, "lon": lon, "tags": tags}

        elif elem.tag == "way":
            tags = {tag.get("k"): tag.get("v") for tag in elem.findall("tag")}
            refs = [nd.get("ref") for nd in elem.findall("nd")]
            ways.append({"id": elem.get("id"), "tags": tags, "refs": refs})

    return nodes, ways


# ---------- Geometry helpers ----------

def haversine_m(lat1, lon1, lat2, lon2):
    """Distance in meters between two lat/lon points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lat1, lon1, lat2, lon2):
    """Initial compass bearing (0=N, 90=E, ...) from point 1 to point 2."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    x = math.sin(dlambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def compass_word(bearing):
    dirs = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]
    return dirs[round(bearing / 45) % 8]


def relative_bearing(walk_bearing, target_bearing):
    """
    Signed angle from the direction you are walking to some other bearing.
    Range -180..180. POSITIVE means clockwise, i.e. to your RIGHT.
    NEGATIVE means to your LEFT. Near 0 means dead ahead. Near +/-180
    means directly behind you.
    """
    return (target_bearing - walk_bearing + 540) % 360 - 180


def relative_bearing_to_point(lat, lon, walk_bearing, target_lat, target_lon):
    """Same as above, but for an actual point rather than a bearing."""
    return relative_bearing(walk_bearing, bearing_deg(lat, lon, target_lat, target_lon))


def relative_position(rel):
    """
    Turns a signed relative bearing into the phrase a human would use.
    This is the fix for 'the building is in front of me but it says left'.
    """
    a = abs(rel)
    side = "right" if rel > 0 else "left"
    if a <= AHEAD_CONE_DEG:
        return "straight ahead"
    if a <= DIAGONAL_CONE_DEG:
        return "ahead on your " + side
    if a <= ABREAST_CONE_DEG:
        return "on your " + side
    return "behind you on your " + side


def is_behind(rel):
    """True when something sits behind the walker's shoulders right now."""
    return abs(rel) > ABREAST_CONE_DEG


def side_word(rel):
    """Just left/right, ignoring how far forward or back it is."""
    return "right" if rel > 0 else "left"


def round_distance(m):
    """Round a distance the way a person would say it out loud."""
    if m < 10:
        return int(round(m))
    if m < 100:
        return int(round(m / 5.0) * 5)
    return int(round(m / 10.0) * 10)


def describe_distance(m):
    """Spoken-style distance phrase."""
    r = round_distance(m)
    if r <= 4:
        return "a couple of steps"
    if r <= 10:
        return "a few steps"
    return "about " + str(r) + " meters"


def latlon_to_xy(lat, lon, ref_lat):
    """Flat local projection (meters) - fine for small areas like a campus."""
    x = math.radians(lon) * EARTH_RADIUS_M * math.cos(math.radians(ref_lat))
    y = math.radians(lat) * EARTH_RADIUS_M
    return x, y


def point_segment_info(p, a, b):
    """
    Returns (distance_m, t, side) for point p relative to segment a->b.
    - distance_m: perpendicular distance in meters
    - t: 0..1, how far along the segment the closest point falls
    - side: "left" or "right" of the direction of travel from a to b
    """
    ref_lat = a[0]
    px, py = latlon_to_xy(p[0], p[1], ref_lat)
    ax, ay = latlon_to_xy(a[0], a[1], ref_lat)
    bx, by = latlon_to_xy(b[0], b[1], ref_lat)

    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay), 0.0, "left"

    t_raw = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t_raw))
    closest_x, closest_y = ax + t * dx, ay + t * dy
    dist = math.hypot(px - closest_x, py - closest_y)

    cross_z = dx * (py - ay) - dy * (px - ax)
    side = "left" if cross_z > 0 else "right"

    return dist, t, side


def closest_point_on_polygon(point, vertices):
    """
    Returns (distance_m, (lat, lon)) - the closest point on the polygon's
    boundary to the given point, checking every edge (not just vertices).
    """
    ref_lat = point[0]
    px, py = latlon_to_xy(point[0], point[1], ref_lat)

    best_dist = None
    best_ll = None
    n = len(vertices)

    for i in range(n):
        a = vertices[i]
        b = vertices[(i + 1) % n]
        ax, ay = latlon_to_xy(a[0], a[1], ref_lat)
        bx, by = latlon_to_xy(b[0], b[1], ref_lat)

        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            t = 0
        else:
            t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
            t = max(0, min(1, t))

        cx, cy = ax + t * dx, ay + t * dy
        dist = math.hypot(px - cx, py - cy)

        if best_dist is None or dist < best_dist:
            best_dist = dist
            lat_c = math.degrees(cy / EARTH_RADIUS_M)
            lon_c = math.degrees(cx / (EARTH_RADIUS_M * math.cos(math.radians(ref_lat))))
            best_ll = (lat_c, lon_c)

    return best_dist, best_ll


def point_to_polygon_distance(point, vertices):
    """Shortest distance in meters from a point to the BOUNDARY of a polygon."""
    dist, _ = closest_point_on_polygon(point, vertices)
    return dist


def point_in_polygon(point, vertices):
    """
    Standard ray-casting test. Lat/lon is treated as flat here, which is
    perfectly fine at campus scale. Used so that walking straight through
    a field or a courtyard is described as going THROUGH it rather than
    passing beside it.
    """
    lat, lon = point
    inside = False
    n = len(vertices)
    j = n - 1
    for i in range(n):
        lat_i, lon_i = vertices[i]
        lat_j, lon_j = vertices[j]
        if (lon_i > lon) != (lon_j > lon):
            denom = (lon_j - lon_i)
            if denom != 0:
                lat_cross = lat_i + (lon - lon_i) * (lat_j - lat_i) / denom
                if lat < lat_cross:
                    inside = not inside
        j = i
    return inside


def polygon_centroid(vertices):
    """Simple average of the corners - good enough for a campus building."""
    lat = sum(v[0] for v in vertices) / len(vertices)
    lon = sum(v[1] for v in vertices) / len(vertices)
    return lat, lon


def side_from_bearing(route_lat, route_lon, bearing, target_lat, target_lon):
    """Which side (left/right) of someone's direction of travel a target falls on."""
    return side_word(relative_bearing_to_point(route_lat, route_lon, bearing, target_lat, target_lon))


def densify_polygon(vertices, step_m=2.0):
    """
    Walk the outline of a polygon and return a point every `step_m`.

    Why this matters: a building is often only four corners. If you only
    project the corners onto the route you get four along-track values and
    a long wall between two of them contributes nothing. Densifying means
    the whole face of the building is represented, so "where does this
    building begin alongside me" is answered by the actual wall, not by
    whichever corner happened to be closest.
    """
    points = []
    n = len(vertices)
    for i in range(n):
        a = vertices[i]
        b = vertices[(i + 1) % n]
        seg = haversine_m(a[0], a[1], b[0], b[1])
        steps = max(1, int(seg // step_m))
        for s in range(steps):
            t = s / steps
            points.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return points


class RouteProjector:
    """
    Projects any point onto the walked route and answers two questions:
    how far along the walk it sits (along_m), and how far off to the side
    it is (offset_m).

    This replaces "find the sample where the distance is smallest". That
    old approach broke badly for anything running parallel to the path,
    because the smallest distance is a long flat plateau and which sample
    wins is essentially arbitrary. Along-track projection has no plateau
    problem: a wall that starts at 70 m projects to 70 m, always, on both
    sides of the path.
    """

    def __init__(self, samples):
        self.samples = samples
        self.ref_lat = samples[0]["lat"]
        self.xy = [latlon_to_xy(s["lat"], s["lon"], self.ref_lat) for s in samples]

    def project(self, lat, lon):
        px, py = latlon_to_xy(lat, lon, self.ref_lat)
        best_sq = None
        best_i = 0
        for i, (sx, sy) in enumerate(self.xy):
            d = (px - sx) ** 2 + (py - sy) ** 2
            if best_sq is None or d < best_sq:
                best_sq = d
                best_i = i
        return {
            "index": best_i,
            "along_m": self.samples[best_i]["cum_dist"],
            "offset_m": math.sqrt(best_sq),
            "sample": self.samples[best_i],
        }

    def sample_at(self, distance_m):
        """The route sample closest to a given distance from the start."""
        best_i = 0
        best_d = None
        for i, s in enumerate(self.samples):
            d = abs(s["cum_dist"] - distance_m)
            if best_d is None or d < best_d:
                best_d = d
                best_i = i
        return self.samples[best_i]


def sample_route(path, nodes, step_m=5):
    """
    Walks the whole route in small steps, returning a list of
    {lat, lon, cum_dist, bearing} - used to check, at every point along
    the walk, what's nearby AND which way the walker is facing at that
    exact moment. The bearing is what lets us tell "in front of you"
    apart from "behind you", which the old version could not do.
    """
    samples = []
    cum = 0.0

    for i in range(len(path) - 1):
        a, b = nodes[path[i]], nodes[path[i + 1]]
        seg_len = haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
        bearing = bearing_deg(a["lat"], a["lon"], b["lat"], b["lon"])
        steps = max(1, int(seg_len // step_m))

        for s in range(steps):
            t = s / steps
            lat = a["lat"] + (b["lat"] - a["lat"]) * t
            lon = a["lon"] + (b["lon"] - a["lon"]) * t
            samples.append({
                "lat": lat,
                "lon": lon,
                "cum_dist": cum + seg_len * t,
                "bearing": bearing,
            })

        cum += seg_len

    last = nodes[path[-1]]
    last_bearing = samples[-1]["bearing"] if samples else 0
    samples.append({
        "lat": last["lat"],
        "lon": last["lon"],
        "cum_dist": cum,
        "bearing": last_bearing,
    })
    return samples


# ---------- Graph building ----------

def build_graph(nodes, ways):
    """
    adjacency: node_id -> list of (neighbor_id, distance_m)
    edge_tags: frozenset({a,b}) -> tags dict of the way that edge belongs to
               (surface, description, access, name of the path, etc.)
    """
    graph = {}
    footpath_edges = []
    edge_tags = {}

    for way in ways:
        tags = way["tags"]
        if "highway" not in tags:
            continue

        refs = way["refs"]
        for i in range(len(refs) - 1):
            a, b = refs[i], refs[i + 1]
            if a == b:
                continue
            if a not in nodes or b not in nodes:
                continue
            dist = haversine_m(nodes[a]["lat"], nodes[a]["lon"], nodes[b]["lat"], nodes[b]["lon"])
            graph.setdefault(a, []).append((b, dist))
            graph.setdefault(b, []).append((a, dist))
            footpath_edges.append((a, b))
            edge_tags[frozenset((a, b))] = tags

    return graph, footpath_edges, edge_tags


def named_nodes(nodes):
    """dict of id -> node data, only for nodes with a 'name' tag."""
    return {nid: d for nid, d in nodes.items() if d["tags"].get("name")}


def named_areas(nodes, ways):
    """
    Returns a list of named AREAS (polygons) - buildings, fields, forests,
    parking plots, anything drawn as a shape rather than a single point.
    These are NOT part of the routing graph - they're only used for
    describing what's around the route, never as a start/end point.
    """
    areas = []
    for way in ways:
        tags = way["tags"]
        if "highway" in tags:
            continue  # that's a path, not an area
        name = tags.get("name")
        if not name:
            continue
        refs = [r for r in way["refs"] if r in nodes]
        if len(refs) < 3:
            continue  # not enough points to be a meaningful shape
        vertices = [(nodes[r]["lat"], nodes[r]["lon"]) for r in refs]
        areas.append({
            "id": way["id"],
            "name": name,
            "description": tags.get("description", ""),
            "tags": tags,
            "vertices": vertices,
            "centroid": polygon_centroid(vertices),
        })
    return areas


def find_named_node(nodes, query):
    """Fuzzy-match a typed name to the closest named node. Returns node_id or None."""
    named = named_nodes(nodes)
    names = {d["tags"]["name"]: nid for nid, d in named.items()}

    query_lower = query.strip().lower()
    if not query_lower:
        return None

    # 1. exact match
    for name, nid in names.items():
        if query_lower == name.lower():
            return nid

    # 2. substring match - prefer the SHORTEST matching name, because
    #    "Library" should win over "Library Annex Back Entrance"
    candidates = [name for name in names if query_lower in name.lower()]
    if candidates:
        return names[min(candidates, key=len)]

    # 3. the other way round: the typed text contains a known name
    candidates = [name for name in names if name.lower() in query_lower]
    if candidates:
        return names[max(candidates, key=len)]

    # 4. fall back to fuzzy match
    close = difflib.get_close_matches(query, list(names.keys()), n=1, cutoff=0.5)
    if close:
        return names[close[0]]
    return None


# ---------- A* pathfinding ----------

def a_star(graph, nodes, start_id, goal_id):
    """A* with a real priority queue. Returns (path, distance_m)."""
    goal = nodes[goal_id]

    def heuristic(nid):
        n = nodes[nid]
        return haversine_m(n["lat"], n["lon"], goal["lat"], goal["lon"])

    open_heap = [(heuristic(start_id), start_id)]
    came_from = {}
    g_score = {start_id: 0.0}
    closed = set()

    while open_heap:
        _f, current = heapq.heappop(open_heap)
        if current in closed:
            continue

        if current == goal_id:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path, g_score[goal_id]

        closed.add(current)

        for neighbor, dist in graph.get(current, []):
            tentative_g = g_score[current] + dist
            if tentative_g < g_score.get(neighbor, math.inf):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                heapq.heappush(open_heap, (tentative_g + heuristic(neighbor), neighbor))

    return None, None  # no path found


# ---------- Turn-by-turn generation ----------

def turn_label(angle_diff, gradual=False):
    """
    angle_diff: signed difference between the new bearing and the bearing
    at the start of the current straight-ish run. Positive = right.

    gradual=True means the direction changed a little bit at a time over
    several nodes - that is a bend in the path, not a junction turn, and
    saying "turn left" there is what makes the directions feel wrong to
    someone actually walking it.
    """
    a = angle_diff
    side = "right" if a > 0 else "left"
    m = abs(a)

    if gradual:
        if m >= 70:
            return "the path swings round to the " + side
        return "the path curves " + side

    if m < 20:
        return "continue straight"
    if m < 45:
        return "bear slightly " + side
    if m < 120:
        return "turn " + side
    return "turn sharply " + side


def generate_turn_by_turn(path, nodes, turn_threshold=30, corner_threshold=22):
    """
    Returns a list of step dicts:
        {instruction, node_id, at_m, distance_m, turn, kind}

    kind is one of "start", "turn", "curve", "arrive".

    at_m: cumulative distance (meters from the start) at which this
    instruction occurs, so other parts of the pipeline can place area
    mentions and junction mentions in the correct chronological order.

    turn_threshold: how many degrees of TOTAL cumulative direction change
    (since the last announced instruction) are needed before we announce
    anything at all.

    corner_threshold: how many degrees a SINGLE segment has to swing for
    it to count as a genuine corner. If the whole drift happened without
    any single segment swinging this much, it is a curve, not a turn, and
    it gets phrased that way. This is also how the instruction gets
    pinned to the node where the corner actually is, instead of to the
    node where the running total happened to cross the threshold.
    """
    if len(path) < 2:
        return []

    # cumulative distance to reach each node index along the path
    cum = [0.0]
    for i in range(len(path) - 1):
        a, b = nodes[path[i]], nodes[path[i + 1]]
        cum.append(cum[-1] + haversine_m(a["lat"], a["lon"], b["lat"], b["lon"]))

    segments = []
    for i in range(len(path) - 1):
        a, b = nodes[path[i]], nodes[path[i + 1]]
        segments.append({
            "index": i,
            "dist": haversine_m(a["lat"], a["lon"], b["lat"], b["lon"]),
            "bearing": bearing_deg(a["lat"], a["lon"], b["lat"], b["lon"]),
        })

    first_bearing = segments[0]["bearing"]
    start_name = nodes[path[0]]["tags"].get("name", "your starting point")

    steps = [{
        "kind": "start",
        "instruction": "Head " + compass_word(first_bearing) + " from " + start_name,
        "node_id": path[0],
        "at_m": 0.0,
        "distance_m": 0.0,
        "turn": None,
        "bearing": first_bearing,
    }]

    ref_bearing = first_bearing
    prev_bearing = first_bearing
    last_at = 0.0
    max_single_swing = 0.0
    corner_index = None

    for k in range(1, len(segments)):
        bearing = segments[k]["bearing"]
        single = abs(relative_bearing(prev_bearing, bearing))
        drift = relative_bearing(ref_bearing, bearing)

        if single > max_single_swing:
            max_single_swing = single
            if single >= corner_threshold:
                corner_index = segments[k]["index"]

        prev_bearing = bearing

        if abs(drift) < turn_threshold:
            continue  # still basically the same direction, keep walking

        gradual = max_single_swing < corner_threshold
        node_index = segments[k]["index"] if (gradual or corner_index is None) else corner_index
        run = max(cum[node_index] - last_at, 0.0)
        label = turn_label(drift, gradual=gradual)

        if gradual:
            instruction = "Continue for " + describe_distance(run) + " as " + label
        else:
            instruction = "Continue for " + describe_distance(run) + ", then " + label

        steps.append({
            "kind": "curve" if gradual else "turn",
            "instruction": instruction,
            "node_id": path[node_index],
            "at_m": cum[node_index],
            "distance_m": run,
            "turn": label,
            "bearing": bearing,
        })

        last_at = cum[node_index]
        ref_bearing = bearing
        max_single_swing = 0.0
        corner_index = None

    final_run = max(cum[-1] - last_at, 0.0)
    steps.append({
        "kind": "arrive",
        "instruction": "Continue for " + describe_distance(final_run) + " and you'll arrive",
        "node_id": path[-1],
        "at_m": cum[-1],
        "distance_m": final_run,
        "turn": None,
        "bearing": segments[-1]["bearing"],
    })

    return steps


def total_distance_m(path, nodes):
    total = 0
    for i in range(len(path) - 1):
        a, b = nodes[path[i]], nodes[path[i + 1]]
        total += haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
    return total