"""Cancellation/settlement regressions. No native display, global kill or app changes."""

import asyncio
import json

import pytest

from src.computer.controller import ComputerController
from src.computer.runtime import x11_attached as attached
from src.computer.runtime import x11_guardian as guardian
from src.computer.store import ComputerStore
from tests.test_computer_attached_controller_r5 import Attached, RequestContext
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_x11_attached_r5 import StubProcess
from tests.test_computer_x11_guardian_r5 import rig


def backend():
    value = attached.X11AttachedBackend(
        enabled=True,
        display_name=":197",
        monitor_names=["screen"],
        app_profile="xed",
        input_enabled=True,
    )
    # These tests stub all native workers, including the retained topology
    # watcher. Supply its independently measured final census explicitly.
    value._accept_shutdown_identity(
        json.dumps({"event": "shared_identity_at_close", "ok": True, "device_identity": [11, 12]})
    )
    return value


class ReceiptWorker:
    def __init__(self, *, returncode=0, receipt=None):
        self.stdin = self.stdout = self
        self.returncode = None
        self.exitcode = returncode
        self.receipt = receipt or {
            "released": True,
            "status": "unknown",
            "persistent_input_devices": False,
            "owned_devices": "not_created",
            "device_identity": [11, 12],
        }
        self.reading, self.closed, self.exit = (asyncio.Event() for _ in range(3))
        self.reads = self.writes = 0

    def write(self, data):
        self.writes += 1

    async def drain(self):
        pass

    def close(self):
        self.closed.set()

    async def readline(self):
        self.reads += 1
        self.reading.set()
        await self.closed.wait()
        return json.dumps(self.receipt).encode() + b"\n" if self.reads == 1 else b""

    async def wait(self):
        await self.exit.wait()
        self.returncode = self.exitcode
        return self.returncode

    def kill(self):
        pytest.fail("release guardian was killed")

    terminate = kill


@pytest.mark.parametrize("method", ["detach", "pause"])
async def test_stop_does_not_wait_for_action_or_capture_lock(method):
    b = backend()
    async with b._lock:
        result = await asyncio.wait_for(getattr(b, method)(), 0.2)
    assert (
        result["released"] and result["applications_preserved"]
        if method == "detach"
        else (result["released"] and result["paused"])
    )


@pytest.mark.parametrize("cancel_at", ["spawn", "receipt", "repeated"])
@pytest.mark.parametrize("kind", ["input", "capture"])
async def test_cancel_during_worker_lifetime_is_owned(monkeypatch, cancel_at, kind):
    b = backend()
    before = asyncio.all_tasks()
    child = ReceiptWorker() if kind == "input" else StubProcess()
    entered, spawning = asyncio.Event(), asyncio.Event()

    async def spawn(*args, **kwargs):
        entered.set()
        await spawning.wait()
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    coroutine = b._input_worker({}) if kind == "input" else b._read_worker("sources")
    caller = asyncio.create_task(coroutine)
    await entered.wait()
    if cancel_at == "spawn":
        caller.cancel()
        await asyncio.sleep(0)
        spawning.set()
    else:
        spawning.set()
        if kind == "input":
            await child.reading.wait()
        else:
            while not b._children:
                await asyncio.sleep(0)
        caller.cancel()
        await asyncio.sleep(0)
        if cancel_at == "repeated":
            caller.cancel()
    if kind == "input":
        await child.closed.wait()
        child.exit.set()
    with pytest.raises(asyncio.CancelledError):
        await caller
    result = await asyncio.wait_for(b.detach(), 1)
    assert not b._children and not b._guardians and not b._jobs
    if kind == "capture":
        assert child.terminations == 1 and result["stopped"]
    elif cancel_at == "spawn":
        assert child.writes == 0  # Never dispatch after cancellation of launch.
        assert result["stopped"]  # No request means no native input was possible.
    else:
        assert result["stopped"] and child.reads == 1 and child.writes == 1
    assert not (asyncio.all_tasks() - before), "detached release/reaper task survived stop"


@pytest.mark.parametrize(
    "exitcode,receipt",
    [
        (7, {"released": True, "status": "unknown"}),
        (0, {"released": False, "status": "unknown"}),
        (0, ["not a receipt"]),
    ],
)
async def test_no_false_success_after_cancel(monkeypatch, exitcode, receipt):
    b, child = backend(), ReceiptWorker(returncode=exitcode, receipt=receipt)

    async def spawn(*args, **kwargs):
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    caller = asyncio.create_task(b._input_worker({}))
    await child.reading.wait()
    caller.cancel()
    await child.closed.wait()
    child.exit.set()
    with pytest.raises(asyncio.CancelledError):
        await caller
    result = await b.detach()
    assert not result["stopped"] and not result["released"]
    assert result["state"] == "quarantined"
    assert result["recovery"] == "owned_x11_cleanup_unverified"


async def test_capture_timeout_single_reaper_and_no_lock_dependency(monkeypatch):
    b, child = backend(), StubProcess()

    async def spawn(*args, **kwargs):
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(attached, "CAPTURE_TIMEOUT", 0.015)
    async with b._lock:
        with pytest.raises(attached.AttachedFailure):
            await b._read_worker("capture", selected={})
        result = await asyncio.wait_for(b.detach(), 0.2)
    assert result["stopped"] and child.terminations == 1 and not b._children


async def test_unresponsive_guardian_quarantines_without_killing_release_owner(monkeypatch):
    b, child = backend(), ReceiptWorker()

    async def spawn(*args, **kwargs):
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(attached, "CLEANUP_TIMEOUT", 0.025)
    task = asyncio.create_task(b._input_worker({}))
    await child.reading.wait()
    result = await asyncio.wait_for(b.detach(), 0.2)
    assert not result["stopped"] and b._guardians
    assert child.closed.is_set()
    child.exit.set()
    await task
    # No success while unsettled. A later Stop uses the verified owner result,
    # not a permanently latched failure caused only by the observer's deadline.
    assert (await b.detach())["stopped"]


async def test_cancelled_pause_cannot_resume_with_live_guardian(monkeypatch):
    b, child = backend(), ReceiptWorker()

    async def spawn(*args, **kwargs):
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    input_task = asyncio.create_task(b._input_worker({}))
    await child.reading.wait()
    pause_task = asyncio.create_task(b.pause())
    await child.closed.wait()
    pause_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await pause_task
    with pytest.raises(attached.AttachedFailure, match="owned_release_unverified"):
        await b.resume(consent_generation=2)
    child.exit.set()
    await input_task
    assert (await b.detach())["stopped"]


@pytest.mark.parametrize("cancel_count", [1, 2])
async def test_controller_close_cancellation_keeps_receipt_owner(tmp_path, cancel_count):
    native = Attached()
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    c = ComputerController(store, lambda _: native, lambda _: True, enabled=True)
    ctx = RequestContext("owner", "channel", "turn", "host")
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []
    original = native.detach

    async def detach():
        calls.append(1)
        entered.set()
        await release.wait()
        return await original()

    try:
        grant = await c.session(ctx, {"operation": "start"})
        native.detach = detach
        close = asyncio.create_task(
            c.session(ctx, {"operation": "close", "session_id": grant["session_id"]})
        )
        await entered.wait()
        for _ in range(cancel_count):
            close.cancel()
            await asyncio.sleep(0)
        assert store.get_session(grant["session_id"]).state == "quarantined"
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await close
        await asyncio.gather(*c._stops.values())
        status = await c.session(ctx, {"operation": "status", "session_id": grant["session_id"]})
        assert status["cleanup"]["complete"] and status["state"] == "closed"
        assert calls == [1] and not c._live
    finally:
        release.set()
        await c.close()
        store.close()


@pytest.mark.parametrize("failure", ["topology", "capture", "sleep"])
def test_guardian_scope_loss_releases_ledger_without_scope_retry(failure):
    calls = []

    def validate(step):
        calls.append(step)
        if len(calls) > 1:
            raise guardian.GuardianFailure(failure + "_unavailable")

    native, helper, guard = rig(validate=validate)
    receipt = guard.run([("button", 1, True), ("key", 38, True)])
    assert receipt["status"] == "unknown" and receipt["released"]
    assert not native.buttons and helper.fenced and len(calls) == 2
    assert ("key", 38, True) not in native.calls


def test_empty_ledger_release_needs_no_capture_topology_or_server():
    class Unavailable:
        def __getattr__(self, name):
            pytest.fail("empty ledger queried " + name)

    assert guardian.OwnedLedger(Unavailable()).release()


async def test_post_input_capture_loss_preserves_release_and_clean_explicit_stop_no_replay(
    tmp_path, monkeypatch
):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, _state, calls):
        b = c._live[action["session_id"]].backend
        read = b._read_worker

        async def failed_capture(operation, **kwargs):
            if calls:
                raise attached.AttachedFailure("capture_unavailable")
            return await read(operation, **kwargs)

        monkeypatch.setattr(b, "_read_worker", failed_capture)
        monkeypatch.setattr(b, "detach", attached.X11AttachedBackend.detach.__get__(b))
        action.update(operation="type", text="never replay me")
        b._accept_shutdown_identity(
            json.dumps(
                {"event": "shared_identity_at_close", "ok": True, "device_identity": [11, 12]}
            )
        )
        result = await c.act(ctx, action)
        assert result["status"] == "executed" and len(calls) == 1
        assert result["execution"] == {"sent": True, "injected": True, "released": True}
        assert result["verification"]["status"] == "unavailable"
        assert result["verification"]["next_action"] == "observe_and_reconcile"
        assert result["diagnostics"]["replay_allowed"] is False
        assert "next_observation" not in result
        assert await c.act(ctx, action) == result and len(calls) == 1
        await c.session(ctx, {"operation": "stop", "session_id": action["session_id"]})
        status = await c.session(ctx, {"operation": "status", "session_id": action["session_id"]})
        assert status["state"] == "cancelled" and status["cleanup"]["complete"]


async def test_controller_pending_timeout_reaps_input_before_cleanup_receipt(tmp_path, monkeypatch):
    from src.computer import controller as control

    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, _state, calls):
        b = c._live[action["session_id"]].backend
        child = ReceiptWorker()

        async def spawn(*args, **kwargs):
            return child

        # Exercise real adapter worker ownership, not a direct-result stub.
        monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
        b._accept_shutdown_identity(
            json.dumps(
                {"event": "shared_identity_at_close", "ok": True, "device_identity": [11, 12]}
            )
        )
        monkeypatch.setattr(
            b, "_input_worker", attached.X11AttachedBackend._input_worker.__get__(b)
        )
        # Stub child has no real PID. Production identity recording is covered
        # with actual processes by the private Xvfb test, never a forged /proc.
        monkeypatch.setattr(b, "_record_spawn", lambda *args, **kwargs: None)
        monkeypatch.setattr(b, "detach", attached.X11AttachedBackend.detach.__get__(b))
        monkeypatch.setattr(control, "MAX_ACTION_RPC_SECONDS", 0.02)

        async def exit_on_revoke():
            await child.closed.wait()
            child.exit.set()

        exiting = asyncio.create_task(exit_on_revoke())
        action.update(operation="type", text="uncertain input")
        result = await c.act(ctx, action)
        await exiting
        assert result["status"] == "unknown" and child.writes == 1
        assert await c.act(ctx, action) == result and child.writes == 1
        status = await c.session(ctx, {"operation": "status", "session_id": action["session_id"]})
        assert status["cleanup"]["complete"] and status["state"] == "cancelled"
        assert child.returncode == 0 and not b._jobs and not b._guardians
        assert not calls
