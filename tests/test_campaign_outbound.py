"""Admission/cooldown regressions using the actual dispatcher and HTTP boundary."""
import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.notifications.outbound_webhooks import OutboundWebhookDispatcher, WebhookTarget
from tests.test_outbound_webhooks import _make_mock_session


@pytest.mark.parametrize("status", [200, 400])
async def test_overlapping_delivery_reserves_target_and_preserves_settled_cooldown(status):
    dispatcher = OutboundWebhookDispatcher(rate_limit_seconds=300)
    dispatcher._webhooks["target"] = WebhookTarget(
        id="target", name="fixture", url="https://example.com/hook")
    session, response = _make_mock_session(status=status)
    dispatcher._session = session
    entered, release = asyncio.Event(), asyncio.Event()

    async def enter():
        entered.set()
        await release.wait()
        return response

    session.post.return_value.__aenter__.side_effect = enter
    with patch("src.notifications.outbound_webhooks.time", SimpleNamespace(monotonic=lambda: 12)):
        first = asyncio.create_task(dispatcher.dispatch("custom", {"event": 1}))
        await entered.wait()
        assert await dispatcher.dispatch("custom", {"event": 2}) == []
        release.set()
        result = await first
        assert len(result) == 1
        assert result[0].success is (status == 200)
        assert await dispatcher.dispatch("custom", {"event": 3}) == []
    assert session.post.call_count == (1 if status == 200 else 3)
    assert dispatcher._in_flight == set()


async def test_cancelled_admission_releases_reservation_without_false_settlement():
    dispatcher = OutboundWebhookDispatcher(rate_limit_seconds=300)
    dispatcher._webhooks["target"] = WebhookTarget(
        id="target", name="fixture", url="https://example.com/hook")
    session, response = _make_mock_session()
    dispatcher._session = session
    entered = asyncio.Event()

    async def enter():
        entered.set()
        await asyncio.Event().wait()

    session.post.return_value.__aenter__.side_effect = enter
    task = asyncio.create_task(dispatcher.dispatch("custom", {}))
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert dispatcher._in_flight == set()
    assert dispatcher._last_sent == {}
    session.post.return_value.__aenter__.side_effect = None
    assert len(await dispatcher.dispatch("custom", {})) == 1
