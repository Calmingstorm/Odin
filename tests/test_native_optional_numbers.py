"""Null and blank optional numbers in native tools (#716).

OpenAI-compatible and Ollama models may send ``null`` or ``""`` for an optional
field; the strict Codex adapter strips those placeholders, but these tools are
reached without it. Null or blank means "omitted" (the documented default),
any other non-number is a clear tool failure, and valid numbers, zero and
negatives included, behave exactly as before.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.discord.native_tools.channel_ops import ChannelOpsTools
from src.discord.native_tools.knowledge import KnowledgeTools
from src.tools.execution_outcome import ToolFailure
from src.tools.input_defaults import int_or_default


def _knowledge(sessions=None, store=None, audit=None):
    return KnowledgeTools(
        sessions=sessions or MagicMock(),
        get_knowledge_store=lambda: store,
        embedder=object(),
        audit=audit or MagicMock(),
    )


def _channel_ops():
    return ChannelOpsTools(sessions=MagicMock(), permissions=MagicMock(),
                           get_channel=lambda cid: None)


@pytest.mark.parametrize("blank", [None, "", "  "])
def test_int_or_default_treats_null_and_blank_as_omitted(blank):
    assert int_or_default(blank, 10) == 10


@pytest.mark.parametrize(("value", "expected"), [(0, 0), (-3, -3), (7, 7), ("12", 12)])
def test_int_or_default_keeps_given_numbers(value, expected):
    assert int_or_default(value, 10) == expected


@pytest.mark.parametrize("bad", ["many", [1], {"n": 1}])
def test_int_or_default_rejects_non_numbers(bad):
    with pytest.raises(ValueError):
        int_or_default(bad, 10)


@pytest.mark.parametrize("blank", [None, ""])
async def test_search_history_blank_limit_uses_default(blank):
    sessions = MagicMock()
    sessions.search_history = AsyncMock(return_value=[])
    await _knowledge(sessions=sessions)._handle_search_history({"query": "q", "limit": blank})
    assert sessions.search_history.await_args.kwargs["limit"] == 10


async def test_search_history_zero_and_caps_are_unchanged():
    sessions = MagicMock()
    sessions.search_history = AsyncMock(return_value=[])
    tools = _knowledge(sessions=sessions)
    await tools._handle_search_history({"query": "q", "limit": 0})
    assert sessions.search_history.await_args.kwargs["limit"] == 0
    await tools._handle_search_history({"query": "q", "limit": 99})
    assert sessions.search_history.await_args.kwargs["limit"] == 20


async def test_search_history_non_number_limit_is_a_tool_failure():
    out = await _knowledge()._handle_search_history({"query": "q", "limit": "many"})
    assert isinstance(out, ToolFailure) and "whole number" in out


@pytest.mark.parametrize("blank", [None, ""])
async def test_search_knowledge_blank_limit_uses_default(blank):
    store = MagicMock()
    store.search_hybrid = AsyncMock(return_value=[])
    await _knowledge(store=store)._handle_search_knowledge({"query": "q", "limit": blank})
    assert store.search_hybrid.await_args.kwargs["limit"] == 5


@pytest.mark.parametrize("blank", [None, ""])
async def test_search_audit_blank_numbers_and_flags_are_omitted(blank):
    seen = {}

    async def fake_search(entries, filters, limit):
        seen.update(filters=filters, limit=limit)
        return []

    with patch("src.discord.native_tools.knowledge.search_calls", fake_search):
        out = await _knowledge()._handle_search_audit(
            {"limit": blank, "min_duration_ms": blank, "has_error": blank})
    assert "No audit log entries" in out
    assert seen["limit"] == 20
    assert seen["filters"].min_duration_ms is None and seen["filters"].has_error is None


async def test_search_audit_non_number_is_a_tool_failure():
    out = await _knowledge()._handle_search_audit({"min_duration_ms": "slow"})
    assert isinstance(out, ToolFailure) and "whole numbers" in out


@pytest.mark.parametrize("blank", [None, ""])
async def test_purge_blank_count_uses_default(blank):
    tools = _channel_ops()
    message = MagicMock()
    message.channel.purge = AsyncMock(return_value=[])
    await tools._handle_purge(message, {"count": blank})
    assert message.channel.purge.await_args.kwargs["limit"] == 100


async def test_purge_non_number_count_purges_nothing():
    tools = _channel_ops()
    message = MagicMock()
    message.channel.purge = AsyncMock(return_value=[])
    out = await tools._handle_purge(message, {"count": "all"})
    assert isinstance(out, ToolFailure)
    message.channel.purge.assert_not_awaited()
    tools.sessions.reset.assert_not_called()


@pytest.mark.parametrize("blank", [None, ""])
async def test_read_channel_blank_limit_uses_default(blank):
    seen = {}

    class _History:
        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    channel = MagicMock()
    channel.id = 42

    def history(limit):
        seen["limit"] = limit
        return _History()

    channel.history = history
    message = MagicMock()
    message.channel = channel
    await _channel_ops()._handle_read_channel(message, {"limit": blank})
    assert seen["limit"] == 10


@pytest.mark.parametrize("blank", [None, ""])
async def test_create_poll_blank_duration_uses_default(blank):
    message = MagicMock()
    message.channel.send = AsyncMock()
    out = await _channel_ops()._handle_create_poll(
        message, {"question": "Lunch?", "options": ["a", "b"], "duration_hours": blank})
    assert out == "Poll created."
    poll = message.channel.send.await_args.kwargs["poll"]
    assert poll.duration.total_seconds() == 24 * 3600


async def test_search_knowledge_non_number_limit_is_a_tool_failure():
    store = MagicMock()
    store.search_hybrid = AsyncMock(return_value=[])
    out = await _knowledge(store=store)._handle_search_knowledge({"query": "q", "limit": "lots"})
    assert isinstance(out, ToolFailure) and "whole number" in out
    store.search_hybrid.assert_not_awaited()


async def test_read_channel_non_number_limit_is_a_tool_failure():
    channel = MagicMock()
    channel.id = 42
    message = MagicMock()
    message.channel = channel
    out = await _channel_ops()._handle_read_channel(message, {"limit": "lots"})
    assert isinstance(out, ToolFailure) and "whole number" in out


async def test_create_poll_non_number_duration_is_a_tool_failure():
    message = MagicMock()
    message.channel.send = AsyncMock()
    out = await _channel_ops()._handle_create_poll(
        message, {"question": "Lunch?", "options": ["a", "b"], "duration_hours": "soon"})
    assert isinstance(out, ToolFailure) and "whole number" in out
    message.channel.send.assert_not_awaited()
