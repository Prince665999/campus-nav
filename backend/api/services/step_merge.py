"""
step_merge.py

Narrow post-processing for the outdoor engine's step list.

Problem
-------
generate_turn_by_turn() emits a pure opening step ("Head north from X")
at at_m = 0, and puts the length of the first leg on the *next* step.
So while the walker covers the first leg, the walking screen shows only
the opening line. The leg length only appears once the walker has
already reached the turn, which reads as "one step behind."

Fix
---
Fold the opening line into the first real step and drop the opening:

    "Head north from Library"
    "Continue for about 150 meters, then turn left"
  becomes
    "Head north from Library, continue for about 150 meters, then turn left"

Nothing else in the step list is touched: at_m, kind, distance_m, and
every instruction from index 1 onward are exactly as the engine made
them.

Scope
-----
Only the outdoor engine's step list is affected. Narration calls
generate_turn_by_turn() directly and is not routed through here, so it
is unchanged. The frozen engine is not modified.
"""


_OPENER_PREFIX = "Continue for "


def merge_opening_step(steps):
    """
    Merge steps[0] (the pure opening) into steps[1] (the first real leg),
    and return the list with steps[0] removed.

    steps[0] is the engine's opening heading, e.g. "Head north from Library".
    steps[1] is the first real instruction, e.g. "Continue for about 150
    meters, then turn left".

    The returned first step is a copy of steps[1] with:
      - instruction = "<opening>, continue for <tail of steps[1]>"
      - at_m = 0.0  (the merged step now begins at the walk's start)

    All other fields on the merged step, and every field on every later
    step, are left as the engine produced them.

    Safe to call on a list with fewer than two steps — returns it unchanged.
    """
    if not steps or len(steps) < 2:
        return steps

    opening = steps[0]
    first = steps[1]
    rest = steps[2:]

    opening_text = (opening.get("instruction") or "").strip()
    first_text = (first.get("instruction") or "").strip()

    if not opening_text:
        # Nothing to fold in. Drop the empty opener and return the rest.
        return [first, *rest]

    if first_text.startswith(_OPENER_PREFIX):
        # Normal case: "Continue for about 150 meters, then turn left"
        # becomes "continue for about 150 meters, then turn left"
        # (lowercase the C; keep the rest verbatim).
        tail = first_text[len(_OPENER_PREFIX):]
        merged_text = f"{opening_text}, continue for {tail}"
    else:
        # Defensive: the engine's shape changed, or this step already
        # starts with something other than "Continue for ". Merge with
        # a comma, lowercasing the first letter so it reads as a
        # continuation of the opening.
        lowered = first_text[:1].lower() + first_text[1:] if first_text else ""
        merged_text = f"{opening_text}, {lowered}".rstrip(", ")

    merged = {
        **first,
        "at_m": 0.0,
        "instruction": merged_text,
    }
    return [merged, *rest]