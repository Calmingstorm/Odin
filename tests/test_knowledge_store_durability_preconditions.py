"""Focused regressions for KnowledgeStore durability precondition failures."""
from __future__ import annotations

import hashlib

from src.knowledge.store import KnowledgeStore
from src.search.fts import FullTextIndex


async def test_durability_rejects_incomplete_or_stale_source(tmp_path):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)
    content = "A synthetic document with enough content to persist."
    try:
        outcome = await store.ingest(content, "synthetic.md")
        assert outcome.status == "stored"

        # The source exists, but its complete chunk set and content provenance
        # are part of the durability contract, not optional metadata.
        assert not store.source_is_durable("synthetic.md", expected_chunks=2)
        assert not store.source_is_durable(
            "synthetic.md", expected_content_hash=hashlib.sha256(b"stale").hexdigest()
        )

        fts_conn = fts._conn
        fts._conn = None
        try:
            assert not store.source_is_durable("synthetic.md")
        finally:
            fts._conn = fts_conn
    finally:
        store.close()
        if fts._conn is not None:
            fts._conn.close()
