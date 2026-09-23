"""Regression tests for concurrent dedup, long words and chunk-id ownership."""
import asyncio
from unittest.mock import patch

from src.knowledge import store as knowledge_module
from src.knowledge.store import CHUNK_SIZE, KnowledgeStore
from src.search.fts import FullTextIndex


async def test_concurrent_identical_sources_and_versions(tmp_path):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    try:
        outcomes = await asyncio.gather(*(
            store.ingest("concurrent document", name)
            for name in ("a.md", "b.md")
        ))
        assert sorted(outcome.status for outcome in outcomes) == ["duplicate", "stored"]
        assert store.count() == 1
        source = store.list_sources()[0]["source"]
        outcomes = await asyncio.gather(*(
            store.ingest("concurrent document", source) for _ in range(2)
        ))
        assert [outcome.status for outcome in outcomes] == ["unchanged", "unchanged"]
        assert len(store.get_versions(source)) == 1
    finally:
        store.close()


def test_long_words_never_emit_empty_or_oversized_chunks():
    text = "x" * (CHUNK_SIZE * 3 + 17)
    for candidate in (
        text, "before " + text + " after", "prefix\n\n" + text,
        "before " + "x" * CHUNK_SIZE + " after",
    ):
        chunks = KnowledgeStore._chunk_text(candidate)
        assert chunks
        assert all(0 < len(chunk) <= CHUNK_SIZE for chunk in chunks)
        assert "x" * (CHUNK_SIZE if len(candidate) < len(text) else len(text)) in "".join(chunks)


async def test_colliding_sources_survive_restore_and_dedup_bypass(tmp_path):
    fts = FullTextIndex(str(tmp_path / "search.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)
    original_md5 = knowledge_module.hashlib.md5

    def same_prefix_md5(data, *args, **kwargs):
        if data in (b"first", b"second"):
            return original_md5(b"same-source-prefix", *args, **kwargs)
        return original_md5(data, *args, **kwargs)

    try:
        with patch.object(knowledge_module.hashlib, "md5", side_effect=same_prefix_md5):
            assert (await store.ingest("old", "first")).status == "stored"
            assert (await store.ingest("shared", "second", dedup=False)).status == "stored"
            assert (await store.ingest("shared", "first", dedup=False)).status == "stored"
            first_id = store.get_source_chunks("first")[0]["chunk_id"]
            second_id = store.get_source_chunks("second")[0]["chunk_id"]
            assert first_id != second_id
            assert store.source_is_durable("first", 1)
            assert store.source_is_durable("second", 1)
            assert await store.restore_version("first", 1) == 1
            assert store.source_is_durable("first", 1)
            assert store.source_is_durable("second", 1)
            assert store.get_source_chunks("second")[0]["chunk_id"] == second_id
            assert store.get_source_content("second") == "shared"
    finally:
        store.close()
        fts._conn.close()
