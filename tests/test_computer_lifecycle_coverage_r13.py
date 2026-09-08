"""In-process F1 lifecycle tests.

These use pipe and process doubles only.  In particular, no test opens an X
display or delegates cleanup to an OS process, so the assertions exercise the
controller's decisions rather than merely accepting a helper's exit status.
"""
from __future__ import annotations

import asyncio
import builtins
import os
from types import SimpleNamespace

import pytest

from src.computer.runtime import x11_session_lifecycle as session_lifecycle
from src.computer.runtime import x11_worker_lifecycle as worker_lifecycle
from src.computer.runtime.x11_attached import AttachedFailure, X11AttachedBackend

SESSION_PREFIX = "Odin session " + "1" * 32


def _backend(*, runtime_sudo=False):
    return X11AttachedBackend(
        enabled=True,
        display_name=":991",
        monitor_names=["fixture"],
        input_enabled=True,
        runtime_sudo=runtime_sudo,
    )


def _startup_receipt(**changes):
    receipt = {
        "ok": True,
        "released": True,
        "device_identity": [[21, "pointer"], [22, "keyboard"]],
        "owned_devices": "session_idle",
        "session_input_devices": True,
        "persistent_input_devices": False,
    }
    receipt.update(changes)
    return receipt


def _restoration(**changes):
    receipt = {
        "released": True,
        "owned_devices": "removed",
        "physical_slaves_restored": True,
        "no_inflight_input": True,
        "no_active_grabs": True,
        "owned_masters_removed": True,
    }
    receipt.update(changes)
    return receipt


class _Stdin:
    def __init__(self):
        self.writes = []
        self.drains = 0
        self.closed = False

    def write(self, value):
        if self.closed:
            raise BrokenPipeError
        self.writes.append(value)

    async def drain(self):
        self.drains += 1

    def close(self):
        self.closed = True


class _Stdout:
    def __init__(self, rows):
        import json

        self.rows = [row if isinstance(row, bytes) else json.dumps(row).encode() + b"\n"
                     for row in rows]

    async def readline(self):
        return self.rows.pop(0) if self.rows else b""


class _Child:
    _next_pid = 31000

    def __init__(self, rows, *, returncode=0, wait_gate=None):
        self.stdin = _Stdin()
        self.stdout = _Stdout(rows)
        self.returncode = returncode
        self.wait_gate = wait_gate
        self.pid = _Child._next_pid
        _Child._next_pid += 1
        self.waits = 0

    async def wait(self):
        self.waits += 1
        if self.wait_gate is not None:
            await self.wait_gate.wait()
        return self.returncode


def _lease_fd(initial=b"0"):
    fd = os.memfd_create("f1-lifecycle-test", os.MFD_CLOEXEC)
    os.write(fd, initial)
    return fd


@pytest.fixture(autouse=True)
def _reset_worker_revocation():
    before = worker_lifecycle.REVOKED
    worker_lifecycle.REVOKED = False
    try:
        yield
    finally:
        worker_lifecycle.REVOKED = before


def test_emit_treats_a_closed_controller_stdout_as_delivery_loss(monkeypatch):
    attempts = []

    def broken_print(*args, **kwargs):
        attempts.append((args, kwargs))
        raise BrokenPipeError

    monkeypatch.setattr(builtins, "print", broken_print)
    session_lifecycle.emit({"released": True})
    assert len(attempts) == 1
    assert attempts[0][1]["flush"] is True


@pytest.mark.parametrize("bad_fd", [-1, 0, 2, 3.0, True])
def test_input_lease_rejects_non_private_descriptors(bad_fd):
    with pytest.raises(RuntimeError, match="session_lease_required"):
        with session_lifecycle.input_lease(bad_fd):
            pytest.fail("invalid descriptor acquired authority")


def test_input_lease_closes_duplicate_when_lease_was_revoked(monkeypatch):
    fd = _lease_fd(b"0")
    real_close = os.close
    closed = []

    def recording_close(candidate):
        closed.append(candidate)
        real_close(candidate)

    monkeypatch.setattr(session_lifecycle.os, "close", recording_close)
    try:
        with pytest.raises(RuntimeError, match="session_lease_revoked"):
            with session_lifecycle.input_lease(fd):
                pytest.fail("revoked lease entered")
        assert len(closed) == 1 and closed[0] != fd
        assert os.pread(fd, 1, 0) == b"0"
    finally:
        real_close(fd)


def test_input_lease_admits_only_while_authority_byte_is_live():
    fd = _lease_fd(b"1")
    try:
        with session_lifecycle.input_lease(fd):
            assert os.pread(fd, 1, 0) == b"1"
        os.pwrite(fd, b"0", 0)
        with pytest.raises(RuntimeError, match="session_lease_revoked"):
            with session_lifecycle.input_lease(fd):
                pytest.fail("revoked authority was reused")
    finally:
        os.close(fd)


def test_serve_releases_authority_and_detaches_after_controller_eof(monkeypatch):
    events = []
    native = SimpleNamespace(
        identity=lambda: [(21, "pointer"), (22, "keyboard")],
        owned_release_state=lambda: {"keys": set(), "buttons": set()},
        detach_owned=lambda: events.append("detach") or _restoration(),
        close=lambda: events.append("close"),
    )
    from src.computer.runtime import x11_owned_device

    monkeypatch.setattr(x11_owned_device, "SessionXTest", lambda *args, **kwargs: native)
    monkeypatch.setattr(session_lifecycle.select, "select", lambda *args: ([0], [], []))
    monkeypatch.setattr(session_lifecycle, "emit", events.append)
    fd = _lease_fd()
    try:
        session_lifecycle.serve({"session_lease_fd": fd, "display_name": ":991",
                                 "session_prefix": SESSION_PREFIX})
        assert events[0]["ok"] is True
        assert events[0]["owned_devices"] == "session_idle"
        assert events[1:3] == ["detach", "close"]
        assert events[-1] == _restoration()
        assert os.pread(fd, 1, 0) == b"0"
    finally:
        os.close(fd)


def test_serve_revocation_skips_stdin_poll_and_reports_non_idle_creation(monkeypatch):
    closed = []
    native = SimpleNamespace(
        identity=lambda: [(7, "pointer")],
        owned_release_state=lambda: {"keys": {42}},
        detach_owned=lambda: _restoration(),
        close=lambda: closed.append(True),
    )
    from src.computer.runtime import x11_owned_device

    monkeypatch.setattr(x11_owned_device, "SessionXTest", lambda *args, **kwargs: native)
    monkeypatch.setattr(session_lifecycle.select, "select",
                        lambda *args: pytest.fail("revoked owner polled controller stdin"))
    receipts = []
    monkeypatch.setattr(session_lifecycle, "emit", receipts.append)
    worker_lifecycle.REVOKED = True
    fd = _lease_fd()
    try:
        with pytest.raises(RuntimeError, match="new_session_devices_not_idle"):
            session_lifecycle.serve({"session_lease_fd": fd, "display_name": ":991",
                                     "session_prefix": SESSION_PREFIX})
        assert receipts == [_restoration()]
        assert closed == [True]
        assert os.pread(fd, 1, 0) == b"0"
    finally:
        os.close(fd)


def test_serve_keeps_retrying_lease_and_native_cleanup_after_diagnostic_timeout(monkeypatch):
    events = []
    detach_calls = 0

    def detach():
        nonlocal detach_calls
        detach_calls += 1
        if detach_calls == 1:
            raise RuntimeError("temporary external grab")
        return _restoration()

    native = SimpleNamespace(
        identity=lambda: [], owned_release_state=lambda: {}, detach_owned=detach,
        close=lambda: events.append("closed"),
    )
    from src.computer.runtime import x11_owned_device

    monkeypatch.setattr(x11_owned_device, "SessionXTest", lambda *args, **kwargs: native)
    monkeypatch.setattr(session_lifecycle.select, "select", lambda *args: ([0], [], []))
    monkeypatch.setattr(session_lifecycle, "emit", events.append)
    clock = iter([0, 16, 16, 16, 16])
    monkeypatch.setattr(session_lifecycle.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(session_lifecycle.time, "sleep", lambda seconds: None)
    real_flock = session_lifecycle.fcntl.flock
    attempts = 0

    def delayed_flock(handle, operation):
        nonlocal attempts
        if operation & session_lifecycle.fcntl.LOCK_EX and attempts == 0:
            attempts += 1
            raise BlockingIOError
        return real_flock(handle, operation)

    monkeypatch.setattr(session_lifecycle.fcntl, "flock", delayed_flock)
    fd = _lease_fd()
    try:
        session_lifecycle.serve({"session_lease_fd": fd, "display_name": ":991",
                                 "session_prefix": SESSION_PREFIX})
        diagnostics = [row for row in events if isinstance(row, dict)
                       and row.get("owned_devices") == "unknown"]
        assert len(diagnostics) == 1
        assert detach_calls == 2
        assert events[-2:] == ["closed", _restoration()]
    finally:
        os.close(fd)


@pytest.mark.asyncio
async def test_attached_owner_consumes_intermediate_receipt_until_terminal_restoration(monkeypatch):
    backend = _backend()
    backend._session_lease_fd = _lease_fd()
    child = _Child([_startup_receipt(), _restoration(released=False), _restoration()])

    async def spawn(*args, **kwargs):
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    ready = asyncio.get_running_loop().create_future()
    try:
        await backend._own_device_lifecycle(ready)
        assert ready.result()["session_input_devices"] is True
        assert backend._restoration == _restoration()
        assert backend._device_state == "removed"
        assert backend._paused is True
        assert backend.input_supported is False
        assert child.stdin.closed and child.waits >= 1
        assert backend._lifecycle is child
        assert b'"session_lease_fd"' in child.stdin.writes[0]
    finally:
        os.close(backend._session_lease_fd)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("rows", "returncode", "ready_error"),
    [
        ([_startup_receipt(ok=False)], 0, "session_devices_unavailable"),
        ([_startup_receipt(), _restoration()], 7, None),
        ([_startup_receipt()], 0, None),
    ],
)
async def test_attached_owner_quarantines_bad_start_exit_and_eof(
        monkeypatch, rows, returncode, ready_error):
    backend = _backend()
    backend._session_lease_fd = _lease_fd(b"1")
    child = _Child(rows, returncode=returncode)

    async def spawn(*args, **kwargs):
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    ready = asyncio.get_running_loop().create_future()
    try:
        await backend._own_device_lifecycle(ready)
        if ready_error:
            with pytest.raises(AttachedFailure, match=ready_error):
                ready.result()
        else:
            assert ready.result()["ok"] is True
        assert backend._device_state == "session_release_unverified"
        assert backend._paused is True
        assert backend.input_supported is False
        assert os.pread(backend._session_lease_fd, 1, 0) == b"0"
        assert child.stdin.closed
    finally:
        os.close(backend._session_lease_fd)


@pytest.mark.asyncio
async def test_attached_owner_marks_cleanup_wait_timeout_without_killing_owner(monkeypatch):
    backend = _backend()
    backend._session_lease_fd = _lease_fd(b"1")
    never = asyncio.Event()
    child = _Child([_startup_receipt()], returncode=None, wait_gate=never)

    async def spawn(*args, **kwargs):
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr("src.computer.runtime.x11_attached.CLEANUP_TIMEOUT", 0.001)
    ready = asyncio.get_running_loop().create_future()
    try:
        await backend._own_device_lifecycle(ready)
        assert ready.result()["ok"] is True
        assert backend._release_failed is True
        assert backend._device_state == "session_release_unverified"
        assert child.stdin.closed
    finally:
        never.set()
        os.close(backend._session_lease_fd)


@pytest.mark.asyncio
async def test_private_lifecycle_start_returns_ready_without_waiting_for_restoration(monkeypatch):
    backend = _backend()
    owner_gate = asyncio.Event()
    startup = _startup_receipt()

    async def owner(ready):
        ready.set_result(startup)
        await owner_gate.wait()

    monkeypatch.setattr(backend, "_own_device_lifecycle", owner)
    monkeypatch.setattr("src.computer.runtime.x11_attached.CAPTURE_TIMEOUT", 0.1)
    try:
        assert await backend._start_device_lifecycle() == startup
        assert backend._lifecycle_job is not None
        assert not backend._lifecycle_job.done()
        assert os.pread(backend._session_lease_fd, 1, 0) == b"0"
    finally:
        owner_gate.set()
        await backend._lifecycle_job
        os.close(backend._session_lease_fd)


@pytest.mark.asyncio
async def test_cleanup_workers_distinguishes_deadline_from_verified_settlement(monkeypatch):
    backend = _backend()
    revoked = asyncio.Event()
    owner_gate = asyncio.Event()

    async def owned_job():
        await owner_gate.wait()

    job = asyncio.create_task(owned_job())
    backend._jobs[job] = ("input", revoked)
    child = _Child([])
    backend._workers[revoked] = child
    monkeypatch.setattr("src.computer.runtime.x11_attached.CLEANUP_TIMEOUT", 0.001)
    try:
        assert await backend._cleanup_workers() is False
        assert revoked.is_set() and child.stdin.closed
        assert not job.done()
        owner_gate.set()
        await job
        backend._jobs.clear()
        backend._workers.clear()
        assert await backend._cleanup_workers() is True
    finally:
        owner_gate.set()
        if not job.done():
            await job


@pytest.mark.asyncio
async def test_pause_reports_unsettled_authority_and_resume_rejects_it(monkeypatch):
    backend = _backend()

    async def unsettled():
        return False

    monkeypatch.setattr(backend, "_cleanup_workers", unsettled)
    result = await backend.pause()
    assert result["paused"] is True
    assert result["input_revoked"] is True
    assert result["capture_revoked"] is True
    assert result["released"] is False
    assert result["owned_devices"] == "not_created"
    assert result["resume_requires_new_session"] is False
    backend._release_failed = True
    with pytest.raises(AttachedFailure, match="owned_release_unverified"):
        await backend.resume(consent_generation=2)
