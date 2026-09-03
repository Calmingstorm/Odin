"""Failure-injection coverage for DB/FTS knowledge durability.

These tests drive public store/index operations.  The injected faults sit at the
SQLite or FTS boundary so each assertion pins the production route that must
refuse a partial write or restore a searchable snapshot.
"""

from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest

from src.knowledge.store import VECTOR_DIM, KnowledgeStore
from src.search.fts import FullTextIndex


class _ConnectionProxy:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def __getattr__(self, name):
        return getattr(self.conn, name)


class _FailExecuteOnce(_ConnectionProxy):
    def __init__(self, conn: sqlite3.Connection, needle: str) -> None:
        super().__init__(conn)
        self.needle = needle
        self.failed = False

    def execute(self, sql, parameters=()):
        if not self.failed and self.needle in sql:
            self.failed = True
            raise sqlite3.OperationalError("injected execute failure")
        return self.conn.execute(sql, parameters)


class _FailCommitOnce(_ConnectionProxy):
    def __init__(self, conn: sqlite3.Connection) -> None:
        super().__init__(conn)
        self.failed = False

    def commit(self):
        if not self.failed:
            self.failed = True
            raise sqlite3.OperationalError("injected commit failure")
        return self.conn.commit()


class _SwallowKnowledgeInsert(_ConnectionProxy):
    def execute(self, sql, parameters=()):
        if "INSERT OR REPLACE INTO knowledge_chunks" in sql:
            return self.conn.execute("SELECT 1")
        return self.conn.execute(sql, parameters)


class _EmptyVectorRead(_ConnectionProxy):
    class _Rows:
        @staticmethod
        def fetchall():
            return []

    def execute(self, sql, parameters=()):
        if "SELECT v.chunk_id FROM knowledge_vec" in sql:
            return self._Rows()
        return self.conn.execute(sql, parameters)


class _Embedder:
    async def embed(self, _text: str) -> list[float]:
        return [0.0] * VECTOR_DIM


def _dual_store(tmp_path: Path) -> tuple[KnowledgeStore, FullTextIndex]:
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = KnowledgeStore(str(tmp_path / "knowledge.db"), fts_index=fts)
    assert store.available and fts.available
    return store, fts


def _close(store: KnowledgeStore, fts: FullTextIndex) -> None:
    store.close()
    if fts._conn is not None:
        fts._conn.close()


def _long_document(token: str) -> str:
    return " ".join(f"{token}-{i}" for i in range(900))


class TestFullTextTransactionalFailures:
    def test_replacement_insert_failure_rolls_back_prior_delete(self, tmp_path):
        index = FullTextIndex(str(tmp_path / "fts.db"))
        assert index.index_knowledge_chunk("k1", "old searchable token", "doc", 0)
        before = index.get_knowledge_source_rows("doc")
        real_conn = index._conn
        assert real_conn is not None
        index._conn = _FailExecuteOnce(real_conn, "INSERT INTO knowledge_fts")

        assert not index.index_knowledge_chunk("k1", "new token", "doc", 0)
        assert index._conn.failed
        assert index.get_knowledge_source_rows("doc") == before
        assert index.search_knowledge("old")
        index._conn = real_conn
        real_conn.close()

    def test_exact_chunk_delete_failure_rolls_back(self, tmp_path):
        index = FullTextIndex(str(tmp_path / "fts.db"))
        assert index.index_knowledge_chunk("k1", "one", "doc", 0)
        assert index.index_knowledge_chunk("k2", "two", "doc", 1)
        before = index.get_knowledge_source_rows("doc")
        real_conn = index._conn
        assert real_conn is not None
        index._conn = _FailCommitOnce(real_conn)

        assert index.delete_knowledge_chunks({"k1", "k2"}) == 0
        assert index._conn.failed
        assert index.get_knowledge_source_rows("doc") == before
        assert index.delete_knowledge_chunks(set()) == 0
        index._conn = real_conn
        real_conn.close()

    def test_source_delete_failure_rolls_back_and_count_is_unchanged(self, tmp_path):
        index = FullTextIndex(str(tmp_path / "fts.db"))
        assert index.index_knowledge_chunk("k1", "one", "doc", 0)
        assert index.count_knowledge_source("doc") == 1
        real_conn = index._conn
        assert real_conn is not None
        index._conn = _FailCommitOnce(real_conn)

        assert index.delete_knowledge_source("doc") == 0
        assert index._conn.failed
        assert index.count_knowledge_source("doc") == 1
        index._conn = real_conn
        real_conn.close()


class TestIngestFailureDetection:
    async def test_non_durable_duplicate_is_not_treated_as_stored(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            content = "duplicate body that must remain searchable"
            assert await store.ingest(content, "broken.md", dedup=False) == 1
            assert fts.delete_knowledge_source("broken.md") == 1

            assert await store.ingest(content, "replacement.md") == 1

            assert store.source_is_durable("replacement.md", expected_chunks=1)
            assert store.get_source_content("broken.md") == content
            assert not fts.has_knowledge_source("broken.md")
            assert fts.search_knowledge("searchable")[0]["source"] == "replacement.md"
        finally:
            _close(store, fts)

    async def test_db_insert_exception_refuses_ingest(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            store._conn.execute(
                "CREATE TRIGGER fail_doc_insert BEFORE INSERT ON knowledge_chunks "
                "WHEN NEW.source = 'broken.md' BEGIN "
                "SELECT RAISE(ABORT, 'injected insert failure'); END"
            )
            store._conn.commit()

            assert await store.ingest("body", "broken.md", dedup=False) == 0
            assert store.get_source_content("broken.md") is None
            assert not fts.has_knowledge_source("broken.md")
            assert store.get_versions("broken.md") == []
        finally:
            _close(store, fts)

    async def test_db_commit_exception_rolls_back_and_reports_zero(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        real_conn = store._conn
        assert real_conn is not None
        store._conn = _FailCommitOnce(real_conn)
        try:
            assert await store.ingest("commit failure body", "broken.md", dedup=False) == 0
            assert store._conn.failed
            assert store.get_source_content("broken.md") is None
            assert store.get_versions("broken.md") == []
        finally:
            store._conn = real_conn
            _close(store, fts)

    async def test_missing_db_row_fails_post_write_verification(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        real_conn = store._conn
        assert real_conn is not None
        store._conn = _SwallowKnowledgeInsert(real_conn)
        try:
            assert await store.ingest("missing DB row", "broken.md", dedup=False) == 0
            assert store.get_source_content("broken.md") is None
            assert store.get_versions("broken.md") == []
        finally:
            store._conn = real_conn
            _close(store, fts)

    async def test_unreadable_fts_rows_fail_post_write_verification(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            with patch.object(
                fts, "get_knowledge_source_rows", side_effect=RuntimeError("probe failed")
            ) as probe:
                assert await store.ingest("probe failure body", "broken.md", dedup=False) == 0
            assert probe.call_count >= 1
            assert store.get_versions("broken.md") == []
        finally:
            _close(store, fts)

    async def test_obsolete_fts_delete_mismatch_refuses_update(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            old = _long_document("old")
            assert await store.ingest(old, "doc.md", dedup=False) > 1
            initial_versions = len(store.get_versions("doc.md"))
            with patch.object(fts, "delete_knowledge_chunks", return_value=0) as retire:
                assert await store.ingest("short replacement", "doc.md", dedup=False) == 0
            retire.assert_called_once()
            assert len(store.get_versions("doc.md")) == initial_versions
            assert fts.search_knowledge("old")
        finally:
            _close(store, fts)

    async def test_obsolete_db_delete_exception_refuses_update(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            old = _long_document("old")
            assert await store.ingest(old, "doc.md", dedup=False) > 1
            old_hash = KnowledgeStore._content_hash(old)
            old_ids = {row["chunk_id"] for row in store.get_source_chunks("doc.md")}
            store._conn.execute(
                "CREATE TRIGGER fail_old_retire BEFORE DELETE ON knowledge_chunks "
                "WHEN OLD.source = 'doc.md' AND OLD.doc_content_hash = '"
                + old_hash
                + "' BEGIN SELECT RAISE(ABORT, 'injected retire failure'); END"
            )
            store._conn.commit()

            assert await store.ingest("short replacement", "doc.md", dedup=False) == 0
            assert old_ids.issubset({row["chunk_id"] for row in store.get_source_chunks("doc.md")})
            assert fts.search_knowledge("replacement")
        finally:
            _close(store, fts)

    async def test_final_durability_probe_refuses_lost_desired_fts_row(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            old = _long_document("old")
            assert await store.ingest(old, "doc.md", dedup=False) > 1
            new = "short final verification replacement"
            desired_id = (
                f"{hashlib.md5(b'doc.md').hexdigest()[:8]}_0_"
                f"{KnowledgeStore._content_hash(new)[:12]}"
            )
            real_delete = fts.delete_knowledge_chunks

            def retire_old_and_drop_desired(chunk_ids):
                removed = real_delete(chunk_ids)
                assert real_delete({desired_id}) == 1
                return removed

            with patch.object(
                fts, "delete_knowledge_chunks", side_effect=retire_old_and_drop_desired
            ) as retire:
                assert await store.ingest(new, "doc.md", dedup=False) == 0
            assert retire.call_count == 1
            assert store.get_source_content("doc.md") == new
            assert not fts.has_knowledge_chunk(desired_id)
            assert not store.source_is_durable("doc.md")
        finally:
            _close(store, fts)

    async def test_vector_verification_mismatch_refuses_ingest(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        if not store._has_vec:
            pytest.skip("sqlite-vec unavailable")
        real_conn = store._conn
        assert real_conn is not None
        store._conn = _EmptyVectorRead(real_conn)
        try:
            assert (
                await store.ingest(
                    "vector verification body", "vector.md", embedder=_Embedder(), dedup=False
                )
                == 0
            )
            assert store.get_versions("vector.md") == []
            assert store.source_is_durable("vector.md", expected_chunks=1)
        finally:
            store._conn = real_conn
            _close(store, fts)


class TestConfirmedDeleteFailureDetection:
    async def test_refuses_without_both_stores_and_for_missing_source(self, tmp_path):
        store = KnowledgeStore(str(tmp_path / "knowledge-only.db"))
        try:
            assert await store.ingest("body", "doc.md", dedup=False) == 1
            assert await store.delete_source_confirmed_async("doc.md") == 0
            assert store.get_source_content("doc.md") == "body"
        finally:
            store.close()

        store, fts = _dual_store(tmp_path)
        try:
            assert await store.delete_source_confirmed_async("missing.md") == 0
        finally:
            _close(store, fts)

    async def test_survivor_count_mismatch_refuses_before_delete(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            assert await store.ingest("legacy", "legacy.md", dedup=False) == 1
            assert await store.ingest("canonical", "canonical.md", dedup=False) == 1
            assert (
                await store.delete_source_confirmed_async(
                    "legacy.md", survivor_source="canonical.md", survivor_expected_chunks=2
                )
                == 0
            )
            assert store.source_is_durable("legacy.md", expected_chunks=1)
        finally:
            _close(store, fts)

    @pytest.mark.parametrize("mode", ["committed_but_reported_zero", "claimed_without_delete"])
    async def test_unconfirmed_fts_delete_restores_db_snapshot(self, tmp_path, mode):
        store, fts = _dual_store(tmp_path)
        try:
            content = _long_document("snapshot")
            expected = await store.ingest(content, "legacy.md", dedup=False)
            before = fts.get_knowledge_source_rows("legacy.md")
            real_delete = fts.delete_knowledge_source

            def faulty_delete(source):
                if mode == "committed_but_reported_zero":
                    assert real_delete(source) == expected
                    return 0
                return expected

            with patch.object(fts, "delete_knowledge_source", side_effect=faulty_delete) as delete:
                assert await store.delete_source_confirmed_async("legacy.md") == 0
            delete.assert_called_once_with("legacy.md")
            db_rows = [
                (str(row[0]), str(row[1]), int(row[2]))
                for row in store._conn.execute(
                    "SELECT chunk_id, content, chunk_index FROM knowledge_chunks "
                    "WHERE source = ? ORDER BY chunk_id",
                    ("legacy.md",),
                ).fetchall()
            ]
            assert fts.get_knowledge_source_rows("legacy.md") == before == db_rows
            assert store.source_is_durable("legacy.md", expected_chunks=expected)
        finally:
            _close(store, fts)

    async def test_silent_db_delete_refusal_is_detected_after_commit(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            content = "same content protected by canonical survivor"
            assert await store.ingest(content, "legacy.md", dedup=False) == 1
            assert await store.ingest(content, "canonical.md", dedup=False) == 1
            store._conn.execute(
                "CREATE TRIGGER ignore_legacy_delete BEFORE DELETE ON knowledge_chunks "
                "WHEN OLD.source = 'legacy.md' BEGIN SELECT RAISE(IGNORE); END"
            )
            store._conn.commit()

            assert (
                await store.delete_source_confirmed_async(
                    "legacy.md",
                    survivor_source="canonical.md",
                    survivor_expected_chunks=1,
                    survivor_content_hash=KnowledgeStore._content_hash(content),
                    expected_source_hash=KnowledgeStore._content_hash(content),
                )
                == 0
            )
            assert store.source_is_durable("canonical.md", expected_chunks=1)
            assert store.get_source_content("legacy.md") == content
            assert not fts.has_knowledge_source("legacy.md")
        finally:
            _close(store, fts)

    async def test_failed_restore_after_db_delete_exception_is_reported(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            assert await store.ingest("legacy body", "legacy.md", dedup=False) == 1
            store._conn.execute(
                "CREATE TRIGGER fail_delete BEFORE DELETE ON knowledge_chunks "
                "WHEN OLD.source = 'legacy.md' BEGIN "
                "SELECT RAISE(ABORT, 'injected DB delete failure'); END"
            )
            store._conn.commit()
            restore_attempted = False

            def fail_restore(chunk_id, content, source, chunk_index):
                nonlocal restore_attempted
                restore_attempted = True
                return False

            with patch.object(fts, "index_knowledge_chunk", side_effect=fail_restore):
                assert await store.delete_source_confirmed_async("legacy.md") == 0
            assert restore_attempted
            assert store.get_source_content("legacy.md") == "legacy body"
            assert not fts.has_knowledge_source("legacy.md")
            assert store.backfill_fts() == 1
            assert store.source_is_durable("legacy.md", expected_chunks=1)
        finally:
            _close(store, fts)

    async def test_confirmed_delete_records_version_only_after_absence(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            assert await store.ingest("body", "doc.md", dedup=False) == 1
            assert await store.delete_source_async("doc.md") == 1
            versions = store.get_versions("doc.md")
            assert versions[0]["action"] == "delete"
            assert not fts.has_knowledge_source("doc.md")
        finally:
            _close(store, fts)

    async def test_merge_refuses_non_durable_survivor(self, tmp_path):
        store, fts = _dual_store(tmp_path)
        try:
            assert await store.ingest("keep body", "keep.md", dedup=False) == 1
            assert await store.ingest("remove body", "remove.md", dedup=False) == 1
            assert fts.delete_knowledge_source("keep.md") == 1

            assert store.merge_sources("keep.md", "remove.md") == 0
            assert store.get_source_content("remove.md") == "remove body"
            assert fts.has_knowledge_source("remove.md")
        finally:
            _close(store, fts)


class TestBackfillDurability:
    async def test_backfill_counts_only_verified_fts_writes(self, tmp_path):
        store = KnowledgeStore(str(tmp_path / "knowledge.db"))
        fts = FullTextIndex(str(tmp_path / "fts.db"))
        try:
            assert await store.ingest("backfill body", "doc.md", dedup=False) == 1
            store._fts = fts
            with patch.object(fts, "index_knowledge_chunk", return_value=False) as failed:
                assert store.backfill_fts() == 0
            failed.assert_called_once()
            assert not fts.has_knowledge_source("doc.md")

            assert store.backfill_fts() == 1
            assert store.source_is_durable("doc.md", expected_chunks=1)
            assert store.backfill_fts() == 0
        finally:
            _close(store, fts)
