"""
chat_doc_service.py

The document chat service. Answers questions about the university
using the knowledge base — the documents uploaded to the admin site.

This service does not touch routes. Walk questions belong to
chat_service.py. If a student asks about the walk here, the answer
is "ask that in Walking Mode."
"""

import logging

from . import knowledge_service, llm_client

logger = logging.getLogger(__name__)


_DOC_SYSTEM_PROMPT = """You are an information assistant for a university campus.

You will be given excerpts from university documents — the handbook, almanac, rules, history, or any other uploaded material — and a question.

Answer only from those excerpts. Never invent a fact, a date, a rule, or a place.

If the answer isn't in the excerpts, say so plainly. "I don't know that one — check the official notice board" is a fine answer.

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

    if not chunks:
        return (
            "I don't have anything about that in the documents I've "
            "been given. Try rephrasing, or check the official notice "
            "board.",
            False,
        )

    # No LLM? Return the top chunk as plain text. Honest and useful.
    if not llm_client.is_available():
        top = chunks[0]
        source = top["metadata"].get("source_file", "the documents")
        return (
            f"From {source}: {top['text']}",
            True,
        )

    context = _format_chunks(chunks)
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
    top = chunks[0]
    source = top["metadata"].get("source_file", "the documents")
    return (f"From {source}: {top['text']}", True)