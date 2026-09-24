"""Regression tests for concurrent dedup, long words and chunk-id ownership."""

import asyncio
import hashlib
import logging
from unittest.mock import patch

from src.knowledge import store as knowledge_module
from src.knowledge.store import CHUNK_SIZE, KnowledgeStore
from src.search.fts import FullTextIndex


async def test_non_durable_duplicate_warning_is_logged_once(tmp_path, monkeypatch, caplog):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    try:
        monkeypatch.setattr(store, "_find_by_doc_hash", lambda _digest: ("same.md", 1))
        original_durable = store.source_is_durable
        monkeypatch.setattr(
            store,
            "source_is_durable",
            lambda source, *args, **kwargs: (
                False if source == "same.md" and args else original_durable(source, *args, **kwargs)
            ),
        )
        with caplog.at_level(logging.WARNING, logger="src.knowledge.store"):
            outcome = await store.ingest("same content", "same.md")
        matching = [
            record
            for record in caplog.records
            if "non-durable duplicate source" in record.message
        ]
        assert outcome.status == "stored"
        assert len(matching) == 1
        assert "re-ingesting" in matching[0].message
    finally:
        store.close()


async def test_concurrent_identical_sources_and_versions(tmp_path):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    try:
        outcomes = await asyncio.gather(
            *(store.ingest("concurrent document", name) for name in ("a.md", "b.md"))
        )
        assert sorted(outcome.status for outcome in outcomes) == ["duplicate", "stored"]
        assert store.count() == 1
        source = store.list_sources()[0]["source"]
        outcomes = await asyncio.gather(
            *(store.ingest("concurrent document", source) for _ in range(2))
        )
        assert [outcome.status for outcome in outcomes] == ["unchanged", "unchanged"]
        assert len(store.get_versions(source)) == 1
    finally:
        store.close()


def test_long_words_never_emit_empty_or_oversized_chunks():
    text = "x" * (CHUNK_SIZE * 3 + 17)
    for candidate in (
        text,
        "before " + text + " after",
        "prefix\n\n" + text,
        "before " + "x" * CHUNK_SIZE + " after",
    ):
        chunks = KnowledgeStore._chunk_text(candidate)
        assert chunks
        assert all(0 < len(chunk) <= CHUNK_SIZE for chunk in chunks)
        assert "x" * (CHUNK_SIZE if len(candidate) < len(text) else len(text)) in "".join(chunks)


def test_whitespace_paragraph_does_not_emit_empty_chunk():
    chunks = KnowledgeStore._chunk_text("a" * CHUNK_SIZE + "\n\n   \n\n" + "b" * CHUNK_SIZE)
    assert all(chunk.strip() for chunk in chunks)


def test_consecutive_whitespace_paragraphs_do_not_emit_empty_chunk():
    chunks = KnowledgeStore._chunk_text(
        "a" * CHUNK_SIZE + "\n\n   \n\n\t\n\n" + "b" * CHUNK_SIZE
    )
    assert all(chunk.strip() for chunk in chunks)
    assert chunks[0] == "a" * CHUNK_SIZE
    assert chunks[-1] == "b" * CHUNK_SIZE


def test_blank_paragraph_after_oversized_paragraph_does_not_erase_following_text():
    text = "a" * CHUNK_SIZE + "\n\n   \n\n" + "b" * (CHUNK_SIZE + 1)
    chunks = KnowledgeStore._chunk_text(text)
    assert all(chunk.strip() for chunk in chunks)
    assert chunks[0] == "a" * CHUNK_SIZE
    assert "b" * (CHUNK_SIZE + 1) in "".join(chunks)


def test_whitespace_only_paragraph_after_full_chunk_does_not_create_chunk():
    chunks = KnowledgeStore._chunk_text("a" * CHUNK_SIZE + "\n\n \t \n\n" + "tail")
    assert chunks == ["a" * CHUNK_SIZE, "tail"]


def test_short_nonblank_paragraph_after_full_chunk_is_kept():
    chunks = KnowledgeStore._chunk_text("a" * CHUNK_SIZE + "\n\nsmall")
    assert chunks == ["a" * CHUNK_SIZE, "small"]


async def test_duplicate_ingest_skips_embedding_before_precheck(tmp_path):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))

    class Embedder:
        calls = 0

        async def embed(self, _text):
            self.calls += 1
            return [0.0] * 3

    try:
        assert (await store.ingest("unchanged content", "same-source")).status == "stored"
        store._has_vec = True
        embedder = Embedder()
        outcome = await store.ingest("unchanged content", "same-source", embedder=embedder)
        assert outcome.status == "unchanged"
        assert embedder.calls == 0
    finally:
        store.close()


def test_long_word_after_regular_words_flushes_pending_chunk():
    word = "x" * (CHUNK_SIZE + 7)
    chunks = KnowledgeStore._chunk_text("before " + word + " after")
    assert chunks[0] == "before"
    assert "".join(chunks[1:]).startswith(word)
    assert all(0 < len(chunk) <= CHUNK_SIZE for chunk in chunks)


async def test_existing_source_specific_chunk_id_is_kept_after_collision_owner_removed(tmp_path):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    original_md5 = knowledge_module.hashlib.md5

    def same_prefix_md5(data, *args, **kwargs):
        if data in (b"first", b"second"):
            return original_md5(b"same-source-prefix", *args, **kwargs)
        return original_md5(data, *args, **kwargs)

    try:
        with patch.object(knowledge_module.hashlib, "md5", side_effect=same_prefix_md5):
            assert (await store.ingest("shared", "first", dedup=False)).status == "stored"
            assert (await store.ingest("shared", "second", dedup=False)).status == "stored"
            fallback_id = store.get_source_chunks("second")[0]["chunk_id"]
            assert hashlib.sha256(b"second").hexdigest() in fallback_id
            assert store.delete_source("first") == 1
            assert (await store.ingest("shared", "second", dedup=False)).status == "stored"
            assert store.get_source_chunks("second")[0]["chunk_id"] == fallback_id
    finally:
        store.close()


async def test_occupied_source_specific_id_gets_numbered_suffix(tmp_path):
    store = KnowledgeStore(str(tmp_path / "knowledge.db"))
    original_md5 = knowledge_module.hashlib.md5

    def same_prefix_md5(data, *args, **kwargs):
        if data in (b"first", b"second"):
            return original_md5(b"same-source-prefix", *args, **kwargs)
        return original_md5(data, *args, **kwargs)

    try:
        with patch.object(knowledge_module.hashlib, "md5", side_effect=same_prefix_md5):
            assert (await store.ingest("shared", "first", dedup=False)).status == "stored"
            base_id = store.get_source_chunks("first")[0]["chunk_id"]
            reserved = f"{base_id}_{hashlib.sha256(b'second').hexdigest()}"
            store._conn.execute(
                "INSERT INTO knowledge_chunks "
                "(chunk_id, content, source, chunk_index, total_chunks, uploader, "
                "ingested_at, content_hash, doc_content_hash) "
                "SELECT ?, content, ?, chunk_index, total_chunks, uploader, "
                "ingested_at, content_hash, doc_content_hash "
                "FROM knowledge_chunks WHERE chunk_id = ?",
                (reserved, "third", base_id),
            )
            store._conn.commit()
            assert (await store.ingest("shared", "second", dedup=False)).status == "stored"
            assert store.get_source_chunks("second")[0]["chunk_id"] == reserved + "_1"
            assert store.get_source_chunks("third")[0]["chunk_id"] == reserved
    finally:
        store.close()


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
