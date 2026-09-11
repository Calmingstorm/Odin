"""Generation capture at discord.py's scheduling boundary."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from src.discord.client import OdinBot, _callback_generation


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
    obj.scheduled_events = type("Events", (), {"_on_scheduled_task": None, "_on_schedule_failure": None})()

    async def sync():
        supervisor.owned.clear()
    monkeypatch.setattr(obj, "_reconcile_application_commands", sync)
    monkeypatch.setattr("src.discord.client.get_tool_definitions", lambda: [])
    await obj.on_ready(expected_generation=7)
    assert supervisor.ready == []
