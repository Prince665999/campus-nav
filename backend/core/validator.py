"""
validator.py

Checks that AI narration stays grounded in the timeline it was
generated from. The model is told to only mention things that appear
in the timeline, in the order they appear — this file verifies that
it actually did.

Three things are checked:

1. Every place name mentioned in the narration exists in the timeline
   OR is the known start / end of the walk.
2. Every distance mentioned in the narration exists in the timeline.
3. First-mention order of place names in the narration matches the
   order those names appear in the timeline.

If any check fails, the caller retries once, then falls back to the
local (non-AI) narration.

Design notes:
- Place names are matched case-insensitively, and a leading article
  ("the Library" vs "Library") is stripped before comparison.
- Order is determined by where each name FIRST appears in the
  narration text, not by iterating names in timeline order. That
  distinction is the whole point of check 3 — iterating in timeline
  order can never detect an out-of-order mention.
- Distances are matched loosely: every integer in the narration must
  be within `tolerance_m` of some integer in the timeline.
- Start and end place names are passed in as arguments because they
  are the route's endpoints, not events on the timeline.
- Nothing here imports from ai_navigator.py. The validator takes the
  timeline as an argument, which keeps it testable and keeps the
  frozen file frozen.
"""

import re


# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

_LEADING_ARTICLES = ("the ", "a ", "an ")


def _normalise_name(name):
    """Lowercase, strip punctuation, strip a leading article."""
    if not name:
        return ""
    n = name.strip().lower()
    for art in _LEADING_ARTICLES:
        if n.startswith(art):
            n = n[len(art):]
            break
    n = re.sub(r"[^\w\s]", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def _extract_integers(text):
    """Return every integer that appears in the text."""
    return [int(m) for m in re.findall(r"\d+", text)]


# ---------------------------------------------------------------------------
# Extraction from the timeline
# ---------------------------------------------------------------------------

def _timeline_names(events):
    """Every place name the timeline mentions, in order of first
    appearance."""
    names = []
    seen = set()
    for _at_m, kind, detail, _spoken in events:
        if kind not in ("AREA", "DESTINATION"):
            continue
        for candidate in _names_from_detail(detail):
            key = _normalise_name(candidate)
            if key and key not in seen:
                seen.add(key)
                names.append(candidate)
    return names


def _names_from_detail(detail):
    """Pull out the place names embedded in one event's detail text."""
    if not detail:
        return []

    out = []

    both = re.match(
        r"BOTH SIDES AT ONCE:\s*(.+?)\s+on your left and\s+(.+?)\s+on your right",
        detail,
    )
    if both:
        out.append(both.group(1).strip())
        out.append(both.group(2).strip())
        return out

    dest = re.match(r"THIS IS THE DESTINATION \(([^)]+)\)", detail)
    if dest:
        out.append(dest.group(1).strip())
        return out

    m = re.match(r"^([A-Z][^.]*?)\s+(?:starts|sits|is|begins|runs)\b", detail)
    if m:
        out.append(m.group(1).strip())
        return out

    through = re.match(r"you are walking through\s+(.+?)\s+\(", detail)
    if through:
        out.append(through.group(1).strip())
        return out

    return out


def _timeline_distances(events):
    """Every integer that appears in the timeline's detail strings."""
    numbers = set()
    for at_m, _kind, detail, _spoken in events:
        numbers.add(int(round(at_m)))
        for n in _extract_integers(detail):
            numbers.add(n)
    return numbers


# ---------------------------------------------------------------------------
# Extraction from the narration
# ---------------------------------------------------------------------------

_NAME_LIKE = re.compile(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b")


def _first_mention_positions(text, names):
    """
    Return a list of (position, name) for each name's FIRST occurrence
    in the text, sorted by position. Names that don't appear are skipped.

    This is the function that makes out-of-order detection possible.
    The previous version iterated names in timeline order and simply
    checked which were present — that can never detect a reordering.
    """
    text_norm = _normalise_name(text)
    positions = []

    for name in names:
        key = _normalise_name(name)
        if not key:
            continue
        idx = text_norm.find(key)
        if idx == -1:
            continue
        positions.append((idx, name))

    positions.sort(key=lambda p: p[0])
    return positions


def _narration_introduces_unknown_names(text, known_names):
    """Look for capitalised multi-word sequences in the narration that
    do not match any known name and are not common English words at the
    start of a sentence. Returns the list of suspects."""
    known_keys = {_normalise_name(n) for n in known_names}

    suspects = []
    for match in _NAME_LIKE.finditer(text):
        candidate = match.group(1)
        key = _normalise_name(candidate)

        if key in _STOPWORDS:
            continue

        if key in known_keys:
            continue
        # A known name contains the candidate (e.g. candidate "Hostel"
        # vs known "Hostel B") — the candidate is a legitimate prefix.
        if any(k in key for k in known_keys):
            continue
        # The candidate contains a known name (e.g. candidate "Science
        # Block Annexe" vs known "Science Block") — likely the same
        # place with extra words, so allow it.
        if any(key in k for k in known_keys):
            continue

        if match.start() == 0:
            continue

        before = text[: match.start()].rstrip()
        if before.endswith((".", "!", "?")):
            continue
        if before.endswith(("\u2014", " -", ":")):
            continue

        suspects.append(candidate)

    return suspects


_STOPWORDS = {
    "i", "you", "we", "they", "he", "she", "it",
    "the", "a", "an", "and", "or", "but",
    "then", "there", "here", "this", "that", "these", "those",
    "when", "while", "as", "if", "so",
    "okay", "alright", "right", "left", "straight",
    "north", "south", "east", "west",
    "continue", "turn", "bear", "head", "walk", "keep", "go", "arrive",
    "after", "before", "about", "around", "roughly", "just", "now",
    "meters", "metres", "meter", "metre", "steps", "minutes",
    "first", "second", "third", "next", "last",
    "later", "finally", "meanwhile", "once", "where", "which",
    "yet", "for", "nor",
    "you'll", "youre", "well", "your", "yourself",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate(narration_text, events, start_name=None, end_name=None,
             tolerance_m=5):
    """
    Check that `narration_text` is grounded in `events`.

    Returns (ok: bool, reason: str). `reason` is "" when ok is True,
    and a short human-readable explanation otherwise.

    `start_name` and `end_name` are the route endpoints. They are
    always allowed to appear in the narration, even though they are
    not events on the timeline.
    """
    if not narration_text or not narration_text.strip():
        return False, "narration is empty"

    if not events:
        return True, ""

    timeline_names = _timeline_names(events)
    known_names = list(timeline_names)
    known_keys = {_normalise_name(n) for n in known_names}
    for extra in (start_name, end_name):
        if extra and _normalise_name(extra) not in known_keys:
            known_names.append(extra)
            known_keys.add(_normalise_name(extra))

    timeline_nums = _timeline_distances(events)

    # -- Check 1: invented place names -----------------------------------
    suspects = _narration_introduces_unknown_names(narration_text, known_names)
    if suspects:
        joined = ", ".join(suspects[:5])
        return False, "narration mentions names not in the timeline: " + joined

    # -- Check 2: invented distances -------------------------------------
    narration_nums = _extract_integers(narration_text)
    for n in narration_nums:
        if n <= 1:
            continue
        if not any(abs(n - t) <= tolerance_m for t in timeline_nums):
            return False, "narration mentions distance not in timeline: " + str(n)

    # -- Check 3: place-name mention order -------------------------------
    # For each timeline name that appears in the narration, find where
    # it FIRST appears. Sort those positions. The resulting name order
    # is what the narration actually said. It must match the order the
    # names appear in the timeline.
    mentioned = _first_mention_positions(narration_text, timeline_names)
    mentioned_names = [name for _pos, name in mentioned]

    # Filter timeline_names down to just the ones that were mentioned,
    # preserving timeline order. This is the expected order.
    mentioned_keys = {_normalise_name(n) for n in mentioned_names}
    expected_names = [n for n in timeline_names if _normalise_name(n) in mentioned_keys]

    if mentioned_names != expected_names:
        return False, (
            "place names appear out of timeline order: mentioned as "
            + " then ".join(mentioned_names)
            + " but timeline order is "
            + " then ".join(expected_names)
        )

    return True, ""