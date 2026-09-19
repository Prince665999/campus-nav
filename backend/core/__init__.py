"""
backend/core/__init__.py

Makes the three frozen files importable regardless of where the
process starts from.

Why this exists
---------------
campus_graph.py, ai_navigator.py, and turn_by_turn.py import each
other as top-level modules (`import campus_graph`, not
`from backend.core import campus_graph`). That worked when they lived
in a folder you `cd`-ed into. Now that the API loads them from the
repo root, Python needs a helping hand to find them.

We can't edit those files — they're frozen — so we register their
folder on sys.path the moment anything under backend.core is
imported. After this runs once, `import campus_graph` from inside
ai_navigator.py resolves correctly.

This is a compatibility shim, not a design choice. It exists only
because the frozen files predate the package layout.
"""

import sys
from pathlib import Path

# The folder holding the three frozen files: backend/core/
_CORE_DIR = Path(__file__).resolve().parent

# Add it to sys.path so `import campus_graph` inside ai_navigator.py
# resolves to backend/core/campus_graph.py.
if str(_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_CORE_DIR))