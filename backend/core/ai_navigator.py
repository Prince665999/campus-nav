"""
ai_navigator.py

Same routing as turn_by_turn.py, but instead of printing raw
turn-by-turn steps, it gathers the named landmarks near the route
(using their descriptions) and asks an LLM (via Groq's free API) to
narrate the walk like a local guide.

Setup:
    pip install requests
    Get a free API key from https://console.groq.com
    Set it as an environment variable before running:

        Windows (PowerShell):  $env:GROQ_API_KEY="your_key_here"
        Mac/Linux:              export GROQ_API_KEY="your_key_here"

Usage:
    python ai_navigator.py map.osm


What changed in this version
----------------------------
A. Things stopped appearing too early.
   Before, an area was placed on the timeline at the FIRST distance
   where its boundary came within 15 m of the route. A wide building or
   a long field satisfies that far too soon, which is exactly why a
   junction at 80 m looked like it came after a building at 75 m even
   though on the ground the junction is clearly first. Now each area is
   anchored at the distance where the walker is genuinely ALONGSIDE it
   (the point of closest approach), and the "first came into view"
   distance is kept separately as extra colour.

B. Things behind you are no longer called out as in front of you.
   Every sample along the route now knows which way the walker is
   facing. An area whose closest point sits behind the walker's
   shoulders at that moment is not treated as a sighting at all.

C. "It's on your left" when the building is dead ahead is fixed.
   Position is now straight ahead / ahead on your left / on your left /
   behind you, decided from the angle, not just a left-right sign.

D. Ties are broken deterministically.
   When two things land within the same meter, turns are announced
   before junctions, junctions before areas, and areas before arrival.

E. The narration is plain spoken text. No asterisks, no bullets, no
   headings. Anything the model sneaks in is stripped afterwards.

F. If the API key is missing or the call fails, the script still
   produces a natural-sounding narration locally instead of dropping
   back to robotic numbered steps.
"""

import os
import re
import sys
import json

try:
    import requests
except ImportError:
    requests = None

from campus_graph import (
    parse_osm, build_graph, named_nodes, named_areas, find_named_node,
    a_star, generate_turn_by_turn, total_distance_m,
    haversine_m, sample_route, closest_point_on_polygon, point_in_polygon,
    relative_bearing_to_point, relative_position, is_behind, side_word,
    bearing_deg, describe_distance, round_distance,
    densify_polygon, RouteProjector,
)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"   # free-tier model on Groq as of writing

LANDMARK_RADIUS_M = 15   # how close an area's boundary must be to be mentioned
ROUTE_STEP_M = 3         # resolution used to walk the route (finer = more accurate anchoring)
GAP_TOLERANCE_M = 12     # gaps smaller than this don't split one area into two mentions
BOUNDARY_STEP_M = 2      # how finely an area's outline is walked when projecting it
PAIR_WINDOW_M = 12       # two areas starting within this of each other are "either side of you"
MIN_RUN_M = 4            # ignore blink-and-miss detections
NEAR_START_IGNORE_M = 4  # don't announce a junction sitting on your own doorstep
END_BUFFER_M = 15        # things that only show up at the very end aren't "along the way"


# ---------- Areas along the route ----------

def area_extents_along_route(path, nodes, areas, radius=LANDMARK_RADIUS_M,
                             step_m=ROUTE_STEP_M, gap_tolerance_m=GAP_TOLERANCE_M):
    """
    Works out, for every named area, WHERE ALONG THE WALK it begins and
    ends - not where you happen to be nearest to it.

    How it works now
    ----------------
    The area's whole outline is densified into points every couple of
    meters. Every one of those points is projected onto the route, giving
    (along_m, offset_m): how far into the walk that bit of wall sits, and
    how far off to the side. Points further than `radius` to the side are
    ignored. What remains is the true along-track footprint of the area:

        begins_m = the smallest along_m   -> where it starts beside you
        ends_m   = the largest along_m    -> where it stops
        length_m = ends_m - begins_m      -> how long you walk past it

    Why this replaces the old "point of closest approach" anchor
    -----------------------------------------------------------
    For anything running roughly parallel to the path, the distance to it
    is almost constant for its whole length. The minimum of an almost-flat
    curve is decided by noise, so one building would resolve to its near
    corner and the building directly opposite would resolve to its far
    corner. That is exactly why two buildings that start at the same point
    were being announced 30 m apart. Along-track projection has no minimum
    to search for, so two facades that start together always report the
    same begins_m.

    Returned fields:
        begins_m, ends_m, length_m, min_dist_m, side, approach, inside
    """
    samples = sample_route(path, nodes, step_m)
    if len(samples) < 2:
        return []

    projector = RouteProjector(samples)
    results = []

    for area in areas:
        boundary = densify_polygon(area["vertices"], step_m=BOUNDARY_STEP_M)

        hits = []
        for blat, blon in boundary:
            p = projector.project(blat, blon)
            if p["offset_m"] > radius:
                continue
            s = p["sample"]
            rel = relative_bearing_to_point(s["lat"], s["lon"], s["bearing"], blat, blon)
            hits.append({
                "along_m": p["along_m"],
                "offset_m": p["offset_m"],
                "rel": rel,
                "lat": blat,
                "lon": blon,
            })

        if not hits:
            continue

        hits.sort(key=lambda h: h["along_m"])

        # Split into separate stretches only if there is a genuine along-track
        # gap - e.g. an L-shaped block you leave and rejoin.
        runs = []
        current = [hits[0]]
        for h in hits[1:]:
            if h["along_m"] - current[-1]["along_m"] <= gap_tolerance_m:
                current.append(h)
            else:
                runs.append(current)
                current = [h]
        runs.append(current)

        route_inside = any(
            point_in_polygon((sm["lat"], sm["lon"]), area["vertices"]) for sm in samples
        )

        for run in runs:
            begins = run[0]["along_m"]
            ends = run[-1]["along_m"]
            length = ends - begins
            closest = min(run, key=lambda h: h["offset_m"])

            forward = [h for h in run if not is_behind(h["rel"])]
            if not forward:
                continue  # only ever behind you - not something you walk past

            if length < MIN_RUN_M and closest["offset_m"] > radius * 0.6:
                continue  # clipped the corner of something far off - noise

            # Which side it sits on, decided by the whole footprint rather
            # than by one sample, and weighted toward the nearest bits.
            left_weight = sum(1.0 / max(h["offset_m"], 0.5) for h in run if h["rel"] < 0)
            right_weight = sum(1.0 / max(h["offset_m"], 0.5) for h in run if h["rel"] >= 0)
            side = "right" if right_weight >= left_weight else "left"

            # How it looks as you come up to it: stand back a little from
            # where it begins and look at its leading edge.
            look_from = projector.sample_at(max(0.0, begins - 12.0))
            lead = run[0]
            approach_rel = relative_bearing_to_point(
                look_from["lat"], look_from["lon"], look_from["bearing"],
                lead["lat"], lead["lon"]
            )
            approach = relative_position(approach_rel)
            if is_behind(approach_rel):
                approach = "on your " + side
            if route_inside and closest["offset_m"] < 3.0:
                # The path runs into or through it, so it is in front of you,
                # not off to one side, however the leading edge happens to sit.
                approach = "straight ahead"

            results.append({
                "name": area["name"],
                "description": area["description"],
                "begins_m": begins,
                "ends_m": ends,
                "length_m": max(length, step_m),
                "min_dist_m": closest["offset_m"],
                "side": side,
                "approach": approach,
                "inside": route_inside,
            })

    return sorted(results, key=lambda e: (round(e["begins_m"]), e["name"]))


def dedupe_areas(areas, window_m=25):
    """
    The same building can be picked up twice if the route wiggles. Keep
    the closest sighting when two mentions of the same name fall within
    `window_m` of each other.
    """
    kept = []
    for a in areas:
        clash = None
        for k in kept:
            if k["name"] == a["name"] and abs(k["begins_m"] - a["begins_m"]) <= window_m:
                clash = k
                break
        if clash is None:
            kept.append(a)
        elif a["min_dist_m"] < clash["min_dist_m"]:
            kept[kept.index(clash)] = a
    return sorted(kept, key=lambda e: (round(e["begins_m"]), e["name"]))


def filter_areas(areas_along_route, distance_m, start_name, end_name, end_buffer_m=END_BUFFER_M):
    """
    1. Drops the START building - you are leaving from there, you don't
       "pass" it.
    2. Marks the area matching the destination name so it gets phrased as
       arriving rather than as a landmark.
    3. Drops any OTHER area that only shows up in the final stretch, since
       those are things sitting near the destination rather than things
       genuinely passed on the way, and mentioning them makes it sound
       like they come before the destination when they do not.
    """
    filtered = []
    start_lower = (start_name or "").strip().lower()
    end_lower = (end_name or "").strip().lower()

    for a in areas_along_route:
        name_lower = a["name"].strip().lower() if a["name"] else ""

        if name_lower == start_lower:
            continue

        is_destination = name_lower == end_lower

        if not is_destination and a["begins_m"] > (distance_m - end_buffer_m):
            continue

        a = dict(a)
        a["is_destination"] = is_destination
        filtered.append(a)

    return filtered


def destination_view(path, nodes, areas, end_name):
    """
    Works out how the destination looks on the final approach - straight
    ahead, ahead on your left, and so on - using the bearing of the last
    stretch of the walk rather than a guess.
    """
    if len(path) < 2:
        return None

    last = nodes[path[-1]]
    prev = nodes[path[-2]]
    final_bearing = bearing_deg(prev["lat"], prev["lon"], last["lat"], last["lon"])

    # Stand back a little so "ahead" means something.
    lookback_lat, lookback_lon = prev["lat"], prev["lon"]

    target = None
    for area in areas:
        if area["name"].strip().lower() == (end_name or "").strip().lower():
            target = area
            break

    if target is None:
        rel = relative_bearing_to_point(
            lookback_lat, lookback_lon, final_bearing, last["lat"], last["lon"]
        )
        return relative_position(rel)

    _dist, closest_ll = closest_point_on_polygon((lookback_lat, lookback_lon), target["vertices"])
    rel = relative_bearing_to_point(
        lookback_lat, lookback_lon, final_bearing, closest_ll[0], closest_ll[1]
    )
    return relative_position(rel)


# ---------- Junctions along the route ----------

def path_branches_along_route(path, nodes, graph, edge_tags, total_m=None):
    """
    Purely informational, does NOT affect routing at all.

    At every node along the route, checks the graph for any OTHER path
    connected there that isn't part of the route itself, and notes which
    side it's on. No destinations are named - just "a path also goes off
    to your left", so the walker can confirm they're still on track.

    Only branches tagged highway=footway are mentioned. A branch tagged
    highway=path is treated as a point-connector (drawn only to link a
    location to the network) and is silently skipped here. Routing itself
    still uses BOTH tag types - this filter only affects narration.

    Branches sitting right on the start point, or right at the
    destination, are skipped: at those moments the walker has better
    things to think about than a side path.
    """
    branches = []
    cumulative = 0.0

    for i, node_id in enumerate(path):
        if i < len(path) - 1:
            walking_bearing = bearing_deg(
                nodes[node_id]["lat"], nodes[node_id]["lon"],
                nodes[path[i + 1]]["lat"], nodes[path[i + 1]]["lon"],
            )
        else:
            walking_bearing = bearing_deg(
                nodes[path[i - 1]]["lat"], nodes[path[i - 1]]["lon"],
                nodes[node_id]["lat"], nodes[node_id]["lon"],
            )

        route_neighbors = set()
        if i > 0:
            route_neighbors.add(path[i - 1])
        if i < len(path) - 1:
            route_neighbors.add(path[i + 1])

        sides_here = set()
        for neighbor_id, _dist in graph.get(node_id, []):
            if neighbor_id in route_neighbors:
                continue  # that's the route itself, not a branch

            tags = edge_tags.get(frozenset((node_id, neighbor_id)), {})
            if tags.get("highway") != "footway":
                continue  # point-connector, not a real path someone would notice

            branch_bearing = bearing_deg(
                nodes[node_id]["lat"], nodes[node_id]["lon"],
                nodes[neighbor_id]["lat"], nodes[neighbor_id]["lon"],
            )
            rel = (branch_bearing - walking_bearing + 540) % 360 - 180

            if abs(rel) < 15:
                continue  # basically continues the same way
            if abs(rel) > 160:
                continue  # doubles straight back the way you came

            sides_here.add(side_word(rel))

        keep = bool(sides_here)
        if keep and cumulative < NEAR_START_IGNORE_M:
            keep = False
        if keep and total_m is not None and cumulative > total_m - NEAR_START_IGNORE_M:
            keep = False

        if keep:
            branches.append({
                "at_m": cumulative,
                "sides": sorted(sides_here),
                "node_id": node_id,
            })

        if i < len(path) - 1:
            cumulative += haversine_m(
                nodes[node_id]["lat"], nodes[node_id]["lon"],
                nodes[path[i + 1]]["lat"], nodes[path[i + 1]]["lon"],
            )

    return branches


def remove_branches_at_turns(branches, steps, window_m=6):
    """
    Drop any junction mention that lands on the same node as a turn, or
    within a few meters of one. The turn instruction already covers that
    spot, so repeating it just clutters the narration.
    """
    turn_nodes = {s["node_id"] for s in steps}
    turn_distances = [s["at_m"] for s in steps if s["kind"] in ("turn", "curve")]

    kept = []
    for b in branches:
        if b["node_id"] in turn_nodes:
            continue
        if any(abs(b["at_m"] - t) <= window_m for t in turn_distances):
            continue
        kept.append(b)
    return kept


# ---------- Path surface / description notes ----------

def path_notes_along_route(path, nodes, edge_tags):
    """
    Pulls path-level tags (surface, description) for each edge walked and
    returns only the CHANGES, each stamped with the distance at which the
    change happens, so they can sit on the same timeline as everything
    else instead of being dumped in a separate list the model has to
    guess the timing for.
    """
    notes = []
    last_surface = None
    last_description = None
    cumulative = 0.0

    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        tags = edge_tags.get(frozenset((a, b)), {})
        surface = tags.get("surface")
        description = tags.get("description")

        if surface and surface != last_surface:
            if last_surface is not None:
                notes.append({"at_m": cumulative, "text": "the path surface changes to " + surface})
            else:
                notes.append({"at_m": cumulative, "text": "the path underfoot is " + surface})
            last_surface = surface

        if description and description != last_description:
            notes.append({"at_m": cumulative, "text": description})
            last_description = description

        cumulative += haversine_m(
            nodes[a]["lat"], nodes[a]["lon"], nodes[b]["lat"], nodes[b]["lon"]
        )

    return notes


# ---------- Timeline ----------

EVENT_PRIORITY = {
    "TURN": 0,
    "PATH": 1,
    "JUNCTION": 2,
    "AREA": 3,
    "DESTINATION": 4,
}


def _area_phrases(a):
    """Detail text (for the model and the accuracy check) and spoken text."""
    length_txt = str(round_distance(a["length_m"])) + " meters"
    span = ("from about " + str(round_distance(a["begins_m"])) + " to about "
            + str(round_distance(a["ends_m"])) + " meters in")

    if a["inside"]:
        detail = "you are walking through " + a["name"] + " (" + span + ")"
        spoken = "you'll be walking right through " + a["name"] + " for about " + length_txt
    elif a["approach"] == "straight ahead":
        detail = (a["name"] + " starts straight ahead of you and you pass it on your "
                  + a["side"] + " (" + span + ", so about " + length_txt + " alongside you)")
        spoken = (a["name"] + " sits straight ahead of you, and you'll pass it on your "
                  + a["side"] + ", with it beside you for about " + length_txt)
    else:
        approach_side = "right" if a["approach"].endswith("right") else (
            "left" if a["approach"].endswith("left") else None)
        detail = a["name"] + " starts " + a["approach"]
        spoken = a["name"] + " starts " + a["approach"]
        if approach_side is not None and approach_side != a["side"]:
            detail += " and ends up on your " + a["side"]
            spoken += " and ends up on your " + a["side"]
        detail += " (" + span + ", so about " + length_txt + " alongside you)"
        spoken += ", staying beside you for about " + length_txt

    if a["description"]:
        detail += " - " + a["description"]
        spoken += ". That's " + a["description"]

    return detail, spoken


def pair_areas(areas, window_m=PAIR_WINDOW_M):
    """
    Groups areas that BEGIN at roughly the same distance on OPPOSITE sides
    of the path, so they can be announced as one thing you walk between
    rather than as two unrelated landmarks tens of meters apart.

    This is the other half of the fix. Even with correct distances, saying
    "a hall on your right" and then, separately, "a hall on your left" is
    not how a person describes walking down a gap between two buildings.

    Returns a list of (area, partner_or_None) in order of begins_m.
    """
    ordered = sorted(areas, key=lambda a: (round(a["begins_m"]), a["name"]))
    used = set()
    groups = []

    for i, a in enumerate(ordered):
        if i in used or a["inside"]:
            if i not in used:
                used.add(i)
                groups.append((a, None))
            continue

        partner_index = None
        for j in range(i + 1, len(ordered)):
            if j in used:
                continue
            b = ordered[j]
            if b["inside"]:
                continue
            if b["begins_m"] - a["begins_m"] > window_m:
                break  # ordered, so nothing further can pair either
            if b["side"] != a["side"]:
                partner_index = j
                break

        used.add(i)
        if partner_index is None:
            groups.append((a, None))
        else:
            used.add(partner_index)
            groups.append((a, ordered[partner_index]))

    return groups


def _pair_phrases(a, b):
    """Two areas either side of you, starting together."""
    left = a if a["side"] == "left" else b
    right = b if a["side"] == "left" else a

    overlap = max(0.0, min(a["ends_m"], b["ends_m"]) - max(a["begins_m"], b["begins_m"]))
    length_txt = str(round_distance(max(overlap, min(a["length_m"], b["length_m"])))) + " meters"
    begin_txt = str(round_distance(min(a["begins_m"], b["begins_m"])))

    detail = ("BOTH SIDES AT ONCE: " + left["name"] + " on your left and " + right["name"]
              + " on your right both begin at about " + begin_txt
              + " meters, and you walk between them for about " + length_txt)
    spoken = ("you'll find yourself walking in between two of them - " + left["name"]
              + " on your left and " + right["name"] + " on your right - for about "
              + length_txt)

    descriptions = []
    if left["description"]:
        descriptions.append(left["name"] + " is " + left["description"])
    if right["description"]:
        descriptions.append(right["name"] + " is " + right["description"])
    if descriptions:
        detail += " (" + "; ".join(descriptions) + ")"
        spoken += ". " + " and ".join(descriptions)

    return detail, spoken


def build_timeline(steps, areas, path_notes, branches):
    """
    One merged, chronologically ordered list of everything that happens on
    the walk. Every entry is (distance, kind, detail_text, spoken_text).

    detail_text is the precise version handed to the model and printed by
    the accuracy check. spoken_text is the same fact already shaped into
    speech, used by the local narrator.

    Areas are anchored at the distance where they BEGIN alongside you, and
    areas beginning together on opposite sides are merged into a single
    "you walk between them" event before anything is sorted.

    Sorting is by rounded distance first, then by a fixed priority, so two
    things that happen at the same spot always come out in the same
    sensible order rather than whatever the sort happened to do that run.
    """
    events = []
    arrival_m = steps[-1]["at_m"] if steps else 0.0

    for s in steps:
        events.append((s["at_m"], "TURN", s["instruction"], s["instruction"]))

    for n in path_notes:
        events.append((n["at_m"], "PATH", n["text"], n["text"]))

    for b in branches:
        sides = " and ".join(b["sides"])
        detail = "another path branches off to your " + sides
        spoken = ("you'll notice another path going off to your " + sides
                  + ", just keep going straight")
        events.append((b["at_m"], "JUNCTION", detail, spoken))

    destinations = [a for a in areas if a.get("is_destination")]
    ordinary = [a for a in areas if not a.get("is_destination")]

    for a, partner in pair_areas(ordinary):
        if partner is None:
            detail, spoken = _area_phrases(a)
            events.append((a["begins_m"], "AREA", detail, spoken))
        else:
            detail, spoken = _pair_phrases(a, partner)
            events.append((min(a["begins_m"], partner["begins_m"]), "AREA", detail, spoken))

    for a in destinations:
        detail = ("THIS IS THE DESTINATION (" + a["name"] + "), " + a["approach"]
                  + " as you come up to it")
        spoken = "that's " + a["name"] + " right there, " + a["approach"]
        if a["description"]:
            detail += " - " + a["description"]
            spoken += " - " + a["description"]
        # The destination is always the last thing said. Its outline can
        # begin a little before the final node, which would otherwise make
        # the narration announce arrival and then carry on walking.
        events.append((max(a["begins_m"], arrival_m), "DESTINATION", detail, spoken))

    events.sort(key=lambda e: (round(e[0]), EVENT_PRIORITY.get(e[1], 9)))
    return events


def format_timeline(events):
    return "\n".join(
        "- [" + str(round(at_m)) + "m] " + kind + ": " + detail
        for at_m, kind, detail, _spoken in events
    )


# ---------- Prompt ----------

def build_prompt(start_name, end_name, distance_m, events, destination_position):
    timeline_lines = format_timeline(events)

    prompt = (
        "You are a friendly local who has lived on this campus for twenty years, "
        "walking a fellow student from \"" + start_name + "\" to \"" + end_name + "\" "
        "and talking to them as you go. The whole walk is about "
        + str(round_distance(distance_m)) + " meters.\n\n"
        "Here is the EXACT sequence of everything that happens on this walk, in order "
        "of how many meters into the walk it happens (the number in brackets):\n\n"
        + timeline_lines + "\n\n"
        "When you arrive, " + end_name + " is " + (destination_position or "in front of you") + ".\n\n"
        "Turn this into spoken directions, the way you would actually say them out loud "
        "while walking beside someone.\n\n"
        "Rules you must follow:\n"
        "1. Follow the timeline strictly in order. Never mention anything before the "
        "distance at which it appears in the list. If a turn is listed before a building, "
        "say the turn first and only then the building. Do not pull a landmark forward "
        "into an earlier sentence just because you already know it is coming.\n"
        "2. Keep every distance that is given to you. Say them naturally, for example "
        "\"walk on for about forty meters\" or \"after roughly twenty meters\", but do not "
        "change, merge, average or invent any number.\n"
        "3. Use the left, right and straight-ahead wording exactly as given. If the list "
        "says something is straight ahead, never call it left or right. If it says ahead "
        "on your right, do not flatten it to just on your right.\n"
        "4. Describe an area as something you walk alongside for the stretch given, not a "
        "single point you flash past. Some entries are marked BOTH SIDES AT ONCE: those are "
        "two places that begin together on either side of the path, and you must say them "
        "as one thing - that the walker passes between them - never as two separate "
        "landmarks at two different distances.\n"
        "5. For a junction, keep it short and just say which side the other path goes off "
        "to, and that they should keep going. Never say where that other path leads.\n"
        "6. For the DESTINATION entry, phrase it as arriving, for example \"and there it "
        "is, right in front of you\", not as a landmark passed along the way.\n"
        "7. Invent nothing. If it is not in the list above, it does not exist.\n"
        "8. Write plain spoken prose only. No asterisks, no bullet points, no numbered "
        "lists, no headings, no bold, no markdown of any kind. Just two or three short "
        "flowing paragraphs, warm and casual, like a real person giving directions.\n"
        "9. Do not start with a preamble like \"Sure\" or \"Here are your directions\". "
        "Begin with the first instruction itself.\n"
    )
    return prompt


# ---------- Local narration (fallback, and used when there is no API key) ----------

def local_narration(start_name, end_name, distance_m, events, destination_position):
    """
    A natural-sounding narration built straight from the timeline, with no
    model involved. Same order, same facts, just stitched into sentences.
    Used when there is no API key and whenever the API call fails, so the
    output never falls back to a robotic numbered list.
    """
    parts = ["Alright, from " + start_name + " it's " + describe_distance(distance_m)
             + " altogether."]
    connectors = ["Then", "After that", "From there", "Keep on and", "A bit further along"]
    c = 0
    said_destination = False

    for at_m, kind, _detail, spoken in events:
        if kind == "TURN":
            if spoken.startswith("Head ") or "then" in spoken.lower():
                parts.append(spoken + ".")
            else:
                lowered = spoken[0].lower() + spoken[1:]
                parts.append(connectors[c % len(connectors)] + " " + lowered + ".")
                c += 1
        elif kind == "PATH":
            parts.append("Along here " + spoken + ".")
        elif kind == "DESTINATION":
            parts.append("And " + spoken + ".")
            said_destination = True
        else:
            parts.append(spoken[0].upper() + spoken[1:] + ".")

    if not said_destination:
        parts.append("And that's " + end_name + ", "
                     + (destination_position or "right in front of you") + ".")

    return clean_output(" ".join(parts))


# ---------- Output cleaning ----------

def clean_output(text):
    """Strip anything that looks like markdown so the output reads as speech."""
    text = re.sub(r"```.*?```", "", text, flags=re.S)
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.M)
    text = re.sub(r"^\s*[-*\u2022]\s+", "", text, flags=re.M)
    text = re.sub(r"^\s*\d+[.)]\s+", "", text, flags=re.M)
    text = text.replace("*", "").replace("`", "").replace("#", "")
    text = re.sub(r"(?<!\w)_(?!\w)", "", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------- Groq ----------

def call_groq(prompt, api_key):
    headers = {
        "Authorization": "Bearer " + api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content":
                "You give walking directions out loud. You always reply in plain prose. "
                "You never use markdown, asterisks, bullet points or numbered lists. "
                "You never mention something before the point in the walk where it occurs."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.6,
    }
    response = requests.post(GROQ_URL, headers=headers, data=json.dumps(payload), timeout=30)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


# ---------- Main ----------

def main():
    if len(sys.argv) < 2:
        print("Usage: python ai_navigator.py map.osm")
        sys.exit(1)

    osm_path = sys.argv[1]
    print("Loading " + osm_path + " ...")
    nodes, ways = parse_osm(osm_path)
    graph, _, edge_tags = build_graph(nodes, ways)
    areas = named_areas(nodes, ways)
    names = named_nodes(nodes)
    print("Loaded " + str(len(names)) + " named locations.\n")

    print("Available named locations:")
    for d in names.values():
        print("   - " + d["tags"]["name"])

    start_query = input("\nStart from: ").strip()
    end_query = input("Go to: ").strip()

    start_id = find_named_node(nodes, start_query)
    end_id = find_named_node(nodes, end_query)

    if not start_id or not end_id:
        print("Couldn't match one of those names to a location on the map.")
        return
    if start_id == end_id:
        print("That's the same place - you're already there.")
        return
    if start_id not in graph or end_id not in graph:
        print("One of those locations isn't connected to a footpath yet.")
        return

    path, distance = a_star(graph, nodes, start_id, end_id)
    if not path:
        print("No route found - check the footpaths connect those two points.")
        return

    start_name = nodes[start_id]["tags"]["name"]
    end_name = nodes[end_id]["tags"]["name"]

    steps = generate_turn_by_turn(path, nodes)
    areas_along_route = dedupe_areas(area_extents_along_route(path, nodes, areas))
    areas_along_route = filter_areas(areas_along_route, distance, start_name, end_name)
    path_notes = path_notes_along_route(path, nodes, edge_tags)
    branches = path_branches_along_route(path, nodes, graph, edge_tags, total_m=distance)
    branches = remove_branches_at_turns(branches, steps)

    destination_position = destination_view(path, nodes, areas, end_name)

    events = build_timeline(steps, areas_along_route, path_notes, branches)

    api_key = os.environ.get("GROQ_API_KEY")

    if not api_key or requests is None:
        if not api_key:
            print("\nNo GROQ_API_KEY set, so here are the directions written locally.\n")
        else:
            print("\nThe requests library isn't installed, so here are the directions written locally.\n")
        print("--- Your route ---\n")
        print(local_narration(start_name, end_name, distance, events, destination_position))
        return

    prompt = build_prompt(start_name, end_name, distance, events, destination_position)

    print("\nAsking the AI to narrate your route...\n")
    try:
        narration = clean_output(call_groq(prompt, api_key))
    except Exception as e:
        print("Groq API request failed: " + str(e))
        print("\nHere are the directions written locally instead.\n")
        print("--- Your route ---\n")
        print(local_narration(start_name, end_name, distance, events, destination_position))
        return

    print("--- Your route ---\n")
    print(narration)


if __name__ == "__main__":
    main()