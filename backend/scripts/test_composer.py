"""
Quick test for the route composer. Picks one indoor and one outdoor
place and prints the route.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.api.db.session import session_scope
from backend.api.models.place import Place
from backend.api.services import route_composer


def main():
    with session_scope() as session:
        outdoor = session.query(Place).filter_by(kind="outdoor").first()
        indoor = session.query(Place).filter_by(kind="indoor").first()

        if outdoor is None:
            print("No outdoor place found. Run ingest first.")
            return
        if indoor is None:
            print("No indoor place found. Run ingest first.")
            return

        print(f"Outdoor: {outdoor.name} (id={outdoor.id})")
        print(f"Indoor:  {indoor.name} (id={indoor.id}, room={indoor.room_name})")
        print()

        try:
            route = route_composer.compose_route(session, outdoor.id, indoor.id)
        except route_composer.RouteCompositionError as e:
            print(f"Composer error: {e}")
            return

        print(f"Engine:   {route['engine']}")
        print(f"Distance: {route['distance_m']:.0f} m")
        print()
        print("Steps:")
        for i, step in enumerate(route["steps"], 1):
            print(f"  {i}. {step['instruction']}")


if __name__ == "__main__":
    main()