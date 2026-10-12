"""History provenance and exact invoking-request exclusion across sources."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.discord.channel_logger import ChannelLogger
from src.discord.native_tools.knowledge import KnowledgeTools
from src.search.fts import FullTextIndex
from src.sessions.manager import SessionManager


def tools(manager, channels=None):
    return KnowledgeTools(sessions=manager, get_knowledge_store=lambda: None,
                          embedder=None, audit=None,
                          get_channel=(channels or {}).get)


def manager(tmp_path):
    return SessionManager(max_history=50, max_age_hours=24,
                          persist_dir=str(tmp_path / "sessions"))


@pytest.mark.parametrize("dm", [False, True])
async def test_hit_has_channel_name_id_in_preview_and_retained_matches(tmp_path, dm):
    sessions = manager(tmp_path)
    sessions.add_message("123", "user", "needle " + "x" * 400,
                         message_id="old", channel_name="Aaron" if dm else "general", is_dm=dm)
    output = await tools(sessions)._handle_search_history({"query": "needle"})
    location = "DM with Aaron (id: 123)" if dm else "general (id: 123)"
    assert location in output
    assert location in output.matches[0]


async def test_cached_channel_supplies_legacy_name_and_dm_identity(tmp_path):
    sessions = manager(tmp_path)
    sessions.add_message("123", "user", "needle")
    channels = {123: SimpleNamespace(guild=None, recipient="Aaron")}
    output = await tools(sessions, channels)._handle_search_history({"query": "needle"})
    assert "DM with Aaron (id: 123)" in output
    channels[123] = SimpleNamespace(guild=object(), name="general")
    output = await tools(sessions, channels)._handle_search_history({"query": "needle"})
    assert "general (id: 123)" in output


async def test_current_request_only_excluded_with_limit_backfill_and_persistence(tmp_path):
    sessions = manager(tmp_path)
    sessions.add_message("123", "user", "needle same text", message_id="old",
                         channel_name="DM with Aaron", is_dm=True)
    sessions.add_message("123", "user", "needle same text", message_id="current")
    sessions.save_all()
    sessions = manager(tmp_path)
    sessions.load()
    request = SimpleNamespace(id="current", channel=SimpleNamespace(id="123"))
    result = await sessions.search_history("needle", limit=1,
                                           exclude_message=("123", "current"))
    assert [r["message_id"] for r in result] == ["old"]
    output = await tools(sessions)._handle_search_history({"query": "needle", "limit": 1}, request)
    assert "Found 1 result" in output and "DM with Aaron (id: 123)" in output
    # IDs are channel-scoped, not content-scoped, and only the caller is excluded.
    sessions.add_message("456", "user", "needle same text", message_id="current")
    result = await sessions.search_history("needle", exclude_message=("123", "current"))
    assert {(r["channel_id"], r["message_id"]) for r in result} == {
        ("123", "old"), ("456", "current")}


async def test_archived_request_excluded_without_consuming_limit(tmp_path):
    sessions = manager(tmp_path)
    sessions.add_message("123", "user", "needle old", message_id="old",
                         channel_name="general", is_dm=False)
    sessions.add_message("123", "user", "needle current", message_id="current")
    sessions._archive_session("123")
    sessions._sessions.clear()
    result = await sessions.search_history("needle", limit=1,
                                           exclude_message=("123", "current"))
    assert [r["message_id"] for r in result] == ["old"]
    assert result[0]["channel_name"] == "general"


@pytest.mark.parametrize("use_fts", [True, False])
async def test_channel_log_request_excluded_and_next_hit_backfills(tmp_path, use_fts):
    sessions = manager(tmp_path)
    logger = ChannelLogger(tmp_path / "logs")
    guild = SimpleNamespace(id=99)
    for message_id, timestamp in [("old", 100), ("current", 200)]:
        logger.log_message(SimpleNamespace(
            id=message_id, channel=SimpleNamespace(id=123, name="general", guild=guild),
            author=SimpleNamespace(id=1, name="Aaron", bot=False), attachments=[],
            content="needle " + message_id, created_at=datetime.fromtimestamp(timestamp, UTC)))
    index = FullTextIndex(str(tmp_path / "fts.db"))
    try:
        index.index_channel_messages([
            {"message_id": "current", "channel_id": "123", "content": "needle current", "ts": 200},
            {"message_id": "old", "channel_id": "123", "content": "needle old", "ts": 100},
        ])
        sessions.set_channel_search(logger, index if use_fts else None)
        result = await sessions.search_history("needle", limit=1,
                                               exclude_message=("123", "current"))
        assert [r["message_id"] for r in result] == ["old"]
    finally:
        index._conn.close()


async def test_handler_supplies_exact_current_message_identity():
    sessions = SimpleNamespace(search_history=AsyncMock(return_value=[]))
    request = SimpleNamespace(id=987, channel=SimpleNamespace(id=123))
    await tools(sessions)._handle_search_history({"query": "needle"}, request)
    sessions.search_history.assert_awaited_once_with(
        "needle", limit=10, exclude_message=("123", "987"))


async def test_legacy_session_without_identity_still_loads_and_searches(tmp_path):
    import json

    sessions = manager(tmp_path)
    (sessions.persist_dir / "123.json").write_text(json.dumps({
        "channel_id": "123", "messages": [
            {"role": "user", "content": "needle", "timestamp": 100}],
    }))
    sessions.load()
    output = await tools(sessions)._handle_search_history({"query": "needle"})
    assert "Unknown channel (id: 123)" in output


async def test_transport_adapter_is_registered_and_uses_observed_request():
    from src.discord.native_tools.registry import NativeToolDispatcher, register_native_handlers

    class Owner:
        def __getattr__(self, name):
            return AsyncMock()

    sessions = SimpleNamespace(search_history=AsyncMock(return_value=[]))
    knowledge = tools(sessions)
    owners = dict.fromkeys(("channel_ops", "media", "scheduling", "agents", "memory"), Owner())
    owners["knowledge"] = knowledge
    dispatcher = NativeToolDispatcher(
        owners=owners, skill_manager=None, tool_catalog=None,
        prompt_builder=None, channel_state=None)
    register_native_handlers(dispatcher)
    assert dispatcher._handlers["search_history"] == (
        "knowledge", "_handle_search_history_message", "msg_input")
    request = SimpleNamespace(id=987, channel=SimpleNamespace(id=123))
    await knowledge._handle_search_history_message(request, {"query": "needle"})
    sessions.search_history.assert_awaited_once_with(
        "needle", limit=10, exclude_message=("123", "987"))
