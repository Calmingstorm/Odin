"""Harmless deterministic regressions for independent Wayland review findings."""
import asyncio
from types import SimpleNamespace

import pytest

from src.computer.models import ComputerError
from src.computer.runtime.wayland_guardian import WaylandGuardian
from tests.test_computer_wayland_backend_r8 import SCOPE, action
from tests.test_computer_wayland_backend_r8 import adapter as backend_fixture


@pytest.fixture
def adapter(monkeypatch):
    return backend_fixture.__wrapped__(monkeypatch)


@pytest.mark.parametrize("command", ["B 2000\nT 61\n", "S mapping\n", "N\n"])
async def test_queued_write_cannot_cross_close_fence(command):
    writes = []

    class Pipe:
        def is_closing(self):
            return False

        def write(self, value):
            writes.append(value)

        async def drain(self):
            pass

    guardian = WaylandGuardian("/unused", 0)
    guardian._child = SimpleNamespace(returncode=None, stdin=Pipe())

    async def cleanup():
        await guardian._send("C\n")
        return {"process_reaped": True}

    guardian._close = cleanup
    await guardian._write_lock.acquire()
    queued = asyncio.create_task(guardian._send(command))
    await asyncio.sleep(0)
    close = asyncio.create_task(guardian.close())
    await asyncio.sleep(0)
    assert guardian._closing
    guardian._write_lock.release()
    with pytest.raises(ComputerError, match="revoked"):
        await queued
    await close
    assert writes == [b"C\n"]


async def test_focus_change_during_region_selection_denies_input(adapter):
    await adapter.start("session1")
    frame = await adapter.observe()
    select = adapter._guardian.select

    async def changed(mapping):
        result = await select(mapping)
        adapter._scope_provider.scope = {**SCOPE, "focus_digest": "changed"}
        return result

    adapter._guardian.select = changed
    try:
        with pytest.raises(ComputerError, match="focus_changed_before_dispatch"):
            await adapter.act(action(frame))
        assert not adapter._guardian.commands
    finally:
        await adapter.stop()


@pytest.mark.parametrize("failure", ["guardian", "portal", "scope", "portal_receipt"])
async def test_every_cleanup_resource_attempted_when_one_fails(adapter, failure):
    await adapter.start("session1")
    calls = []

    async def close_guardian():
        calls.append("guardian")
        if failure == "guardian":
            raise RuntimeError("fixture")
        return {"process_reaped": True, "release_submitted": True}

    async def close_portal():
        calls.append("portal")
        if failure == "portal":
            raise RuntimeError("fixture")
        return {"process_reaped": True,
                "cleanup_errors": ["TimeoutError"] if failure == "portal_receipt" else []}

    async def close_scope():
        calls.append("scope")
        if failure == "scope":
            raise RuntimeError("fixture")

    adapter._guardian.close = close_guardian
    adapter._portal.close = close_portal
    adapter._scope_provider.close = close_scope
    result = await adapter.stop()
    assert calls == ["guardian", "portal", "scope"]
    assert result["stopped"] is False
    assert result["state"] == "quarantined"
    if failure in {"portal", "portal_receipt"}:
        assert result["portal_session_closed"] is False


async def test_cancelled_detach_continues_all_owned_cleanup(adapter):
    await adapter.start("session1")
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []

    async def guardian_close():
        entered.set()
        await release.wait()
        calls.append("guardian")
        return {"process_reaped": True, "release_submitted": True}

    async def portal_close():
        calls.append("portal")
        return {"process_reaped": True}

    async def scope_close():
        calls.append("scope")

    adapter._guardian.close = guardian_close
    adapter._portal.close = portal_close
    adapter._scope_provider.close = scope_close
    task = asyncio.create_task(adapter.detach())
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not adapter._cleanup_task.done()
    release.set()
    assert await asyncio.wait_for(asyncio.shield(adapter._cleanup_task), 1)
    assert calls == ["guardian", "portal", "scope"]
