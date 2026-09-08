"""Admission timing and cleanup semantics, executing real guardian/backend logic."""

import asyncio
import json
import socket
import threading
from types import SimpleNamespace

import pytest

from src.computer.runtime import x11_guardian as guardian
from src.computer.runtime.x11_attached import X11AttachedBackend


class Native:
    def __init__(self):
        self.keys = set()
        self.buttons = set()
        self.moves = []

    def identity(self):
        return (1, 2)

    def held(self):
        return {"keys": self.keys.copy(), "buttons": self.buttons.copy()}

    def physical_held(self):
        return {"keys": set(), "buttons": set()}

    def physical_events(self):
        return []

    def button(self, code, down):
        (self.buttons.add if down else self.buttons.discard)(code)

    def move(self, x, y):
        self.moves.append((x, y))

    def sync(self):
        pass


class Helper:
    def __init__(self, native, now, startup=0.1, move_latency=0.003):
        self.native, self.now = native, now
        self.startup, self.move_latency = startup, move_latency
        self.process = SimpleNamespace(poll=lambda: None)
        self.commands = []
        self.fenced = False
        self.stall_after = None

    def ready(self, guard):
        guard()
        self.now[0] += self.startup
        guard()

    def exchange(self, command, guard):
        guard()
        self.commands.append(command)
        getattr(self.native, command["op"])(*command["args"])
        self.now[0] += self.move_latency
        if self.stall_after == len(self.commands):
            self.now[0] += 2
        guard()

    def fence(self):
        self.fenced = True
        return True


def plan(native):
    return guardian.input_steps(
        {"type": "polyline", "duration": 0.8, "points": [[i, i % 2] for i in range(17)]}, native
    )


def rig(monkeypatch, **kwargs):
    now = [0.0]
    monkeypatch.setattr(
        guardian.time, "sleep", lambda seconds: now.__setitem__(0, now[0] + seconds)
    )
    native = Native()
    helper = Helper(native, now, **kwargs)
    lease = guardian.Guardian(
        native, helper, lambda step: None, controller_fd=None, clock=lambda: now[0]
    )
    return native, helper, lease


def test_cold_start_is_paid_once_without_renewing_lease(monkeypatch):
    native, helper, lease = rig(monkeypatch, startup=0.4)
    receipt = lease.run(plan(native))
    assert receipt["status"] == "executed" and receipt["released"]
    assert receipt["diagnostics"]["steps_completed"] == 35
    assert native.moves == [(i, i % 2) for i in range(17)]
    assert len(helper.commands) == 19 and not native.buttons
    assert lease.deadline == 2 and lease.dispatch_deadline == 1.75


@pytest.mark.parametrize(
    "startup, reason", [(1, "input_dispatch_expired"), (2.1, "input_lease_expired")]
)
def test_slow_start_refuses_before_any_input(monkeypatch, startup, reason):
    native, helper, lease = rig(monkeypatch, startup=startup)
    receipt = lease.run(plan(native))
    assert receipt["status"] == "unavailable" and receipt["reason"] == reason
    assert receipt["diagnostics"]["steps_completed"] == 0
    assert receipt["released"] and helper.fenced and helper.commands == []
    assert lease.deadline == 2 and lease.dispatch_deadline == 1.75


def test_slow_actual_dispatch_still_refuses_before_press(monkeypatch):
    native, helper, lease = rig(monkeypatch, move_latency=0.05)
    receipt = lease.run(plan(native))
    assert receipt["reason"] == "input_dispatch_expired"
    assert receipt["diagnostics"]["steps_completed"] == 1
    assert len(helper.commands) == 1 and not native.buttons


def test_post_press_stall_releases_without_replay(monkeypatch):
    native, helper, lease = rig(monkeypatch)
    helper.stall_after = 3
    receipt = lease.run(plan(native))
    assert receipt["status"] == "unknown" and receipt["reason"] == "input_lease_expired"
    assert receipt["released"] and helper.fenced and not native.buttons
    assert native.moves == [(0, 0), (1, 1)]
    assert len(helper.commands) == 3


def test_maximum_plan_is_refused_without_silent_partial(monkeypatch):
    native, helper, lease = rig(monkeypatch)
    steps = guardian.input_steps(
        {"type": "polyline", "duration": 1, "points": [[i, 1] for i in range(256)]}, native
    )
    receipt = lease.run(steps)
    assert receipt["reason"] == "input_dispatch_expired"
    assert receipt["diagnostics"]["steps_completed"] == 0
    assert receipt["status"] == "unavailable" and helper.commands == []


def test_ready_ack_is_transport_only_and_checks_guard():
    parent, child = socket.socketpair()
    helper = object.__new__(guardian.InjectionHelper)
    helper.sock, helper.buffer = parent, b""
    seen = []
    guards = []

    def peer():
        with child:
            message = b""
            while b"\n" not in message:
                message += child.recv(1024)
            seen.append(json.loads(message))
            child.sendall(b'{"ok":true}\n')

    thread = threading.Thread(target=peer)
    thread.start()
    try:
        helper.ready(lambda: guards.append(True))
    finally:
        parent.close()
        thread.join(timeout=2)
    assert not thread.is_alive() and guards
    assert seen == [{"op": "ready"}]


def test_injector_ready_has_no_native_effect(monkeypatch):
    from unittest.mock import Mock

    from src.computer.runtime import x11_owned_device, x11_worker_lifecycle

    native = Mock(independent_pointer=False)
    stream = Mock()
    stream.readline.side_effect = [b'{"display_name":":991"}\n', b'{"op":"ready"}\n', b""]
    sock = Mock()
    sock.makefile.return_value = stream
    monkeypatch.setattr(guardian.socket, "socket", lambda **kwargs: sock)
    monkeypatch.setattr(guardian.select, "select", lambda *args: ([], [], []))
    monkeypatch.setattr(x11_worker_lifecycle, "parent_watch", lambda **kwargs: None)
    monkeypatch.setattr(x11_worker_lifecycle, "REVOKED", False)
    monkeypatch.setattr(x11_owned_device, "open_input", lambda *args, **kwargs: native)
    guardian.injector(99)
    stream.write.assert_called_once_with(b'{"ok":true}\n')
    native.move.assert_not_called()
    native.button.assert_not_called()
    native.key.assert_not_called()
    native.close.assert_called_once()
    stream.close.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "identity_matches, release_failed", [(True, False), (False, False), (True, True)]
)
async def test_shared_cleanup_reports_only_measured_evidence(identity_matches, release_failed):
    backend = X11AttachedBackend(enabled=True, display_name=":991", monitor_names=["fixture"])
    backend._device_state = "not_created"
    backend._device_identity = (1, 2)
    backend._shared_cleanup_identity = (1, 2) if identity_matches else (3, 4)
    backend._release_failed = release_failed
    receipt = await backend.detach()
    assert receipt["released"] == (identity_matches and not release_failed)
    assert receipt["stopped"] == receipt["released"]
    assert receipt["no_inflight_input"] is True
    assert receipt["no_active_grabs"] is None
    assert receipt["physical_slaves_restored"] is None
    assert receipt["owned_masters_removed"] is None
    assert receipt["cleanup_checks"]["no_active_grabs"] == "unsupported_shared_server_probe"
    assert receipt["state"] == ("closed" if receipt["released"] else "quarantined")


@pytest.mark.asyncio
async def test_shared_cleanup_waits_for_inflight_job_to_settle():
    backend = X11AttachedBackend(enabled=True, display_name=":991", monitor_names=["fixture"])
    backend._device_state = "not_created"
    revoked = asyncio.Event()
    completed = asyncio.Event()

    async def job():
        await revoked.wait()
        await asyncio.sleep(0.02)
        completed.set()

    task = asyncio.create_task(job())
    backend._jobs[task] = ("capture", revoked)
    receipt = await backend.detach()
    assert completed.is_set() and task.done()
    assert receipt["released"] and receipt["no_inflight_input"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_field", [None, "no_active_grabs", "no_inflight_input"])
async def test_owned_cleanup_keeps_strict_native_certificate(bad_field):
    backend = X11AttachedBackend(enabled=True, display_name=":991", monitor_names=["fixture"])
    backend.creates_devices = True
    backend._device_state = "session_release_unverified"
    backend._restoration = {
        "released": True,
        "owned_devices": "removed",
        "physical_slaves_restored": True,
        "no_inflight_input": True,
        "no_active_grabs": True,
        "owned_masters_removed": True,
    }
    if bad_field:
        backend._restoration[bad_field] = False
    receipt = await backend.detach()
    assert receipt["released"] == (bad_field is None)
    assert "cleanup_checks" not in receipt
    assert receipt["no_active_grabs"] is (bad_field != "no_active_grabs")
    assert receipt["no_inflight_input"] is (bad_field != "no_inflight_input")
