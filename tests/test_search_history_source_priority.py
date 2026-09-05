"""B9: exact channel history cannot be crowded out by semantic session hits."""
from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.channel_logger import ChannelLogger
from src.discord.native_tools.knowledge import KnowledgeTools
from src.search.fts import FullTextIndex
from src.sessions.manager import SessionManager


@pytest.fixture
def history(tmp_path):
    manager = SessionManager(max_history=50, max_age_hours=24,
                             persist_dir=str(tmp_path / "sessions"))
    logger = ChannelLogger(tmp_path / "channel_logs")
    index = FullTextIndex(str(tmp_path / "fts.db"))
    assert index.available
    manager.set_channel_search(logger, index)
    manager._vector_store = SimpleNamespace(
        available=False, search_hybrid=AsyncMock(return_value=[]),
    )
    manager._embedder = object()
    yield manager, logger, index
    index._conn.close()


def _semantic(channel_id, timestamp, content="unrelated semantic suggestion"):
    return {"channel_id": channel_id, "timestamp": timestamp,
            "content": content, "type": "semantic"}


def _index(index, content, channel_id="logs", timestamp=100):
    assert index.index_channel_messages([
        {"content": content, "channel_id": channel_id, "ts": timestamp,
         "author": "test author"},
    ]) == 1


@pytest.mark.parametrize("limit", [1, 3, 10, 20])
async def test_exact_channel_match_precedes_saturated_semantic_results(history, limit):
    manager, _, index = history
    _index(index, "uniqueneedle exact channel match")
    semantic = [_semantic(f"semantic-{n}", 200 + n) for n in range(limit + 2)]
    manager._vector_store.search_hybrid.return_value = semantic

    results = await manager.search_history("uniqueneedle", limit=limit)

    assert len(results) == limit
    assert results[0]["type"] == "channel"
    assert "uniqueneedle" in results[0]["content"]
    assert results[1:] == semantic[:limit - 1]
    if limit == 1:
        manager._vector_store.search_hybrid.assert_not_awaited()
    else:
        manager._vector_store.search_hybrid.assert_awaited_once_with(
            "uniqueneedle", manager._embedder, limit=limit,
        )


async def test_current_archive_channel_then_semantic_order(history):
    manager, _, index = history
    manager.add_message("archive", "user", "needle archived", user_id="alice")
    manager._archive_session("archive")
    manager._sessions.pop("archive")
    manager.add_message("current", "user", "needle current", user_id="alice")
    _index(index, "needle channel")
    semantic = [_semantic(f"semantic-{n}", 200 + n) for n in range(4)]
    manager._vector_store.search_hybrid.return_value = semantic

    results = await manager.search_history("needle", limit=4)

    assert [r["channel_id"] for r in results] == ["current", "archive", "logs", "semantic-0"]
    assert results[-1] == semantic[0]


async def test_dedupe_still_uses_channel_and_timestamp_across_sources(history):
    manager, _, index = history
    manager.add_message("current", "user", "needle current")
    current = manager.get_or_create("current")
    timestamp = current.messages[0].timestamp
    _index(index, "needle duplicate current", "current", timestamp)
    _index(index, "needle log", "logs", 100)
    manager._vector_store.search_hybrid.return_value = [
        _semantic("current", timestamp), _semantic("logs", 100),
        _semantic("unique", 200), _semantic("unique", 200),
        _semantic("unique", 201),
    ]

    results = await manager.search_history("needle", limit=5)

    assert [(r["channel_id"], r["timestamp"]) for r in results] == [
        ("current", timestamp), ("logs", 100), ("unique", 200), ("unique", 201),
    ]
    assert results[1]["type"] == "channel"


async def test_time_and_reset_epoch_filters_retained_for_both_backends(history):
    manager, _, index = history
    manager._reset_epochs["reset"] = 300
    for channel_id, timestamp in [
        ("old", 50), ("new", 600), ("reset", 300), ("reset", 301), ("logs", 200),
    ]:
        _index(index, "needle channel", channel_id, timestamp)
    manager._vector_store.search_hybrid.return_value = [
        _semantic("old-semantic", 50), _semantic("new-semantic", 600),
        _semantic("reset", 299), _semantic("reset", 300),
        _semantic("reset", 302), _semantic("semantic", 400),
    ]

    results = await manager.search_history("needle", limit=20, after=100, before=500)

    assert {(r["channel_id"], r["timestamp"]) for r in results} == {
        ("reset", 301), ("logs", 200), ("reset", 302), ("semantic", 400),
    }
    assert [r["type"] for r in results] == ["channel", "channel", "semantic", "semantic"]


async def test_current_and_archive_user_filters_are_unchanged(history):
    manager, _, index = history
    manager.add_message("archive", "user", "needle alice archive", user_id="alice")
    manager.add_message("archive", "user", "needle bob archive", user_id="bob")
    manager._archive_session("archive")
    manager._sessions.pop("archive")
    manager.add_message("current", "user", "needle alice current", user_id="alice")
    manager.add_message("current", "user", "needle bob current", user_id="bob")
    _index(index, "needle channel")
    manager._vector_store.search_hybrid.return_value = [_semantic("semantic", 200)]

    results = await manager.search_history("needle", limit=4, user_id="alice")

    assert [r["user_id"] for r in results[:2]] == ["alice", "alice"]
    assert [r["type"] for r in results[2:]] == ["channel", "semantic"]


@pytest.mark.parametrize("limit", [1, 3])
async def test_scoped_search_keeps_existing_hybrid_then_channel_priority(history, limit):
    manager, _, index = history
    _index(index, "needle channel", "target", 100)
    _index(index, "needle other channel", "other", 101)
    manager._reset_epochs["target"] = 90
    semantic = _semantic("target", 200)
    manager._vector_store.search_hybrid.return_value = [
        _semantic("other", 200), _semantic("target", 80), semantic,
    ]

    results = await manager.search_history("needle", limit=limit, channel_id="target", after=50)

    assert results[0] == semantic
    assert all(r["channel_id"] == "target" for r in results)
    if limit == 1:
        assert results == [semantic]
    else:
        assert len(results) == 2
        assert results[1]["type"] == "channel"


async def test_keyword_fallback_also_precedes_semantic(history):
    manager, logger, _ = history
    manager._fts_index = None
    keyword = {"channel_id": "logs", "timestamp": 100, "type": "channel",
               "content": "needle keyword fallback"}
    logger.search = MagicMock(return_value=[keyword])
    manager._vector_store.search_hybrid.return_value = [_semantic("semantic", 200)]

    assert await manager.search_history("needle", limit=1) == [keyword]
    logger.search.assert_called_once_with("needle", 1)
    manager._vector_store.search_hybrid.assert_not_awaited()


async def test_channel_execution_error_is_not_hidden_by_semantic_saturation(history):
    manager, _, index = history
    index.search_channel_logs = MagicMock(side_effect=RuntimeError("FTS execution failure"))
    manager._vector_store.search_hybrid.return_value = [_semantic("semantic", 200)]

    with pytest.raises(RuntimeError, match="FTS execution failure"):
        await manager.search_history("needle", limit=1)
    manager._vector_store.search_hybrid.assert_not_awaited()


async def test_semantic_error_still_propagates_when_keyword_leaves_capacity(history):
    manager, _, index = history
    _index(index, "needle channel")
    manager._vector_store.search_hybrid.side_effect = RuntimeError("semantic execution failure")

    with pytest.raises(RuntimeError, match="semantic execution failure"):
        await manager.search_history("needle", limit=2)


@pytest.mark.parametrize("limit", [1, 10])
async def test_unscoped_native_search_finds_fresh_logged_marker(history, limit):
    """Real log -> FTS -> SessionManager -> native output, without live data."""
    manager, logger, index = history
    marker = "b9marker" + uuid.uuid4().hex
    message = SimpleNamespace(
        id="12345", channel=SimpleNamespace(id="scratch", guild=SimpleNamespace(id="test")),
        author=SimpleNamespace(id="author", display_name="tester", bot=False),
        content=f"Fresh marker {marker}", created_at=datetime.now(UTC), attachments=[],
    )
    logger.log_message(message)
    assert logger.index_to_fts(index) == 1
    manager._vector_store.search_hybrid.return_value = [
        _semantic(f"semantic-{n}", time.time() + n) for n in range(limit + 1)
    ]
    tools = KnowledgeTools(
        sessions=manager, get_knowledge_store=lambda: None, embedder=object(), audit=None,
    )

    output = await tools._handle_search_history({"query": marker, "limit": limit})

    # The query is echoed in the heading even on the broken path; inspect a result.
    result_lines = output.splitlines()[1:]
    assert len(result_lines) == limit
    assert "(channel):" in result_lines[0] and marker in result_lines[0]
