"""
_common.py

Shared helpers for the admin scripts.

Everything here is about making the scripts work the same way:
same sys.path setup, same colour handling, same session management,
same exit codes.
"""

import os
import sys
from pathlib import Path

# Repo root on sys.path so `backend...` imports resolve. Two levels up
# from admin/scripts/_common.py.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


# ANSI colours for terminal output. On Windows terminals that don't
# support them, the escape sequences are harmless — they just show up
# as literal characters, which is ugly but works. Set NO_COLOR=1 in
# the environment to disable.
_NO_COLOR = os.environ.get("NO_COLOR") in ("1", "true")


def _c(code: str) -> str:
    return "" if _NO_COLOR else code


RESET = _c("\033[0m")
BOLD = _c("\033[1m")
DIM = _c("\033[2m")
RED = _c("\033[31m")
GREEN = _c("\033[32m")
YELLOW = _c("\033[33m")
BLUE = _c("\033[34m")


def heading(text: str) -> None:
    """Print a section heading."""
    print(f"\n{BOLD}{text}{RESET}")


def info(text: str) -> None:
    print(f"  {text}")


def success(text: str) -> None:
    print(f"  {GREEN}{text}{RESET}")


def warn(text: str) -> None:
    print(f"  {YELLOW}{text}{RESET}")


def error(text: str) -> None:
    print(f"  {RED}{text}{RESET}")


def dim(text: str) -> None:
    print(f"  {DIM}{text}{RESET}")


def session():
    """
    Open a database session. Returns a context manager from the
    backend's session_scope, which commits on clean exit and rolls
    back on exception.
    """
    from backend.api.db.session import session_scope

    return session_scope()