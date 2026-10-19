"""
chat_doc_service.py

The document chat service. Answers questions about the university
using the knowledge base — the documents uploaded to the admin site.

This service does not touch routes. Walk questions belong to
chat_service.py. If a student asks about the walk here, the answer
is "ask that in Walking Mode."
"""

import logging

import re

from . import date_query, knowledge_service, llm_client

logger = logging.getLogger(__name__)


_DOC_SYSTEM_PROMPT = """You are an information assistant for a university campus.

You will be given excerpts from university documents — the handbook, almanac, rules, history, or any other uploaded material — and a question.

Answer only from those excerpts. Never invent a fact, a date, a rule, or a place.

If the answer isn't in the excerpts, say so plainly. "I don't know that one — check the official notice board" is a fine answer.

The almanac lists only the dates that have an event. If a note in the excerpts says no entry was found for the date the student asked about, say plainly that you can't find anything listed for that date, so probably nothing is scheduled, and suggest checking the official notice board.

For anything time-sensitive (exam dates, holidays, deadlines, term dates), always add a short reminder: "check the official notice board to confirm."

Keep answers short — one to three sentences.

Be warm and conversational. Plain prose only. No markdown.
"""


def _format_chunks(chunks: list) -> str:
    if not chunks:
        return ""

    lines = ["UNIVERSITY DOCUMENT EXCERPTS:"]
    for chunk in chunks:
        source = chunk["metadata"].get("source_file", "?")
        page = chunk["metadata"].get("page_number", "?")
        heading = chunk["metadata"].get("section_heading", "")
        header = f"[{source}, page {page}"
        if heading:
            header += f", {heading}"
        header += "]"
        lines.append(header)
        lines.append("  " + chunk["text"])
        lines.append("")

    return "\n".join(lines)


# The most day-chunks we will add for a month question ("what is in May").
_MAX_MONTH_CHUNKS = 31

_ISO_IN_TEXT = re.compile(r"\((\d{4}-\d{2}-\d{2})\)")


def _chunk_date(chunk) -> str:
    """The ISO date a chunk is about, e.g. "2026-05-01", for sorting."""
    match = _ISO_IN_TEXT.search(chunk["text"])
    return match.group(1) if match else ""


def _date_chunks(question: str):
    """
    Chunks that match a date written in the question, found by exact text.
    Returns (chunks, note). `note` is a sentence for the model when a
    specific day was asked about but nothing is listed for it, else None.
    """
    day_needles, month_needles = date_query.find_date_needles(question)
    chunks = []

    try:
        for needle in day_needles:
            chunks.extend(knowledge_service.retrieve_containing(needle, limit=5))
        for needle in month_needles:
            found = knowledge_service.retrieve_containing(
                needle, limit=_MAX_MONTH_CHUNKS
            )
            # Put the days in calendar order.
            found.sort(key=_chunk_date)
            chunks.extend(found)
    except Exception as e:
        logger.warning("Date lookup failed: %s", e)
        return [], None

    note = None
    if day_needles and not chunks:
        note = (
            "Note: the documents were searched for the exact date the "
            "student asked about and no entry was found for it."
        )
    return chunks, note


def _merge(primary: list, secondary: list, limit: int) -> list:
    """primary first, then secondary, without repeating a chunk."""
    seen, merged = set(), []
    for chunk in primary + secondary:
        if chunk["text"] in seen:
            continue
        seen.add(chunk["text"])
        merged.append(chunk)
    return merged[:limit]


def answer_doc_question(question: str, top_k: int = 5) -> tuple[str, bool]:
    """
    Answer a question about the university using the knowledge base.

    Returns (reply, used_knowledge). `used_knowledge` is True when at
    least one chunk was retrieved.
    """
    if not question or not question.strip():
        return "Ask me anything about the university.", False

    # Retrieve chunks.
    chunks = []
    try:
        chunks = knowledge_service.retrieve(question, top_k=top_k)
    except Exception as e:
        logger.warning("Knowledge retrieval failed: %s", e)

    # A date in the question is matched by exact text, because searching
    # by meaning cannot tell one almanac day from another.
    date_chunks, date_note = _date_chunks(question)
    if date_chunks:
        limit = max(top_k, len(date_chunks) + 2)
        chunks = _merge(date_chunks, chunks, limit)

    if not chunks and not date_note:
        return (
            "I don't have anything about that in the documents I've "
            "been given. Try rephrasing, or check the official notice "
            "board.",
            False,
        )

    # No LLM? Return the top chunk as plain text. Honest and useful.
    if not llm_client.is_available():
        if not chunks:
            return (
                "I can't find an entry for that date in the documents. "
                "Check the official notice board to confirm.",
                False,
            )
        top = chunks[0]
        source = top["metadata"].get("source_file", "the documents")
        return (
            f"From {source}: {top['text']}",
            True,
        )

    context = _format_chunks(chunks)
    if date_note:
        context = f"{context}\n\n{date_note}" if context else date_note
    response = llm_client.chat(
        [
            {"role": "system", "content": _DOC_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"{context}\n\nStudent asked: {question}",
            },
        ],
        temperature=0.4,
        max_tokens=400,
    )

    if response:
        return response.strip(), True

    # LLM call failed. Return the top chunk as plain text.
    if not chunks:
        return (
            "I can't find an entry for that date in the documents. "
            "Check the official notice board to confirm.",
            False,
        )
    top = chunks[0]
    source = top["metadata"].get("source_file", "the documents")
    return (f"From {source}: {top['text']}", True)

