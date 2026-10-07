"""
One-off script to add indoor_areas and indoor_path_edges tables.
Safe to run twice.
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.api.settings import DATABASE_PATH

conn = sqlite3.connect(str(DATABASE_PATH))

conn.executescript("""
CREATE TABLE IF NOT EXISTS indoor_areas (
    id INTEGER PRIMARY KEY,
    osm_type TEXT NOT NULL,
    osm_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    ref TEXT,
    level TEXT,
    geometry_wkt TEXT NOT NULL,
    door_node_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_indoor_areas_name_lower ON indoor_areas(lower(name));
CREATE INDEX IF NOT EXISTS ix_indoor_areas_level ON indoor_areas(level);
CREATE INDEX IF NOT EXISTS ix_indoor_areas_osm_id ON indoor_areas(osm_id);
CREATE INDEX IF NOT EXISTS ix_indoor_areas_door_node_id ON indoor_areas(door_node_id);

CREATE TABLE IF NOT EXISTS indoor_path_edges (
    id INTEGER PRIMARY KEY,
    node_a_osm TEXT NOT NULL,
    node_b_osm TEXT NOT NULL,
    length_m REAL NOT NULL,
    highway TEXT,
    level TEXT,
    kind TEXT NOT NULL DEFAULT 'walk',
    corridor INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_indoor_path_edges_node_a_osm ON indoor_path_edges(node_a_osm);
CREATE INDEX IF NOT EXISTS ix_indoor_path_edges_node_b_osm ON indoor_path_edges(node_b_osm);
CREATE INDEX IF NOT EXISTS ix_indoor_path_edges_level ON indoor_path_edges(level);
CREATE INDEX IF NOT EXISTS ix_indoor_path_edges_kind ON indoor_path_edges(kind);
CREATE UNIQUE INDEX IF NOT EXISTS ix_indoor_path_edges_pair ON indoor_path_edges(node_a_osm, node_b_osm);
""")

conn.commit()
conn.close()
print("Done.")