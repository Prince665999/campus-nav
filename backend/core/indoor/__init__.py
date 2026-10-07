"""
backend/core/indoor/__init__.py

Makes the three frozen indoor files importable the same way the
outdoor ones are.

The indoor frozen files import each other as top-level modules
(`import campus_graph`), exactly like the outdoor trio does. For
that to work, Python needs their folder on sys.path. That's what
this file does — same pattern as the outdoor `backend/core/__init__.py`.

Why a separate folder: the indoor files have the same names as the
outdoor ones (`campus_graph.py`, `ai_navigator.py`, `turn_by_turn.py`),
so they can't live side by side in `backend/core/`. This folder gives
them their own namespace and their own sys.path entry.
"""

import sys
from pathlib import Path

# The folder holding the three indoor frozen files: backend/core/indoor/
_INDOOR_DIR = Path(__file__).resolve().parent

# Add it to sys.path so `import campus_graph` inside the indoor
# ai_navigator.py resolves to backend/core/indoor/campus_graph.py,
# NOT to the outdoor backend/core/campus_graph.py.
if str(_INDOOR_DIR) not in sys.path:
    sys.path.insert(0, str(_INDOOR_DIR))