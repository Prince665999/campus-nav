"""
chat_doc.py

Request and response shapes for the document chat endpoints.
"""

from pydantic import BaseModel, Field


class DocChatRequest(BaseModel):
    """Body for POST /api/chat/doc."""

    message: str = Field(..., min_length=1, max_length=1000)
    session_id: str | None = None


class DocChatResponse(BaseModel):
    reply: str
    session_id: str | None = None
    used_knowledge: bool = False


class DocSearchResult(BaseModel):
    """Result of a direct search against the knowledge base."""

    text: str
    source_file: str
    page_number: int
    section_heading: str
    type: str
    score: float