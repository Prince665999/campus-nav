"""
chat_doc.py

Document chat endpoints:

  POST /api/chat/doc/session
  DELETE /api/chat/doc/session/{id}
  POST /api/chat/doc
  GET  /api/chat/doc/search?q=

The document chat answers university questions using the knowledge
base. It has no route context. Walk questions belong to /api/chat.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from .. import cache
from ..dependencies import db_session
from ..rate_limit import limiter
from ..schemas.chat import StartChatSessionResponse
from ..schemas.chat_doc import (
    DocChatRequest,
    DocChatResponse,
    DocSearchResult,
)
from ..services import chat_doc_service, knowledge_service
from ..settings import RATE_LIMIT_CHAT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat/doc", tags=["chat:doc"])

MAX_HISTORY_TURNS = 10
SESSION_TTL_S = 60 * 60


def _history_key(session_id: str) -> str:
    return f"chat:doc:{session_id}"


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
# Session lifecycle
# ---------------------------------------------------------------------------

@router.post("/session", response_model=StartChatSessionResponse)
@limiter.limit(RATE_LIMIT_CHAT)
def start_session(request: Request):
    return StartChatSessionResponse(session_id=str(uuid.uuid4()))


@router.delete("/session/{session_id}", status_code=204)
def end_session(session_id: str):
    cache.delete(_history_key(session_id))
    return None


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@router.post("", response_model=DocChatResponse)
@limiter.limit(RATE_LIMIT_CHAT)
def chat(
    request: Request,
    body: DocChatRequest,
    session: Session = Depends(db_session),
):
    """
    Answer a question about the university using the knowledge base.
    """
    session_id = body.session_id
    history = _load_history(session_id) if session_id else []

    reply, used_knowledge = chat_doc_service.answer_doc_question(body.message)

    if session_id:
        history.append({"role": "user", "content": body.message})
        history.append({"role": "assistant", "content": reply})
        _save_history(session_id, history)

    return DocChatResponse(
        reply=reply,
        session_id=session_id,
        used_knowledge=used_knowledge,
    )


# ---------------------------------------------------------------------------
# Direct search (for debugging and the admin site)
# ---------------------------------------------------------------------------

@router.get("/search", response_model=list[DocSearchResult])
@limiter.limit(RATE_LIMIT_CHAT)
def search(
    request: Request,
    q: str = Query(..., min_length=1),
    top_k: int = Query(5, gt=0, le=20),
):
    """
    Test retrieval directly. Returns the chunks the chat would use.
    Useful for the admin site's knowledge base page.
    """
    results = knowledge_service.retrieve(q, top_k=top_k)
    return [
        DocSearchResult(
            text=r["text"],
            source_file=r["metadata"].get("source_file", ""),
            page_number=r["metadata"].get("page_number", 0),
            section_heading=r["metadata"].get("section_heading", ""),
            type=r["metadata"].get("type", ""),
            score=r["score"],
        )
        for r in results
    ]