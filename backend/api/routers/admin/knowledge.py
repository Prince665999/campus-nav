"""
knowledge.py

Admin endpoints for the knowledge base.

  GET    /api/admin/knowledge             — list documents
  POST   /api/admin/knowledge/upload      — upload a PDF or text file
  DELETE /api/admin/knowledge/{id}        — delete a document
  GET    /api/admin/knowledge/search?q=   — test retrieval
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.orm import Session

from ...dependencies import db_session
from ...errors import BadRequestError, NotFoundError
from ...models.knowledge_document import KnowledgeDocument
from ...schemas.knowledge import (
    KnowledgeDocumentItem,
    KnowledgeSearchResult,
    KnowledgeUploadResponse,
)
from ...services import knowledge_service
from ...settings import KNOWLEDGE_MAX_UPLOAD_BYTES, KNOWLEDGE_UPLOAD_DIR

router = APIRouter(prefix="/knowledge", tags=["admin:knowledge"])


def _to_item(doc: KnowledgeDocument) -> KnowledgeDocumentItem:
    return KnowledgeDocumentItem(
        id=doc.id,
        filename=doc.filename,
        size_bytes=doc.size_bytes,
        chunk_count=doc.chunk_count,
        status=doc.status,
        error_message=doc.error_message,
        notes=doc.notes,
        created_at=doc.created_at,
    )


@router.get("", response_model=list[KnowledgeDocumentItem])
def list_documents(session: Session = Depends(db_session)):
    """List every uploaded document, newest first."""
    docs = (
        session.query(KnowledgeDocument)
        .order_by(KnowledgeDocument.created_at.desc())
        .all()
    )
    return [_to_item(d) for d in docs]


@router.post("/upload", response_model=KnowledgeUploadResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    session: Session = Depends(db_session),
):
    """
    Upload a PDF or text file. The file is stored, then processed:
    text and tables are extracted, chunked, embedded, and stored in
    Chroma.
    """
    contents = await file.read()

    if len(contents) > KNOWLEDGE_MAX_UPLOAD_BYTES:
        mb = KNOWLEDGE_MAX_UPLOAD_BYTES // (1024 * 1024)
        raise BadRequestError(f"File is larger than {mb} MB")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".pdf", ".txt", ".md"):
        raise BadRequestError(
            "Only .pdf, .txt, and .md files are supported."
        )

    # Save the file under a unique name so two uploads of "almanac.pdf"
    # don't collide.
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    stored_path = KNOWLEDGE_UPLOAD_DIR / stored_name
    stored_path.write_bytes(contents)

    doc = KnowledgeDocument(
        filename=file.filename,
        stored_path=str(stored_path),
        size_bytes=len(contents),
        status="processing",
    )
    session.add(doc)
    session.flush()

    # Process synchronously. For small documents this is fine. For
    # large ones (>20 MB) a background task would be better, but
    # that's a later improvement.
    try:
        chunks = knowledge_service.extract(stored_path)
        chunk_count = knowledge_service.store_chunks(chunks, doc.id)
        doc.chunk_count = chunk_count
        doc.status = "ready"
    except Exception as e:
        doc.status = "failed"
        doc.error_message = str(e)
        session.flush()
        raise BadRequestError(f"Processing failed: {e}") from e

    session.flush()

    return KnowledgeUploadResponse(
        id=doc.id,
        filename=doc.filename,
        chunk_count=doc.chunk_count,
        status=doc.status,
    )


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: int,
    session: Session = Depends(db_session),
):
    """
    Delete a document and its chunks. Removes the file from disk, the
    chunks from Chroma, and the row from the database.
    """
    doc = (
        session.query(KnowledgeDocument)
        .filter_by(id=document_id)
        .one_or_none()
    )
    if doc is None:
        raise NotFoundError(f"Document {document_id} not found")

    # Remove chunks from Chroma.
    knowledge_service.delete_document(document_id)

    # Remove the file from disk.
    try:
        Path(doc.stored_path).unlink(missing_ok=True)
    except Exception:
        pass

    session.delete(doc)
    return None


@router.get("/search", response_model=list[KnowledgeSearchResult])
def search(
    q: str = Query(..., min_length=1),
    top_k: int = Query(5, gt=0, le=20),
):
    """
    Test retrieval. Returns the chunks the knowledge base would use
    to answer a question.
    """
    results = knowledge_service.retrieve(q, top_k=top_k)
    return [
        KnowledgeSearchResult(
            text=r["text"],
            source_file=r["metadata"].get("source_file", ""),
            page_number=r["metadata"].get("page_number", 0),
            section_heading=r["metadata"].get("section_heading", ""),
            type=r["metadata"].get("type", ""),
            score=r["score"],
        )
        for r in results
    ]