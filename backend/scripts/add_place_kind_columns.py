import sqlite3
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.api.settings import DATABASE_PATH

conn = sqlite3.connect(str(DATABASE_PATH))
cols = {r[1] for r in conn.execute("PRAGMA table_info(places)").fetchall()}

if "kind" not in cols:
    conn.execute("ALTER TABLE places ADD COLUMN kind TEXT NOT NULL DEFAULT 'outdoor'")
if "level" not in cols:
    conn.execute("ALTER TABLE places ADD COLUMN level TEXT")
if "room_name" not in cols:
    conn.execute("ALTER TABLE places ADD COLUMN room_name TEXT")
conn.execute("CREATE INDEX IF NOT EXISTS ix_places_kind ON places(kind)")
conn.commit()
print("Done.")