"""PR 749 attached-runtime contracts using fake pipes, never a native display."""

import asyncio
import copy
import ctypes
import hashlib
import json
import subprocess
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime import recovery
from src.computer.runtime import x11_attached as attached
from src.computer.runtime.profile import unit_for


@pytest.fixture(autouse=True)
def forbid_native_transport(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("This suite must not launch a process or load native display libraries")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(ctypes, "CDLL", forbidden)
    monkeypatch.setattr(recovery, "boot_id", forbidden)
    monkeypatch.setattr(recovery, "_processes_gone", forbidden)


def backend():
    b = attached.X11AttachedBackend(
        enabled=True, display_name=":997", monitor_names=["fixture"], input_enabled=True
    )
    b._started = True
    b._selected = "source"
    b._sources = {"source": {"name": "fixture", "width": 100, "height": 80}}
    b._incarnation_epoch = b._frame_incarnation_epoch = 4
    b._scope = {"window": 7, "process": [11, 22, 33], "modal": False,
                "window_kind": "normal", "transient_chain": [], "transient_processes": []}
    b._frame = SimpleNamespace(focused=True)
    b._device_identity = [[2, "fake XTEST", 1, 3, True]]
    return b


class Pipe:
    def __init__(self):
        self.messages = []
        self.closed = False
        self.on_drain = None

    def write(self, data):
        assert not self.closed
        self.messages.append(json.loads(data))

    async def drain(self):
        if self.on_drain:
            self.on_drain()

    def close(self):
        self.closed = True


class Process:
    def __init__(self, lines, *, returncode=0):
        self.stdin = Pipe()
        self.lines = list(lines)
        self.returncode = returncode
        self.on_read = None
        self.on_wait = None
        self.stdout = SimpleNamespace(readline=self.readline)
        self.wait = AsyncMock(side_effect=self.waited)

    async def readline(self):
        if self.on_read:
            self.on_read()
        return self.lines.pop(0) if self.lines else b""

    async def waited(self):
        if self.on_wait:
            self.on_wait()
        return self.returncode


def encoded(value):
    return json.dumps(value).encode() + b"\n"


def install_process(monkeypatch, b, process):
    spawn = AsyncMock(return_value=process)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    reap = AsyncMock()
    monkeypatch.setattr(b, "_reap", reap)
    ready = AsyncMock()
    monkeypatch.setattr(b, "_worker_ready", ready)
    return spawn, reap, ready


@pytest.mark.asyncio
async def test_watcher_events_revoke_only_recovery_and_resolve_live_barriers(monkeypatch):
    b = backend()
    revoke = asyncio.Event()
    recovery_revoked, capture_revoked = asyncio.Event(), asyncio.Event()
    b._jobs = {object(): ("recovery", recovery_revoked), object(): ("capture", capture_revoked)}
    loop = asyncio.get_running_loop()
    barrier = loop.create_future()
    completed = loop.create_future()
    completed.set_result("already settled")
    b._incarnation_barriers = {"live": barrier, "done": completed}
    events = [
        {"event": "incarnation_unavailable"},
        {"event": "incarnation_changed", "incarnation_epoch": 5},
        {"event": "incarnation_barrier", "incarnation_epoch": 5, "barrier": "live"},
        {"event": "incarnation_barrier", "incarnation_epoch": 5, "barrier": "done"},
        {"event": "incarnation_barrier", "incarnation_epoch": None, "barrier": "missing"},
    ]
    child = Process([encoded(event) for event in events])
    reads = 0

    def before_read():
        nonlocal reads
        if reads == 1:
            assert b._incarnation_epoch is None
            assert recovery_revoked.is_set() and not capture_revoked.is_set()
            recovery_revoked.clear()
        elif reads == 2:
            assert b._incarnation_epoch == 5 and recovery_revoked.is_set()
        elif reads == len(events):
            revoke.set()
        reads += 1

    child.on_read = before_read
    _, reap, _ = install_process(monkeypatch, b, child)
    ready = loop.create_future()
    ready.set_result(True)
    await b._watch_topology(revoke, ready)
    assert barrier.result() == 5 and completed.result() == "already settled"
    assert not capture_revoked.is_set()
    assert b._topology_error is None and b._incarnation_epoch == 5
    assert child.stdin.messages == [b._config] and child.stdin.closed
    reap.assert_awaited_once_with(child)


@pytest.mark.asyncio
@pytest.mark.parametrize("event,epoch", [
    ("incarnation_changed", None), ("incarnation_changed", True),
    ("incarnation_changed", 0), ("incarnation_changed", "5"),
    ("incarnation_barrier", False), ("incarnation_barrier", 0),
    ("incarnation_barrier", 5),
])
async def test_watcher_invalid_incarnation_events_fail_closed(monkeypatch, event, epoch):
    b = backend()
    child = Process([encoded({"event": event, "incarnation_epoch": epoch})])
    _, reap, _ = install_process(monkeypatch, b, child)
    ready = asyncio.get_running_loop().create_future()
    await b._watch_topology(asyncio.Event(), ready)
    with pytest.raises(attached.AttachedFailure, match="incarnation_monitor_unavailable"):
        ready.result()
    assert b._topology_error == "topology_monitor_unavailable"
    assert b._frame is None and b._revision == 1 and b._topology_epoch == 1
    assert child.stdin.closed
    reap.assert_awaited_once_with(child)


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["success", "drain_error", "cancelled"])
async def test_incarnation_barrier_round_trip_and_cleanup(monkeypatch, outcome):
    b = backend()
    child = Process([])
    child.returncode = None
    b._topology_child = child
    observed_tokens = []

    def acknowledge():
        token = child.stdin.messages[-1]["incarnation_barrier"]
        observed_tokens.append(token)
        assert token in b._incarnation_barriers
        future = b._incarnation_barriers[token]
        if outcome == "drain_error":
            raise OSError("fake closed transport")
        if outcome == "cancelled":
            future.cancel()
        else:
            future.set_result(4)

    child.stdin.on_drain = acknowledge
    if outcome == "success":
        assert await b._incarnation_barrier() == 4
    else:
        error = OSError if outcome == "drain_error" else asyncio.CancelledError
        with pytest.raises(error):
            await b._incarnation_barrier()
    assert len(observed_tokens) == 1 and b._incarnation_barriers == {}
    assert not child.stdin.closed  # A barrier does not revoke the retained watcher.


@pytest.mark.asyncio
@pytest.mark.parametrize("epoch", [None, 5])
async def test_recover_target_requires_a_synchronized_exact_epoch(monkeypatch, epoch):
    b = backend()
    binding = b.recovery_binding()
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=epoch))
    work = AsyncMock()
    monkeypatch.setattr(b, "_work", work)
    assert await b.recover_target(binding) == {
        "status": "target_changed", "focus_requested": False, "released": True, "attempts": 0
    }
    work.assert_not_awaited()
    assert b._frame is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("requested,recent", [(False, False), (True, False), (True, True)])
async def test_recover_target_copies_identity_and_records_only_requested_refocus(
    monkeypatch, requested, recent
):
    b = backend()
    binding = b.recovery_binding()
    monkeypatch.setattr(attached, "time", SimpleNamespace(monotonic=lambda: 100))
    if recent:
        b._last_recovery_refocus = 98
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=4))
    reply = {"status": "recovered", "focus_requested": requested, "released": True, "attempts": 1}

    async def work(kind, operation, request):
        assert kind == "recovery" and operation == b._recovery_worker_owned
        assert b._frame is None
        assert request == {**b._config, "selected": binding["selected"],
                           "scope": binding["scope"], "recent_refocus": recent,
                           "incarnation_epoch": 4, "expected_device_identity": b._device_identity}
        assert request["expected_device_identity"] is not b._device_identity
        request["expected_device_identity"].clear()
        return reply

    monkeypatch.setattr(b, "_work", work)
    assert await b.recover_target(binding) == reply
    assert b._device_identity
    if requested:
        assert b._last_recovery_refocus == 100
    else:
        assert not hasattr(b, "_last_recovery_refocus")


@pytest.mark.asyncio
@pytest.mark.parametrize("changed", ["closed", "paused", "generation", "topology", "incarnation"])
async def test_recover_target_downgrades_reply_when_binding_changes_in_flight(monkeypatch, changed):
    b = backend()
    binding = b.recovery_binding()
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=4))
    reply = {"status": "recovered", "focus_requested": True, "released": True, "attempts": 1}

    async def work(*args):
        field = {"closed": "_closed", "paused": "_paused", "generation": "_generation",
                 "topology": "_topology_epoch", "incarnation": "_incarnation_epoch"}[changed]
        setattr(b, field, True if changed in {"closed", "paused"} else getattr(b, field) + 1)
        return reply

    monkeypatch.setattr(b, "_work", work)
    assert await b.recover_target(binding) == {**reply, "status": "unavailable"}
    assert hasattr(b, "_last_recovery_refocus")


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [RuntimeError("interrupted"), asyncio.CancelledError()])
async def test_interrupted_recovery_retains_refocus_cooldown(monkeypatch, error):
    b = backend()
    binding = b.recovery_binding()
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=4))
    monkeypatch.setattr(b, "_work", AsyncMock(side_effect=error))
    monkeypatch.setattr(attached, "time", SimpleNamespace(monotonic=lambda: 100))
    with pytest.raises(type(error)):
        await b.recover_target(binding)
    assert b._last_recovery_refocus == 100 and b._frame is None


def recovery_reply(**overrides):
    return {"ok": True, "released": True, "status": "recovered",
            "focus_requested": True, "attempts": 1, **overrides}


@pytest.mark.asyncio
@pytest.mark.parametrize("sudo,prepared", [(False, False), (False, True), (True, True)])
async def test_recovery_worker_handshake_and_cleanup(monkeypatch, sudo, prepared):
    b = backend()
    b._runtime_sudo = sudo
    reply = recovery_reply()
    request = {"incarnation_epoch": 4}
    child = Process(([encoded({"prepared": "recovery"})] if prepared else []) + [encoded(reply)])
    spawn, reap, ready = install_process(monkeypatch, b, child)

    async def barrier():
        assert not child.stdin.closed and child.stdin.messages == [request]
        return 4

    monkeypatch.setattr(b, "_incarnation_barrier", barrier)
    revoked = asyncio.Event()
    assert await b._recovery_worker_owned(revoked, request) == reply
    assert child.stdin.messages == [request] + ([{"proceed": True}] if prepared else [])
    assert child.stdin.closed and b._workers[revoked] is child and child in b._children
    assert any(arg.endswith("x11_recovery.py") for arg in spawn.await_args.args)
    assert spawn.await_args.kwargs["env"] == attached.worker_environment("")
    assert spawn.await_args.kwargs["start_new_session"] is True
    reap.assert_awaited_once_with(child)
    assert ready.await_count == int(sudo)
    if sudo:
        ready.assert_awaited_once_with(child, "recovery")


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["before_spawn", "after_spawn", "barrier", "after_wait"])
async def test_recovery_worker_revocation_never_replays_or_skips_reaping(monkeypatch, stage):
    b = backend()
    revoked = asyncio.Event()
    request = {"incarnation_epoch": 4}
    child = Process([encoded({"prepared": "recovery"}), encoded(recovery_reply())])
    spawn, reap, _ = install_process(monkeypatch, b, child)
    barrier = AsyncMock(return_value=4)
    monkeypatch.setattr(b, "_incarnation_barrier", barrier)
    if stage == "before_spawn":
        revoked.set()
    elif stage == "after_spawn":
        async def spawn_then_revoke(*args, **kwargs):
            revoked.set()
            return child
        spawn.side_effect = spawn_then_revoke
    elif stage == "barrier":
        barrier.return_value = 5
    else:
        child.on_wait = revoked.set
    with pytest.raises(attached.AttachedFailure, match="recovery_revoked"):
        await b._recovery_worker_owned(revoked, request)
    if stage == "before_spawn":
        spawn.assert_not_awaited()
        reap.assert_not_awaited()
    else:
        reap.assert_awaited_once_with(child)
        assert child.stdin.closed
        assert child.stdin.messages == ([] if stage == "after_spawn" else
                                        [request] + ([{"proceed": True}]
                                                     if stage == "after_wait" else []))


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [
    {"ok": False}, {"released": False}, {"status": "executed"},
    {"focus_requested": 1}, {"attempts": True}, {"attempts": -1}, {"attempts": 3},
    {"attempts": "1"}, {"returncode": 1}, {"not_dict": True},
])
async def test_recovery_worker_rejects_untrusted_receipts(monkeypatch, change):
    b = backend()
    change = dict(change)
    code = change.pop("returncode", 0)
    reply = [] if change.pop("not_dict", False) else recovery_reply(**change)
    child = Process([encoded(reply)], returncode=code)
    _, reap, _ = install_process(monkeypatch, b, child)
    with pytest.raises(attached.AttachedFailure, match="invalid_recovery_reply"):
        await b._recovery_worker_owned(asyncio.Event(), {"incarnation_epoch": 4})
    assert child.stdin.closed and child.stdin.messages == [{"incarnation_epoch": 4}]
    reap.assert_awaited_once_with(child)


BOOT = "00000000-0000-0000-0000-000000000000"


def descriptor():
    return {"version": 1, "kind": "processes", "session_id": "fake-session",
            "boot_id": BOOT, "launch_pending": False,
            "processes": [{"pid": 777777, "start_ticks": 123}],
            "no_persistent_devices": True, "input_was_enabled": True}


@pytest.mark.asyncio
@pytest.mark.parametrize("case", [
    "gone", "remaining", "inspection_error", "missing", "invalid", "pending", "reboot", "isolated"
])
async def test_reconciliation_census_requires_same_boot_and_exact_process_group_absence(
    monkeypatch, case
):
    b = backend()
    b._runtime_descriptor = descriptor()
    boot = Mock(return_value=BOOT if case != "reboot" else "11111111-1111-1111-1111-111111111111")
    census = Mock(return_value=None if case != "remaining" else "owned_process_group_remaining")
    if case == "inspection_error":
        census.side_effect = OSError("unreadable fake process")
    if case == "missing":
        b._runtime_descriptor = None
    elif case == "invalid":
        b._runtime_descriptor["processes"][0]["start_ticks"] = -1
    elif case == "pending":
        b._runtime_descriptor["launch_pending"] = True
    elif case == "isolated":
        value = b._runtime_descriptor
        value["kind"] = "isolated"
        value.pop("no_persistent_devices")
        value.pop("input_was_enabled")
        prefix = hashlib.sha256(value["session_id"].encode()).hexdigest()[:32]
        value["token"] = prefix + "-" + "0" * 32
        value["unit"] = unit_for(value["token"])
    original = copy.deepcopy(b._runtime_descriptor)
    monkeypatch.setattr(recovery, "boot_id", boot)
    monkeypatch.setattr(recovery, "_processes_gone", census)
    assert await b._reconciliation_census() is (case == "gone")
    assert b._runtime_descriptor == original
    if case in {"gone", "remaining", "inspection_error"}:
        inspection = census.call_args.args[0]
        assert inspection == {**original, "kind": "isolated"}
        assert inspection is not b._runtime_descriptor
        assert inspection["processes"] is not b._runtime_descriptor["processes"]
        boot.assert_called_once_with()
    else:
        census.assert_not_called()
        if case != "reboot":
            boot.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize("sudo", [False, True])
async def test_shared_query_is_tracked_read_only_and_works_behind_terminal_fence(monkeypatch, sudo):
    b = backend()
    b._closed = b._paused = True
    b._runtime_sudo = sudo
    expected = copy.deepcopy(b._device_identity)
    proof = {"ok": True, "all_up": True, "device_identity": expected}
    child = Process([encoded(proof)])
    spawn, reap, ready = install_process(monkeypatch, b, child)
    assert await b._query_shared_all_up(expected) == proof
    assert child.stdin.messages == [{**b._config, "operation": "reconcile_shared_all_up",
                                     "expected_device_identity": expected}]
    assert child.stdin.closed and child in b._children
    assert spawn.await_args.kwargs["start_new_session"] is True
    assert ready.await_count == int(sudo)
    if sudo:
        ready.assert_awaited_once_with(child, "capture")
    reap.assert_awaited_once_with(child)


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["truncated", "oversized", "exit", "json", "timeout"])
async def test_shared_query_reaps_worker_on_every_bad_reply(monkeypatch, failure):
    b = backend()
    output = {"truncated": b'{"ok":true}', "oversized": b"x" * (attached.MAX_REPLY + 1) + b"\n",
              "exit": b"{}\n", "json": b"not-json\n", "timeout": b"{}\n"}[failure]
    child = Process([output], returncode=1 if failure == "exit" else 0)
    _, reap, _ = install_process(monkeypatch, b, child)
    if failure == "timeout":
        async def slow_read():
            await asyncio.Event().wait()
        child.stdout.readline = slow_read
        monkeypatch.setattr(attached, "CAPTURE_TIMEOUT", 0.001)
    error, message = {
        "truncated": (attached.AttachedFailure, "reconciliation_reply_invalid"),
        "oversized": (attached.AttachedFailure, "reconciliation_reply_invalid"),
        "exit": (attached.AttachedFailure, "reconciliation_worker_failed"),
        "json": (json.JSONDecodeError, None), "timeout": (TimeoutError, None),
    }[failure]
    with pytest.raises(error, match=message):
        await b._query_shared_all_up(b._device_identity)
    assert child.stdin.closed and len(child.stdin.messages) == 1
    reap.assert_awaited_once_with(child)


@pytest.mark.asyncio
async def test_shared_query_spawn_failure_does_not_reap_an_unowned_process(monkeypatch):
    b = backend()
    spawn = AsyncMock(side_effect=OSError("fake spawn failed"))
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    reap = AsyncMock()
    monkeypatch.setattr(b, "_reap", reap)
    with pytest.raises(OSError, match="fake spawn failed"):
        await b._query_shared_all_up(b._device_identity)
    reap.assert_not_awaited()
    assert not b._children


@pytest.mark.asyncio
async def test_reconciliation_query_error_preserves_historical_release_failure(monkeypatch):
    b = backend()
    b._runtime_descriptor = descriptor()
    b._release_failed = True
    b._device_state = "persistent_release_unverified"
    monkeypatch.setattr(b, "_reconciliation_census", AsyncMock(return_value=True))
    query = AsyncMock(side_effect=OSError("fake native query unavailable"))
    monkeypatch.setattr(b, "_query_shared_all_up", query)
    result = await b.reconcile_owned_cleanup()
    assert result == {"reconciled": False, "reason": "synthetic_query_unavailable",
                      "proof_scope": "recorded_synthetic_devices_only",
                      "physical_release_proven": False}
    query.assert_awaited_once_with(b._device_identity)
    assert query.await_args.args[0] is not b._device_identity
    assert b._closed and b._paused and not b.input_supported and b._frame is None
    assert b._release_failed and b._device_state == "persistent_release_unverified"
    assert b._shared_reconciliation is None
