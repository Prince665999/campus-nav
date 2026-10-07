"""
campus_graph.py  –  Indoor Navigation Engine

Shared logic for indoor building navigation:
- Parses an indoor .osm map (doors, footways, stairs, corridors, rooms)
- Builds a routable graph where doors are the meaningful destinations
- A* shortest path with stairs penalty
- Turn-by-turn instruction generation using natural indoor language:
    • "Walk along the corridor"  (not "head north")
    • "Pass Room 102 on your left"  (not "pass 5 doors")
    • "Take the stairs up to the first floor"  (not "go to level 1")
    • "Room 108A is just in front of you"

Design principles:
- Directions sound like a person walking beside you, not a GPS.
- Only mention rooms/doors that are on the SAME FLOOR as the walker.
- Don't overwhelm: mention one notable landmark per stretch, not every door.
- After exiting a door into a corridor, the next instruction is the turn — no
  filler "walk a few steps" in between.
- Arrival at a door that is straight ahead says "in front of you", not left/right.

Both turn_by_turn.py and ai_navigator.py import this file.
"""

import xml.etree.ElementTree as ET
import math
import heapq
import difflib

EARTH_RADIUS_M = 6_371_000

# Tags that mark a walkable way in our indoor map
WALKABLE_HIGHWAY = {"footway", "corridor", "path"}
STAIRS_HIGHWAY = "steps"

# Level number → human-friendly floor name
LEVEL_NAMES = {
    "-1": "the basement",
    "0":  "the ground floor",
    "1":  "the first floor",
    "2":  "the second floor",
    "3":  "the third floor",
}


def level_label(lvl_str):
    """Turn a level string like '-1' into 'the basement'."""
    return LEVEL_NAMES.get(lvl_str, f"level {lvl_str}")


# ──────────────────────────── Geometry ────────────────────────────

def haversine_m(lat1, lon1, lat2, lon2):
    """Distance in metres between two lat/lon points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lat1, lon1, lat2, lon2):
    """Initial compass bearing (0 = N, 90 = E …) from point 1 to point 2."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    x = math.sin(dlam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def latlon_to_xy(lat, lon, ref_lat):
    """Flat local projection (metres) – fine for a single building."""
    x = math.radians(lon) * EARTH_RADIUS_M * math.cos(math.radians(ref_lat))
    y = math.radians(lat) * EARTH_RADIUS_M
    return x, y


def point_segment_info(p, a, b):
    """
    Returns (distance_m, t, side) for point p relative to segment a→b.
    - distance_m: perpendicular distance in metres
    - t: 0‥1 projection along the segment
    - side: "left" or "right" of the walking direction
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


# ──────────────────────────── Parsing ────────────────────────────

def parse_osm(osm_path):
    """
    Returns:
        nodes  –  id → {"lat", "lon", "tags"}
        ways   –  list of {"id", "tags", "refs"}
    """
    tree = ET.parse(osm_path)
    root = tree.getroot()

    nodes = {}
    ways = []

    for elem in root:
        if elem.tag == "node":
            nid = elem.get("id")
            lat = float(elem.get("lat"))
            lon = float(elem.get("lon"))
            tags = {tag.get("k"): tag.get("v") for tag in elem.findall("tag")}
            nodes[nid] = {"lat": lat, "lon": lon, "tags": tags}

        elif elem.tag == "way":
            tags = {tag.get("k"): tag.get("v") for tag in elem.findall("tag")}
            refs = [nd.get("ref") for nd in elem.findall("nd")]
            ways.append({"id": elem.get("id"), "tags": tags, "refs": refs})

    return nodes, ways


# ──────────────────────────── Graph Building ────────────────────────────

def is_door(tags):
    return bool(tags.get("door")) or tags.get("indoor") == "door"


def is_entrance(tags):
    return bool(tags.get("entrance"))


def node_display_name(tags):
    """Best human-readable label for a door / entrance node."""
    name = tags.get("name", "")
    loc = tags.get("loc_name", "")
    if name and loc:
        return f"{name} ({loc})"
    return name or loc or ""


def build_graph(nodes, ways):
    """
    Build a routable indoor graph.

    Returns:
        graph      – node_id → [(neighbor_id, distance_m, edge_info), ...]
                     edge_info = {"kind": "walk"|"stairs", "level": str, "way_tags": dict}
        edge_tags  – frozenset({a,b}) → tags dict  (for backward compat)
        door_nodes – set of node ids that are doors
        corridor_of_door – door_id → corridor_name (if the door sits on a corridor outline)
        rooms      – list of {"name", "level", "door_node_id"} for rooms
        stair_ways – list of {"way_id", "tags", "refs"} for stairways
    """
    graph = {}
    edge_tags = {}
    door_node_ids = set()
    entrance_node_ids = set()

    # Identify door and entrance nodes
    for nid, d in nodes.items():
        if is_door(d["tags"]):
            door_node_ids.add(nid)
        if is_entrance(d["tags"]):
            entrance_node_ids.add(nid)

    # Build adjacency from footways and stairs
    stair_ways = []
    for way in ways:
        tags = way["tags"]
        hw = tags.get("highway", "")

        if hw in WALKABLE_HIGHWAY or hw == STAIRS_HIGHWAY:
            refs = way["refs"]
            is_stairs = (hw == STAIRS_HIGHWAY)
            kind = "stairs" if is_stairs else "walk"
            level = tags.get("level", "0")

            if is_stairs:
                stair_ways.append(way)

            for i in range(len(refs) - 1):
                a, b = refs[i], refs[i + 1]
                if a not in nodes or b not in nodes:
                    continue
                d = haversine_m(
                    nodes[a]["lat"], nodes[a]["lon"],
                    nodes[b]["lat"], nodes[b]["lon"],
                )
                info = {"kind": kind, "level": level, "way_tags": tags}
                graph.setdefault(a, []).append((b, d, info))
                graph.setdefault(b, []).append((a, d, info))
                edge_tags[frozenset((a, b))] = tags

    # Map doors to corridors (via corridor outlines sharing nodes)
    corridor_of_door = {}
    for way in ways:
        tags = way["tags"]
        if tags.get("indoor") == "corridor":
            cname = tags.get("name", "the corridor")
            refs_set = set(way["refs"])
            for r in refs_set:
                if r in door_node_ids:
                    corridor_of_door[r] = cname

    # Map rooms: find room outlines that share a door node with a footway node
    rooms = []
    for way in ways:
        tags = way["tags"]
        if tags.get("indoor") == "room":
            rname = tags.get("name", "")
            rlevel = tags.get("level", "0").split(";")[0]
            refs = way["refs"]
            # find the door node(s) this room shares with the footway network
            shared_doors = [r for r in refs if r in door_node_ids]
            for d in shared_doors:
                rooms.append({"name": rname, "level": rlevel, "door_node_id": d})
            if not shared_doors and rname:
                # Room has no door on the network — record with centroid position
                pts = [nodes[r] for r in refs if r in nodes]
                if pts:
                    rooms.append({
                        "name": rname, "level": rlevel, "door_node_id": None,
                        "lat": sum(p["lat"] for p in pts) / len(pts),
                        "lon": sum(p["lon"] for p in pts) / len(pts),
                    })

    return graph, edge_tags, door_node_ids, entrance_node_ids, corridor_of_door, rooms, stair_ways


# ──────────────────────────── Named-node Helpers ────────────────────────────

def named_nodes(nodes):
    """dict of id → node data, only for nodes with a 'name' tag."""
    return {nid: d for nid, d in nodes.items() if d["tags"].get("name")}


def find_named_node(nodes, query, graph=None):
    """
    Fuzzy-match a typed name to the closest named node.
    Also tries loc_name.
    Returns node_id or None.
    """
    named = named_nodes(nodes)
    # Build lookup: name → nid, loc_name → nid
    lookup = {}
    for nid, d in named.items():
        n = d["tags"].get("name", "")
        if n:
            lookup[n] = nid
        ln = d["tags"].get("loc_name", "")
        if ln:
            lookup[ln] = nid

    q = query.strip().lower()

    # exact match
    for name, nid in lookup.items():
        if q == name.lower():
            return nid
    # substring match
    for name, nid in lookup.items():
        if q in name.lower():
            return nid
    # fuzzy match
    close = difflib.get_close_matches(query, lookup.keys(), n=1, cutoff=0.4)
    if close:
        return lookup[close[0]]
    return None


# ──────────────────────────── A* Pathfinding ────────────────────────────

def a_star(graph, nodes, start_id, goal_id):
    """
    A* shortest path with stairs penalty.
    Returns (path_as_list_of_node_ids, total_distance_m) or (None, None).
    """
    goal = nodes[goal_id]

    def heuristic(nid):
        n = nodes[nid]
        return haversine_m(n["lat"], n["lon"], goal["lat"], goal["lon"])

    # Priority queue: (f_score, node_id)
    pq = [(heuristic(start_id), start_id)]
    g_score = {start_id: 0}
    came_from = {}  # nid → (prev_nid, edge_info)

    while pq:
        _, current = heapq.heappop(pq)

        if current == goal_id:
            path = [current]
            while current in came_from:
                current, _ = came_from[current]
                path.append(current)
            path.reverse()
            return path, g_score[goal_id]

        for neighbor, dist, info in graph.get(current, []):
            # Stairs cost 3× to prefer staying on level when possible
            cost = dist * (3 if info["kind"] == "stairs" else 1)
            tentative_g = g_score[current] + cost

            if tentative_g < g_score.get(neighbor, math.inf):
                came_from[neighbor] = (current, info)
                g_score[neighbor] = tentative_g
                heapq.heappush(pq, (tentative_g + heuristic(neighbor), neighbor))

    return None, None


# ──────────────────────────── Turn helpers ────────────────────────────

def turn_descriptor(angle_diff):
    """
    angle_diff: signed difference between outgoing and incoming bearing, -180..180
    Returns a turn phrase or None if going straight.
    """
    a = angle_diff
    if abs(a) < 25:
        return None  # straight enough
    if abs(a) > 150:
        return "turn around"
    if a > 0:
        return "turn right" + (" slightly" if abs(a) < 55 else "")
    else:
        return "turn left" + (" slightly" if abs(a) < 55 else "")


def _side_of_door(walk_bearing, door_node, prev_node, nodes):
    """
    Determine if a door is on the left, right, or straight ahead
    relative to the walking direction.
    Returns "left", "right", or "ahead".
    """
    door = nodes[door_node]
    prev = nodes[prev_node]

    # Bearing from prev toward the door
    door_bearing = bearing_deg(prev["lat"], prev["lon"], door["lat"], door["lon"])
    diff = (door_bearing - walk_bearing + 540) % 360 - 180

    # If the door is within ~30° of straight ahead, it's "ahead"
    if abs(diff) < 30:
        return "ahead"

    # Use cross product relative to walking direction for left/right
    ref_lat = prev["lat"]
    px, py = latlon_to_xy(door["lat"], door["lon"], ref_lat)
    ax, ay = latlon_to_xy(prev["lat"], prev["lon"], ref_lat)
    br = math.radians(walk_bearing)
    dx, dy = math.sin(br), math.cos(br)
    dpx, dpy = px - ax, py - ay
    cross = dx * dpy - dy * dpx
    return "right" if cross > 0 else "left"


# ──────────────────────────── Turn-by-turn generation ────────────────────────────

# Minimum distance (metres) between consecutive door/room mentions.
# Prevents overwhelming the user with "pass X on your left, pass Y on your right"
# every 2 metres. Only the most notable door in each stretch is mentioned.
MIN_LANDMARK_SPACING_M = 8

# A connecting path shorter than this that touches a real corridor (tagged
# corridor=yes) is treated as part of the corridor: "step out into the corridor".
# Longer connecting paths get "walk N metres until you reach the corridor".
CORRIDOR_STUB_MAX_M = 5

# Walks shorter than this are just "Walk a short distance"; from this length up the
# instruction gives the metres ("Walk about 4 metres ...").
SHORT_WALK_M = 3


def _is_tagged_corridor(tags):
    """True if a way carries corridor=yes (set in JOSM on the real corridors)."""
    return str((tags or {}).get("corridor", "")).strip().lower() in ("yes", "true", "1")


def _edge_info_between(graph, a_id, b_id):
    for nb, d, info in graph.get(a_id, []):
        if nb == b_id:
            return info
    return None


def _classify_path_edges(path, nodes, graph):
    """
    For every edge of the path return:
        True  – real corridor (way tagged corridor=yes)
        False – ordinary connecting path
        None  – stairs
    A short connecting stub (< CORRIDOR_STUB_MAX_M) that touches a real
    corridor is promoted to True, so a door that opens straight onto the
    corridor still reads "step out into the corridor".
    If NO way in the whole map is tagged corridor=yes, every walkable edge is
    treated as a corridor (the old behaviour), so untagged maps keep working.
    """
    legacy = not any(
        _is_tagged_corridor(info["way_tags"])
        for edges in graph.values() for (_, _, info) in edges
        if info["kind"] != "stairs"
    )

    kinds, lengths = [], []
    for i in range(len(path) - 1):
        a, b = nodes[path[i]], nodes[path[i + 1]]
        lengths.append(haversine_m(a["lat"], a["lon"], b["lat"], b["lon"]))
        info = _edge_info_between(graph, path[i], path[i + 1])
        if info is not None and info["kind"] == "stairs":
            kinds.append(None)
        elif legacy:
            kinds.append(True)
        else:
            kinds.append(bool(info) and _is_tagged_corridor(info["way_tags"]))

    n = len(kinds)
    i = 0
    while i < n:
        if kinds[i] is False:
            j = i
            while j < n and kinds[j] is False:
                j += 1
            run_len = sum(lengths[i:j])
            touches = (i > 0 and kinds[i - 1] is True) or (j < n and kinds[j] is True)
            if run_len < CORRIDOR_STUB_MAX_M and touches:
                for k in range(i, j):
                    kinds[k] = True
            i = j
        else:
            i += 1
    return kinds


def _level_after_stairs(path, idx, graph, nodes, fallback):
    """
    Floor you arrive on after a flight of stairs: the level of the first
    non-stairs edge after position idx, or the destination's level.
    (The stairs way's own level tag, e.g. -1;0;1, lists every floor it touches,
    so it can't tell us which one this route ends up on.)
    """
    for j in range(idx, len(path) - 1):
        info = _edge_info_between(graph, path[j], path[j + 1])
        if info is not None and info["kind"] != "stairs":
            return info["level"].split(";")[0]
    return nodes[path[-1]]["tags"].get("level", fallback).split(";")[0]


def generate_turn_by_turn(path, nodes, graph, door_nodes, corridor_of_door):
    """
    Produce natural indoor walking instructions.

    Design goals:
    - Sound like a person giving directions, not a GPS.
    - After "step out into the corridor" the next instruction is the turn,
      NOT "walk a few steps" first.
    - Only mention rooms/doors on the SAME FLOOR.
    - Don't overwhelm: max one landmark mention per ~8 m stretch.
    - Arrival at a door that is straight ahead says "in front of you".

    Returns a list of step dicts: {"instruction": str, "node_id": str}
    """
    if len(path) < 2:
        return [{"instruction": "You are already there.", "node_id": path[0] if path else ""}]

    steps = []
    current_level = nodes[path[0]]["tags"].get("level", "0").split(";")[0]
    in_stairs = False
    stairs_target_level = None
    stairs_direction = None  # "up" or "down"
    just_exited_door = False  # True right after the opening "step out into the corridor"

    # Accumulate walk segments
    walk_distance = 0.0
    doors_passed = []  # doors we walked past (not the destination) since last instruction
    last_landmark_distance = 0.0  # cumulative m since last landmark mention
    prev_bearing = None

    # Which edges are real corridors (True), connecting paths (False), stairs (None)
    edge_kinds = _classify_path_edges(path, nodes, graph)
    walk_is_corr = True  # kind of the walk currently being accumulated

    def _flush_walk(next_action="", next_is_corr=False):
        """Emit a walking instruction for the accumulated walk.
        next_is_corr: True if the walk is about to join a real corridor."""
        nonlocal walk_distance, doors_passed, prev_bearing, last_landmark_distance

        if walk_distance < 0.5 and not doors_passed:
            return  # nothing to flush

        parts = []

        if walk_distance >= 1:
            # Under SHORT_WALK_M (3 m): "a short distance". From 3 m up: always say the metres.
            if walk_distance < SHORT_WALK_M:
                parts.append("Walk a short distance")
            elif walk_is_corr:
                if walk_distance < 25:
                    parts.append(f"Walk about {walk_distance:.0f} metres along the corridor")
                else:
                    parts.append(f"Continue for about {walk_distance:.0f} metres")
            else:
                # Ordinary connecting path: never call it "the corridor"
                if next_is_corr:
                    parts.append(f"Walk about {walk_distance:.0f} metres until you reach the corridor")
                elif walk_distance < 25:
                    parts.append(f"Walk about {walk_distance:.0f} metres")
                else:
                    parts.append(f"Continue for about {walk_distance:.0f} metres")

        if doors_passed:
            # Filter to same floor only
            same_floor = [
                d for d in doors_passed
                if d.get("level", current_level) == current_level
            ]
            if same_floor:
                # Separate named (notable) from generic doors
                named_passed = [
                    d for d in same_floor
                    if d["name"] and not d["name"].startswith("door")
                ]
                generic = [d for d in same_floor if d not in named_passed]

                if named_passed:
                    # Only mention one notable room per flush to avoid overload
                    # Pick the first one (closest to where the walk started)
                    best = named_passed[0]
                    parts.append(f"passing {best['name']} on your {best['side']}")
                elif len(generic) <= 3:
                    left_doors = [d for d in generic if d.get("side") == "left"]
                    right_doors = [d for d in generic if d.get("side") == "right"]
                    if left_doors and right_doors:
                        parts.append(
                            f"passing {len(left_doors)} door{'s' if len(left_doors)>1 else ''} on your left "
                            f"and {len(right_doors)} on your right"
                        )
                    elif left_doors:
                        parts.append(f"passing {len(left_doors)} door{'s' if len(left_doors)>1 else ''} on your left")
                    elif right_doors:
                        parts.append(f"passing {len(right_doors)} door{'s' if len(right_doors)>1 else ''} on your right")
                else:
                    parts.append("passing several doors along the corridor" if walk_is_corr else "passing several doors")

        if parts:
            instruction = ". ".join(parts) if len(parts) > 1 and any(len(p) > 30 for p in parts) else ", ".join(parts)
            instruction = instruction[0].upper() + instruction[1:]
            steps.append({"instruction": instruction, "node_id": ""})

        walk_distance = 0.0
        doors_passed = []
        last_landmark_distance = 0.0

    def _add_turn(turn_text, node_id, steps_before):
        """A turn that comes right after a walk instruction joins that line:
        "Walk about 10 metres along the corridor, then turn left"
        (one instruction instead of two). A turn with no walk before it stands alone."""
        if len(steps) > steps_before:
            steps[-1]["instruction"] += f", then {turn_text}"
            steps[-1]["node_id"] = node_id
        else:
            steps.append({"instruction": turn_text.capitalize(), "node_id": node_id})

    # ─── Walk through the path ───
    for idx in range(len(path) - 1):
        a_id, b_id = path[idx], path[idx + 1]
        a_node, b_node = nodes[a_id], nodes[b_id]
        seg_dist = haversine_m(a_node["lat"], a_node["lon"], b_node["lat"], b_node["lon"])
        seg_bearing = bearing_deg(a_node["lat"], a_node["lon"], b_node["lat"], b_node["lon"])

        a_tags = a_node["tags"]
        b_tags = b_node["tags"]

        # Determine the edge info (kind, level)
        edge_info = None
        for nb, d, info in graph.get(a_id, []):
            if nb == b_id:
                edge_info = info
                break
        if not edge_info:
            edge_info = {"kind": "walk", "level": current_level}

        is_stair_edge = edge_info["kind"] == "stairs"
        seg_kind = edge_kinds[idx]  # True corridor / False connecting path / None stairs

        # ── Handle stairs ──
        if is_stair_edge:
            if not in_stairs:
                n_before = len(steps)
                _flush_walk()
                if prev_bearing is not None:
                    diff = (seg_bearing - prev_bearing + 540) % 360 - 180
                    t = turn_descriptor(diff)
                    if t:
                        _add_turn(t, a_id, n_before)

                # Where do we actually come out? Look at the first walking edge
                # after the stairs (the stairs way's own level tag may list
                # every floor, e.g. -1;0;1, so it can't be used directly).
                to_lvl = _level_after_stairs(path, idx, graph, nodes, current_level)
                try:
                    up = float(to_lvl) > float(current_level)
                except ValueError:
                    up = True
                stairs_direction = "up" if up else "down"
                stairs_target_level = to_lvl

                steps.append({
                    "instruction": f"Take the stairs {stairs_direction} to {level_label(stairs_target_level)}",
                    "node_id": a_id,
                })
                in_stairs = True

            prev_bearing = seg_bearing
            just_exited_door = False
            continue

        # ── Exiting stairs ──
        if in_stairs:
            in_stairs = False
            if stairs_target_level:
                current_level = stairs_target_level
            diff = (seg_bearing - prev_bearing + 540) % 360 - 180 if prev_bearing is not None else 0
            t = turn_descriptor(diff)
            at_label = "At the top" if stairs_direction == "up" else "At the bottom"
            if t:
                steps.append({
                    "instruction": f"{at_label} of the stairs, {t}",
                    "node_id": b_id,
                })
            else:
                steps.append({
                    "instruction": f"{at_label} of the stairs, continue straight",
                    "node_id": b_id,
                })
            prev_bearing = seg_bearing
            walk_distance = seg_dist
            walk_is_corr = bool(seg_kind)
            just_exited_door = False
            continue

        # ── Handle turns ──
        if prev_bearing is not None:
            diff = (seg_bearing - prev_bearing + 540) % 360 - 180
            t = turn_descriptor(diff)
            if t:
                if just_exited_door:
                    # Merge the turn directly with the door-exit instruction.
                    # Instead of: "Step out into the corridor" → "Walk a few steps" → "Turn left"
                    # We get:     "Step out into the corridor, then turn left"
                    if steps:
                        steps[-1]["instruction"] += f", then {t}"
                    just_exited_door = False
                    walk_distance = 0.0
                    doors_passed = []
                else:
                    n_before = len(steps)
                    _flush_walk(next_is_corr=bool(seg_kind))
                    _add_turn(t, a_id, n_before)

        # ── Corridor <-> connecting path change without a turn ──
        if (walk_distance >= 0.5 or doors_passed) and bool(seg_kind) != walk_is_corr:
            _flush_walk(next_is_corr=bool(seg_kind))
        walk_is_corr = bool(seg_kind)

        # ── Accumulate walk ──
        walk_distance += seg_dist
        last_landmark_distance += seg_dist
        prev_bearing = seg_bearing
        just_exited_door = False

        # ── Check if b is a door we pass by (not the destination) ──
        b_is_destination = (idx + 1 == len(path) - 1)

        if not b_is_destination and is_door(b_tags):
            # Only track doors on the SAME FLOOR
            door_level = b_tags.get("level", current_level).split(";")[0]
            if door_level == current_level:
                dname = node_display_name(b_tags)
                side = _side_of_door(seg_bearing, b_id, a_id, nodes)
                # For "ahead" doors that we pass by, demote to left/right based on cross product
                if side == "ahead":
                    side = "right"  # fallback — rarely happens for pass-by doors

                # Spacing: don't mention a door if we just mentioned one recently
                if last_landmark_distance >= MIN_LANDMARK_SPACING_M or not doors_passed:
                    doors_passed.append({
                        "name": dname, "side": side, "node_id": b_id,
                        "level": door_level,
                    })
                    last_landmark_distance = 0.0

        # ── Entrance node (not start or end) ──
        if not b_is_destination and is_entrance(b_tags):
            _flush_walk()
            ename = b_tags.get("name", "the entrance")
            steps.append({"instruction": f"Go through {ename}", "node_id": b_id})

    # ── Final destination ──
    _flush_walk()
    dest_id = path[-1]
    dest_tags = nodes[dest_id]["tags"]
    dest_name = node_display_name(dest_tags)
    dest_level = dest_tags.get("level", current_level)

    if is_door(dest_tags):
        if len(path) >= 2:
            prev_id = path[-2]
            final_bearing = bearing_deg(
                nodes[prev_id]["lat"], nodes[prev_id]["lon"],
                nodes[dest_id]["lat"], nodes[dest_id]["lon"],
            )
            side = _side_of_door(final_bearing, dest_id, prev_id, nodes)

            if side == "ahead":
                # Door is straight ahead — most natural phrasing
                if dest_name:
                    steps.append({
                        "instruction": f"You have arrived — {dest_name} is just in front of you",
                        "node_id": dest_id,
                    })
                else:
                    steps.append({
                        "instruction": "You have arrived — the door is just in front of you",
                        "node_id": dest_id,
                    })
            else:
                if dest_name:
                    steps.append({
                        "instruction": f"You have arrived — {dest_name} is the door on your {side}",
                        "node_id": dest_id,
                    })
                else:
                    steps.append({
                        "instruction": f"You have arrived — the door is on your {side}",
                        "node_id": dest_id,
                    })
        else:
            steps.append({
                "instruction": f"You have arrived at {dest_name}" if dest_name else "You have arrived",
                "node_id": dest_id,
            })
    elif is_entrance(dest_tags):
        steps.append({
            "instruction": f"You have arrived at {dest_name}" if dest_name else "You have arrived at the entrance",
            "node_id": dest_id,
        })
    else:
        steps.append({
            "instruction": f"You have arrived at {dest_name}" if dest_name else "You have arrived",
            "node_id": dest_id,
        })

    # ── Prepend starting instruction ──
    start_id = path[0]
    start_tags = nodes[start_id]["tags"]
    start_name = node_display_name(start_tags)
    start_level = start_tags.get("level", "0").split(";")[0]

    first_bearing = bearing_deg(
        nodes[path[0]]["lat"], nodes[path[0]]["lon"],
        nodes[path[1]]["lat"], nodes[path[1]]["lon"],
    )

    opening = f"Starting from {start_name}" if start_name else "From your current position"
    opening += f" on {level_label(start_level)}"

    if is_door(start_tags):
        first_kind = edge_kinds[0]
        if first_kind is False:
            # The first stretch is an ordinary connecting path, not the corridor
            opening += " — step out of the room"
        else:
            opening += " — step out into the corridor"
        just_exited_door = True  # signal to merge next turn

    steps.insert(0, {"instruction": opening, "node_id": start_id})

    # ── Post-process: merge door-exit + immediate turn ──
    # If step[0] is the door-exit and step[1] is a short walk (< 5m) followed
    # by step[2] being a turn, collapse steps 1+2 into the door-exit step.
    opening_merged = False
    if len(steps) >= 2 and just_exited_door:
        second = steps[1]["instruction"]
        k = second.lower().rfind(", then turn")
        if second.lower().startswith(("walk a short", "walk a few")) and k != -1 and k + len(", then ") < len(second):
            # "Walk a short distance, then turn left" folds into the opening line
            steps[0]["instruction"] += ", then " + second[k + len(", then "):]
            del steps[1]
            opening_merged = True
    if len(steps) >= 3 and just_exited_door and not opening_merged:
        second = steps[1]["instruction"].lower()
        third = steps[2]["instruction"].lower()
        is_tiny_walk = second.startswith("walk a short") or second.startswith("walk a few")
        is_turn = third.startswith("turn ")
        if is_tiny_walk and is_turn:
            # Merge: remove the filler walk and append the turn to the opening
            turn_phrase = steps[2]["instruction"][0].lower() + steps[2]["instruction"][1:]
            steps[0]["instruction"] += f", then {turn_phrase}"
            del steps[1]  # remove "walk a short distance"
            del steps[1]  # remove the turn (was at index 2, now at 1)

    return steps


def total_distance_m(path, nodes):
    """Total walking distance along a path, in metres."""
    total = 0
    for i in range(len(path) - 1):
        a, b = nodes[path[i]], nodes[path[i + 1]]
        total += haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
    return total



# ─────────────────── Door counting (used by the AI narration only) ───────────────────
#
# generate_turn_by_turn() above is NOT touched by anything in this section.
#
# How this map is drawn: every door is a one-node stub (about 1–3 m long) hanging off a
# corridor way (a footway tagged corridor=yes). A route therefore never walks *through*
# the doors it passes — it walks beside them. To say "the fourth door on your left" we
# work per STRAIGHT STRETCH of corridor (the part between two turns, split with the same
# 25° rule the turn-by-turn uses) and keep only door NODES that are:
#   • on the same floor,
#   • alongside the stretch (inside its length, within DOOR_ALONGSIDE_MAX_M of the line),
#   • attached to that corridor (their stub joins one of the stretch's nodes).
# Rooms (areas) are never counted — only door nodes.
#
# A count is only trusted ("reliable") when the stretch looks cleanly mapped; otherwise
# the caller falls back to the normal wording and no number is given.

DOOR_ALONGSIDE_MAX_M = 3.5    # a door must be this close to the corridor line to count as "beside" it
DOOR_WINDOW_EXT_M = 1.6       # slack at the ends of each edge so a gentle bend can't drop a door
DOOR_END_AMBIGUITY_M = 1.5    # a same-side door this close to a corner / the destination makes a count unsafe
DOOR_DUPLICATE_M = 1.5        # two door nodes closer than this on one side may be one double door
DOOR_STUB_MAX_M = 4.0         # the destination's connecting stub must be this short (door on the corridor wall)
DOOR_COUNT_MAX = 7            # beyond this nobody counts doors by eye
DOOR_SIDE_MIN_ANGLE = 35      # the stub must leave the corridor at least this far off "straight on"
DOOR_SIDE_MAX_ANGLE = 145     # ...and not double back


def _is_generic_door_name(name):
    """True for blank names and auto-names like 'door12'."""
    name = (name or "").strip()
    return (not name) or (name.startswith("door") and name[4:].isdigit())


def _door_level(nodes, nid):
    return nodes[nid]["tags"].get("level", "0").split(";")[0]


def door_line_info(p, a, b):
    """
    Position of point p relative to the (infinite) line a→b.
    Returns (perp_m, along_m, length_m, side) or None for a zero-length edge.
      perp_m   – perpendicular distance to the line
      along_m  – metres from a, measured along a→b (NOT clamped; can be <0 or >length)
      side     – "left" / "right" of the walking direction a→b
    """
    ref_lat = a[0]
    px, py = latlon_to_xy(p[0], p[1], ref_lat)
    ax, ay = latlon_to_xy(a[0], a[1], ref_lat)
    bx, by = latlon_to_xy(b[0], b[1], ref_lat)
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    if length < 1e-6:
        return None
    along = ((px - ax) * dx + (py - ay) * dy) / length
    cross = dx * (py - ay) - dy * (px - ax)
    return abs(cross) / length, along, length, ("left" if cross > 0 else "right")


def _map_has_tagged_corridors(graph):
    """True if at least one walkable way carries corridor=yes."""
    for edges in graph.values():
        for (_, _, info) in edges:
            if info["kind"] != "stairs" and _is_tagged_corridor(info["way_tags"]):
                return True
    return False


def analyze_route_doors(path, nodes, graph, door_nodes):
    """
    Door facts for one route, for the AI narration.

    Returns a dict:
      available    – False if counting can't be done at all (reason says why)
      reason       – short explanation when not available
      stretches    – list of straight corridor stretches, each:
                       {level, start_m, length_m, node_ids,
                        doors: [{node_id, name, generic, description, side,
                                 along_m, perp_m, attached}]}   (sorted by along_m)
      destination  – count facts for the last door (see _destination_count)
    """
    out = {"available": False, "reason": "", "stretches": [], "destination": None}
    if len(path) < 2:
        out["reason"] = "route has no movement"
        return out
    if not _map_has_tagged_corridors(graph):
        out["reason"] = "the map has no corridor=yes ways, so corridors can't be told from connecting paths"
        return out

    m = len(path) - 1
    route_set = set(path)

    def _leaf_door(nid):
        return nid in door_nodes and len(graph.get(nid, ())) <= 1

    # ---- per-edge facts -------------------------------------------------
    lens, brgs, infos, corr = [], [], [], []
    for i in range(m):
        a_id, b_id = path[i], path[i + 1]
        a, b = nodes[a_id], nodes[b_id]
        lens.append(haversine_m(a["lat"], a["lon"], b["lat"], b["lon"]))
        brgs.append(bearing_deg(a["lat"], a["lon"], b["lat"], b["lon"]))
        info = _edge_info_between(graph, a_id, b_id)
        infos.append(info)
        corr.append(
            info is not None
            and info["kind"] != "stairs"
            and _is_tagged_corridor(info["way_tags"])
            and not _leaf_door(a_id)
            and not _leaf_door(b_id)
        )
    cum = [0.0]
    for L in lens:
        cum.append(cum[-1] + L)

    # ---- split into straight stretches (same 25° rule as the turn-by-turn) ----
    spans = []
    cur = None
    for i in range(m):
        if not corr[i]:
            if cur:
                spans.append(cur)
                cur = None
            continue
        lvl = infos[i]["level"].split(";")[0]
        if cur is not None:
            diff = (brgs[i] - brgs[i - 1] + 540) % 360 - 180
            if cur["last"] == i - 1 and cur["level"] == lvl and turn_descriptor(diff) is None:
                cur["last"] = i
                continue
            spans.append(cur)
        cur = {"first": i, "last": i, "level": lvl}
    if cur:
        spans.append(cur)

    # ---- doors beside each stretch ----------------------------------------
    doors_by_level = {}
    for d in door_nodes:
        if d in route_set or d not in nodes:
            continue
        doors_by_level.setdefault(_door_level(nodes, d), []).append(d)

    for sp in spans:
        first, last = sp["first"], sp["last"]
        node_ids = path[first:last + 2]
        node_set = set(node_ids)
        edge_cum = []
        run = 0.0
        for k in range(first, last + 1):
            edge_cum.append(run)
            run += lens[k]
        stretch_len = run

        found = []
        for d in doors_by_level.get(sp["level"], []):
            tags = nodes[d]["tags"]
            p = (nodes[d]["lat"], nodes[d]["lon"])
            best = None
            for j, k in enumerate(range(first, last + 1)):
                a = (nodes[path[k]]["lat"], nodes[path[k]]["lon"])
                b = (nodes[path[k + 1]]["lat"], nodes[path[k + 1]]["lon"])
                li = door_line_info(p, a, b)
                if li is None:
                    continue
                perp, along, L, side = li
                if perp > DOOR_ALONGSIDE_MAX_M:
                    continue
                if along < -DOOR_WINDOW_EXT_M or along > L + DOOR_WINDOW_EXT_M:
                    continue
                if best is None or perp < best[0]:
                    best = (perp, edge_cum[j] + along, side)
            if best is None:
                continue
            name = tags.get("name", "").strip()
            found.append({
                "node_id": d,
                "name": name,
                "generic": _is_generic_door_name(name),
                "description": tags.get("description", "").strip(),
                "loc_name": tags.get("loc_name", "").strip(),
                "side": best[2],
                "along_m": best[1],
                "perp_m": best[0],
                "attached": any(nb in node_set for nb, _, _ in graph.get(d, ())),
            })
        found.sort(key=lambda x: x["along_m"])
        out["stretches"].append({
            "level": sp["level"],
            "start_m": cum[first],
            "length_m": stretch_len,
            "first_edge": first,
            "last_edge": last,
            "node_ids": node_ids,
            "doors": found,
        })

    out["available"] = True
    out["destination"] = _destination_count(path, nodes, graph, door_nodes, out["stretches"], corr, lens, brgs)
    return out


def _destination_count(path, nodes, graph, door_nodes, stretches, corr, lens, brgs):
    """
    "The destination is the Nth door on your <side>" — computed, never guessed.

    Counts only door NODES on the destination's side, beside the LAST straight
    corridor stretch, before the junction where you turn off to the destination.
    `reliable` is True only when the stretch passes every safety check.
    """
    m = len(path) - 1
    dest = path[-1]
    res = {"available": False, "reliable": False, "reason": "", "side": None,
           "ordinal": None, "passed": [], "stretch_length_m": None}

    if dest not in door_nodes:
        res["reason"] = "destination is not a door node"
        return res
    last_corr = max((i for i in range(m) if corr[i]), default=None)
    if last_corr is None:
        res["reason"] = "route never walks a tagged corridor"
        return res
    j_idx = last_corr + 1
    if j_idx >= m:
        res["reason"] = "destination door sits on the corridor line itself"
        return res
    if not stretches or stretches[-1]["last_edge"] != last_corr:
        res["reason"] = "final corridor stretch not found"
        return res
    stub_len = sum(lens[j_idx:m])
    if stub_len > DOOR_STUB_MAX_M:
        res["reason"] = f"destination is {stub_len:.0f} m off the corridor (not a door on the corridor wall)"
        return res

    for k in range(j_idx + 1, m):
        if turn_descriptor((brgs[k] - brgs[k - 1] + 540) % 360 - 180) is not None:
            res["reason"] = "the little path to the destination door bends"
            return res

    diff = (brgs[j_idx] - brgs[last_corr] + 540) % 360 - 180
    if abs(diff) < DOOR_SIDE_MIN_ANGLE or abs(diff) > DOOR_SIDE_MAX_ANGLE:
        res["reason"] = "destination door is not clearly to one side of the corridor"
        return res
    side = "right" if diff > 0 else "left"

    # Cross-check the side against where the door actually sits.
    a = (nodes[path[last_corr]]["lat"], nodes[path[last_corr]]["lon"])
    j = (nodes[path[j_idx]]["lat"], nodes[path[j_idx]]["lon"])
    dpos = (nodes[dest]["lat"], nodes[dest]["lon"])
    li = door_line_info(dpos, a, j)
    if li is None or li[3] != side:
        res["reason"] = "turn direction and door position disagree"
        return res

    st = stretches[-1]
    L = st["length_m"]
    if L < SHORT_WALK_M:
        # the walk before the final turn would be "a short distance" — nothing worth counting
        res["reason"] = "the last stretch of corridor is too short to count doors along"
        return res
    same = [d for d in st["doors"] if d["side"] == side]
    problems = []
    for d in same:
        label = d["name"] or "a door"
        if not d["attached"]:
            problems.append(f"{label} is beside the corridor but not connected to it in the map")
        if d["along_m"] < DOOR_END_AMBIGUITY_M:
            problems.append(f"{label} is right at the corner where this stretch starts")
        if abs(d["along_m"] - L) <= DOOR_END_AMBIGUITY_M:
            problems.append(f"{label} is right next to the destination door")
    # near-duplicate door nodes on the destination's side (double doors / stray nodes)
    pts = [(d["name"] or "a door", nodes[d["node_id"]]) for d in same] + [("the destination", nodes[dest])]
    for x in range(len(pts)):
        for y in range(x + 1, len(pts)):
            if haversine_m(pts[x][1]["lat"], pts[x][1]["lon"], pts[y][1]["lat"], pts[y][1]["lon"]) < DOOR_DUPLICATE_M:
                problems.append(f"{pts[x][0]} and {pts[y][0]} are almost on top of each other")

    passed = [d for d in same if d["along_m"] < L - DOOR_END_AMBIGUITY_M]
    res.update({
        "available": True,
        "side": side,
        "ordinal": len(passed) + 1,
        "stretch_length_m": L,
        "passed": [
            {"ordinal": k + 1, "name": ("" if d["generic"] else d["name"]), "node_id": d["node_id"]}
            for k, d in enumerate(passed)
        ],
    })
    if problems:
        res["reason"] = "; ".join(problems[:2])
        return res
    if res["ordinal"] > DOOR_COUNT_MAX:
        res["reason"] = f"{res['ordinal']} doors is too many to count by eye"
        return res
    res["reliable"] = True
    return res


def alongside_doors(analysis):
    """
    Every door node found beside the route's corridor stretches (attached ones only),
    de-duplicated and ordered by distance from the start of the route.
    Each entry: the door dict from analyze_route_doors plus route_m and level.
    """
    best = {}
    for st in analysis.get("stretches", []):
        for d in st["doors"]:
            if not d["attached"]:
                continue
            e = dict(d)
            e["route_m"] = st["start_m"] + max(0.0, min(d["along_m"], st["length_m"]))
            e["level"] = st["level"]
            if d["node_id"] not in best or e["perp_m"] < best[d["node_id"]]["perp_m"]:
                best[d["node_id"]] = e
    return sorted(best.values(), key=lambda e: e["route_m"])