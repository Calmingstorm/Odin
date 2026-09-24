"""Targeted edge coverage for knowledge import and chunking limits."""

from __future__ import annotations

from unittest.mock import MagicMock

from src.knowledge.importer import BulkImporter
from src.knowledge.store import CHUNK_SIZE, KnowledgeStore


def test_import_limit_returns_empty_when_chunks_cannot_fit():
    store = MagicMock()
    # Every non-empty candidate becomes a chunk larger than the requested cap.
    store._chunk_text.side_effect = lambda text: [text + "x"]
    importer = BulkImporter(store)

    assert importer._limit_import_content("content", 0) == ""


def test_chunk_text_hard_splits_oversized_unbroken_words():
    text = "a" * (CHUNK_SIZE * 2 + 7)

    chunks = KnowledgeStore._chunk_text(text)

    assert chunks == ["a" * CHUNK_SIZE, "a" * CHUNK_SIZE, "a" * 7]
    assert "".join(chunks) == text
