"""A5/D7 lifecycle events through the real outbound-webhook dispatcher."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.discord.turn_recorder import TurnRecorder
from src.notifications.outbound_webhooks import (
    DeliveryResult,
    OutboundWebhookDispatcher,
)


def _recorder(dispatcher):
    return TurnRecorder(
        get_config=lambda: None,
        trajectory_saver=None,
        reflector=None,
        outbound_webhook_dispatcher=dispatcher,
        loop_reflection_gate=None,
    )


@pytest.mark.asyncio
async def test_lifecycle_event_reaches_real_dispatcher_as_one_scrubbed_envelope(monkeypatch):
    """The recorder supplies raw data; the dispatcher owns envelope construction."""
    monkeypatch.setattr("src.tools.url_safety.is_url_blocked", lambda _: False)
    detached: list[asyncio.Task] = []
    monkeypatch.setattr(
        "src.async_utils.fire_and_forget",
        lambda coro, **_: detached.append(asyncio.create_task(coro)),
    )
    dispatcher = OutboundWebhookDispatcher(rate_limit_seconds=0)
    dispatcher.register(name="enabled", url="https://example.com/enabled", events=["all"])
    dispatcher.register(
        name="disabled", url="https://example.com/disabled", events=["all"], enabled=False,
    )
    dispatcher.register(name="alert-only", url="https://example.com/alert", events=["alert"])
    delivered: list[tuple[str, bytes, str]] = []

    async def capture(_dispatcher, target, body, event_type):
        delivered.append((target.name, body, event_type))
        return DeliveryResult(target.id, target.name, event_type, success=True)

    monkeypatch.setattr(OutboundWebhookDispatcher, "_deliver_one", capture)
    event_data = {
        "status": "ok",
        "nested": {"count": 1},
        "api_key": "SYNTHETIC_D7_SECRET_MUST_NOT_ESCAPE",
    }

    await _recorder(dispatcher)._emit_lifecycle_event("tool.completed", event_data)
    assert len(detached) == 1
    await asyncio.gather(*detached)

    assert [(name, event_type) for name, _, event_type in delivered] == [
        ("enabled", "tool.completed"),
    ]
    body = delivered[0][1]
    envelope = json.loads(body)
    assert envelope["event_type"] == "tool.completed"
    assert envelope["data"]["status"] == "ok"
    assert envelope["data"]["nested"] == {"count": 1}
    assert envelope["data"]["api_key"] == "[REDACTED]"
    assert b"SYNTHETIC_D7_SECRET_MUST_NOT_ESCAPE" not in body
    assert "event_id" not in envelope["data"]
    assert "data" not in envelope["data"]


@pytest.mark.asyncio
async def test_disabled_dispatcher_is_a_noop():
    await _recorder(None)._emit_lifecycle_event("tool.completed", {"status": "ok"})


@pytest.mark.asyncio
async def test_delivery_failure_is_isolated_from_turn_recording(monkeypatch):
    monkeypatch.setattr("src.tools.url_safety.is_url_blocked", lambda _: False)
    detached: list[asyncio.Task] = []
    monkeypatch.setattr(
        "src.async_utils.fire_and_forget",
        lambda coro, **_: detached.append(asyncio.create_task(coro)),
    )
    dispatcher = OutboundWebhookDispatcher(rate_limit_seconds=0)
    dispatcher.register(name="failing", url="https://example.com/failing", events=["all"])
    dispatcher.register(name="healthy", url="https://example.com/healthy", events=["all"])
    calls: list[str] = []

    async def deliver(_dispatcher, target, _body, event_type):
        calls.append(target.name)
        return DeliveryResult(
            target.id,
            target.name,
            event_type,
            success=target.name == "healthy",
            error="synthetic failure" if target.name == "failing" else "",
        )

    monkeypatch.setattr(OutboundWebhookDispatcher, "_deliver_one", deliver)
    trajectory = SimpleNamespace(iterations=[], _started_ns=1)
    recorder = _recorder(dispatcher)
    recorder._trajectory_saver = SimpleNamespace(save=AsyncMock())

    await recorder._emit_lifecycle_event("tool.completed", {"status": "ok"})
    await asyncio.gather(*detached)
    await recorder._save_turn_trajectory(trajectory, final_response="completed")

    assert calls == ["failing", "healthy"]
    assert dispatcher.stats.total_failed == 1
    assert dispatcher.stats.total_delivered == 1
    assert trajectory.final_response == "completed"
    recorder._trajectory_saver.save.assert_awaited_once()
