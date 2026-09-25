"""
knowledge.py

Request and response shapes for the knowledge base endpoints.
"""

from datetime import datetime

from pydantic import BaseModel


class KnowledgeDocumentItem(BaseModel):
    id: int
    filename: str
    size_bytes: int
    chunk_count: int
    status: str
    error_message: str | None = None
    notes: str | None = None
    created_at: datetime


class KnowledgeUploadResponse(BaseModel):
    id: int
    filename: str
    chunk_count: int
    status: str


class KnowledgeSearchResult(BaseModel):
    text: str
    source_file: str
    page_number: int
    section_heading: str
    type: str
    score: float