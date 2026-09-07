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
        return {"process_reaped": True, "session_close_acknowledged": True,
                "connection_closed": True,
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
        return {"process_reaped": True, "session_close_acknowledged": True,
                "connection_closed": True}

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


async def test_backend_action_receipt_survives_controller_verification(tmp_path, adapter):
    import hashlib

    from src.computer.controller import ComputerController
    from src.computer.models import RequestContext
    from src.computer.store import ComputerStore

    store = ComputerStore(tmp_path / "state", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: adapter, lambda _: True, enabled=True)
    ctx = RequestContext("owner", "channel", "turn", "host")
    try:
        session = await controller.session(ctx, {"operation": "start", "app": "xed"})
        assert session["input_supported"], session.get("input_admission")
        observation = await controller.observe(ctx, {"session_id": session["session_id"],
                                                     "generation": session["generation"]})
        live = controller._live[session["session_id"]]
        private = live.observations[observation["observation_id"]]
        await controller.validate_observation_delivery(
            ctx, private.frame_metadata, hashlib.sha256(observation["image_bytes"]).hexdigest())
        result = await controller.act(ctx, {
            "session_id": session["session_id"], "generation": session["generation"],
            "observation_id": observation["observation_id"], "action_id": "fixture-action",
            "consent_generation": private.source.consent_generation,
            "source_id": private.source.source_id,
            "source_revision": private.source.source_revision,
            "operation": "type", "text": "fixture", "expect": {"type": "visual_change"},
        })
        # Inert fake produces unchanged pixels: not_satisfied, not unknown or a
        # fabricated visual success. Execution evidence still survives transport.
        assert result["status"] == "not_satisfied"
        assert result["execution"] == {"injected": True, "released": True}
    finally:
        await controller.close()
        store.close()
