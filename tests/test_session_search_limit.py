"""search_history returns at most `limit` results, from every source, in order."""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from src.sessions.manager import Message, Session, SessionManager


def _manager(tmp_path) -> SessionManager:
    return SessionManager(
        max_history=50, max_age_hours=24, persist_dir=str(tmp_path), token_budget=256_000,
    )


def _populate(manager: SessionManager, tmp_path: Path) -> None:
    now = time.time()
    for i in range(6):
        cid = f"ch{i}"
        session = Session(
            channel_id=cid,
            summary=f"summary {i}: the * marker and plain words",
            messages=[Message(role="user", content=f"message {i} with the * marker",
                              timestamp=now - i, user_id="u1")],
        )
        session.summary_segments = [
            {"summary": f"segment {i}.{j} keeps the * marker", "start_ts": now - 100 - j,
             "end_ts": now - 50 - j}
            for j in range(4)
        ]
        manager._sessions[cid] = session
    archive = tmp_path / "archive"
    archive.mkdir(exist_ok=True)
    for i in range(5):
        data = {
            "channel_id": f"old{i}", "summary": f"archived summary {i} with the * marker",
            "messages": [], "created_at": now - 7200, "last_active": now - 3600 - i,
        }
        (archive / f"old{i}_{int(now) - i}.json").write_text(json.dumps(data))


@pytest.mark.parametrize("limit", [1, 2, 3, 5, 9, 25])
async def test_limit_holds_for_summaries_and_segments(tmp_path, limit):
    manager = _manager(tmp_path)
    _populate(manager, tmp_path)

    results = await manager.search_history("*", limit=limit)

    assert len(results) <= limit


@pytest.mark.parametrize("limit", [1, 3, 7])
async def test_first_n_keep_the_existing_order(tmp_path, limit):
    manager = _manager(tmp_path)
    _populate(manager, tmp_path)

    everything = await manager.search_history("marker", limit=200)
    first = await manager.search_history("marker", limit=limit)

    key = lambda r: (r["type"], r["channel_id"], r["content"])
    assert [key(r) for r in first] == [key(r) for r in everything[:limit]]


async def test_archived_summaries_respect_the_limit(tmp_path):
    manager = _manager(tmp_path)
    _populate(manager, tmp_path)

    results = manager._search_archives("archived summary", 2)

    assert len(results) == 2
    assert manager._search_archives("archived summary", 0) == []


@pytest.mark.parametrize("query", [" ", "   ", "\t", "\n"])
async def test_whitespace_only_query_matches_nothing(tmp_path, query):
    manager = _manager(tmp_path)
    _populate(manager, tmp_path)

    assert await manager.search_history(query, limit=10) == []


async def test_meaningful_whitespace_is_not_stripped(tmp_path):
    manager = _manager(tmp_path)
    _populate(manager, tmp_path)

    results = await manager.search_history(" with the", limit=50)

    assert results
    assert all(" with the" in r["content"] for r in results)


async def test_star_stays_a_literal_match(tmp_path):
    manager = _manager(tmp_path)
    manager._sessions["only"] = Session(
        channel_id="only", summary="no star here",
        messages=[Message(role="user", content="a * b", timestamp=time.time(), user_id="u1")],
    )

    results = await manager.search_history("*", limit=10)

    assert [r["content"] for r in results] == ["a * b"]
