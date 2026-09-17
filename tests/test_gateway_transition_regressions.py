"""Campaign gateway ordering and real reconnect-loop retirement regressions."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from discord.ext import commands

import discord
from src.discord.client import OdinBot
from src.discord.connection_supervisor import ConnectionSupervisor
from src.discord.discordpy_adapter import DiscordPyReattachmentAdapter


class _Gateway:
    def require_supported(self):
        pass

    async def start(self, token):
        await asyncio.Event().wait()

    async def retire_gateway(self, task):
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.fixture
async def gateway_bot(monkeypatch):
    bot = OdinBot.__new__(OdinBot)
    commands.Bot.__init__(bot, command_prefix="?", intents=discord.Intents.none())
    await discord.Client._async_setup_hook(bot)
    bot._connection.user = SimpleNamespace(id=1)
    bot._delivery_application_id = None
    bot.sessions = SimpleNamespace(prune=Mock(return_value=0))
    bot._vector_store = None
    bot.delivery = SimpleNamespace(set_status=AsyncMock())
    bot.scheduler = SimpleNamespace(start=Mock())
    bot.scheduled_events = SimpleNamespace(_on_scheduled_task=None, _on_schedule_failure=None)
    monkeypatch.setattr(bot, "_reconcile_application_commands", AsyncMock())
    monkeypatch.setattr("src.discord.client.get_tool_definitions", lambda: [])
    gateway = _Gateway()
    bot.start = gateway.start
    bot.connection_supervisor = supervisor = ConnectionSupervisor(bot, adapter=gateway)
    await supervisor.attach("synthetic-gateway-credential")
    try:
        yield bot, supervisor
    finally:
        await supervisor.close()
        tasks = [
            task for group in getattr(bot, "_gateway_event_tasks", {}).values() for task in group
        ]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await discord.Client.close(bot)


@pytest.mark.asyncio
@pytest.mark.parametrize("event", ["ready", "resumed"])
@pytest.mark.parametrize("scheduled", [False, True])
async def test_disconnect_during_reconciliation_cannot_be_reversed(gateway_bot, event, scheduled):
    bot, supervisor = gateway_bot
    entered, release = asyncio.Event(), asyncio.Event()

    async def reconcile():
        entered.set()
        await release.wait()

    bot._reconcile_application_commands = reconcile
    callback = getattr(bot, "on_" + event)
    generation = supervisor.callback_generation()
    # Start disconnected as well: repeated disconnects must invalidate pending
    # readiness even when the public state string does not change.
    supervisor.transport_disconnected(generation)
    if scheduled:
        task = bot._schedule_event(callback, "on_" + event)
    else:
        task = asyncio.create_task(callback(expected_generation=generation))
    try:
        await asyncio.wait_for(entered.wait(), 1)
        supervisor.transport_disconnected(generation)
        assert not supervisor.connection_availability().available
        release.set()
        await asyncio.wait_for(task, 1)
        assert supervisor.status().state == "disconnected"
        assert not supervisor.connection_availability().available
        bot.scheduler.start.assert_not_called()
        # A genuinely newer callback in this same generation may rearm.
        await bot._schedule_event(callback, "on_" + event)
        assert supervisor.connection_availability().available
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("event", ["ready", "resumed"])
async def test_disconnect_before_queued_readiness_runs_fences_callback(gateway_bot, event):
    bot, supervisor = gateway_bot
    task = bot._schedule_event(getattr(bot, "on_" + event), "on_" + event)
    # The synchronous dispatch fence happens before either queued coroutine runs.
    bot.dispatch("disconnect")
    await task
    assert not supervisor.connection_availability().available
    bot._reconcile_application_commands.assert_not_awaited()


@pytest.mark.asyncio
async def test_late_disconnect_callback_cannot_reverse_newer_resumed(gateway_bot):
    bot, supervisor = gateway_bot
    entered, release = asyncio.Event(), asyncio.Event()
    original = bot.on_disconnect

    async def delayed_disconnect():
        entered.set()
        await release.wait()
        await original()

    bot.on_disconnect = delayed_disconnect
    bot.dispatch("disconnect")
    await asyncio.wait_for(entered.wait(), 1)
    tasks = list(bot._gateway_event_tasks[supervisor.callback_generation()])
    bot.dispatch("resumed")
    resumed = list(set(bot._gateway_event_tasks[supervisor.callback_generation()]) - set(tasks))
    try:
        await asyncio.gather(*resumed)
        assert supervisor.connection_availability().available
        release.set()
        await asyncio.gather(*tasks)
        assert supervisor.connection_availability().available
    finally:
        release.set()
        await asyncio.gather(*tasks, *resumed, return_exceptions=True)


@pytest.mark.asyncio
async def test_retirement_cancels_real_library_reconnect_backoff(monkeypatch):
    bot = commands.Bot(command_prefix="?", intents=discord.Intents.none())
    await discord.Client._async_setup_hook(bot)
    adapter = DiscordPyReattachmentAdapter(bot)
    entered, cancelled = asyncio.Event(), asyncio.Event()
    backoff_release = asyncio.Event()
    websocket = SimpleNamespace(
        open=True, sequence=1, gateway="wss://example.invalid", session_id="synthetic",
        poll_event=AsyncMock(side_effect=OSError("synthetic network failure")),
    )

    async def close_socket(*, code):
        websocket.open = False

    websocket.close = close_socket
    monkeypatch.setattr(
        discord.client.DiscordWebSocket, "from_client", AsyncMock(return_value=websocket)
    )

    async def backoff_sleep(delay):
        entered.set()
        try:
            await backoff_release.wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    # Replace only the library module's sleep, not the event loop/shared asyncio.
    class LibraryAsyncio:
        sleep = staticmethod(backoff_sleep)

        def __getattr__(self, name):
            return getattr(asyncio, name)

    monkeypatch.setattr(discord.client, "asyncio", LibraryAsyncio())
    gateway = asyncio.create_task(bot.connect())
    retirement = None
    try:
        await asyncio.wait_for(entered.wait(), 1)
        retirement = asyncio.create_task(adapter.retire_gateway(gateway))
        # This is a bounded harness wait: the controlled backoff NEVER elapses.
        await asyncio.wait_for(asyncio.shield(retirement), 1)
        assert cancelled.is_set() and gateway.cancelled()
        assert not backoff_release.is_set()
        assert not websocket.open
        assert bot.ws is None and bot._closing_task is None
        assert bot.loop is asyncio.get_running_loop()
    finally:
        gateway.cancel()
        await asyncio.gather(gateway, return_exceptions=True)
        if retirement is not None:
            await asyncio.gather(retirement, return_exceptions=True)
        await discord.Client.close(bot)
