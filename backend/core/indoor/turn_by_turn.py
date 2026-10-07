"""
turn_by_turn.py  –  Indoor Navigation (No AI)

Plain A* routing for indoor building navigation.
Type two locations (room names, door names, codes) and get
natural turn-by-turn directions through the building's corridors.

Usage:
    python turn_by_turn.py map.osm
"""

import sys
from campus_graph import (
    parse_osm, build_graph, named_nodes, find_named_node,
    a_star, generate_turn_by_turn, total_distance_m, level_label,
    node_display_name, is_door,
)


def _format_location_list(nodes, door_nodes, graph):
    """Group named locations by floor for a nice display."""
    named = named_nodes(nodes)

    # Group by level
    by_level = {}
    for nid, d in named.items():
        # Only show nodes that are on the network
        if nid not in graph:
            continue
        lvl = d["tags"].get("level", "0").split(";")[0]
        name = d["tags"].get("name", "")
        loc = d["tags"].get("loc_name", "")
        # Skip generic "door1", "door2" names — they're navigation plumbing
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
        print("Usage: python turn_by_turn.py map.osm")
        sys.exit(1)

    osm_path = sys.argv[1]
    print(f"Loading indoor map: {osm_path} ...")
    nodes, ways = parse_osm(osm_path)
    graph, edge_tags, door_nodes, entrance_nodes, corridor_of_door, rooms, stair_ways = build_graph(nodes, ways)

    named = named_nodes(nodes)
    routable_named = {nid: d for nid, d in named.items() if nid in graph}
    print(f"Loaded {len(routable_named)} named locations across {len(set(d['tags'].get('level','0').split(';')[0] for d in routable_named.values()))} floors.\n")

    if not routable_named:
        print("No named nodes found on the footway network.")
        print("Make sure your door/entrance nodes have a 'name' tag and sit on a footway.")
        return

    print("Available locations:")
    _format_location_list(nodes, door_nodes, graph)

    print()
    start_query = input("Start from: ").strip()
    end_query = input("Go to: ").strip()

    start_id = find_named_node(nodes, start_query, graph)
    end_id = find_named_node(nodes, end_query, graph)

    if not start_id:
        print(f"\n❌ Couldn't find a location matching '{start_query}'.")
        return
    if not end_id:
        print(f"\n❌ Couldn't find a location matching '{end_query}'.")
        return
    if start_id not in graph:
        print(f"\n❌ '{node_display_name(nodes[start_id]['tags'])}' isn't connected to any corridor.")
        return
    if end_id not in graph:
        print(f"\n❌ '{node_display_name(nodes[end_id]['tags'])}' isn't connected to any corridor.")
        return

    start_name = node_display_name(nodes[start_id]["tags"]) or start_query
    end_name = node_display_name(nodes[end_id]["tags"]) or end_query

    path, distance = a_star(graph, nodes, start_id, end_id)

    if not path:
        print("\n❌ No route found between those two points.")
        print("   Check that the footways connect them (use JOSM validator).")
        return

    total = total_distance_m(path, nodes)
    start_level = nodes[start_id]["tags"].get("level", "0").split(";")[0]
    end_level = nodes[end_id]["tags"].get("level", "0").split(";")[0]

    print(f"\n{'─' * 50}")
    print(f"  Route: {start_name}  →  {end_name}")
    print(f"  Distance: about {total:.0f} metres")
    if start_level != end_level:
        print(f"  Floors: {level_label(start_level)} → {level_label(end_level)}")
    else:
        print(f"  Floor: {level_label(start_level)}")
    print(f"{'─' * 50}\n")

    steps = generate_turn_by_turn(path, nodes, graph, door_nodes, corridor_of_door)
    for i, step in enumerate(steps, 1):
        print(f"  {i}. {step['instruction']}")

    print()


if __name__ == "__main__":
    main()