"""The turn typing keeper never puts Discord on the turn's critical path."""
from __future__ import annotations

import asyncio
import logging
import time

import pytest

from src.discord import typing_keeper
from src.discord.tool_loop import _best_effort_typing
from src.discord.typing_keeper import turn_typing, turn_typing_active


class _Channel:
    """typing() returns an awaitable one-shot POST, like discord.py's Typing."""

    def __init__(self, behaviour: str = "ok", delay: float = 0.0) -> None:
        self.behaviour = behaviour
        self.delay = delay
        self.posts = 0

    def typing(self):
        channel = self

        class _Post:
            def __await__(self):
                return channel._post().__await__()

        return _Post()

    async def _post(self):
        self.posts += 1
        if self.behaviour == "raise":
            raise RuntimeError("discord 500")
        if self.behaviour == "hang":
            await asyncio.Event().wait()
        if self.behaviour == "stubborn":
            # Holds until cancelled, then delays its own cancellation.
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                loop = asyncio.get_running_loop()
                deadline = loop.time() + self.delay
                while (left := deadline - loop.time()) > 0:
                    try:
                        await asyncio.sleep(left)
                    except asyncio.CancelledError:
                        pass
            return
        await asyncio.sleep(self.delay)


class _WebChannel:
    def __init__(self) -> None:
        self.calls = 0

    def typing(self):
        self.calls += 1

        class _NoOp:
            async def __aenter__(self):
                return None

            async def __aexit__(self, *exc):
                return False

        return _NoOp()


def _keepers() -> list[asyncio.Task]:
    return [
        task for task in asyncio.all_tasks()
        if getattr(task.get_coro(), "__name__", "") == "_keep_typing" and not task.done()
    ]


@pytest.fixture
def fast_refresh(monkeypatch):
    monkeypatch.setattr(typing_keeper, "TYPING_REFRESH_SECONDS", 0.01)
    monkeypatch.setattr(typing_keeper, "TYPING_ATTEMPT_TIMEOUT", 0.05)


@pytest.mark.parametrize("behaviour,delay", [("ok", 0.3), ("hang", 0.0), ("raise", 0.0)])
async def test_work_never_waits_on_the_indicator(behaviour, delay):
    channel = _Channel(behaviour, delay)

    started = time.monotonic()
    async with turn_typing(channel):
        await asyncio.sleep(0)
        body = time.monotonic() - started

    assert body < 0.05
    assert _keepers() == []


async def test_indicator_is_refreshed_while_the_scope_runs(fast_refresh):
    channel = _Channel()

    async with turn_typing(channel):
        await asyncio.sleep(0.1)

    assert channel.posts >= 3
    assert _keepers() == []


async def test_failures_are_logged_once_per_scope(fast_refresh, caplog):
    channel = _Channel("raise")

    with caplog.at_level(logging.WARNING):
        async with turn_typing(channel):
            await asyncio.sleep(0.1)

    warnings = [r for r in caplog.records if "Typing indicator refresh failed" in r.getMessage()]
    assert channel.posts >= 3
    assert len(warnings) == 1


async def test_hanging_post_is_bounded_and_joined(fast_refresh):
    channel = _Channel("hang")

    async with turn_typing(channel):
        await asyncio.sleep(0.2)

    assert channel.posts >= 2
    assert _keepers() == []


async def test_body_exception_propagates_unchanged():
    channel = _Channel("raise")

    with pytest.raises(ValueError, match="the turn's own error"):
        async with turn_typing(channel):
            raise ValueError("the turn's own error")
    for _ in range(3):  # the cancelled keeper finishes, then its callbacks run
        await asyncio.sleep(0)

    assert _keepers() == []
    assert typing_keeper._unsettled == set()


async def test_the_scopes_own_error_wins_over_a_pending_cancellation():
    channel = _Channel("hang")

    async def turn():
        async with turn_typing(channel):
            await asyncio.sleep(0)
            asyncio.current_task().cancel()  # e.g. /stop lands as the turn fails
            raise ValueError("the turn's own error")

    with pytest.raises(ValueError, match="the turn's own error"):
        await asyncio.create_task(turn())
    await asyncio.sleep(0)

    assert _keepers() == []


async def test_a_keeper_that_outlives_its_join_is_held_until_it_finishes(monkeypatch, caplog):
    monkeypatch.setattr(typing_keeper, "_STOP_JOIN_SECONDS", 0.05)
    channel = _Channel("stubborn", 0.3)

    with caplog.at_level(logging.WARNING):
        async with turn_typing(channel):
            await asyncio.sleep(0.01)  # the keeper is inside its POST

    held = list(typing_keeper._unsettled)
    assert len(held) == 1 and not held[0].done()
    assert any("tracked until it does" in r.getMessage() for r in caplog.records)
    await asyncio.wait(held, timeout=2)
    await asyncio.sleep(0)
    assert held[0].done() and typing_keeper._unsettled == set()
    assert _keepers() == []


async def test_cancelling_the_scope_stops_the_keeper():
    channel = _Channel("hang")
    entered = asyncio.Event()

    async def turn():
        async with turn_typing(channel):
            entered.set()
            await asyncio.Event().wait()

    task = asyncio.create_task(turn())
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.sleep(0)

    assert _keepers() == []


async def test_web_channels_have_nothing_to_keep(caplog):
    channel = _WebChannel()

    with caplog.at_level(logging.WARNING):
        async with turn_typing(channel):
            await asyncio.sleep(0.01)

    assert channel.calls == 1
    assert not [r for r in caplog.records if "Typing indicator" in r.getMessage()]


async def test_per_step_wrapper_defers_to_the_keeper():
    keeper_channel = _Channel()
    step_channel = _WebChannel()

    assert not turn_typing_active()
    async with turn_typing(keeper_channel):
        assert turn_typing_active()
        async with _best_effort_typing(step_channel):
            pass
    assert not turn_typing_active()

    assert step_channel.calls == 0
    async with _best_effort_typing(step_channel):
        pass
    assert step_channel.calls == 1


async def test_a_turn_without_a_channel_runs_without_a_keeper():
    ran = []

    async with typing_keeper.turn_typing(None):
        ran.append(typing_keeper.turn_typing_active())

    assert ran == [False]
