"""Gateway ownership tests.  No Discord network is involved."""

from __future__ import annotations

import asyncio

import pytest

from src.discord.connection_supervisor import ConnectionSupervisor


class FakeAdapter:
    def __init__(self) -> None:
        self.retired: list[asyncio.Task] = []

    def require_supported(self) -> None:
        return None

    async def retire_gateway(self, task: asyncio.Task) -> None:
        self.retired.append(task)
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


class FakeBot:
    def __init__(self) -> None:
        self.tokens: list[str] = []
        self.release = asyncio.Event()

    async def start(self, token: str) -> None:
        self.tokens.append(token)
        await self.release.wait()


@pytest.mark.asyncio
async def test_attach_and_detach_are_generation_owned_and_serialized() -> None:
    bot = FakeBot()
    adapter = FakeAdapter()
    supervisor = ConnectionSupervisor(bot, adapter=adapter)

    first = await supervisor.attach("first")
    assert first.generation == 1
    assert first.state == "connecting"
    await asyncio.sleep(0)

    second = await supervisor.attach("second")
    assert second.generation == 3
    assert adapter.retired and adapter.retired[0].cancelled()
    assert bot.tokens == ["first"]
    await asyncio.sleep(0)
    assert bot.tokens == ["first", "second"]

    detached = await supervisor.detach()
    assert detached.state == "detached"
    assert detached.generation == 4


@pytest.mark.asyncio
async def test_cancelled_old_owner_cannot_overwrite_new_generation_status() -> None:
    bot = FakeBot()
    supervisor = ConnectionSupervisor(bot, adapter=FakeAdapter())
    await supervisor.attach("old")
    await asyncio.sleep(0)
    await supervisor.attach("new")
    await asyncio.sleep(0)

    assert supervisor.status().generation == 3
    assert supervisor.status().state == "connecting"
    await supervisor.detach()


@pytest.mark.asyncio
async def test_rejects_empty_token() -> None:
    with pytest.raises(ValueError, match="non-empty"):
        await ConnectionSupervisor(FakeBot(), adapter=FakeAdapter()).attach(" ")

@pytest.mark.asyncio
async def test_stale_callback_generation_cannot_change_current_transport_state() -> None:
    bot = FakeBot()
    supervisor = ConnectionSupervisor(bot, adapter=FakeAdapter())
    await supervisor.attach("old")
    old = supervisor.callback_generation()
    await asyncio.sleep(0)
    await supervisor.attach("new")
    await asyncio.sleep(0)

    assert supervisor.transport_ready(old).state == "connecting"
    assert supervisor.transport_disconnected(old).state == "connecting"


@pytest.mark.asyncio
async def test_failed_gateway_is_unavailable_then_can_be_retired_cleanly() -> None:
    class FailingBot:
        async def start(self, token: str) -> None:
            raise OSError("local connection refused")

    supervisor = ConnectionSupervisor(FailingBot(), adapter=FakeAdapter())
    await supervisor.attach("opaque-test-token")
    task = supervisor._task
    assert task is not None
    await asyncio.gather(task, return_exceptions=True)
    await asyncio.sleep(0)  # permit the done callback to publish its terminal state
    assert supervisor.status().state == "failed"
    assert not supervisor.connection_availability().available
    assert supervisor.connection_availability().reason.value == "unavailable"

    detached = await supervisor.detach()
    assert detached.state == "detached"
    assert supervisor.connection_availability().reason.value == "disconnected"


@pytest.mark.asyncio
async def test_cancelled_detach_keeps_retirement_owned_until_later_waiter_finishes() -> None:
    class SlowAdapter(FakeAdapter):
        def __init__(self) -> None:
            super().__init__()
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def retire_gateway(self, task: asyncio.Task) -> None:
            self.retired.append(task)
            self.started.set()
            await self.release.wait()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    bot = FakeBot()
    adapter = SlowAdapter()
    supervisor = ConnectionSupervisor(bot, adapter=adapter)
    await supervisor.attach("first")
    await asyncio.sleep(0)
    detaching = asyncio.create_task(supervisor.detach())
    await adapter.started.wait()
    detaching.cancel()
    with pytest.raises(asyncio.CancelledError):
        await detaching
    assert supervisor.status().state == "detaching"
    assert supervisor._retirement is not None and not supervisor._retirement.done()

    adapter.release.set()
    detached = await supervisor.detach()
    assert detached.state == "detached"
    assert supervisor._retirement is None and supervisor._task is None
