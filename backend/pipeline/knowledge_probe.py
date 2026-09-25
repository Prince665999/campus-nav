"""
knowledge_probe.py

Test extraction on a document without uploading it. Prints the
chunks the pipeline would produce, so you can see whether the tables
and prose come out cleanly.

Usage:
    python -m backend.pipeline.knowledge_probe path/to/document.pdf
    python -m backend.pipeline.knowledge_probe path/to/document.pdf --limit 10
"""

import argparse
from pathlib import Path

from backend.api.services import knowledge_service


def probe(path, limit=None):
    """Run extraction and print the resulting chunks."""
    print(f"Probing {path}\n")

    chunks = knowledge_service.extract(path)
    print(f"Total chunks: {len(chunks)}\n")

    # Count by type.
    table_chunks = [c for c in chunks if c["metadata"]["type"] == "table_row"]
    prose_chunks = [c for c in chunks if c["metadata"]["type"] == "prose"]
    print(f"  Table rows:  {len(table_chunks)}")
    print(f"  Prose:       {len(prose_chunks)}\n")

    to_show = chunks[:limit] if limit else chunks
    for i, chunk in enumerate(to_show):
        print(f"--- Chunk {i + 1} ({chunk['metadata']['type']}, "
              f"page {chunk['metadata']['page_number']}) ---")
        print(chunk["text"][:300])
        print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    probe(args.path, limit=args.limit)