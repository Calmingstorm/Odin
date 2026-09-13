"""Generation capture and private transport retirement at discord.py's boundary."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from discord.ext import commands

import discord
from src.discord.client import OdinBot, _callback_generation
from src.discord.discordpy_adapter import (
    DiscordPyReattachmentAdapter,
    UnsupportedDiscordAttachmentError,
    check_attachment_compatibility,
)


class Supervisor:
    def __init__(self):
        self.generation = 7
        self.owned = {7}
        self.ready = []

    def callback_generation(self):
        return self.generation

    def owns(self, generation):
        return generation in self.owned

    def transport_ready(self, generation):
        self.ready.append(generation)


@pytest.mark.asyncio
async def test_schedule_event_captures_generation_before_callback_runs():
    obj = OdinBot.__new__(OdinBot)
    obj.connection_supervisor = supervisor = Supervisor()
    obj.loop = asyncio.get_running_loop()
    seen = []

    async def callback():
        seen.append(_callback_generation.get())

    task = obj._schedule_event(callback, "on_ready")
    supervisor.generation = 8
    await task
    assert seen == [7]


@pytest.mark.asyncio
async def test_schedule_event_does_not_inject_kwargs_into_extra_listener():
    obj = OdinBot.__new__(OdinBot)
    obj.connection_supervisor = Supervisor()
    obj.loop = asyncio.get_running_loop()
    seen = []

    async def extra_listener():
        seen.append("called")

    await obj._schedule_event(extra_listener, "on_ready")
    assert seen == ["called"]


@pytest.mark.asyncio
async def test_ready_rechecks_ownership_after_command_sync(monkeypatch):
    obj = OdinBot.__new__(OdinBot)
    obj.connection_supervisor = supervisor = Supervisor()
    obj._connection = SimpleNamespace(
        user=type("User", (), {"id": 1, "__str__": lambda self: "bot"})()
    )
    obj.sessions = type("Sessions", (), {"prune": lambda self: 0})()
    obj._vector_store = None
    obj.delivery = type("Delivery", (), {"set_status": staticmethod(asyncio.sleep)})()
    obj.scheduler = type("Scheduler", (), {"start": lambda *args: None})()
    obj.scheduled_events = type(
        "Events", (), {"_on_scheduled_task": None, "_on_schedule_failure": None}
    )()

    async def sync():
        supervisor.owned.clear()
    monkeypatch.setattr(obj, "_reconcile_application_commands", sync)
    monkeypatch.setattr("src.discord.client.get_tool_definitions", lambda: [])
    await obj.on_ready(expected_generation=7)
    assert supervisor.ready == []


def _real_bot() -> commands.Bot:
    return commands.Bot(command_prefix="?", intents=discord.Intents.none())


@pytest.mark.asyncio
async def test_cancelled_close_waits_for_real_close_before_propagating_cancellation(monkeypatch):
    """A cancelled detach caller cannot leave discord.py's close coroutine behind."""
    bot = _real_bot()
    adapter = DiscordPyReattachmentAdapter(bot)
    entered = asyncio.Event()
    release = asyncio.Event()

    async def slow_close(client):
        assert client is bot
        entered.set()
        await release.wait()
        bot._closing_task = asyncio.current_task()

    monkeypatch.setattr(discord.Client, "close", slow_close)
    closing = asyncio.create_task(adapter.close_transport())
    await entered.wait()
    closing.cancel()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await closing
    assert bot._closing_task is not None and bot._closing_task.done()


@pytest.mark.asyncio
async def test_retirement_cleans_real_http_state_and_failed_gateway_without_network(monkeypatch):
    """Use a genuine pinned Bot/HTTPClient, with only its transport locally faked."""
    bot = _real_bot()
    adapter = DiscordPyReattachmentAdapter(bot)
    await discord.Client._async_setup_hook(bot)

    class Resource:
        def __init__(self):
            self.closed = False

        async def close(self):
            self.closed = True

    class Bucket:
        def __init__(self, waiter):
            self._pending_requests = [waiter]

    connector = Resource()
    session = Resource()
    waiter = asyncio.get_running_loop().create_future()
    bot.http.connector = connector
    setattr(bot.http, "_HTTPClient__session", session)
    bot.http.token = "not-a-discord-token"
    bot.http._bucket_hashes["route"] = "bucket"
    bot.http._buckets["bucket"] = Bucket(waiter)
    bot.http._global_over = asyncio.Event()
    chunk_waiter = asyncio.get_running_loop().create_future()
    bot._connection._chunk_requests[1] = SimpleNamespace(waiters=[chunk_waiter])
    listener = asyncio.get_running_loop().create_future()
    bot._listeners["message"] = [(listener, lambda *_: True)]

    async def closed_transport():
        async def completed_close():
            return None

        closing_task = asyncio.create_task(completed_close())
        await closing_task
        bot._closing_task = closing_task

    monkeypatch.setattr(adapter, "close_transport", closed_transport)

    async def failed_gateway():
        raise RuntimeError("local gateway failure")

    task = asyncio.create_task(failed_gateway())
    await asyncio.sleep(0)
    await adapter.retire_gateway(task)

    assert task.done() and isinstance(task.exception(), RuntimeError)
    assert connector.closed and session.closed
    assert waiter.cancelled() and chunk_waiter.cancelled() and listener.cancelled()
    assert bot.http.connector is discord.utils.MISSING
    assert bot.http.token is None
    assert not bot.http._buckets and not bot.http._bucket_hashes
    assert not bot._connection._chunk_requests and not bot._listeners
    assert bot.ws is None and bot._closing_task is None
    assert bot.loop is asyncio.get_running_loop()


def test_version_and_private_layout_guards_refuse_untested_attachment(monkeypatch):
    bot = _real_bot()
    monkeypatch.setattr(discord, "__version__", "99.0.0")
    compatibility = check_attachment_compatibility(bot)
    assert not compatibility.available
    with pytest.raises(UnsupportedDiscordAttachmentError, match="99.0.0"):
        DiscordPyReattachmentAdapter(bot).require_supported()
