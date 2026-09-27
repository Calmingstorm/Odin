"""Exercise the digest's many-failed-check summary using fake-only deps."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.scheduled_events import ScheduledEventHandlers, ScheduledEventsDeps
from src.tools import ToolResult


@pytest.mark.asyncio
async def test_digest_summarizes_many_failures_with_bounded_label_list():
    channel = SimpleNamespace(send=AsyncMock())
    aliases = tuple(f"host-{index}" for index in range(6))
    failure = ToolResult(
        output="unavailable", ok=False, error="execution_error", tool_name="run_command"
    )
    tool_loop = MagicMock(
        dispatch_loop_tool_inner=AsyncMock(
            side_effect=[failure] * 11 + [ToolResult(output="healthy", ok=True)]
        )
    )
    deps = ScheduledEventsDeps(
        get_config=lambda: SimpleNamespace(tools=SimpleNamespace(hosts={})),
        get_channel=lambda _channel_id: channel,
        get_guilds=lambda: [],
        tool_executor=MagicMock(check_permission=MagicMock(return_value="")),
        audit=MagicMock(log_execution=AsyncMock(), log_event=AsyncMock()),
        llm_gateway=SimpleNamespace(
            active_client=SimpleNamespace(chat=AsyncMock(return_value="partial summary"))
        ),
        tool_loop=tool_loop,
        agent_task_tools=MagicMock(),
        host_registry=SimpleNamespace(active_aliases=lambda: aliases),
    )
    handlers = ScheduledEventHandlers(deps)

    await handlers._on_scheduled_digest({"id": "D-many", "channel_id": "42"})

    assert tool_loop.dispatch_loop_tool_inner.await_count == 12
    notice = channel.send.await_args.args[0]
    assert "partial summary" in notice
    assert "Collection failed for 11 of 12 checks:" in notice
    assert "Disk (host-0)" in notice
    assert "Memory (host-4)" in notice
    assert "…" in notice
    assert "Disk (host-5)" not in notice
