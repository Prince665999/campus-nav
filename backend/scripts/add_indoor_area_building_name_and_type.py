"""
One-off script to add building_name and type columns to indoor_areas.

Safe to run twice — checks existing columns before altering.

Usage (from the backend/ folder, inside the venv):
    python -m backend.scripts.add_indoor_area_building_name_and_type
"""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.api.settings import DATABASE_PATH  # noqa: E402


def main():
    conn = sqlite3.connect(str(DATABASE_PATH))

    cols = {row[1] for row in conn.execute("PRAGMA table_info(indoor_areas)")}

    if "building_name" not in cols:
        conn.execute(
            "ALTER TABLE indoor_areas ADD COLUMN building_name TEXT"
        )
        print("  added indoor_areas.building_name")

    if "type" not in cols:
        conn.execute(
            "ALTER TABLE indoor_areas "
            "ADD COLUMN type TEXT NOT NULL DEFAULT 'room'"
        )
        print("  added indoor_areas.type")

    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_indoor_areas_building_name "
        "ON indoor_areas(building_name)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS ix_indoor_areas_type "
        "ON indoor_areas(type)"
    )

    conn.commit()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()