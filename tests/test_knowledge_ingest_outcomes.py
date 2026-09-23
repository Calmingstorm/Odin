"""Gist M7 — a dedup skip is not an ingestion failure.

`KnowledgeStore.ingest` reported every duplicate/near-duplicate skip as ``0``,
which a caller can only read as "nothing durable was written". `BulkImporter`
then mapped ``<= 0`` onto a durability error, so re-importing stored content
surfaced as a failed import (HTTP 500 / failed batch counts).

These tests pin the typed outcome (stored / unchanged / duplicate / conflict /
failure), the operator ruling that re-ingesting stored content reports
"already stored, unchanged", and that a plain ``int`` from an older store or a
test double still behaves exactly as before.
"""
from __future__ import annotations

import copy
import json
import pickle
from unittest.mock import AsyncMock, MagicMock, patch

from src.knowledge.importer import (
    ALREADY_STORED_NOTE,
    DURABILITY_FAILURE_MESSAGE,
    BulkImporter,
    ImportResult,
)
from src.knowledge.store import (
    INGEST_CONFLICT,
    INGEST_DUPLICATE,
    INGEST_FAILURE,
    INGEST_STORED,
    INGEST_UNCHANGED,
    IngestOutcome,
    KnowledgeStore,
)
from src.search.fts import FullTextIndex

SHORT_DOC = "Hello world, this is a test document."


def _store(tmp_path) -> KnowledgeStore:
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    return KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)


def _long_doc(seed: str = "alpha", paragraphs: int = 20) -> str:
    para = f"This is paragraph about {seed}. " * 40
    return "\n\n".join([f"Paragraph {i}: {para}" for i in range(paragraphs)])


def _close(store: KnowledgeStore) -> None:
    fts = store._fts
    store.close()
    if fts is not None and fts._conn is not None:
        fts._conn.close()


# ---------------------------------------------------------------------------
# The outcome type keeps the int contract
# ---------------------------------------------------------------------------


class TestIngestOutcomeContract:
    def test_is_int_compatible(self):
        outcome = IngestOutcome(4, INGEST_STORED)
        assert outcome == 4
        assert int(outcome) == 4
        assert outcome > 0
        assert outcome.chunks == 4
        assert outcome + 1 == 5
        assert isinstance(outcome, int)

    def test_zero_outcomes_still_compare_as_failure(self):
        for status in (INGEST_DUPLICATE, INGEST_CONFLICT, INGEST_FAILURE):
            outcome = IngestOutcome(0, status)
            assert outcome == 0
            assert outcome <= 0
            assert not outcome

    def test_status_and_duplicate_of_are_readable(self):
        outcome = IngestOutcome(0, INGEST_DUPLICATE, "other.md")
        assert outcome.status == INGEST_DUPLICATE
        assert outcome.duplicate_of == "other.md"
        assert IngestOutcome(3, INGEST_UNCHANGED).duplicate_of == ""

    def test_survives_json_copy_and_pickle(self):
        outcome = IngestOutcome(3, INGEST_UNCHANGED, "doc.md")
        assert json.dumps({"chunks": outcome}) == '{"chunks": 3}'
        assert copy.copy(outcome).status == INGEST_UNCHANGED
        assert copy.deepcopy(outcome).status == INGEST_UNCHANGED
        revived = pickle.loads(pickle.dumps(outcome))
        assert (int(revived), revived.status, revived.duplicate_of) == (
            3, INGEST_UNCHANGED, "doc.md",
        )


# ---------------------------------------------------------------------------
# Store-level outcomes
# ---------------------------------------------------------------------------


class TestStoreOutcomes:
    async def test_new_document_is_stored(self, tmp_path):
        store = _store(tmp_path)
        try:
            outcome = await store.ingest(SHORT_DOC, "doc.md")
            assert outcome.status == INGEST_STORED
            assert int(outcome) == 1
        finally:
            _close(store)

    async def test_same_source_same_content_is_unchanged_not_failure(self, tmp_path):
        store = _store(tmp_path)
        try:
            first = await store.ingest(SHORT_DOC, "doc.md")
            second = await store.ingest(SHORT_DOC, "doc.md")
            assert first.status == INGEST_STORED
            assert second.status == INGEST_UNCHANGED
            assert int(second) == int(first)
            assert second.duplicate_of == "doc.md"
            assert store.count() == 1
        finally:
            _close(store)

    async def test_identical_content_under_another_source_is_duplicate(self, tmp_path):
        store = _store(tmp_path)
        try:
            await store.ingest(SHORT_DOC, "doc-a.md")
            outcome = await store.ingest(SHORT_DOC, "doc-b.md")
            assert outcome.status == INGEST_DUPLICATE
            assert int(outcome) == 0
            assert outcome.duplicate_of == "doc-a.md"
            assert store.count() == 1
        finally:
            _close(store)

    async def test_near_duplicate_is_conflict(self, tmp_path):
        store = _store(tmp_path)
        try:
            doc = _long_doc("shared")
            assert int(await store.ingest(doc, "original.md")) > 1
            lines = doc.split("\n\n")
            lines[0] = "Paragraph 0: THIS IS ENTIRELY DIFFERENT CONTENT. " * 40
            outcome = await store.ingest("\n\n".join(lines), "near-copy.md")
            assert outcome.status == INGEST_CONFLICT
            assert int(outcome) == 0
            assert outcome.duplicate_of == "original.md"
        finally:
            _close(store)

    async def test_dedup_false_still_stores_a_duplicate(self, tmp_path):
        store = _store(tmp_path)
        try:
            await store.ingest(SHORT_DOC, "doc-a.md")
            outcome = await store.ingest(SHORT_DOC, "doc-b.md", dedup=False)
            assert outcome.status == INGEST_STORED
            assert int(outcome) == 1
            assert store.count() == 2
        finally:
            _close(store)

    async def test_unavailable_store_is_failure(self, tmp_path):
        store = _store(tmp_path)
        try:
            store._conn = None
            outcome = await store.ingest(SHORT_DOC, "doc.md")
            assert outcome.status == INGEST_FAILURE
            assert int(outcome) == 0
        finally:
            _close(store)

    async def test_empty_content_is_failure(self, tmp_path):
        store = _store(tmp_path)
        try:
            outcome = await store.ingest("   ", "doc.md")
            assert outcome.status == INGEST_FAILURE
            assert int(outcome) == 0
        finally:
            _close(store)

    async def test_durability_failure_is_still_failure(self, tmp_path):
        """A failed FTS write is a real failure, not a skip."""
        store = _store(tmp_path)
        try:
            with patch.object(store._fts, "index_knowledge_chunk", return_value=False):
                outcome = await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            assert outcome.status == INGEST_FAILURE
            assert int(outcome) == 0
            assert store.get_source_content("doc.md") is None
        finally:
            _close(store)

    async def test_stored_implies_the_fts_copy_is_verified(self, tmp_path):
        """`stored` is a durability claim, and the FTS store is part of it.

        `ingest` returns `indexed == len(chunks)`, and that count is only
        reachable past `_write_chunks_sync`'s own gates: every chunk write
        succeeded (`all_writes_ok`), `_source_contains_rows` confirmed the
        chunk rows in BOTH the DB and the configured FTS table, obsolete rows
        were retired, and the final `source_is_durable` re-check passed. This
        test holds that line: a partial, absent, raising, or silently lying
        FTS write must never be reported as `stored`.
        """
        # A partial multi-chunk failure: chunk 2 of 9 never lands in FTS.
        fts = FullTextIndex(str(tmp_path / "fts.db"))
        store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)
        try:
            doc = " ".join(f"newtoken{i}" for i in range(900))
            chunk_count = len(store._chunk_text(doc))
            assert chunk_count > 1
            real_index = fts.index_knowledge_chunk
            calls = 0

            def fail_second(chunk_id, content, source, chunk_index):
                nonlocal calls
                calls += 1
                if calls == 2:
                    return False
                return real_index(chunk_id, content, source, chunk_index)

            with patch.object(fts, "index_knowledge_chunk", side_effect=fail_second):
                outcome = await store.ingest(doc, "big.md", dedup=False)

            assert outcome.status == INGEST_FAILURE
            assert int(outcome) == 0
            # The FTS copy really is incomplete, which is why `stored` was
            # withheld: 8 of 9 chunks landed and the durability check refused.
            assert fts.count_knowledge_source("big.md") == chunk_count - 1
            assert store.source_is_durable("big.md") is False
        finally:
            store.close()
            if fts._conn is not None:
                fts._conn.close()

    async def test_a_lying_fts_write_is_caught_by_verification(self, tmp_path):
        """An FTS write that reports success but stores nothing is a failure."""
        store = _store(tmp_path)
        try:
            with patch.object(store._fts, "index_knowledge_chunk", return_value=True):
                outcome = await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            assert outcome.status == INGEST_FAILURE
            assert int(outcome) == 0
            assert store.source_is_durable("doc.md") is False
        finally:
            _close(store)

    async def test_a_raising_fts_write_is_a_failure(self, tmp_path):
        store = _store(tmp_path)
        try:
            with patch.object(
                store._fts, "index_knowledge_chunk", side_effect=RuntimeError("boom"),
            ):
                outcome = await store.ingest(SHORT_DOC, "doc.md", dedup=False)
            assert outcome.status == INGEST_FAILURE
            assert int(outcome) == 0
        finally:
            _close(store)

    async def test_stored_without_a_configured_fts_store_is_intended(self, tmp_path):
        """With no FTS store configured, durability is the DB alone.

        `source_is_durable` returns ``not require_fts`` when ``_fts`` is None,
        so `stored` here means "DB-verified", which is the established
        FTS-optional mode (``wiring.py`` only passes an FTS index when the
        search subsystem initialized). This is the one case where `stored`
        does not imply an FTS row, and it is by design.
        """
        store = KnowledgeStore(str(tmp_path / "knowledge.db"))
        try:
            outcome = await store.ingest(SHORT_DOC, "doc.md")
            assert outcome.status == INGEST_STORED
            assert int(outcome) == 1
            assert store._fts is None
            assert store.source_is_durable("doc.md") is True
        finally:
            store.close()


# ---------------------------------------------------------------------------
# Importer mapping
# ---------------------------------------------------------------------------


class TestImporterOutcomes:
    async def test_reimport_of_stored_file_reports_already_stored(self, tmp_path):
        """The operator ruling, end to end: same file imported twice."""
        store = _store(tmp_path)
        importer = BulkImporter(store)
        try:
            path = tmp_path / "doc.md"
            path.write_text(SHORT_DOC, encoding="utf-8")

            first = await importer.import_file(str(path))
            second = await importer.import_file(str(path))

            assert first.status == "ok"
            assert first.outcome == INGEST_STORED

            assert second.status == "ok"
            assert second.outcome == INGEST_UNCHANGED
            assert second.note == ALREADY_STORED_NOTE
            assert second.error == ""
            assert second.chunks == first.chunks
        finally:
            _close(store)

    async def test_identical_content_under_another_source_is_skipped_not_failed(self, tmp_path):
        store = _store(tmp_path)
        importer = BulkImporter(store)
        try:
            await store.ingest(SHORT_DOC, "elsewhere.md")
            path = tmp_path / "doc.md"
            path.write_text(SHORT_DOC, encoding="utf-8")

            result = await importer.import_file(str(path))

            assert result.status == "skipped"
            assert result.outcome == INGEST_DUPLICATE
            assert result.error == ""
            assert "already stored" in result.note
            assert "elsewhere.md" in result.note
            assert store.get_source_content(path.resolve().as_uri()) is None
        finally:
            _close(store)

    async def test_durability_failure_is_still_an_error(self, tmp_path):
        store = MagicMock()
        store.ingest = AsyncMock(return_value=IngestOutcome(0, INGEST_FAILURE))
        importer = BulkImporter(store)
        path = tmp_path / "doc.md"
        path.write_text(SHORT_DOC, encoding="utf-8")

        result = await importer.import_file(str(path))

        assert result.status == "error"
        assert result.outcome == INGEST_FAILURE
        assert result.error == DURABILITY_FAILURE_MESSAGE

    async def test_near_duplicate_import_is_skipped_with_the_existing_source(self, tmp_path):
        """The conflict branch names the durable source it collided with."""
        store = _store(tmp_path)
        importer = BulkImporter(store)
        try:
            doc = _long_doc("shared")
            assert int(await store.ingest(doc, "original.md")) > 1
            lines = doc.split("\n\n")
            lines[0] = "Paragraph 0: THIS IS ENTIRELY DIFFERENT CONTENT. " * 40
            near_copy = tmp_path / "near.md"
            near_copy.write_text("\n\n".join(lines), encoding="utf-8")

            result = await importer.import_file(str(near_copy))

            assert result.status == "skipped"
            assert result.outcome == INGEST_CONFLICT
            assert result.error == ""
            assert "original.md" in result.note
            assert "near-duplicate" in result.note
        finally:
            _close(store)

    async def test_conflict_note_without_a_named_source(self):
        """A store that reports no duplicate_of still yields a clear skip."""
        importer = BulkImporter(MagicMock())
        result = importer._classify_ingest(
            "doc.md", IngestOutcome(0, INGEST_CONFLICT),
        )
        assert result.status == "skipped"
        assert result.outcome == INGEST_CONFLICT
        assert "near-duplicate" in result.note

    async def test_plain_int_results_from_a_double_keep_old_semantics(self, tmp_path):
        """A store returning a bare int must not silently become a skip."""
        store = MagicMock()
        store.list_sources.return_value = []
        store.ingest = AsyncMock(return_value=3)
        importer = BulkImporter(store)
        path = tmp_path / "doc.md"
        path.write_text(SHORT_DOC, encoding="utf-8")

        positive = await importer._import_resolved_file(path, uploader="u")
        assert positive.status == "ok"
        assert positive.outcome == INGEST_STORED
        assert positive.chunks == 3

        store.ingest = AsyncMock(return_value=0)
        zero = await importer._import_resolved_file(path, uploader="u")
        assert zero.status == "error"
        assert zero.error == DURABILITY_FAILURE_MESSAGE

    async def test_unchanged_counts_as_success_and_duplicate_as_skipped(self, tmp_path):
        store = _store(tmp_path)
        importer = BulkImporter(store)
        try:
            await store.ingest(SHORT_DOC, "elsewhere.md")
            duplicate_path = tmp_path / "dup.md"
            duplicate_path.write_text(SHORT_DOC, encoding="utf-8")
            fresh_path = tmp_path / "fresh.md"
            fresh_path.write_text("entirely different content", encoding="utf-8")

            batch = await importer.import_batch([
                {"type": "file", "path": str(duplicate_path)},
                {"type": "file", "path": str(fresh_path)},
            ])

            assert batch.total == 2
            assert batch.succeeded == 1
            assert batch.failed == 0
            assert batch.skipped == 1
            duplicate_entry = next(r for r in batch.results if r["status"] == "skipped")
            assert duplicate_entry["outcome"] == INGEST_DUPLICATE
            assert duplicate_entry["note"]
            plain_entry = next(r for r in batch.results if r["status"] == "ok")
            assert "note" not in plain_entry
        finally:
            _close(store)

    async def test_ordinary_results_carry_no_extra_keys(self):
        """The published per-result shape stays {source, status, chunks, error}
        unless there is an outcome worth reporting."""
        plain = ImportResult(source="s", status="ok", chunks=2)
        assert plain.outcome == ""
        assert plain.note == ""

    async def test_web_url_reimport_reports_unchanged(self, tmp_path):
        from tests.test_knowledge_import import _mock_aiohttp_response

        store = _store(tmp_path)
        importer = BulkImporter(store)
        try:
            response = _mock_aiohttp_response(
                status=200,
                text_data="stable page body",
                headers={"Content-Type": "text/plain"},
            )
            with patch("src.tools.safe_fetch.safe_fetch", response):
                first = await importer.import_web_url("https://example.com/page")
                second = await importer.import_web_url("https://example.com/page")

            assert first.status == "ok" and first.outcome == INGEST_STORED
            assert second.status == "ok" and second.outcome == INGEST_UNCHANGED
            assert second.note == ALREADY_STORED_NOTE
        finally:
            _close(store)
