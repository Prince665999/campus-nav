"""
knowledge_service.py

The knowledge base pipeline. Reads a PDF or text file, extracts text
and tables, converts each into chunks, embeds them, and stores them
in ChromaDB.

The pipeline per page:

  1. Run `extract_tables()` first.
  2. If tables exist, convert each row to a sentence, prefixed with
     the nearest heading on the page.
  3. Record the table's bounding box so its content can be excluded
     from the plain-text pass.
  4. Run `extract_text()` on the page, excluding the table bounding
     boxes.
  5. Split the remaining text into paragraph-sized chunks.
  6. Store all chunks in Chroma with metadata:
       {source_file, page_number, section_heading, type}

Retrieval:

  Given a query string, embed it and ask Chroma for the closest
  chunks. Return the chunk texts and their metadata.
"""

import logging
import re
import uuid
from pathlib import Path

import os
os.environ["ANONYMIZED_TELEMETRY"] = "False"

import chromadb
import pdfplumber

from backend.api.settings import (
    CHROMA_COLLECTION,
    CHROMA_DIR,
    EMBEDDING_MODEL,
    KNOWLEDGE_CHUNK_WORDS,
    KNOWLEDGE_TOP_K,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Chroma client — created lazily on first use
# ---------------------------------------------------------------------------

_client = None
_embedder = None


def _get_client():
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return _client


def _get_collection():
    client = _get_client()
    return client.get_or_create_collection(
        name=CHROMA_COLLECTION,
        metadata={"hnsw:space": "cosine"},
    )


def _get_embedder():
    """
    Load the sentence-transformers model once, on first use. The
    first call downloads the model (~80 MB); after that it's cached.
    """
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model %s", EMBEDDING_MODEL)
        _embedder = SentenceTransformer(EMBEDDING_MODEL)
    return _embedder


def _embed(texts):
    """Embed a list of strings. Returns a list of vectors."""
    model = _get_embedder()
    return model.encode(texts, show_progress_bar=False).tolist()


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------

def _clean(text):
    """Collapse whitespace and strip empty lines."""
    if not text:
        return ""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def _is_heading(line):
    """
    Heuristic: a short line, no trailing period, capitalised, on its
    own, is likely a heading.

    pdfplumber doesn't tell us font sizes via extract_text(), so this
    is what we have. It's not perfect but it catches most headings.
    """
    if not line:
        return False
    line = line.strip()
    if len(line) > 80:
        return False
    if line.endswith("."):
        return False
    # At least two words, first letter capitalised.
    words = line.split()
    if len(words) < 2:
        return False
    return words[0][0].isupper()


def _nearest_heading_before(text, position):
    """
    Given a page's text and a character position, return the most
    recent heading line before that position, or None.
    """
    before = text[:position]
    lines = before.split("\n")
    for line in reversed(lines):
        stripped = line.strip()
        if _is_heading(stripped):
            return stripped
    return None


# ---------------------------------------------------------------------------
# Table extraction
# ---------------------------------------------------------------------------

def _table_rows_to_chunks(table, source_file, page_number, heading):
    """
    Convert a pdfplumber table into a list of chunk dicts.

    Each row becomes one chunk. The row is prefixed with the heading
    so the embedding has context, and joined with a colon between
    cells so the sentence reads naturally.
    """
    chunks = []
    if not table or len(table) < 2:
        return chunks

    # First row is the header.
    header = [str(c).strip() if c else "" for c in table[0]]

    for row in table[1:]:
        if not row:
            continue

        cells = [str(c).strip() if c else "" for c in row]
        # Build "Header1: cell1. Header2: cell2."
        parts = []
        for h, c in zip(header, cells):
            if not c:
                continue
            if h:
                parts.append(f"{h}: {c}")
            else:
                parts.append(c)

        if not parts:
            continue

        sentence = ". ".join(parts)
        if heading:
            sentence = f"{heading}. {sentence}"

        chunks.append({
            "text": _clean(sentence),
            "metadata": {
                "source_file": source_file,
                "page_number": page_number,
                "section_heading": heading or "",
                "type": "table_row",
            },
        })

    return chunks


# ---------------------------------------------------------------------------
# Prose extraction
# ---------------------------------------------------------------------------

def _split_paragraphs(text, max_words):
    """
    Split prose into paragraph-sized chunks of at most `max_words`.

    Splits on blank lines first. Any paragraph longer than the max is
    split further at sentence boundaries.
    """
    paragraphs = re.split(r"\n\s*\n", text)
    chunks = []

    for para in paragraphs:
        para = _clean(para)
        if not para:
            continue

        words = para.split()
        if len(words) <= max_words:
            chunks.append(para)
            continue

        # Split long paragraphs at sentence boundaries.
        sentences = re.split(r"(?<=[.!?])\s+", para)
        current = []
        current_len = 0
        for sentence in sentences:
            s_len = len(sentence.split())
            if current_len + s_len > max_words and current:
                chunks.append(" ".join(current))
                current = [sentence]
                current_len = s_len
            else:
                current.append(sentence)
                current_len += s_len
        if current:
            chunks.append(" ".join(current))

    return chunks


# ---------------------------------------------------------------------------
# PDF extraction
# ---------------------------------------------------------------------------

def extract_pdf(path):
    """
    Extract chunks from a PDF. Returns a list of
    {text, metadata} dicts.
    """
    source_file = Path(path).name
    all_chunks = []

    with pdfplumber.open(str(path)) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text() or ""

            # Tables first.
            tables = page.extract_tables() or []
            table_bboxes = []

            for table_obj in page.find_tables():
                table_bboxes.append(table_obj.bbox)

            # The extract_tables() call returns the data, but we need
            # the positions from find_tables(). They align by index.
            for t_idx, table_data in enumerate(tables):
                # Use the bounding box position to find the nearest
                # heading above it.
                heading = None
                if t_idx < len(table_bboxes):
                    bbox = table_bboxes[t_idx]
                    # bbox is (x0, top, x1, bottom). The `top` is a
                    # y-coordinate from the top of the page. We
                    # approximate the position in the extracted text
                    # by the ratio of `top` to the page height.
                    if page.height > 0:
                        ratio = bbox[1] / page.height
                        char_pos = int(len(page_text) * ratio)
                        heading = _nearest_heading_before(page_text, char_pos)

                all_chunks.extend(
                    _table_rows_to_chunks(
                        table_data, source_file, page_index, heading
                    )
                )

            # Now the prose, excluding the table regions.
            prose_text = page_text
            for bbox in table_bboxes:
                try:
                    # Crop the page to everything outside this table
                    # and add its text.
                    cropped = page.outside_bbox(bbox)
                    # We only use this to filter — see the approach
                    # below.
                except Exception:
                    pass

            # Simpler approach: if there are tables, strip out any
            # lines that appear verbatim as cells, so we don't
            # double-count them.
            if table_bboxes:
                table_cells = set()
                for table_data in tables:
                    for row in table_data:
                        for cell in row:
                            if cell:
                                table_cells.add(str(cell).strip())

                lines = prose_text.split("\n")
                filtered_lines = []
                for line in lines:
                    stripped = line.strip()
                    # Skip lines that are entirely a table cell.
                    if stripped in table_cells:
                        continue
                    # Skip lines that are mostly table-like (many
                    # pipes or tabs).
                    if stripped.count("|") >= 2 or stripped.count("\t") >= 2:
                        continue
                    filtered_lines.append(line)
                prose_text = "\n".join(filtered_lines)

            # Split the prose into chunks.
            for chunk_text in _split_paragraphs(
                prose_text, KNOWLEDGE_CHUNK_WORDS
            ):
                all_chunks.append({
                    "text": chunk_text,
                    "metadata": {
                        "source_file": source_file,
                        "page_number": page_index,
                        "section_heading": "",
                        "type": "prose",
                    },
                })

    return all_chunks


def extract_text_file(path):
    """
    Extract chunks from a plain text file. Treats the whole file as
    prose and splits by paragraph.
    """
    source_file = Path(path).name
    text = Path(path).read_text(encoding="utf-8", errors="replace")

    chunks = []
    for chunk_text in _split_paragraphs(text, KNOWLEDGE_CHUNK_WORDS):
        chunks.append({
            "text": chunk_text,
            "metadata": {
                "source_file": source_file,
                "page_number": 1,
                "section_heading": "",
                "type": "prose",
            },
        })
    return chunks


def extract(path):
    """
    Extract chunks from a file. Picks PDF or text based on extension.
    """
    p = Path(path)
    suffix = p.suffix.lower()

    if suffix == ".pdf":
        return extract_pdf(p)
    if suffix in (".txt", ".md"):
        return extract_text_file(p)

    raise ValueError(f"Unsupported file type: {suffix}")


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------

def store_chunks(chunks, document_id):
    """
    Embed and store a list of chunks in Chroma. Ids are namespaced by
    document id so chunks from different documents can't collide.
    """
    if not chunks:
        return 0

    collection = _get_collection()
    texts = [c["text"] for c in chunks]
    embeddings = _embed(texts)
    ids = [f"doc{document_id}-{uuid.uuid4().hex[:8]}" for _ in chunks]
    metadatas = []
    for c in chunks:
        md = dict(c["metadata"])
        md["document_id"] = document_id
        metadatas.append(md)

    collection.add(
        ids=ids,
        documents=texts,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(chunks)


def delete_document(document_id):
    """
    Remove every chunk belonging to a document.
    """
    collection = _get_collection()
    try:
        collection.delete(where={"document_id": document_id})
    except Exception as e:
        logger.warning("Chroma delete failed for doc %s: %s", document_id, e)


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------

def retrieve(query, top_k=KNOWLEDGE_TOP_K):
    """
    Find the chunks most relevant to a query. Returns a list of
    {text, metadata, score}.
    """
    if not query or not query.strip():
        return []

    collection = _get_collection()

    # If the collection is empty, avoid calling embed — it would load
    # the model for nothing.
    try:
        if collection.count() == 0:
            return []
    except Exception:
        return []

    query_embedding = _embed([query])[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, max(1, collection.count())),
        include=["documents", "metadatas", "distances"],
    )

    out = []
    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    dists = results.get("distances", [[]])[0]

    for text, metadata, distance in zip(docs, metas, dists):
        out.append({
            "text": text,
            "metadata": metadata,
            "score": 1 - distance,  # cosine similarity
        })

    return out