"""
turn_by_turn.py

Plain A* routing - no AI. Type two named locations from your map,
get the shortest path and turn-by-turn directions.

It also prints an ACCURACY CHECK: the full merged timeline of turns,
junctions, path changes and areas, in the exact order the AI narrator
receives them. If the narration ever feels wrong on the ground, run this
first - the number next to each line is how many meters into the walk
that thing actually happens, so you can see immediately whether the
problem is the map data or the narration.

Usage:
    python turn_by_turn.py map.osm
"""

import sys

from campus_graph import (
    parse_osm, build_graph, named_nodes, named_areas, find_named_node,
    a_star, generate_turn_by_turn, total_distance_m, round_distance,
)

from ai_navigator import (
    area_extents_along_route, dedupe_areas, filter_areas,
    path_notes_along_route, path_branches_along_route,
    remove_branches_at_turns, build_timeline, format_timeline,
    destination_view, local_narration,
)


def main():
    if len(sys.argv) < 2:
        print("Usage: python turn_by_turn.py map.osm")
        sys.exit(1)

    osm_path = sys.argv[1]
    print("Loading " + osm_path + " ...")
    nodes, ways = parse_osm(osm_path)
    graph, _, edge_tags = build_graph(nodes, ways)
    areas = named_areas(nodes, ways)

    names = named_nodes(nodes)
    print("Loaded " + str(len(names)) + " named locations, "
          + str(len(areas)) + " named areas and "
          + str(len(graph)) + " routable junctions.\n")

    if not names:
        print("No named nodes found - make sure your points have a 'name' tag.")
        return

    print("Available named locations:")
    for d in names.values():
        print("   - " + d["tags"]["name"])

    start_query = input("\nStart from: ").strip()
    end_query = input("Go to: ").strip()

    start_id = find_named_node(nodes, start_query)
    end_id = find_named_node(nodes, end_query)

    if not start_id:
        print("Couldn't find a location matching '" + start_query + "'.")
        return
    if not end_id:
        print("Couldn't find a location matching '" + end_query + "'.")
        return
    if start_id == end_id:
        print("That's the same place - you're already there.")
        return
    if start_id not in graph:
        print("'" + nodes[start_id]["tags"]["name"] + "' isn't connected to any footpath yet.")
        return
    if end_id not in graph:
        print("'" + nodes[end_id]["tags"]["name"] + "' isn't connected to any footpath yet.")
        return

    path, distance = a_star(graph, nodes, start_id, end_id)

    if not path:
        print("No route found between those two points - check that the footpaths connect them.")
        return

    start_name = nodes[start_id]["tags"]["name"]
    end_name = nodes[end_id]["tags"]["name"]

    print("\nRoute from " + start_name + " to " + end_name)
    print("Total distance: about " + str(round_distance(distance)) + " meters")
    print("Nodes on the route: " + str(len(path)) + "\n")

    steps = generate_turn_by_turn(path, nodes)

    print("Turn-by-turn:")
    for i, step in enumerate(steps, 1):
        print("  " + str(i) + ". [" + str(round(step["at_m"])) + "m] " + step["instruction"])

    # ----- accuracy check -----
    areas_along_route = dedupe_areas(area_extents_along_route(path, nodes, areas))
    areas_along_route = filter_areas(areas_along_route, distance, start_name, end_name)
    path_notes = path_notes_along_route(path, nodes, edge_tags)
    branches = path_branches_along_route(path, nodes, graph, edge_tags, total_m=distance)
    branches = remove_branches_at_turns(branches, steps)

    events = build_timeline(steps, areas_along_route, path_notes, branches)

    print("\nAccuracy check - the exact ordered timeline the narrator receives:")
    print(format_timeline(events))

    if areas_along_route:
        print("\nArea detail - begins/ends are along-track, so two areas that start")
        print("together MUST show the same 'begins at' value:")
        for a in areas_along_route:
            print("  " + a["name"]
                  + " | begins at " + str(round(a["begins_m"])) + "m"
                  + " | ends at " + str(round(a["ends_m"])) + "m"
                  + " | runs " + str(round(a["length_m"])) + "m"
                  + " | closest " + str(round(a["min_dist_m"], 1)) + "m to the side"
                  + " | approach: " + a["approach"]
                  + " | side: " + a["side"]
                  + (" | route goes through it" if a["inside"] else ""))

    destination_position = destination_view(path, nodes, areas, end_name)

    print("\nSpoken version (no AI, built straight from the timeline):\n")
    print(local_narration(start_name, end_name, distance, events, destination_position))


if __name__ == "__main__":
    main()