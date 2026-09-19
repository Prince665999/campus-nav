"""
narration.py

Wraps the frozen ai_navigator.py with the two things Phase 2 calls for:

1. Validation of the model's output against the timeline it was given.
   If validation fails, retry once; if it fails again, fall back to the
   deterministic local narration.

2. A mention budget that caps landmark mentions to roughly one per 40m
   of walking before the timeline is handed to the model. Areas that
   compete for the same stretch are resolved in favour of the one the
   walker spends the longest time alongside.

This file imports from ai_navigator.py and never edits it. Everything
that ai_navigator.py already does — building the timeline, calling
Groq, cleaning the output, building the local narration — is reused
unchanged. The only new logic lives here and in validator.py.

Public API:
    narrate(
        start_name,
        end_name,
        distance_m,
        events,
        destination_position,
        api_key=None,
        lang="en",
        mention_budget_m=40,
    ) -> str
"""

import os
import re

from validator import validate

from ai_navigator import (
    build_prompt,
    call_groq,
    clean_output,
    local_narration,
    EVENT_PRIORITY,
)


# ---------------------------------------------------------------------------
# Mention budget
# ---------------------------------------------------------------------------

DEFAULT_MENTION_BUDGET_M = 40


def apply_mention_budget(events, budget_m=DEFAULT_MENTION_BUDGET_M):
    """
    Given a timeline (as returned by build_timeline), drop AREA events so
    that no two area mentions fall within `budget_m` of each other.

    Rules:
      - DESTINATION events are never dropped.
      - TURN, PATH, and JUNCTION events are never dropped.
      - Paired areas ("BOTH SIDES AT ONCE") count as a single event.
      - When two AREA events compete within the budget, keep the one
        with the longer stretch beside the walker.
    """
    if not events:
        return list(events)

    must_keep = []
    areas = []
    for ev in events:
        _at_m, kind, _detail, _spoken = ev
        if kind == "AREA":
            areas.append(ev)
        else:
            must_keep.append(ev)

    if not areas:
        return list(events)

    areas = sorted(areas, key=lambda e: e[0])

    kept_areas = []
    for area in areas:
        if not kept_areas:
            kept_areas.append(area)
            continue

        last_at = kept_areas[-1][0]
        if area[0] - last_at >= budget_m:
            kept_areas.append(area)
            continue

        prev_len = _area_length_from_detail(kept_areas[-1][2])
        this_len = _area_length_from_detail(area[2])
        if this_len > prev_len:
            kept_areas[-1] = area

    combined = must_keep + kept_areas
    combined.sort(key=lambda e: (round(e[0]), EVENT_PRIORITY.get(e[1], 9)))
    return combined


def _area_length_from_detail(detail):
    """Extract the "alongside you" length in metres from an AREA event's
    detail string. Falls back to 0 when the format is unfamiliar."""
    m = re.search(r"about\s+(\d+)\s+meters", detail)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s+meters", detail)
    if m:
        return int(m.group(1))
    return 0


# ---------------------------------------------------------------------------
# Narration with retry + fallback
# ---------------------------------------------------------------------------

def narrate(
    start_name,
    end_name,
    distance_m,
    events,
    destination_position,
    api_key=None,
    lang="en",
    mention_budget_m=DEFAULT_MENTION_BUDGET_M,
):
    """
    Produce spoken narration for a walk.

    If `api_key` is provided (or GROQ_API_KEY is set in the environment):
      1. Apply the mention budget to the timeline.
      2. Build the prompt.
      3. Call Groq.
      4. Validate the response against the budgeted timeline, with
         start_name and end_name passed in as known names.
      5. On validation failure, retry once.
      6. On second failure, fall back to local narration.

    If no api_key is available, apply the mention budget and return the
    local narration. Never raises for API or validation failures.
    """
    budgeted = apply_mention_budget(events, budget_m=mention_budget_m)

    key = api_key or os.environ.get("GROQ_API_KEY")

    if not key:
        return local_narration(
            start_name, end_name, distance_m, budgeted, destination_position
        )

    prompt = build_prompt(
        start_name, end_name, distance_m, budgeted, destination_position
    )

    try:
        text = clean_output(call_groq(prompt, key))
    except Exception:
        return local_narration(
            start_name, end_name, distance_m, budgeted, destination_position
        )

    ok, _reason = validate(text, budgeted, start_name, end_name)
    if ok:
        return text

    try:
        text = clean_output(call_groq(prompt, key))
    except Exception:
        return local_narration(
            start_name, end_name, distance_m, budgeted, destination_position
        )

    ok, _reason = validate(text, budgeted, start_name, end_name)
    if ok:
        return text

    return local_narration(
        start_name, end_name, distance_m, budgeted, destination_position
    )