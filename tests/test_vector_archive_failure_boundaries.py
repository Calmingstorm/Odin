"""Isolated archive failures do not prevent indexing remaining archives."""

import json

import pytest

from src.search.errors import SearchExecutionError
from src.search.fts import FullTextIndex
from src.search.vectorstore import SessionVectorStore


@pytest.mark.asyncio
async def test_backfill_segments_skips_bad_archive_and_commits_good_one(tmp_path):
    archives = tmp_path / "archive"
    archives.mkdir()
    (archives / "a.json").write_text("{broken")
    (archives / "b.json").write_text(json.dumps({
        "channel_id": "room", "summary_segments": [
            {"summary": "retained segment", "start_ts": 1, "end_ts": 2, "source_count": 3},
        ],
    }))
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = SessionVectorStore(str(tmp_path / "sessions.db"), fts)
    assert await store.backfill_segments(archives, None) == 1
    assert store._get_segment_state_sync() == {"b"}
    assert len(fts.search_sessions("retained")) == 1
    # A second run repairs nothing and does not count the acknowledged archive twice.
    assert await store.backfill_segments(archives, None) == 0


@pytest.mark.asyncio
async def test_index_session_rejects_unreadable_archive_without_writing(tmp_path):
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    assert not await store.index_session(tmp_path / "missing.json", None)
    assert store._get_indexed_ids_sync() == set()


def test_fts_repair_rejects_unacknowledged_segment(tmp_path, monkeypatch):
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = SessionVectorStore(str(tmp_path / "sessions.db"), fts)
    store._conn.execute(
        "INSERT INTO session_archives (doc_id, content, channel_id, last_active) "
        "VALUES (?, ?, ?, ?)", ("seg:missing", "repair me", "room", 2),
    )
    store._conn.commit()
    monkeypatch.setattr(fts, "index_session", lambda *_: False)
    with pytest.raises(RuntimeError, match="FTS repair did not acknowledge"):
        store._repair_segment_fts_sync()


@pytest.mark.asyncio
async def test_search_hybrid_no_backend_and_empty_backend(tmp_path):
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    store._has_vec = False
    with pytest.raises(SearchExecutionError, match="no session search backend"):
        await store.search_hybrid("needle", None)
    store._fts = FullTextIndex(str(tmp_path / "fts.db"))
    assert await store.search_hybrid("needle", None) == []


@pytest.mark.asyncio
async def test_backfill_legacy_archives_skips_invalid_json_and_indexes_valid(tmp_path):
    archives = tmp_path / "archive"
    archives.mkdir()
    (archives / "a.json").write_text("{truncated")
    (archives / "b.json").write_text(json.dumps({
        "channel_id": "room", "last_active": 3,
        "messages": [{"role": "user", "content": "searchable archive"}],
    }))
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = SessionVectorStore(str(tmp_path / "sessions.db"), fts)
    # The first archive is unreadable; backfill must still write and index the second.
    assert await store.backfill(archives, None) == 1
    assert store._get_indexed_ids_sync() == {"b"}
    assert [r["doc_id"] for r in fts.search_sessions("searchable")] == ["b"]


@pytest.mark.asyncio
async def test_segment_only_archive_without_summary_is_acknowledged(tmp_path):
    archive = tmp_path / "segment_only.json"
    archive.write_text(json.dumps({
        "channel_id": "room", "summary_segments": [
            {"summary": "", "start_ts": 1, "end_ts": 2},
            {"summary": "recoverable segment", "start_ts": 1, "end_ts": 3},
        ],
    }))
    store = SessionVectorStore(str(tmp_path / "sessions.db"),
                               FullTextIndex(str(tmp_path / "fts.db")))
    assert await store.index_session(archive, None)
    assert store._get_segment_state_sync() == {"segment_only"}
    assert len(store._fts.search_sessions("recoverable")) == 1


def test_fts_backfill_skips_bad_archive_and_missing_text(tmp_path):
    archives = tmp_path / "archive"
    archives.mkdir()
    (archives / "a.json").write_text("{truncated")
    (archives / "b.json").write_text(json.dumps({"channel_id": "room"}))
    (archives / "c.json").write_text(json.dumps({
        "channel_id": "room", "messages": [
            {"role": "user", "content": "restored searchable text"},
        ],
    }))
    fts = FullTextIndex(str(tmp_path / "fts.db"))
    store = SessionVectorStore(str(tmp_path / "sessions.db"), fts)
    store._backfill_fts_sync(archives)
    assert [row["doc_id"] for row in fts.search_sessions("restored")] == ["c"]
    assert not fts.has_session("a")
    assert not fts.has_session("b")
