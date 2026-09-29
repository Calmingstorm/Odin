"""Bounded raw fallback through the real scheduled digest callback."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.discord.scheduled_events import ScheduledEventHandlers, ScheduledEventsDeps


@pytest.mark.parametrize("failed_summary", [False, True])
async def test_raw_digest_fallback_is_bounded_including_heading_and_failures(failed_summary):
    sent = []

    async def send(text):
        assert len(text) <= 2000
        sent.append(text)

    channel = SimpleNamespace(send=send)
    client = SimpleNamespace(chat=AsyncMock(side_effect=RuntimeError("summary unavailable")))
    handler = ScheduledEventHandlers(ScheduledEventsDeps(
        get_config=lambda: SimpleNamespace(), get_channel=lambda _: channel,
        get_guilds=lambda: [], tool_executor=MagicMock(),
        audit=MagicMock(log_execution=AsyncMock()),
        llm_gateway=SimpleNamespace(active_client=client if failed_summary else None),
        tool_loop=MagicMock(), agent_task_tools=MagicMock(),
    ))
    handler._format_digest_raw = AsyncMock(return_value=("x" * 5000, ["disk" * 100], 2))
    await handler._on_scheduled_digest({"id": "fixture", "channel_id": "42"})
    assert len(sent) == 2
    assert "".join(sent) == ("**Daily Infrastructure Digest**\n\n" + "x" * 3000
                             + "\n\nCollection failed for 1 of 2 checks: " + "disk" * 100)
