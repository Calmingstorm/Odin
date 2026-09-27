"""Scheduled digest host probes retain schedule identity and failures."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.tools import ToolResult
from tests.fakes import make_bot


@pytest.fixture
def bot(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return make_bot()


def _wire_domain_stubs(bot, aliases, dispatch):
    events = bot.scheduled_events
    events._host_registry = SimpleNamespace(active_aliases=lambda: aliases)
    events._get_channel = lambda _channel_id: SimpleNamespace(id="55", send=AsyncMock())
    events._tool_executor.check_permission = lambda *_args: ""
    events._tool_loop.dispatch_loop_tool_inner = dispatch
    events._audit.log_execution = AsyncMock()
    return events


@pytest.mark.asyncio
async def test_system_digest_uses_scheduler_identity_and_reports_denied_hosts(bot):
    identities = []

    async def dispatch(name, tool_input, _proxy, user_id):
        identities.append(user_id)
        return ToolResult(
            output="Unknown or disallowed host",
            ok=False,
            error="permission_denied",
            tool_name=name,
        )

    events = _wire_domain_stubs(bot, ("srv",), dispatch)
    raw, failed, total = await events._format_digest_raw(
        {"requester_id": None}, events._get_channel("55")
    )

    assert identities == ["scheduler", "scheduler"]
    assert failed == ["Disk (srv)", "Memory (srv)"]
    assert total == 2
    assert "Collection failed: Unknown or disallowed host" in raw


@pytest.mark.asyncio
async def test_user_digest_runs_as_its_requester(bot):
    identities = []

    async def dispatch(name, _tool_input, _proxy, user_id):
        identities.append(user_id)
        return ToolResult(output="ok", ok=True, tool_name=name)

    events = _wire_domain_stubs(bot, ("srv",), dispatch)
    raw, failed, total = await events._format_digest_raw(
        {"requester_id": "1234"}, events._get_channel("55")
    )

    assert identities == ["1234", "1234"]
    assert failed == []
    assert total == 2
    assert "ok" in raw


@pytest.mark.asyncio
async def test_digest_with_no_reachable_host_is_a_failed_run(bot):
    channel = SimpleNamespace(id="55", send=AsyncMock())

    async def dispatch(name, _tool_input, _proxy, _user_id):
        return ToolResult(
            output="SSH connection refused", ok=False, error="execution_error", tool_name=name
        )

    events = _wire_domain_stubs(bot, ("offline",), dispatch)
    events._get_channel = lambda _channel_id: channel
    with pytest.raises(RuntimeError, match="Digest collected no data: all 2 checks failed"):
        await events._on_scheduled_digest({"id": "D1", "channel_id": "55"})

    notice = channel.send.await_args.args[0]
    assert "Collection failed for every check (2 of 2)" in notice
    assert "Disk (offline)" in notice


@pytest.mark.asyncio
async def test_digest_with_no_configured_hosts_is_not_reported_healthy(bot):
    channel = SimpleNamespace(id="55", send=AsyncMock())
    events = _wire_domain_stubs(bot, (), AsyncMock())
    events._get_channel = lambda _channel_id: channel

    with pytest.raises(RuntimeError, match="No configured hosts"):
        await events._on_scheduled_digest({"id": "D2", "channel_id": "55"})

    assert channel.send.await_count == 1
    assert "Failed to collect data" in channel.send.await_args.args[0]


@pytest.mark.asyncio
async def test_cancelled_child_probe_is_reported_as_collection_failure(bot):
    events = _wire_domain_stubs(bot, ("srv",), AsyncMock())
    events._tool_loop.dispatch_loop_tool_inner = AsyncMock(
        side_effect=[asyncio.CancelledError(), ToolResult(output="mem ok", ok=True)]
    )

    raw, failed, total = await events._format_digest_raw(
        {"requester_id": None}, events._get_channel("55")
    )

    assert failed == ["Disk (srv)"]
    assert total == 2
    assert "Collection failed:" in raw
    assert "mem ok" in raw


@pytest.mark.asyncio
async def test_audit_failure_after_delivery_does_not_retry_digest(bot):
    channel = SimpleNamespace(id="55", send=AsyncMock())
    events = _wire_domain_stubs(bot, ("srv",), AsyncMock())
    events._get_channel = lambda _channel_id: channel
    events._tool_loop.dispatch_loop_tool_inner = AsyncMock(
        return_value=ToolResult(output="healthy", ok=True)
    )
    events._audit.log_execution = AsyncMock(side_effect=RuntimeError("audit unavailable"))

    await events._on_scheduled_digest({"id": "D3", "channel_id": "55"})

    assert channel.send.await_count == 1
    assert "healthy" in channel.send.await_args.args[0]
    events._audit.log_execution.assert_awaited_once()
