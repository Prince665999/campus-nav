"""
ai_navigator.py  –  AI-Narrated Indoor Navigation

Same routing as turn_by_turn.py, but gathers the raw indoor
turn-by-turn steps plus contextual info (nearby doors, rooms,
corridor names) and asks an LLM to narrate the walk like a
helpful friend who knows the building well.

What the program works out (the AI only phrases it):
- DOOR COUNTING: "the fourth door on your left". Only door NODES are
  counted (never room areas), only on the left/right of the corridor you are
  walking, and only when the stretch looks reliably mapped. The number is
  computed in Python (campus_graph.analyze_route_doors) because language
  models are unreliable at counting.
- LANDMARKS: only doors that really sit beside the corridor you walk
  (tight distance, same floor, attached to that corridor), at most two are
  mentioned.
- FEWER, LONGER SENTENCES: the raw steps are merged into "moves"
  ("Turn left, then walk about 10 metres along the corridor") before the AI
  sees them, so the narration isn't a list of two-word lines.

The AI is instructed to:
- Sound natural and conversational (like a person, not a GPS)
- Never invent rooms, corridors, doors or landmarks not in the data
- Never skip turns, stairs, or important navigation steps
- Only mention rooms/doors on the same floor
- Say "in front of you" when a destination door is straight ahead
- Use the door count exactly as given, or give no number at all

This file only changes the AI narration. turn_by_turn.py and the raw steps
from generate_turn_by_turn() are unchanged.

Setup:
    pip install requests
    Get a free API key from https://console.groq.com
    Set it as an environment variable:

        Windows (PowerShell):  $env:GROQ_API_KEY="your_key_here"
        Mac/Linux:              export GROQ_API_KEY="your_key_here"

    Or create a .env file in this directory:
        GROQ_API_KEY=your_key_here

Usage:
    python ai_navigator.py map.osm
"""

import os
import re
import sys
import json
import requests

from campus_graph import (
    parse_osm, build_graph, named_nodes, find_named_node,
    a_star, generate_turn_by_turn, total_distance_m, level_label,
    node_display_name, is_door, is_entrance,
    haversine_m, point_segment_info,
    analyze_route_doors, alongside_doors, door_line_info,
    DOOR_WINDOW_EXT_M,
)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"

# Landmarks must be right beside the corridor: in this map a door's stub is
# 1–3 m long, so 3.5 m keeps real neighbours and drops rooms behind walls.
LANDMARK_RADIUS_M = 3.5
MIN_LANDMARK_GAP_M = 10     # don't mention rooms closer than this apart
MAX_ANCHOR_LANDMARKS = 2    # the AI may name at most this many doors

# Narration merging
MAX_MOVES_PER_SENTENCE = 2  # a tiny move may be joined with the next one, never more
MAX_ACTIONS_PER_SENTENCE = 3   # ...and a sentence never holds more than this many actions (turn / walk / stairs)
CANCEL_DOUBLE_TURN_AROUNDS = True   # two "Turn around" in a row undo each other

_ORDINALS = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
             6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth"}
_NUMBER_WORDS = {0: "no", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
                 6: "six", 7: "seven", 8: "eight", 9: "nine"}


def load_env_file():
    """Load .env file if present (simple key=value pairs)."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    val = val.strip().strip('"').strip("'")
                    os.environ.setdefault(key.strip(), val)


# ───────────────────────────── Landmarks (tight) ─────────────────────────────

def _landmark_label(name, loc, generic):
    if generic:
        return "an unlabelled door"
    return f"{name} ({loc})" if loc else name


def _space_out(landmarks):
    """Keep landmarks at least MIN_LANDMARK_GAP_M apart along the route."""
    ordered = sorted(landmarks, key=lambda e: e["meters_from_start"])
    spaced = []
    last_m = -MIN_LANDMARK_GAP_M  # allow the first one
    for lm in ordered:
        if lm["meters_from_start"] - last_m >= MIN_LANDMARK_GAP_M:
            spaced.append(lm)
            last_m = lm["meters_from_start"]
    return spaced


def _landmarks_from_analysis(analysis):
    """Landmarks = named (or described) door nodes found BESIDE the corridor stretches."""
    found = []
    for e in alongside_doors(analysis):
        if e["generic"] and not e["description"]:
            continue  # skip generic "doorN" names unless they carry a description
        found.append({
            "name": _landmark_label(e["name"], e.get("loc_name", ""), e["generic"]),
            "side": e["side"],
            "meters_from_start": e["route_m"],
            "distance_from_path": e["perp_m"],
            "level": e["level"],
            "description": e["description"],
        })
    return found


def _landmarks_geometric(path, nodes, door_nodes):
    """
    Fallback when no graph is available: same tight rules, geometry only.
    A door counts only if it is beside a segment (inside its length, not past its
    ends), within LANDMARK_RADIUS_M of it, and on the same floor.
    """
    route_set = set(path)
    found = {}
    cumulative = 0.0
    for i in range(len(path) - 1):
        a_id, b_id = path[i], path[i + 1]
        a = (nodes[a_id]["lat"], nodes[a_id]["lon"])
        b = (nodes[b_id]["lat"], nodes[b_id]["lon"])
        seg_length = haversine_m(a[0], a[1], b[0], b[1])
        seg_level = nodes[a_id]["tags"].get("level", "0").split(";")[0]

        for nid in door_nodes:
            if nid in route_set:
                continue
            tags = nodes[nid]["tags"]
            name = tags.get("name", "").strip()
            desc = tags.get("description", "").strip()
            is_generic = (not name) or (name.startswith("door") and name[4:].isdigit())
            if is_generic and not desc:
                continue
            if tags.get("level", "0").split(";")[0] != seg_level:
                continue  # SAME FLOOR ONLY

            li = door_line_info((nodes[nid]["lat"], nodes[nid]["lon"]), a, b)
            if li is None:
                continue
            perp, along, length, side = li
            if perp > LANDMARK_RADIUS_M:
                continue
            if along < -DOOR_WINDOW_EXT_M or along > length + DOOR_WINDOW_EXT_M:
                continue  # round a corner / past the end of this segment
            entry = {
                "name": _landmark_label(name, tags.get("loc_name", "").strip(), is_generic),
                "side": side,
                "meters_from_start": cumulative + max(0.0, min(along, length)),
                "distance_from_path": perp,
                "level": seg_level,
                "description": desc,
            }
            if nid not in found or perp < found[nid]["distance_from_path"]:
                found[nid] = entry
        cumulative += seg_length
    return list(found.values())


def landmarks_along_route(path, nodes, door_nodes, graph=None, door_facts=None):
    """
    Returns an ORDERED list of notable doors/rooms right beside the route, with
    side (left/right) and distance from the start.

    Filters:
    - Only door NODES beside the corridor you walk (within LANDMARK_RADIUS_M,
      inside the stretch's length, attached to that corridor) — no rooms behind walls
    - Skips generic "doorN" names (unless they have a description)
    - Only the SAME FLOOR as the route segment
    - Spaces out mentions: at most one every MIN_LANDMARK_GAP_M metres

    Pass `graph` (and optionally `door_facts` from route_door_facts) to use the
    corridor-aware version. Without a graph it falls back to geometry only.
    """
    analysis = door_facts
    if analysis is None and graph is not None:
        analysis = route_door_facts(path, nodes, graph, door_nodes)
    if analysis and analysis.get("available"):
        return _space_out(_landmarks_from_analysis(analysis))
    return _space_out(_landmarks_geometric(path, nodes, door_nodes))


def corridor_notes(path, nodes, corridor_of_door, graph):
    """
    Track when you enter/exit different corridors.
    Returns a list of notes like "entering the main corridor".
    """
    notes = []
    last_corridor = None

    for nid in path:
        cname = corridor_of_door.get(nid)
        if cname and cname != last_corridor:
            notes.append(f"entering {cname}")
            last_corridor = cname

    # ── Descriptions (description=* tags added in JOSM) ──
    # Nodes on the route: start, destination, and anything in between.
    cumulative = 0.0
    way_seen = set()
    for i, nid in enumerate(path):
        tags = nodes[nid]["tags"]
        desc = tags.get("description", "").strip()
        if desc:
            who = node_display_name(tags)
            if i == 0:
                notes.append(f"description of the starting point{' ' + who if who else ''}: {desc}")
            elif i == len(path) - 1:
                notes.append(f"description of the destination{' ' + who if who else ''}: {desc}")
            else:
                notes.append(
                    f"description of {who or 'a point on the route'} "
                    f"(~{cumulative:.0f}m into the route): {desc}"
                )

        # Ways (paths / corridors / stairs) used by the route
        if i < len(path) - 1:
            nxt = path[i + 1]
            for nb, d, info in graph.get(nid, []):
                if nb == nxt:
                    wtags = info.get("way_tags", {})
                    wdesc = wtags.get("description", "").strip()
                    if wdesc and id(wtags) not in way_seen:
                        way_seen.add(id(wtags))
                        if info["kind"] == "stairs":
                            kind = "stairs"
                        elif str(wtags.get("corridor", "")).strip().lower() in ("yes", "true", "1"):
                            kind = "corridor"
                        else:
                            kind = "connecting path"
                        wname = wtags.get("name", "").strip()
                        label = f"{kind} '{wname}'" if wname else kind
                        notes.append(
                            f"description of the {label} "
                            f"(from ~{cumulative:.0f}m into the route): {wdesc}"
                        )
                    break
            cumulative += haversine_m(
                nodes[nid]["lat"], nodes[nid]["lon"],
                nodes[nxt]["lat"], nodes[nxt]["lon"],
            )

    return notes


# ───────────────────────────── Door-count facts ─────────────────────────────

def route_door_facts(path, nodes, graph, door_nodes):
    """
    Door facts for this route (see campus_graph.analyze_route_doors).
    Never raises: if anything goes wrong the narration simply has no door counts.
    """
    try:
        return analyze_route_doors(path, nodes, graph, door_nodes)
    except Exception as e:  # pragma: no cover - safety net
        print(f"[door counting skipped] {e}")
        return None


def door_count_summary(door_facts):
    """One-line, human-readable status (handy for the console / debugging)."""
    if not door_facts:
        return "Door count: not available (analysis failed)"
    if not door_facts.get("available"):
        return f"Door count: not used — {door_facts.get('reason') or 'not available'}"
    dc = door_facts.get("destination") or {}
    if dc.get("reliable"):
        n, side = dc["ordinal"], dc["side"]
        return f"Door count: destination is the {_ORDINALS.get(n, str(n))} door on your {side}"
    return f"Door count: not used — {dc.get('reason') or 'not available'}"


COUNT_MARKER = "   <<< DOOR COUNT HERE (say it before this move's turn)"


def _count_is_usable(door_facts):
    dc = (door_facts or {}).get("destination") if door_facts else None
    return bool(door_facts and door_facts.get("available") and dc and dc.get("reliable"))


def _door_count_block(door_facts):
    """The DOOR COUNT section of the prompt (facts computed by Python, never by the AI)."""
    dc = (door_facts or {}).get("destination") if door_facts else None
    if not door_facts or not door_facts.get("available") or not dc or not dc.get("reliable"):
        return ("  NOT AVAILABLE for this route. Do NOT give any door numbers and do NOT say "
                "\"the first/second/third door\". Describe the arrival exactly as the step "
                "list does.")

    side = dc["side"]
    n = dc["ordinal"]
    passed = dc["passed"]
    ord_word = _ORDINALS.get(n, f"number {n}")
    lines = [
        f"  - The destination is the {ord_word.upper()} door on your {side.upper()}, counting "
        f"along the LAST stretch of corridor (from where you turn into that corridor up to "
        f"the point where you turn off towards the destination).",
    ]
    if passed:
        k = len(passed)
        lines.append(
            f"  - So you walk past {_NUMBER_WORDS.get(k, str(k)).upper()} door{'s' if k > 1 else ''} "
            f"on your {side} first, and the next one on your {side} is the destination."
        )
        named = [p for p in passed if p["name"]]
        if named:
            lines.append("  - Of the doors you pass, these have names you may use as anchors:")
            for p in named:
                lines.append(f"      * {p['name']} is the {_ORDINALS.get(p['ordinal'], str(p['ordinal']))} door on your {side}")
    else:
        lines.append(f"  - No other doors on your {side} come before it: it is the first one.")
    lines.append(f"  - Count ONLY doors on your {side}. Ignore every door on the other side.")
    lines.append(f"  - Say it in the move marked \"{COUNT_MARKER.strip()}\" (the last stretch of corridor), "
                 f"while the person is STILL WALKING ALONG THE CORRIDOR, before they make the final turn. "
                 f"For example: \"walk past three doors on your left — the fourth one is the room you "
                 f"want, so turn left there\".")
    lines.append("  - NEVER say the count (or \"the first/second/... door on your left\") after that turn "
                 "or in the arrival sentence. Once they have turned they are facing the door, so there "
                 "just say it is right in front of them, exactly as the arrival step says.")
    return "\n".join(lines)


# ───────────────────────────── Fewer, longer sentences ─────────────────────────────

_TURN_ONLY = re.compile(r"^turn (left|right|around)( slightly)?$", re.I)


def _lower_first(text):
    return text[:1].lower() + text[1:]


def _is_walk_step(text):
    return text.lower().startswith(("walk ", "continue ", "keep walking"))


def _is_short_walk(text):
    return text.lower().startswith("walk a short distance")


def _is_arrival(text):
    return text.lower().startswith("you have arrived")


def _actions(text):
    """How many actions a move holds ("Walk 10 m, then turn left" = 2)."""
    return text.count(", then ") + 1


def merge_steps_for_narration(steps):
    """
    Turn the raw step list (20+ tiny lines) into fewer, longer "moves" for the AI.
    Only used for the AI prompt — the raw steps themselves are never changed.

        "Turn left" + "Walk about 10 metres along the corridor"
            →  "Turn left, then walk about 10 metres along the corridor"
        a tiny move (turn + "Walk a short distance") is joined with the move after it
        "Turn around" followed straight by another "Turn around" cancels out (you end up
            facing the same way)
    The raw steps already join a walk with the turn that follows it
    ("Walk about 10 metres along the corridor, then turn left").

    Returns a list of strings.
    """
    texts = [s["instruction"].strip() for s in steps if s.get("instruction")]

    # 1) back-to-back "Turn around" pairs undo each other
    if CANCEL_DOUBLE_TURN_AROUNDS:
        cleaned = []
        for t in texts:
            if t.lower() == "turn around" and cleaned:
                prev = cleaned[-1]
                if prev.lower() == "turn around":
                    cleaned.pop()
                    continue
                if prev.lower().endswith(", then turn around"):
                    cleaned[-1] = prev[: -len(", then turn around")]
                    continue
            cleaned.append(t)
        texts = cleaned

    # 2) a lone turn (or "At the top of the stairs, ...") takes the walk that follows it
    moves = []
    i = 0
    while i < len(texts):
        t = texts[i]
        low = t.lower()
        nxt = texts[i + 1] if i + 1 < len(texts) else None
        is_turn = bool(_TURN_ONLY.match(t))
        is_stairs_exit = low.startswith(("at the top of the stairs", "at the bottom of the stairs"))
        if ((is_turn or is_stairs_exit) and nxt is not None and _is_walk_step(nxt)
                and _actions(t) + _actions(nxt) <= MAX_ACTIONS_PER_SENTENCE):
            moves.append({"text": f"{t}, then {_lower_first(nxt)}", "short": _is_short_walk(nxt)})
            i += 2
            continue
        moves.append({"text": t, "short": _is_short_walk(t)})
        i += 1

    # 3) a tiny move is joined with the move after it (never more than MAX_MOVES_PER_SENTENCE)
    merged = []
    i = 0
    while i < len(moves):
        group = [moves[i]["text"]]
        j = i
        while (
            moves[j]["short"]
            and j + 1 < len(moves)
            and len(group) < MAX_MOVES_PER_SENTENCE
            and not _is_arrival(moves[j + 1]["text"])
            and sum(_actions(x) for x in group) + _actions(moves[j + 1]["text"]) <= MAX_ACTIONS_PER_SENTENCE
        ):
            j += 1
            group.append(_lower_first(moves[j]["text"]))
        merged.append(", then ".join(group))
        i = j + 1
    return merged


# ───────────────────────────── Prompt ─────────────────────────────

def build_prompt(start_name, end_name, start_level, end_level, distance_m, steps, landmarks, notes,
                 door_facts=None):
    """
    Build the LLM prompt for natural indoor navigation narration.

    door_facts: the result of route_door_facts(...). Optional — without it the
    narration simply has no door counts (everything else still works).
    """
    moves = merge_steps_for_narration(steps)
    marked = None
    if _count_is_usable(door_facts):
        # The door count belongs to the walk along the last corridor, i.e. the move that
        # holds the FINAL turn (the turn off the corridor towards the destination door).
        for i in range(len(moves) - 1, -1, -1):
            if not _is_arrival(moves[i]) and re.search(r"\bturn\b", moves[i], re.I):
                marked = i
                break
    move_lines = "\n".join(
        f"  {i+1}. {m}" + (COUNT_MARKER if i == marked else "")
        for i, m in enumerate(moves)
    )

    if landmarks:
        landmark_lines = "\n".join(
            f"  - {lm['name']} (on the {lm['side']}, ~{lm['meters_from_start']:.0f}m into the route, {level_label(lm['level'])})"
            + (f" — description: {lm['description']}" if lm.get("description") else "")
            for lm in landmarks
        )
    else:
        landmark_lines = "  (no notable landmarks near this route)"

    if notes:
        notes_lines = "\n".join(f"  - {n}" for n in notes)
    else:
        notes_lines = "  (no special corridor notes)"

    door_count_lines = _door_count_block(door_facts if marked is not None else None)

    # Floor context (background only — the stairs are mentioned where they happen)
    if start_level != end_level:
        floor_context = f"\nThis route goes from {level_label(start_level)} to {level_label(end_level)}."
    else:
        floor_context = f"\nThis is all on {level_label(start_level)}."

    prompt = f"""You are a friendly person inside a university building, giving another person
walking directions from "{start_name}" to "{end_name}".
{floor_context}

═══════════════════════════════════════════════════
  STRICT RULES — YOU MUST FOLLOW ALL OF THESE
═══════════════════════════════════════════════════

1. NEVER use compass directions (north, south, east, west). People inside
   a building don't know which way is north. Use ONLY: left, right, straight,
   behind you.

2. NEVER INVENT or HALLUCINATE rooms, corridors, doors, or landmarks that
   are NOT in the data below. If a room is not listed, do NOT mention it.
   If a corridor is not listed, do NOT name it.

3. NEVER SKIP any turn, stair change, or important navigation step. Each
   numbered move below may contain several actions (a turn, a walk, stairs).
   Every action must appear in your sentence, in the same order. Missing a
   turn means the person gets lost.

4. Only use the word "corridor" where the moves below use it.
   Some paths are just connecting paths, not the real corridor. If the
   moves say "step out into the corridor", say that and IMMEDIATELY give
   the turn direction. Do NOT add filler like "walk a few steps" between
   exiting a door and turning. Just say: "Step out into the corridor, then
   turn left." If they say "step out of the room" or "until you reach the
   corridor", keep that wording and do not call the connecting path a corridor.

5. When arriving at the destination door:
   - If the moves say "in front of you", say it is "right in front
     of you" or "just ahead".
   - If the moves say "on your left/right", use those exact words.
   - Do NOT change left to right or vice versa.

6. Doors: the ONLY doors you may mention are (a) the landmarks listed below and
   (b) the doors described in the DOOR COUNT section. Don't say "you'll see doors
   on either side" or similar unless the data supports it.

7. Landmarks: name at most TWO doors in total (one or two) — counting both the
   landmark list and any named doors in the DOOR COUNT section — only to help the
   person stay oriented, at roughly the right point in the walk, using the side
   (left/right) EXACTLY as given. Never name more than two.

8. Level -1 is "the basement", level 0 is "the ground floor",
   level 1 is "the first floor". NEVER say "level 0" or "level -1".

9. Keep it warm, natural, and concise — like a fellow student who knows
   the building well is walking with them. Use phrases like "you'll see",
   "keep going", "just past", "right there".

10. FEWER, LONGER SENTENCES. Write exactly ONE flowing sentence for each numbered
   move (the moves are already merged for you), plus the arrival. A move is never
   split into several short sentences, and you never write a sentence that is only
   a turn ("Turn left.") or only a distance ("Walk 10 metres."). A turn and the walk
   that follows it go together: "Turn right and walk about 10 metres along the
   corridor." Put each sentence on its own line. No bullets, no numbering, no
   headings. If the last move is tiny and the arrival follows it, put them in the
   same sentence.

11. DOOR COUNTING. The DOOR COUNT section below was computed by the program.
   Copy its numbers EXACTLY. Never count doors yourself, never change a number,
   never add a count of your own, and only count doors on the side given. If the
   section says NOT AVAILABLE, give no door numbers at all. The count is said
   while the person is still in the corridor, BEFORE the final turn — never after
   it (after the turn the door is right in front of them). The "<<<" marker is
   for you only; never print it.

12. KEEP IT PLAIN. Do NOT add any of these: warnings about a turn before it
   happens ("keep going until you reach..., then turn" — the door count in rule 11
   is the one exception), an announcement of floor
   changes before the stairs step ("first we'll go up..."), "you'll know it by..."
   hints, "if you reach X you've gone too far" warnings, or step counts instead
   of metres. Mention the stairs only in the move where they happen.

13. DISTANCES. Say every distance exactly as the moves give it: "about 12 metres"
   stays "about 12 metres". Where a move says "a short distance", say "a short
   distance" — never invent a number of metres for it.

14. Descriptions: where the landmark data or the path notes include a
   "description", you may use it to help the person recognise the place or
   path (for example the destination door). Use ONLY what the description
   says — never add details of your own.

═══════════════════════════════════════════════════
  RAW NAVIGATION DATA (about {distance_m:.0f} metres total)
═══════════════════════════════════════════════════

Moves (one sentence each, IN ORDER):
{move_lines}

DOOR COUNT (computed by the program — copy exactly):
{door_count_lines}

Landmarks beside your route (IN ORDER, exact side — name at most two doors in total):
{landmark_lines}

Corridor/path notes (including any descriptions):
{notes_lines}

═══════════════════════════════════════════════════
  YOUR TASK
═══════════════════════════════════════════════════

Rewrite the numbered moves above into natural, spoken-style directions: one
flowing sentence per move, each on its own line. Follow ALL rules above. Do not
add a greeting or sign-off — just give the directions as if you're explaining
mid-conversation."""
    return prompt


def call_groq(prompt, api_key):
    """Call the Groq API and return the response text."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.4,  # lower for more reliable, consistent output
    }
    response = requests.post(GROQ_URL, headers=headers, data=json.dumps(payload), timeout=30)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def _format_location_list(nodes, door_nodes, graph):
    """Group named locations by floor for a nice display."""
    named = named_nodes(nodes)
    by_level = {}
    for nid, d in named.items():
        if nid not in graph:
            continue
        lvl = d["tags"].get("level", "0").split(";")[0]
        name = d["tags"].get("name", "")
        loc = d["tags"].get("loc_name", "")
        if name.startswith("door") and name[4:].isdigit():
            continue
        label = f"{name} ({loc})" if loc else name
        by_level.setdefault(lvl, []).append(label)

    for lvl in sorted(by_level):
        floor = level_label(lvl)
        print(f"\n  📍 {floor.replace('the ', '').title()}:")
        for name in sorted(by_level[lvl]):
            print(f"     • {name}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python ai_navigator.py map.osm")
        sys.exit(1)

    load_env_file()

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("Missing GROQ_API_KEY environment variable.")
        print('Set it, e.g. (PowerShell): $env:GROQ_API_KEY="your_key_here"')
        print('Or create a .env file:    GROQ_API_KEY=your_key_here')
        sys.exit(1)

    osm_path = sys.argv[1]
    print(f"Loading indoor map: {osm_path} ...")
    nodes, ways = parse_osm(osm_path)
    graph, edge_tags, door_nodes, entrance_nodes, corridor_of_door, rooms, stair_ways = build_graph(nodes, ways)

    named = named_nodes(nodes)
    routable_named = {nid: d for nid, d in named.items() if nid in graph}
    print(f"Loaded {len(routable_named)} named locations.\n")

    print("Available locations:")
    _format_location_list(nodes, door_nodes, graph)

    print()
    start_query = input("Start from: ").strip()
    end_query = input("Go to: ").strip()

    start_id = find_named_node(nodes, start_query, graph)
    end_id = find_named_node(nodes, end_query, graph)

    if not start_id or not end_id:
        print("Couldn't match one of those names to a location on the map.")
        return
    if start_id not in graph or end_id not in graph:
        print("One of those locations isn't connected to a corridor yet.")
        return

    path, distance = a_star(graph, nodes, start_id, end_id)
    if not path:
        print("No route found — check the footways connect those two points.")
        return

    steps = generate_turn_by_turn(path, nodes, graph, door_nodes, corridor_of_door)
    door_facts = route_door_facts(path, nodes, graph, door_nodes)
    landmarks = landmarks_along_route(path, nodes, door_nodes, graph, door_facts)
    notes = corridor_notes(path, nodes, corridor_of_door, graph)

    start_name = node_display_name(nodes[start_id]["tags"]) or start_query
    end_name = node_display_name(nodes[end_id]["tags"]) or end_query
    start_level = nodes[start_id]["tags"].get("level", "0").split(";")[0]
    end_level = nodes[end_id]["tags"].get("level", "0").split(";")[0]
    total = total_distance_m(path, nodes)

    prompt = build_prompt(
        start_name, end_name, start_level, end_level, total,
        steps, landmarks, notes, door_facts,
    )

    print(f"\n{'─' * 50}")
    print(f"  Route: {start_name}  →  {end_name}")
    print(f"  Distance: about {total:.0f} metres")
    if start_level != end_level:
        print(f"  Floors: {level_label(start_level)} → {level_label(end_level)}")
    print(f"  {door_count_summary(door_facts)}")
    print(f"{'─' * 50}")

    print("\nAsking the AI to narrate your route...\n")
    try:
        narration = call_groq(prompt, api_key)
    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        print("\nFalling back to step-by-step directions:\n")
        for i, step in enumerate(steps, 1):
            print(f"  {i}. {step['instruction']}")
        return

    print("─── Your route ───\n")
    print(narration)
    print()


if __name__ == "__main__":
    main()