"""
knowledge_document.py

Tracks documents uploaded to the knowledge base. The actual content
lives in ChromaDB; this table holds the metadata — filename, when it
was uploaded, how many chunks it produced, and its status.

Why a separate table from the chunks: the chunks live in Chroma, the
document record lives in SQLite. That way the admin site can list,
search, and delete documents without touching the vector store, and
Chroma can be rebuilt from the source PDFs if it ever needs to be.
"""

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class KnowledgeDocument(Base, TimestampMixin):
    __tablename__ = "knowledge_documents"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Original filename, for display.
    filename: Mapped[str] = mapped_column(String(255), nullable=False)

    # Where the file lives on disk (under KNOWLEDGE_UPLOAD_DIR).
    stored_path: Mapped[str] = mapped_column(String(512), nullable=False)

    # File size in bytes.
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    # How many chunks were extracted. Zero if processing failed.
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)

    # Processing status: "processing", "ready", "failed".
    status: Mapped[str] = mapped_column(String(32), default="processing")

    # If processing failed, why.
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Free-text notes the admin can add.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self):
        return f"<KnowledgeDocument id={self.id} filename={self.filename!r}>"