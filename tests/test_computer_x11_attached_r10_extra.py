"""Attached runtime fault contracts with mocked processes/proc, never live X."""
import asyncio
import json
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import recovery
from src.computer.runtime import x11_attached as attached


@pytest.fixture(autouse=True)
def no_native_spawn(monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail("unexpected native worker spawn")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)


def backend(**kwargs):
    return attached.X11AttachedBackend(
        enabled=True, display_name=":177", monitor_names=["fake"], **kwargs)


class Process:
    pid = 700

    def __init__(self, lines=(), waits=()):
        self.lines = iter(lines)
        self.waits = iter(waits)
        self.stdin = self.stdout = self
        self.returncode = None
        self.writes = []
        self.closed = False
        self.signals = []

    async def readline(self):
        return next(self.lines, b"")

    def write(self, data):
        self.writes.append(json.loads(data))

    async def drain(self):
        pass

    def close(self):
        self.closed = True

    async def wait(self):
        result = next(self.waits, 0)
        if isinstance(result, BaseException):
            raise result
        self.returncode = result
        return result

    def terminate(self):
        self.signals.append("terminate")
        raise ProcessLookupError

    def kill(self):
        self.signals.append("kill")
        raise ProcessLookupError


def test_configuration_strict_types():
    with pytest.raises(attached.AttachedFailure, match="authority"):
        attached.attachment_configuration(":177", "relative", ["fake"], "drawing")
    for kwargs, reason in [({"input_enabled": 1}, "input_configuration"),
                           ({"runtime_sudo": 1}, "privilege_configuration")]:
        with pytest.raises(attached.AttachedFailure, match=reason):
            backend(**kwargs)


def test_spawn_descriptor_atomic_callback_and_limits(monkeypatch):
    b = backend()
    b._runtime_descriptor = {"processes": [], "launch_pending": False}
    recorded = []
    b.runtime_identity_callback = recorded.append
    b._record_spawn()
    assert recorded[-1]["launch_pending"]
    identity = {"pid": 700, "start_ticks": 22}
    monkeypatch.setattr(recovery, "process_identity", lambda pid: identity)
    b._record_spawn(Process())
    assert b._runtime_descriptor["processes"] == [identity]
    assert not b._runtime_descriptor["launch_pending"]
    recorded[-1]["processes"].clear()
    assert b._runtime_descriptor["processes"] == [identity]
    monkeypatch.setattr(recovery, "process_identity", lambda pid: None)
    with pytest.raises(attached.AttachedFailure, match="identity_unavailable"):
        b._record_spawn(Process())
    b._runtime_descriptor["processes"] = [identity] * 2048
    with pytest.raises(attached.AttachedFailure, match="process_limit"):
        b._record_spawn()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["ok", "role", "uid", "ancestry"])
async def test_privileged_identity_gate(monkeypatch, mode):
    identity = {"pid": 701, "start_ticks": 22}
    message = {"ready": "capture" if mode != "role" else "wrong", "identity": identity}
    child = Process([json.dumps(message).encode()])
    b = backend(runtime_sudo=True)
    monkeypatch.setattr(recovery, "process_identity", lambda pid: identity)

    def proc_text(path):
        if str(path).endswith("status"):
            return "Uid:\t" + ("1 1 1 1" if mode == "uid" else "0 0 0 0")
        return "701 (fake worker) S " + ("701" if mode == "ancestry" else "700")

    monkeypatch.setattr(attached.Path, "read_text", proc_text)
    if mode == "ok":
        assert await b._worker_ready(child, "capture") == identity
        assert b._worker_identities[child] == [identity]
    else:
        reason = {"role": "identity", "uid": "privilege", "ancestry": "ancestry"}[mode]
        with pytest.raises(attached.AttachedFailure, match=reason + "_unverified"):
            await b._worker_ready(child, "capture")
        assert not b._worker_identities


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["gone", "missing", "error", "remaining", "eventually"])
async def test_identity_disappearance(monkeypatch, mode):
    b, child = backend(), Process()
    identity = {"pid": 701, "start_ticks": 22}
    b._worker_identities[child] = [identity]
    calls = []

    def lookup(pid):
        calls.append(pid)
        if mode == "missing":
            raise FileNotFoundError
        if mode == "error":
            raise OSError
        if mode == "remaining" or (mode == "eventually" and len(calls) == 1):
            return identity
        return None

    monkeypatch.setattr(recovery, "process_identity", lookup)
    assert await b._identities_gone(child, timeout=0 if mode == "remaining" else 1) is (
        mode in {"gone", "missing", "eventually"})
    if mode == "eventually":
        assert len(calls) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("sudo,waits,failed", [
    (False, [TimeoutError(), 0], False),
    (False, [TimeoutError(), TimeoutError()], True),
    (True, [0], False),
])
async def test_reaping_escalation_and_verified_privileged_exit(monkeypatch, sudo, waits, failed):
    b, child = backend(runtime_sudo=sudo), Process(waits=waits)
    b._children.add(child)
    monkeypatch.setattr(recovery, "process_identity", lambda pid: None)
    b._worker_identities[child] = [{"pid": 701, "start_ticks": 22}]
    await b._reap_owned(child)
    assert b._release_failed is failed
    assert (child in b._children) is failed
    assert child.signals == ([] if sudo else ["terminate", "kill"])


@pytest.mark.asyncio
@pytest.mark.parametrize("payload,reason", [
    (b'{"ok":true}\n', None), (b'[]\n', "capture_unavailable"),
    (b'{"ok":false}\n', "capture_unavailable"),
    (b'not json\n', "capture_unavailable"), (b'{}', "capture_reply_limit"),
])
async def test_capture_protocol_and_reaping(monkeypatch, payload, reason):
    b, child = backend(), Process([payload])
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=child))
    if reason:
        with pytest.raises(attached.AttachedFailure, match=reason):
            await b._read_worker("sources")
    else:
        assert await b._read_worker("sources") == {"ok": True}
    assert child.closed and not b._children
    assert child.writes[0]["operation"] == "sources"


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["work", "capture", "input", "select", "resume", "export"])
async def test_inactive_and_revoked_routes(operation):
    b = backend()
    if operation in {"work", "capture", "input"}:
        b._paused = True
    call = {
        "work": lambda: b._read_worker("sources"),
        "capture": lambda: b._read_worker_owned(asyncio.Event(), "sources"),
        "input": lambda: b._input_worker_owned(asyncio.Event(), {}),
        "select": lambda: b.select_source("fake"),
        "resume": lambda: b.resume(consent_generation=2),
        "export": lambda: b.export("fake"),
    }[operation]
    with pytest.raises(attached.AttachedFailure):
        await call()


@pytest.mark.asyncio
@pytest.mark.parametrize("sources", [[], [{}], "invalid"])
async def test_start_failure_detaches_and_cannot_reuse(monkeypatch, sources):
    b = backend()
    monkeypatch.setattr(b, "_read_worker", AsyncMock(return_value={"sources": sources}))
    with pytest.raises(attached.AttachedFailure, match="selected_sources_unavailable"):
        await b.start("test")
    assert b._closed and b._paused
    with pytest.raises(attached.AttachedFailure, match="single_use"):
        await b.start("test")


@pytest.mark.asyncio
@pytest.mark.parametrize("remaining", [False, True])
async def test_privileged_guardian_identity_ack_and_cleanup(monkeypatch, remaining):
    guardian_id = {"pid": 700, "start_ticks": 21}
    injector_id = {"pid": 701, "start_ticks": 22}
    lines = [json.dumps(message).encode() + b"\n" for message in [
        {"ready": "guardian", "identity": guardian_id},
        {"ready": "injector", "identity": injector_id},
        {"released": True, "status": "executed"},
    ]]
    b, child = backend(runtime_sudo=True), Process(lines)
    b._runtime_descriptor = {"processes": [], "launch_pending": False}
    lookups = []

    def lookup(pid):
        lookups.append(pid)
        # Descriptor recording plus the two handshakes see living identities.
        if len(lookups) <= 3 or remaining:
            return guardian_id if pid == 700 else injector_id
        return None

    monkeypatch.setattr(recovery, "process_identity", lookup)
    monkeypatch.setattr(attached.Path, "read_text", lambda path:
                        "Uid: 0 0 0 0" if str(path).endswith("status")
                        else "701 (fake worker) S 700")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=child))
    if remaining:
        with pytest.raises(attached.AttachedFailure, match="input_outcome_unknown"):
            await b._input_worker({"action": {"type": "click"}})
    else:
        assert await b._input_worker({"action": {"type": "click"}}) == {
            "released": True, "status": "executed"}
    assert child.writes[1] == {"ack": injector_id}
    assert child.closed and not b._guardians
    assert b._release_failed is remaining
    assert not b._runtime_descriptor["launch_pending"]
    assert b._runtime_descriptor["processes"] == [guardian_id, guardian_id, injector_id]
