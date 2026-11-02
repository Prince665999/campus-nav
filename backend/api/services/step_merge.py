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


def anchor_steps_to_leg_start(steps):
    """
    Make every step's `at_m` the distance where its LEG BEGINS.

    The engine writes "Continue for 80 meters, then turn right" on the
    step whose at_m is the turn node: the END of that 80 m leg. The
    walking screen switches to a step when the walker reaches its at_m,
    so each instruction only appeared after the walker had already
    walked the leg it describes. `merge_opening_step` fixed this for
    the first step only; every later step stayed one leg behind
    (instruction N shown during leg N+1).

    This function applies the fix to all of them:

        engine:  [start@0, t1@T1, t2@T2, ..., arrive@total]
        result:  [(start+t1)@0, t2@T1, t3@T2, ..., arrive@Tlast]

    Step k now begins at the turn that ends the previous leg, so it is
    shown as soon as the walker makes that turn. `distance_m`, `kind`
    and every instruction are unchanged.

    The last step ("...and you'll arrive") begins at the final turn.
    Its distance-to-go must therefore be measured to the route's total
    length, not to its own at_m; the app does this.
    """
    if not steps or len(steps) < 2:
        return steps

    merged = merge_opening_step(steps)

    # merged[0] came from steps[0] + steps[1] and stays at 0.0.
    # merged[k] for k >= 1 is the engine's steps[k + 1], whose leg
    # starts at the previous engine step's at_m, i.e. steps[k].
    out = [merged[0]]
    for k in range(1, len(merged)):
        out.append({**merged[k], "at_m": steps[k]["at_m"]})
    return out