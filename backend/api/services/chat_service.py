"""
chat_service.py

The two chat features:

1. Destination extraction — turning "take me to the cafeteria near
   the library" into a real place ID.

2. In-walk questions — answering "what's that building on my left?"
   grounded in three sources: the route timeline, the narration the
   student already heard, and the places within walking distance of
   their current position.

Both prefer the LLM when available and fall back to local logic when
it isn't.
"""

import json
import logging
import re

from sqlalchemy.orm import Session

from backend.api.models.place import Place

from . import llm_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Destination extraction
# ---------------------------------------------------------------------------

_EXTRACT_SYSTEM_PROMPT = """You are a destination resolver for a campus navigation app.

The user will type a sentence describing where they want to go. Your job is to identify which place from the campus list they mean.

You must respond with JSON only, in this exact shape:
{
  "place_id": <integer or null>,
  "confidence": "high" | "medium" | "low",
  "reason": "<short explanation>"
}

Rules:
- Only return a place_id from the list you are given.
- If nothing in the list reasonably matches, return null.
- Do not invent place names or IDs.
- Never return free text outside the JSON.
"""


def _build_place_list_for_prompt(session: Session, limit: int = 200) -> str:
    """
    Format the place list for the LLM prompt. Includes ids, names, and
    categories, one per line.
    """
    places = session.query(Place).limit(limit).all()
    lines = []
    for p in places:
        bits = [f"id={p.id}", f"name={p.name!r}"]
        if p.name_sw:
            bits.append(f"sw={p.name_sw!r}")
        if p.category:
            bits.append(f"category={p.category!r}")
        lines.append("  " + " ".join(bits))
    return "\n".join(lines)


def _extract_destination_via_llm(session: Session, message: str):
    """
    Ask the LLM to pick a place. Returns (place_id, confidence) or
    (None, None) if unavailable or no match.
    """
    if not llm_client.is_available():
        return None, None

    place_list = _build_place_list_for_prompt(session)
    user_content = (
        f"Campus places:\n{place_list}\n\n"
        f"User said: {message!r}\n\n"
        f"Which place do they mean?"
    )

    response = llm_client.chat(
        [
            {"role": "system", "content": _EXTRACT_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        temperature=0.1,
        max_tokens=200,
    )
    if response is None:
        return None, None

    # The model was told to return JSON only. Strip any stray fences
    # in case it added them anyway.
    cleaned = response.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("LLM returned non-JSON for destination: %r", response[:200])
        return None, None

    place_id = parsed.get("place_id")
    confidence = parsed.get("confidence", "medium")

    # Validate the id exists.
    if place_id is not None:
        exists = session.query(Place).filter_by(id=place_id).one_or_none()
        if exists is None:
            return None, None

    return place_id, confidence


def _extract_destination_locally(session: Session, message: str):
    """
    Fallback destination extraction with no LLM. Splits the message
    into words, keeps the meaningful ones, and does a substring match
    against place names, alt_names, and name_sw.
    """
    stop_words = {
        "take", "me", "to", "the", "a", "an", "go", "get", "find",
        "where", "is", "at", "in", "on", "near", "by", "next", "please",
        "i", "want", "would", "like", "how", "do", "can", "you", "show",
        "directions", "route", "walk", "walking", "navigate", "navigating",
    }

    words = [
        w.strip(".,!?;:").lower()
        for w in message.split()
        if len(w.strip(".,!?;:")) >= 3
    ]
    meaningful = [w for w in words if w not in stop_words]
    if not meaningful:
        return None, None

    best = None
    best_score = 0
    for place in session.query(Place).limit(500).all():
        haystack = " ".join(
            filter(None, [place.name, place.name_sw, place.alt_names])
        ).lower()
        score = sum(len(w) for w in meaningful if w in haystack)
        if score > best_score:
            best_score = score
            best = place

    if best is None or best_score < 4:
        return None, None

    return best.id, "low"


def extract_destination(session: Session, message: str):
    """
    Turn a free-text destination into a place ID.

    Prefers the LLM. Falls back to local fuzzy matching. Returns
    (place_id, confidence) where place_id may be None.
    """
    if not message or not message.strip():
        return None, None

    place_id, confidence = _extract_destination_via_llm(session, message)
    if place_id is not None:
        return place_id, confidence

    return _extract_destination_locally(session, message)


# ---------------------------------------------------------------------------
# In-walk questions
# ---------------------------------------------------------------------------

_WALK_SYSTEM_PROMPT = """You are a walking companion helping a student navigate a campus.

You will be given three things:

1. The route timeline — every turn, path, junction, area, and the destination, each with a distance marker, in order.

2. The narration the student already heard — the guide's own words describing this walk. This is what the student remembers hearing.

3. Places near the student's current position — a list of named places within walking distance, with their distance and category.

You may use all three when answering. The three sources describe the same campus from different angles:
- The timeline is exact and ordered.
- The narration is conversational and phrased the way a guide speaks.
- The nearby places list covers the surroundings beyond the route.

Rules:
- Answer only using the facts in those three sources. Never invent a building, a landmark, a distance, or a place that isn't in them.
- If the answer isn't in the context, say so plainly. "I don't know that one" is a fine answer.
- If the student asks about a place that's in the nearby list, use the distance from that list.
- If they ask about something they just passed, check the timeline — earlier entries are behind them.
- Keep it short — one or two sentences. The student is walking.
- Be warm and conversational.
"""


def _format_route_context(
    start_name: str,
    end_name: str,
    distance_m: float,
    events: list,
    current_step_index: int,
    distance_from_start_m: float,
    narration_text: str | None = None,
    nearby_places: list | None = None,
) -> str:
    """
    Format everything the chat model needs to answer a question about
    the current walk.

    Three blocks:
      1. Route timeline — what's on this route.
      2. Narration — the guide's own words.
      3. Nearby places — what's around the student right now.
    """
    lines = [
        f"Route: {start_name} → {end_name}",
        f"Total distance: {round(distance_m)}m",
        f"Student has walked: {round(distance_from_start_m)}m",
        f"Student is on step {current_step_index + 1}.",
        "",
        "ROUTE TIMELINE:",
    ]

    for i, ev in enumerate(events):
        at_m, kind, detail, _spoken = ev
        marker = "  ← student is here now" if i == current_step_index else ""
        lines.append(f"  [{round(at_m)}m] {kind}: {detail}{marker}")

    if narration_text:
        lines.append("")
        lines.append("WHAT THE GUIDE TOLD THE STUDENT:")
        lines.append("  " + narration_text.strip())

    if nearby_places:
        lines.append("")
        lines.append("PLACES NEAR THE STUDENT RIGHT NOW:")
        for item in nearby_places:
            # item is {name, distance_m, category}
            bits = [f"{item['name']} ({round(item['distance_m'])}m)"]
            if item.get("category"):
                bits.append(f"[{item['category']}]")
            lines.append("  " + " ".join(bits))

    return "\n".join(lines)


def _answer_locally(events: list, current_step_index: int, question: str):
    """
    Fallback for when the LLM isn't available. Can only answer a
    narrow set of things from the timeline.
    """
    q = question.lower()

    if current_step_index < 0 or current_step_index >= len(events):
        return "I'm not sure where you are on the route right now."

    current = events[current_step_index]

    if any(phrase in q for phrase in ["what's next", "whats next", "what now", "next step"]):
        next_index = current_step_index + 1
        if next_index < len(events):
            next_event = events[next_index]
            return f"Next: {next_event[2]}"
        return "You're on the last step — keep going and you'll arrive."

    if any(phrase in q for phrase in ["where am i", "current step"]):
        return f"You're on: {current[2]}"

    if "how far" in q or "distance" in q:
        if current_step_index + 1 < len(events):
            remaining = events[current_step_index + 1][0] - current[0]
            return f"About {round(remaining)} metres to the next step."
        return "You're almost there."

    return (
        "I can't answer that without a connection to the AI service. "
        "Try asking 'what's next' for the next instruction."
    )


def answer_walk_question(
    question: str,
    start_name: str,
    end_name: str,
    distance_m: float,
    events: list,
    current_step_index: int,
    distance_from_start_m: float,
    narration_text: str | None = None,
    nearby_places: list | None = None,
) -> str:
    """
    Answer a question about the current walk.

    Prefers the LLM, falls back to a small local responder. Always
    returns a string — never raises.
    """
    if not question or not question.strip():
        return "Ask me anything about this walk."

    if llm_client.is_available():
        context = _format_route_context(
            start_name,
            end_name,
            distance_m,
            events,
            current_step_index,
            distance_from_start_m,
            narration_text=narration_text,
            nearby_places=nearby_places,
        )
        response = llm_client.chat(
            [
                {"role": "system", "content": _WALK_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"{context}\n\nStudent asked: {question}",
                },
            ],
            temperature=0.5,
            max_tokens=300,
        )
        if response:
            return response.strip()

    return _answer_locally(events, current_step_index, question)