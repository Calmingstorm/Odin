"""Recovery worker protocol contracts, with fake pipes and no native calls."""

import asyncio
import ctypes
import io
import json
import subprocess
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import x11_recovery
from src.computer.runtime.x11_attached import AttachedFailure
from tests.test_computer_adapters_r11 import backend


@pytest.fixture(autouse=True)
def no_native(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Native desktop/process access forbidden")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(ctypes, "CDLL", forbidden)


class Pipe:
    def __init__(self):
        self.messages = []
        self.closed = False

    def write(self, value):
        assert not self.closed
        self.messages.append(json.loads(value))

    async def drain(self):
        pass

    def close(self):
        self.closed = True


def worker(monkeypatch, b, *, prepared=True):
    pipe = Pipe()
    reply = {"ok": True, "status": "recovered", "released": True,
             "focus_requested": True, "attempts": 1}
    lines = ([b'{"prepared":"recovery"}\n'] if prepared else []) + [
        json.dumps(reply).encode() + b"\n"]

    async def readline():
        line = lines.pop(0)
        if b"prepared" not in line and prepared:
            assert pipe.messages[-1] == {"proceed": True}
        return line

    child = SimpleNamespace(stdin=pipe, stdout=SimpleNamespace(readline=readline),
                            returncode=0, wait=AsyncMock())
    # Runtime child collections require a hashable process-like object.
    class Process:
        pass

    process = Process()
    process.__dict__.update(child.__dict__)
    spawn = AsyncMock(return_value=process)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(b, "_record_spawn", lambda *args, **kwargs: None)
    monkeypatch.setattr(b, "_reap", AsyncMock())
    return process, spawn, reply


@pytest.mark.asyncio
@pytest.mark.parametrize("sudo", [False, True])
async def test_prepared_barrier_precedes_proceed(monkeypatch, sudo):
    b = backend()
    b._runtime_sudo = sudo
    child, spawn, expected = worker(monkeypatch, b)
    ready = AsyncMock()
    monkeypatch.setattr(b, "_worker_ready", ready)

    async def barrier():
        assert child.stdin.messages == [{"incarnation_epoch": 4}]
        return 4

    monkeypatch.setattr(b, "_incarnation_barrier", barrier)
    revoked = asyncio.Event()
    result = await b._recovery_worker_owned(revoked, {"incarnation_epoch": 4})
    assert result == expected
    assert child.stdin.messages == [{"incarnation_epoch": 4}, {"proceed": True}]
    assert child.stdin.closed
    assert spawn.await_count == b._reap.await_count == 1
    assert ready.await_count == int(sudo)


@pytest.mark.asyncio
@pytest.mark.parametrize("epoch,revoked_during_barrier", [(5, False), (4, True)])
async def test_changed_or_revoked_barrier_never_authorizes(monkeypatch, epoch,
                                                         revoked_during_barrier):
    b = backend()
    child, _, _ = worker(monkeypatch, b)
    revoked = asyncio.Event()

    async def barrier():
        if revoked_during_barrier:
            revoked.set()
        return epoch

    monkeypatch.setattr(b, "_incarnation_barrier", barrier)
    with pytest.raises(AttachedFailure, match="recovery_revoked"):
        await b._recovery_worker_owned(revoked, {"incarnation_epoch": 4})
    assert child.stdin.messages == [{"incarnation_epoch": 4}]
    assert child.stdin.closed and b._reap.await_count == 1


@pytest.mark.asyncio
async def test_failed_setup_reply_never_sends_proceed(monkeypatch):
    b = backend()
    child, _, _ = worker(monkeypatch, b, prepared=False)
    barrier = AsyncMock()
    monkeypatch.setattr(b, "_incarnation_barrier", barrier)
    await b._recovery_worker_owned(asyncio.Event(), {"incarnation_epoch": 4})
    assert child.stdin.messages == [{"incarnation_epoch": 4}]
    barrier.assert_not_awaited()
    assert child.stdin.closed


@pytest.mark.parametrize("proceed", [True, False])
def test_native_alarm_rearmed_only_after_overlap_authorization(monkeypatch, proceed):
    output = io.StringIO()
    alarms = []
    monkeypatch.setattr(x11_recovery.sys, "__stdout__", output)
    monkeypatch.setattr(x11_recovery.signal, "alarm", alarms.append)

    def gate():
        assert json.loads(output.getvalue()) == {"prepared": "recovery"}
        assert not alarms
        return {"proceed": proceed}

    if proceed:
        x11_recovery.authorize_recovery(gate)
        assert alarms == [32]
        assert alarms[0] > x11_recovery.WAIT_SECONDS + 1
    else:
        with pytest.raises(RuntimeError, match="recovery_revoked"):
            x11_recovery.authorize_recovery(gate)
        assert not alarms
