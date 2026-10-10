"""
One-off script to add building_name to places.

Safe to run twice — checks existing columns before altering.

Usage (from the repo root, inside the venv):
    python -m backend.scripts.add_place_building_name
"""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.api.settings import DATABASE_PATH  # noqa: E402


def main():
    conn = sqlite3.connect(str(DATABASE_PATH))

    cols = {row[1] for row in conn.execute("PRAGMA table_info(places)")}

    if "building_name" not in cols:
        conn.execute(
            "ALTER TABLE places ADD COLUMN building_name TEXT"
        )
        print("  added places.building_name")

    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_places_building_name "
        "ON places(building_name)"
    )

    conn.commit()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()