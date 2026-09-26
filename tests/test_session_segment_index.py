"""Archived summary segments retain independent, recoverable search identities."""
from __future__ import annotations

import json

from src.search.fts import FullTextIndex
from src.search.vectorstore import SessionVectorStore, summary_segment_doc_id
from src.sessions.manager import SessionManager


def _archive(path, segments, *, messages=None, summary=""):
    path.write_text(json.dumps({"channel_id": "room", "summary": summary,
                                "messages": messages or [], "summary_segments": segments,
                                "last_active": 110}))


async def test_segment_only_backfill_is_idempotent_and_hybrid_finds_canonical_id(tmp_path):
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    segment = {"summary": "uniquearchivefact about deployment", "start_ts": 40,
               "end_ts": 50, "source_count": 3, "participants": ["alice"]}
    _archive(archive_dir / "first.json", [segment])
    _archive(archive_dir / "second.json", [segment])
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = SessionVectorStore(str(tmp_path / "sessions.db"), fts_index=fts)
    assert await store.backfill_segments(archive_dir, None) == 2
    assert await store.backfill_segments(archive_dir, None) == 0
    assert await store.index_session(archive_dir / "first.json", None)
    canonical = summary_segment_doc_id("room", segment)
    results = await store.search_hybrid("uniquearchivefact", None)
    assert [r["doc_id"] for r in results] == [canonical]
    assert store._conn.execute("SELECT COUNT(*) FROM session_archives WHERE doc_id = ?",
                               (canonical,)).fetchone()[0] == 1
    assert store._conn.execute("SELECT message_count FROM session_archives WHERE doc_id = ?",
                               (canonical,)).fetchone()[0] == 3
    fts._conn.execute("DELETE FROM session_fts WHERE doc_id = ?", (canonical,))
    fts._conn.commit()
    assert await store.backfill_segments(archive_dir, None) == 0
    assert fts.has_session(canonical)
    fts._conn.close()
    store._conn.close()


async def test_unacknowledged_fts_write_retries_on_next_backfill(tmp_path):
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    segment = {"summary": "recoverablefact", "start_ts": 1, "end_ts": 2}
    _archive(archive_dir / "one.json", [segment])
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = SessionVectorStore(str(tmp_path / "sessions.db"), fts_index=fts)
    original = fts.index_session
    fts.index_session = lambda *args: False
    assert await store.backfill_segments(archive_dir, None) == 0
    assert store._conn.execute("SELECT COUNT(*) FROM segment_index_state").fetchone()[0] == 0
    fts.index_session = original
    assert await store.backfill_segments(archive_dir, None) == 1
    assert fts.has_session(summary_segment_doc_id("room", segment))
    fts._conn.close()
    store._conn.close()


async def test_fts_ack_before_metadata_commit_retries_missing_segment(tmp_path):
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    segment = {"summary": "interruptedfact", "start_ts": 1, "end_ts": 2}
    _archive(archive_dir / "one.json", [segment])
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = SessionVectorStore(str(tmp_path / "sessions.db"), fts_index=fts)
    store._conn.execute("CREATE TRIGGER abort_segment_state BEFORE INSERT ON "
                        "segment_index_state BEGIN SELECT RAISE(ABORT, 'interrupted'); END")
    store._conn.commit()
    assert await store.backfill_segments(archive_dir, None) == 0
    canonical = summary_segment_doc_id("room", segment)
    assert fts.has_session(canonical)
    assert not store._segment_exists_sync(canonical)
    store._conn.execute("DROP TRIGGER abort_segment_state")
    store._conn.commit()
    assert await store.backfill_segments(archive_dir, None) == 1
    assert store._segment_exists_sync(canonical)
    fts._conn.close()
    store._conn.close()


async def test_archive_search_dedupes_before_limit_and_respects_participants_and_reset(tmp_path):
    manager = SessionManager(max_history=50, max_age_hours=24, persist_dir=str(tmp_path))
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    segment = {"summary": "rarearchivedfact", "start_ts": 5, "end_ts": 10,
               "participants": ["alice", "bob"]}
    for name in ("one", "two"):
        _archive(archive_dir / f"{name}.json", [segment])
    assert len(await manager.search_history("rarearchivedfact", limit=2)) == 1
    assert len(await manager.search_history("rarearchivedfact", user_id="alice")) == 1
    assert await manager.search_history("rarearchivedfact", user_id="other") == []
    manager._reset_epochs["room"] = 10
    assert await manager.search_history("rarearchivedfact") == []
