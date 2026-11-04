"""
test_indoor.py

A standalone terminal tester for the indoor navigation engine.
It only needs:
  - final.osm (your indoor map)
  - the three frozen files in this folder:
        campus_graph.py
        ai_navigator.py
        turn_by_turn.py

Nothing else from the project is imported. No database, no FastAPI,
no backend.api.* — this is purely the indoor engine.

Usage
-----
    # Simplest: run it and follow the prompts.
    python backend/core/indoor/test_indoor.py backend/data/final.osm

    # Or set the map path in the environment and skip the argument.
    INDOOR_OSM_PATH=backend/data/final.osm python backend/core/indoor/test_indoor.py

    # Non-interactive (useful for scripts / CI):
    python backend/core/indoor/test_indoor.py backend/data/final.osm \
        --from "Room 106" --to "Library Entrance" --no-ai

    # See the raw door-count analysis (why it trusted or rejected a count).
    python backend/core/indoor/test_indoor.py backend/data/final.osm \
        --from "Room 106" --to "Room 210" --explain-doors
"""

import argparse
import os
import sys
from pathlib import Path

# --- Make the three frozen files importable. -------------------------------
# They import each other as top-level modules (`import campus_graph`), so
# their folder has to be on sys.path.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from campus_graph import (                                 # noqa: E402
    parse_osm,
    build_graph,
    named_nodes,
    find_named_node,
    a_star,
    generate_turn_by_turn,
    total_distance_m,
    level_label,
    node_display_name,
    is_door,
    is_entrance,
)
from ai_navigator import (                                 # noqa: E402
    route_door_facts,
    landmarks_along_route,
    corridor_notes,
    build_prompt,
    call_groq,
    door_count_summary,
    merge_steps_for_narration,
)


# ---------------------------------------------------------------------------
# Graph diagnostics
# ---------------------------------------------------------------------------

def _graph_diagnostics(nodes, graph, door_nodes, entrance_nodes):
    """
    Return a dict describing the health of the loaded graph.
    These are the things that most commonly stop routing from working.
    """
    all_ids = set(nodes.keys())
    on_graph = set(graph.keys())
    routable = all_ids & on_graph

    # Components: how many disconnected islands are there?
    seen = set()
    components = 0
    component_sizes = []
    for start in routable:
        if start in seen:
            continue
        components += 1
        stack = [start]
        size = 0
        while stack:
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n)
            size += 1
            for nb, _d, _info in graph.get(n, ()):
                if nb not in seen:
                    stack.append(nb)
        component_sizes.append(size)
    component_sizes.sort(reverse=True)

    doors_on_graph = door_nodes & on_graph
    doors_off_graph = door_nodes - on_graph
    entrances_on_graph = entrance_nodes & on_graph
    entrances_off_graph = entrance_nodes - on_graph

    return {
        "total_nodes": len(all_ids),
        "on_graph_nodes": len(routable),
        "components": components,
        "component_sizes": component_sizes,
        "door_nodes": len(door_nodes),
        "doors_on_graph": len(doors_on_graph),
        "doors_off_graph": len(doors_off_graph),
        "entrance_nodes": len(entrance_nodes),
        "entrances_on_graph": len(entrances_on_graph),
        "entrances_off_graph": len(entrances_off_graph),
    }


def _print_diagnostics(diag):
    print("── Graph health ─────────────────────────────────────")
    print(f"  nodes in file:          {diag['total_nodes']}")
    print(f"  nodes on graph:         {diag['on_graph_nodes']}")
    print(f"  connected components:   {diag['components']}  "
          f"(sizes: {diag['component_sizes'][:6]}"
          f"{' …' if len(diag['component_sizes']) > 6 else ''})")
    print(f"  doors total:            {diag['door_nodes']}")
    print(f"    on graph:             {diag['doors_on_graph']}")
    print(f"    off graph:            {diag['doors_off_graph']}")
    print(f"  entrances total:        {diag['entrance_nodes']}")
    print(f"    on graph:             {diag['entrances_on_graph']}")
    print(f"    off graph:            {diag['entrances_off_graph']}")

    if diag["components"] > 1:
        print()
        print("  ⚠ The graph has more than one component.")
        print("    Routing only works between nodes in the SAME component.")
        print("    If a route fails, check whether the start and end are")
        print("    in the same connected island (see component_sizes).")
    if diag["doors_off_graph"]:
        print()
        print(f"  ⚠ {diag['doors_off_graph']} door node(s) are not on any")
        print("    walkable way. Students can't route TO them until they")
        print("    are connected to the corridor network.")
    if diag["entrances_off_graph"]:
        print()
        print(f"  ⚠ {diag['entrances_off_graph']} entrance node(s) are")
        print("    not on any walkable way. The outdoor engine can't")
        print("    link through them.")
    print()


# ---------------------------------------------------------------------------
# Location picker
# ---------------------------------------------------------------------------

def _format_locations_by_floor(nodes, graph, door_nodes):
    """Group routable, named nodes by floor for display."""
    named = named_nodes(nodes)
    by_level = {}
    for nid, d in named.items():
        if nid not in graph:
            continue
        tags = d["tags"]
        name = tags.get("name", "")
        # Skip generic door names — they're navigation plumbing, not
        # something a student would type.
        if name.startswith("door") and name[4:].isdigit():
            continue
        lvl = str(tags.get("level", "0")).split(";")[0]
        label = node_display_name(tags) or name or nid
        marker = "  [door]" if nid in door_nodes else ""
        by_level.setdefault(lvl, []).append(f"{label}{marker}")

    return by_level


def _print_locations(by_level):
    if not by_level:
        print("  (no routable named nodes found)")
        return
    for lvl in sorted(by_level):
        print(f"\n  {level_label(lvl).replace('the ', '').title()}:")
        for label in sorted(by_level[lvl]):
            print(f"     • {label}")


def _prompt(prompt_text):
    try:
        return input(prompt_text).strip()
    except EOFError:
        return ""


# ---------------------------------------------------------------------------
# Step printing
# ---------------------------------------------------------------------------

def _print_steps(steps):
    print("── Turn-by-turn ─────────────────────────────────────")
    for i, s in enumerate(steps, 1):
        print(f"  {i:>2}. {s['instruction']}")
    print()


def _print_door_analysis(door_facts, verbose):
    if not door_facts:
        print("  Door analysis: not available (analysis threw).")
        return

    print("── Door count ───────────────────────────────────────")
    print(f"  {door_count_summary(door_facts)}")

    if not verbose:
        print()
        return

    dest = door_facts.get("destination") or {}
    print(f"  reason:     {dest.get('reason') or '—'}")
    print(f"  side:       {dest.get('side') or '—'}")
    print(f"  ordinal:    {dest.get('ordinal') or '—'}")
    print(f"  reliable:   {dest.get('reliable')}")
    if dest.get("passed"):
        print("  passed doors:")
        for d in dest["passed"]:
            label = d.get("name") or "(unnamed)"
            print(f"     • #{d.get('ordinal')}  {label}  (node {d.get('node_id')})")
    for st in door_facts.get("stretches", []) or []:
        print(f"  stretch: level={st.get('level')} "
              f"start_m={st.get('start_m', 0):.1f} "
              f"len={st.get('length_m', 0):.1f} "
              f"doors={len(st.get('doors', []))}")
    print()


def _print_landmarks(landmarks):
    if not landmarks:
        return
    print("── Landmarks beside the route ───────────────────────")
    for lm in landmarks:
        desc = f" — {lm['description']}" if lm.get("description") else ""
        print(f"  • {lm['name']} on your {lm['side']} "
              f"(~{lm['meters_from_start']:.0f} m){desc}")
    print()


def _print_corridor_notes(notes):
    if not notes:
        return
    print("── Corridor / path notes ────────────────────────────")
    for n in notes:
        print(f"  • {n}")
    print()


# ---------------------------------------------------------------------------
# Narration (optional, requires a Groq key)
# ---------------------------------------------------------------------------

def _run_narration(start_name, end_name, start_level, end_level,
                   total_m, steps, landmarks, notes, door_facts, api_key):
    print("── Narration (Groq) ─────────────────────────────────")
    print("  Asking the model to narrate the route…")
    print()

    prompt = build_prompt(
        start_name, end_name, start_level, end_level, total_m,
        steps, landmarks, notes, door_facts,
    )
    try:
        text = call_groq(prompt, api_key)
    except Exception as e:                                # noqa: BLE001
        print(f"  ✗ Groq call failed: {e}")
        print("  Falling back to plain steps:")
        for i, s in enumerate(steps, 1):
            print(f"    {i}. {s['instruction']}")
        print()
        return

    print(text.strip())
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(args):
    osm_path = Path(args.osm)
    if not osm_path.exists():
        print(f"✗ Map not found at {osm_path}", file=sys.stderr)
        return 1

    print(f"Loading {osm_path} …")
    nodes, ways = parse_osm(str(osm_path))
    (graph, _edge_tags, door_nodes, entrance_nodes,
     corridor_of_door, _rooms, _stairs) = build_graph(nodes, ways)

    named = named_nodes(nodes)
    routable_named = {nid: d for nid, d in named.items() if nid in graph}
    print(f"Loaded {len(nodes)} nodes, {len(ways)} ways, "
          f"{len(routable_named)} routable named locations.")
    print()

    diag = _graph_diagnostics(nodes, graph, door_nodes, entrance_nodes)
    _print_diagnostics(diag)

    # --- Pick start and end. ---------------------------------------------
    if args.show_locations:
        print("── Available locations ──────────────────────────────")
        _print_locations(_format_locations_by_floor(nodes, graph, door_nodes))
        print()
        return 0

    start_query = args.start or _prompt("Start from: ")
    if not start_query:
        print("✗ No start given.", file=sys.stderr)
        return 1

    end_query = args.end or _prompt("Go to: ")
    if not end_query:
        print("✗ No destination given.", file=sys.stderr)
        return 1

    start_id = find_named_node(nodes, start_query, graph)
    end_id = find_named_node(nodes, end_query, graph)

    if not start_id:
        print(f"✗ Couldn't match '{start_query}' to a location.", file=sys.stderr)
        print("  Try --show-locations to see what's available.", file=sys.stderr)
        return 1
    if not end_id:
        print(f"✗ Couldn't match '{end_query}' to a location.", file=sys.stderr)
        print("  Try --show-locations to see what's available.", file=sys.stderr)
        return 1
    if start_id == end_id:
        print("✗ Start and end are the same location.", file=sys.stderr)
        return 1

    start_name = node_display_name(nodes[start_id]["tags"]) or start_query
    end_name = node_display_name(nodes[end_id]["tags"]) or end_query
    start_level = str(nodes[start_id]["tags"].get("level", "0")).split(";")[0]
    end_level = str(nodes[end_id]["tags"].get("level", "0")).split(";")[0]

    # --- Route. ----------------------------------------------------------
    path, distance = a_star(graph, nodes, start_id, end_id)
    if not path:
        print()
        print("✗ No route found between those two nodes.", file=sys.stderr)
        print("  Common causes:", file=sys.stderr)
        print("    • They are in different connected components (see graph health).",
              file=sys.stderr)
        print("    • The end node is a door that is not on a corridor way.",
              file=sys.stderr)
        print("    • A corridor is missing the connecting footway.", file=sys.stderr)
        return 1

    total_m = total_distance_m(path, nodes)

    print("── Route ────────────────────────────────────────────")
    print(f"  from:      {start_name}  ({level_label(start_level)})")
    print(f"  to:        {end_name}  ({level_label(end_level)})")
    print(f"  distance:  about {total_m:.0f} metres")
    print(f"  nodes:     {len(path)}")
    if start_level != end_level:
        print(f"  floors:    {level_label(start_level)} → {level_label(end_level)}")
    print()

    # --- Turn-by-turn. ---------------------------------------------------
    steps = generate_turn_by_turn(path, nodes, graph, door_nodes, corridor_of_door)
    _print_steps(steps)

    # --- Door count, landmarks, corridor notes. --------------------------
    door_facts = route_door_facts(path, nodes, graph, door_nodes)
    landmarks = landmarks_along_route(path, nodes, door_nodes, graph, door_facts)
    notes = corridor_notes(path, nodes, corridor_of_door, graph)

    _print_door_analysis(door_facts, verbose=args.explain_doors)
    _print_landmarks(landmarks)
    _print_corridor_notes(notes)

    # --- Optional AI narration. ------------------------------------------
    if not args.no_ai:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            print("── Narration ────────────────────────────────────────")
            print("  No GROQ_API_KEY set; skipping AI narration.")
            print("  To try it, set GROQ_API_KEY (see ai_navigator.py docstring).")
            print("  Set --no-ai to hide this message next time.")
            print()
        else:
            _run_narration(
                start_name, end_name, start_level, end_level, total_m,
                steps, landmarks, notes, door_facts, api_key,
            )

    # --- Concise merged steps (useful for spotting merged "moves"). -----
    if args.show_moves:
        print("── Merged moves (what the AI prompt sees) ───────────")
        for i, m in enumerate(merge_steps_for_narration(steps), 1):
            print(f"  {i:>2}. {m}")
        print()

    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Standalone tester for the indoor navigation engine.",
    )
    parser.add_argument(
        "osm",
        nargs="?",
        default=os.environ.get("INDOOR_OSM_PATH", "backend/data/final.osm"),
        help="Path to the indoor map (default: backend/data/final.osm).",
    )
    parser.add_argument("--from", dest="start", help="Start location name.")
    parser.add_argument("--to", dest="end", help="Destination name.")
    parser.add_argument(
        "--show-locations",
        action="store_true",
        help="Only list the routable named locations and exit.",
    )
    parser.add_argument(
        "--no-ai",
        action="store_true",
        help="Skip the Groq narration step.",
    )
    parser.add_argument(
        "--explain-doors",
        action="store_true",
        help="Print the full door-count analysis (why it trusted/rejected).",
    )
    parser.add_argument(
        "--show-moves",
        action="store_true",
        help="Print the merged moves the AI prompt would receive.",
    )

    args = parser.parse_args()
    sys.exit(run(args))


if __name__ == "__main__":
    main()