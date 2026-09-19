"""
routing_profiles.py

Cost functions applied to graph edges before A* runs.

Only one profile exists right now: "fastest", whose cost function
returns 1.0 for every edge. That makes the costed graph identical to
the raw graph, so routing is pure shortest-distance.

The hook exists for the day the campus map carries tags that would
justify cost adjustments — `lit` for night routing, `covered` for
rain, `wheelchair` for step-free. None of those tags are surveyed
yet, so none of those profiles are built. When they are, add them
to PROFILES below and set ACTIVE_PROFILE in routing_service.py to
whichever one should be used.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    """A named cost function."""

    name: str
    description: str
    cost: callable


def _cost_identity(tags):
    """No adjustment. Every edge costs its length."""
    return 1.0


PROFILES = {
    "fastest": Profile(
        name="fastest",
        description="Shortest walking distance.",
        cost=_cost_identity,
    ),
}


def get_profile(name):
    """Look up a profile by name, defaulting to 'fastest'."""
    return PROFILES.get(name, PROFILES["fastest"])