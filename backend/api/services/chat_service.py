"""
chat_service.py

The route chat service. Answers questions about the walk the student
is currently on, using the route timeline, the narration they heard,
and the places near their current position.

This service does not touch the knowledge base. University questions
belong to chat_doc_service.py, and the two are deliberately separate
so neither can accidentally answer from the other's source.
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

    if place_id is not None:
        exists = session.query(Place).filter_by(id=place_id).one_or_none()
        if exists is None:
            return None, None

    return place_id, confidence


def _extract_destination_locally(session: Session, message: str):
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
    """Turn free text into a place ID. Returns (place_id, confidence)."""
    if not message or not message.strip():
        return None, None

    place_id, confidence = _extract_destination_via_llm(session, message)
    if place_id is not None:
        return place_id, confidence

    return _extract_destination_locally(session, message)


# ---------------------------------------------------------------------------
# Route question answering
# ---------------------------------------------------------------------------

_ROUTE_SYSTEM_PROMPT = """You are a walking companion on a campus. The student is walking right now and asking about the walk.

You will be given:
- The route timeline — every turn, path, junction, area, and the destination, with distances.
- The narration the student already heard — the guide's own words.
- Places near the student's current position.

Answer only from those three sources. Never invent a building, a landmark, a distance, or a fact about the university that isn't in the sources.

If the answer isn't in the sources, say so plainly. "I don't know that one" is a fine answer.

Keep it short — one or two sentences. The student is walking.

Be warm and conversational. Plain prose only. No markdown.
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
            bits = [f"{item['name']} ({round(item['distance_m'])}m)"]
            if item.get("category"):
                bits.append(f"[{item['category']}]")
            lines.append("  " + " ".join(bits))

    return "\n".join(lines)


def _answer_locally(events: list, current_step_index: int, question: str):
    """Fallback for when there's no LLM."""
    q = question.lower()

    if current_step_index < 0 or current_step_index >= len(events):
        return "I'm not sure where you are on the route right now."

    current = events[current_step_index]

    if any(
        phrase in q
        for phrase in ["what's next", "whats next", "what now", "next step"]
    ):
        next_index = current_step_index + 1
        if next_index < len(events):
            return f"Next: {events[next_index][2]}"
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


def answer_route_question(question: str, route_context: dict) -> str:
    """
    Answer a question about the current walk.

    route_context must have:
        start_name, end_name, distance_m, events,
        current_step_index, distance_from_start_m,
        and optionally narration_text, nearby_places
    """
    if not question or not question.strip():
        return "Ask me anything about the walk."

    if llm_client.is_available():
        context = _format_route_context(
            start_name=route_context["start_name"],
            end_name=route_context["end_name"],
            distance_m=route_context["distance_m"],
            events=route_context["events"],
            current_step_index=route_context["current_step_index"],
            distance_from_start_m=route_context["distance_from_start_m"],
            narration_text=route_context.get("narration_text"),
            nearby_places=route_context.get("nearby_places"),
        )
        response = llm_client.chat(
            [
                {"role": "system", "content": _ROUTE_SYSTEM_PROMPT},
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

    return _answer_locally(
        route_context["events"],
        route_context["current_step_index"],
        question,
    )