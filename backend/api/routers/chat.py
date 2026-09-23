"""
chat.py

Chat endpoints:

  POST /api/chat/extract-destination
  POST /api/chat/session
  DELETE /api/chat/session/{id}
  POST /api/chat
"""

import logging
import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from .. import cache
from ..dependencies import db_session
from ..rate_limit import limiter
from ..schemas.chat import (
    ChatRequest,
    ChatResponse,
    ExtractDestinationRequest,
    ExtractDestinationResponse,
    StartChatSessionResponse,
)
from ..services import cache_service, chat_service
from ..settings import RATE_LIMIT_CHAT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

MAX_HISTORY_TURNS = 10
SESSION_TTL_S = 60 * 60
NEARBY_RADIUS_M = 200
NEARBY_LIMIT = 15


def _history_key(session_id: str) -> str:
    return f"chat:{session_id}"


def _load_history(session_id: str) -> list:
    if not session_id:
        return []
    raw = cache.get(_history_key(session_id))
    if not raw or not isinstance(raw, list):
        return []
    return raw


def _save_history(session_id: str, history: list):
    if not session_id:
        return
    cache.set(
        _history_key(session_id),
        history[-MAX_HISTORY_TURNS * 2 :],
        ttl_s=SESSION_TTL_S,
    )


# ---------------------------------------------------------------------------
# Destination extraction
# ---------------------------------------------------------------------------

@router.post("/extract-destination", response_model=ExtractDestinationResponse)
@limiter.limit(RATE_LIMIT_CHAT)
def extract_destination(
    request: Request,
    body: ExtractDestinationRequest,
    session: Session = Depends(db_session),
):
    """Turn free text into a place ID."""
    place_id, confidence = chat_service.extract_destination(session, body.message)
    return ExtractDestinationResponse(
        place_id=place_id,
        confidence=confidence or "low",
        matched=place_id is not None,
    )


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------

@router.post("/session", response_model=StartChatSessionResponse)
@limiter.limit(RATE_LIMIT_CHAT)
def start_session(request: Request):
    """Start a new chat session."""
    return StartChatSessionResponse(session_id=str(uuid.uuid4()))


@router.delete("/session/{session_id}", status_code=204)
def end_session(session_id: str):
    """End a chat session and discard its memory."""
    cache.delete(_history_key(session_id))
    return None


# ---------------------------------------------------------------------------
# In-walk chat
# ---------------------------------------------------------------------------

@router.post("", response_model=ChatResponse)
@limiter.limit(RATE_LIMIT_CHAT)
def chat(
    request: Request,
    body: ChatRequest,
    session: Session = Depends(db_session),
):
    """Answer a question about the current walk."""
    session_id = body.session_id
    history = _load_history(session_id) if session_id else []

    reply = _build_answer(body, session)

    if session_id:
        history.append({"role": "user", "content": body.message})
        history.append({"role": "assistant", "content": reply})
        _save_history(session_id, history)

    return ChatResponse(reply=reply, session_id=session_id)


def _build_answer(body: ChatRequest, session: Session) -> str:
    """Gather the three context sources and call the chat service."""
    has_route_context = (
        body.from_place_id is not None
        and body.to_place_id is not None
        and body.current_step_index is not None
        and body.distance_from_start_m is not None
    )

    if not has_route_context:
        return (
            "I can help once you're on a route. Start a walk and ask "
            "me about what you see."
        )

    try:
        from backend.core.campus_graph import a_star

        from ..services.graph_service import get_edge_tags, get_graph, get_nodes
        from ..services.narration_service import _build_events
        from ..services.routing_service import _resolve_endpoint

        graph = get_graph()
        nodes = get_nodes()
        edge_tags = get_edge_tags()

        from_node, from_name = _resolve_endpoint(
            session, graph, nodes, place_id=body.from_place_id
        )
        to_node, to_name = _resolve_endpoint(
            session, graph, nodes, place_id=body.to_place_id
        )
        if from_node is None or to_node is None:
            return "I can't find that route anymore."

        path, distance = a_star(graph, nodes, from_node, to_node)
        if not path:
            return "That route isn't available right now."

        _steps, events, _dest_pos = _build_events(
            path, nodes, edge_tags, graph, distance, from_name, to_name
        )
    except Exception as e:
        logger.warning("Chat timeline rebuild failed: %s", e)
        return "I couldn't reach the route right now. Try again in a moment."

    narration_text = _load_cached_narration(session, body)
    nearby = _load_nearby_places(session, body.current_lat, body.current_lon)

    return chat_service.answer_walk_question(
        question=body.message,
        start_name=from_name,
        end_name=to_name,
        distance_m=distance,
        events=events,
        current_step_index=body.current_step_index,
        distance_from_start_m=body.distance_from_start_m,
        narration_text=narration_text,
        nearby_places=nearby,
    )


def _load_cached_narration(session: Session, body: ChatRequest) -> str | None:
    try:
        from backend.core.campus_graph import a_star

        from ..services.graph_service import get_edge_tags, get_graph, get_nodes
        from ..services.narration_service import _build_events
        from ..services.routing_service import _resolve_endpoint

        graph = get_graph()
        nodes = get_nodes()
        edge_tags = get_edge_tags()

        from_node, from_name = _resolve_endpoint(
            session, graph, nodes, place_id=body.from_place_id
        )
        to_node, to_name = _resolve_endpoint(
            session, graph, nodes, place_id=body.to_place_id
        )
        if from_node is None or to_node is None:
            return None

        path, distance = a_star(graph, nodes, from_node, to_node)
        if not path:
            return None

        _steps, events, _dest_pos = _build_events(
            path, nodes, edge_tags, graph, distance, from_name, to_name
        )

        timeline_repr = "\n".join(
            f"{round(e[0])}|{e[1]}|{e[2]}" for e in events
        )
        r_hash = cache_service.route_hash(timeline_repr)

        for lang in ("en", "sw"):
            cached = cache_service.get_cached_narration(r_hash, lang=lang)
            if cached:
                return cached
        return None
    except Exception as e:
        logger.warning("Narration cache lookup failed: %s", e)
        return None


def _load_nearby_places(
    session: Session,
    lat: float | None,
    lon: float | None,
) -> list | None:
    if lat is None or lon is None:
        return None

    try:
        from backend.core.campus_graph import haversine_m

        from ..models.place import Place

        rows = session.query(Place).all()
        nearby = []
        for p in rows:
            d = havetersine_m(lat, lon, p.lat, p.lon)
            if d <= NEARBY_RADIUS_M:
                nearby.append(
                    {
                        "name": p.name,
                        "distance_m": d,
                        "category": p.category,
                    }
                )

        nearby.sort(key=lambda x: x["distance_m"])
        return nearby[:NEARBY_LIMIT] or None
    except Exception as e:
        logger.warning("Nearby places lookup failed: %s", e)
        return None