import asyncio
import base64
import builtins
import io
import json
import re
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.tools import process_manager as pm


class Lease:
    def __init__(self):
        self.target = SimpleNamespace(alias="remote")
        self.revoked = False
        self.released = False

    async def run(self, factory):
        return await factory()

    def release(self):
        self.released = True


@pytest.fixture
def registry(monkeypatch):
    reg = pm.ProcessRegistry()
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    reg._schedule_output_expiry = lambda info: None
    return reg


def info(pid=9123, **kwargs):
    return pm.ProcessInfo(pid, "harmless fixture", "localhost", 1, **kwargs)


async def test_mixed_pending_starts_reserve_shared_capacity(registry, monkeypatch):
    monkeypatch.setattr(pm, "MAX_CONCURRENT", 1)
    entered, finish = asyncio.Event(), asyncio.Event()

    async def spawn(*args, **kwargs):
        entered.set()
        await finish.wait()
        raise OSError("fixture spawn refused")

    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell", spawn)
    first = asyncio.create_task(registry.start("localhost", "harmless fixture"))
    await entered.wait()
    lease = Lease()
    assert "Cannot start" in await registry.start_remote(lease, "harmless fixture")
    assert lease.released
    assert "Cannot start" in await registry.start("localhost", "harmless fixture")
    finish.set()
    assert "Failed to start" in await first
    assert registry._pending_starts == 0


async def test_cancelled_pending_start_returns_capacity(registry, monkeypatch):
    entered = asyncio.Event()

    async def spawn(*args, **kwargs):
        entered.set()
        await asyncio.Event().wait()

    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell", spawn)
    lease = Lease()
    task = asyncio.create_task(registry.start("localhost", "fixture", host_lease=lease))
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert registry._pending_starts == 0
    assert lease.released


async def test_initial_local_persistence_failure_has_lifecycle_and_teardown(registry, monkeypatch):
    proc = SimpleNamespace(pid=9123, returncode=None)
    monkeypatch.setattr(
        "src.tools.local_supervisor.create_supervised_shell", AsyncMock(return_value=proc),
    )
    entered = []

    async def lifecycle(record):
        entered.append(record)

    monkeypatch.setattr(registry, "_read_output", lifecycle)
    monkeypatch.setattr(registry, "_watch_exit", lifecycle)
    def disk_full(record):
        raise OSError("fixture disk full")

    monkeypatch.setattr(registry, "_persist_output", disk_full)
    teardown = AsyncMock(return_value=False)
    monkeypatch.setattr(registry, "_terminate_bound_host_job", teardown)
    with pytest.raises(OSError):
        await registry.start("localhost", "fixture")
    record = registry._processes[9123]
    assert record._reader_task is not None and record._exit_task is not None
    assert 9123 in registry._own_children
    teardown.assert_awaited_once_with(record)
    await asyncio.gather(record._reader_task, record._exit_task)


async def test_initial_remote_persistence_failure_has_backstop_and_teardown(registry, monkeypatch):
    async def remote(target, command, timeout):
        token = re.search(r'\$d" ([^ ]+) ', command).group(1)
        return 0, json.dumps(dict(token=token, pid=101, pgid=101, sid=99, start_id="123"))

    registry._remote_exec = remote
    captured = []

    def lifetime(coro, **kwargs):
        captured.append(coro.cr_frame.f_locals["info"])
        coro.close()

    monkeypatch.setattr("src.async_utils.fire_and_forget", lifetime)
    def disk_full(record):
        raise OSError("fixture disk full")

    monkeypatch.setattr(registry, "_persist_output", disk_full)
    teardown = AsyncMock(return_value="failed, fixture")
    monkeypatch.setattr(registry, "_kill_remote", teardown)
    with pytest.raises(OSError):
        await registry.start_remote(Lease(), "fixture")
    record = registry._processes[-1]
    assert captured == [record]
    teardown.assert_awaited_once_with(record)
    assert registry._pending_starts == 0


async def test_lifetime_timer_cannot_target_recycled_pid(registry, monkeypatch):
    old, replacement = info(), info()
    registry._processes[old.pid] = replacement
    monkeypatch.setattr(pm.asyncio, "sleep", AsyncMock())
    kill = AsyncMock()
    monkeypatch.setattr(registry, "kill", kill)
    await registry._enforce_lifetime(old, 1)
    kill.assert_not_awaited()
    await registry._enforce_lifetime(replacement, 1)
    kill.assert_awaited_once_with(replacement.pid)


async def test_leader_exit_holds_authority_until_descendant_settlement(registry, monkeypatch):
    lease = Lease()
    record = info(process=SimpleNamespace(pid=9123, returncode=0), host_lease=lease)
    registry._processes[record.pid] = record
    registry._retained_generations[record.generation] = record
    monkeypatch.setattr(pm, "_wait_leader_exit", AsyncMock())
    entered, finish = asyncio.Event(), asyncio.Event()

    async def settle(*args, **kwargs):
        entered.set()
        await finish.wait()
        return True

    monkeypatch.setattr(pm, "_terminate_session_until_empty", settle)
    task = asyncio.create_task(registry._watch_exit(record))
    await entered.wait()
    assert record.status == "running"
    assert not lease.released
    teardown = AsyncMock(return_value=False)
    monkeypatch.setattr(registry, "_terminate_bound_host_job", teardown)
    assert not await registry.terminate_generation(record.generation)
    teardown.assert_awaited_once_with(record)
    finish.set()
    await task
    assert record.status == "completed" and record.session_confirmed_empty
    assert lease.released


async def test_remote_unverified_cleanup_is_not_settled_or_counted(registry, monkeypatch):
    record = info(-1, remote=True, remote_lease=Lease())
    registry._processes[-1] = record
    registry._retained_generations[record.generation] = record
    monkeypatch.setattr(registry, "_remote_call", AsyncMock(return_value=(
        0, json.dumps({"ok": True, "already_exited": True}),
    )))
    assert not await registry.terminate_generation(record.generation)
    assert record.status == "running"
    assert not record.remote_lease.released
    with pytest.raises(pm.ProcessCleanupError):
        await registry.shutdown()
    assert not record.session_confirmed_empty


async def test_remote_proven_structured_cleanup_settles(registry, monkeypatch):
    record = info(-1, remote=True, remote_lease=Lease())
    registry._processes[-1] = record
    reply = {
        "ok": True, "empty": True, "containment": "owned_descendants",
        "already_exited": True, "exit": {"exit_code": 0},
    }
    monkeypatch.setattr(registry, "_remote_call", AsyncMock(return_value=(0, json.dumps(reply))))
    await registry._kill_remote(record)
    assert record.session_confirmed_empty and record.status == "completed"
    assert record.remote_lease is None


def run_controller(monkeypatch, capsys, operation, payload, *, exit_record=None, writes=()):
    ready = dict(token="fixture", pid=101, pgid=101, sid=99, start_id="")
    real_open = builtins.open

    def fixture_open(path, *args, **kwargs):
        if path == "/fixture/ready.json":
            return io.StringIO(json.dumps(ready))
        if path == "/fixture/exit.json":
            if exit_record is None:
                raise FileNotFoundError
            return io.StringIO(json.dumps(exit_record))
        raise AssertionError(f"unexpected file access: {path}")

    monkeypatch.setattr(builtins, "open", fixture_open)
    monkeypatch.setattr(sys, "argv", ["controller", "/fixture", "fixture", operation, payload, "0"])
    monkeypatch.setattr(pm.os, "getpgid", lambda pid: 101)
    monkeypatch.setattr(pm.os, "getsid", lambda pid: 99)
    monkeypatch.setattr(pm.os, "killpg", lambda *args: (_ for _ in ()).throw(ProcessLookupError()))
    opened, closed, accepted = [], [], []
    monkeypatch.setattr(pm.os, "open", lambda *args: opened.append(args) or 9123)
    monkeypatch.setattr(pm.os, "close", closed.append)
    counts = iter(writes)

    def write(fd, data):
        count = next(counts)
        if isinstance(count, Exception):
            raise count
        accepted.append(data[:count])
        return count

    monkeypatch.setattr(pm.os, "write", write)
    try:
        exec(compile(pm._REMOTE_CONTROLLER, "<controller-fixture>", "exec"), {})
    except SystemExit:
        pass
    monkeypatch.setattr(builtins, "open", real_open)
    return json.loads(capsys.readouterr().out), closed, b"".join(accepted)


def test_remote_fifo_short_write_retries_exact_remainder(monkeypatch, capsys):
    data = b"x" * 10000
    reply, closed, accepted = run_controller(
        monkeypatch, capsys, "write", base64.b64encode(data).decode(), writes=[4096, 5904],
    )
    assert reply["ok"] and reply["written"] == 10000
    assert accepted == data and closed == [9123]


def test_remote_fifo_partial_failure_is_honest_and_closes(monkeypatch, capsys):
    data = b"x" * 10000
    reply, closed, accepted = run_controller(
        monkeypatch, capsys, "write", base64.b64encode(data).decode(),
        writes=[4096, BrokenPipeError()],
    )
    assert not reply["ok"] and reply["written"] == 4096
    assert len(accepted) == 4096 and closed == [9123]


def test_remote_fifo_backpressure_has_bounded_partial_outcome(monkeypatch, capsys):
    ticks = iter([0, 0, 0, 3])
    monkeypatch.setattr(pm.time, "monotonic", lambda: next(ticks))
    monkeypatch.setattr(pm.time, "sleep", lambda seconds: None)
    reply, closed, accepted = run_controller(
        monkeypatch, capsys, "write", base64.b64encode(b"abcdef").decode(),
        writes=[2, BlockingIOError()],
    )
    assert reply["written"] == 2 and not reply["ok"]
    assert accepted == b"ab" and closed == [9123]


def test_remote_group_emptiness_does_not_prove_escaped_descendant_absence(monkeypatch, capsys):
    reply, _, _ = run_controller(
        monkeypatch, capsys, "kill", "", exit_record={"empty": True, "exit_code": 0},
    )
    assert reply["ok"] is False and reply["unknown"] is True
    assert reply["group_empty"] is True
    assert "escaped descendants" in reply["error"]


async def test_remote_write_reports_utf8_bytes_and_refuses_unverified_prefix(registry, monkeypatch):
    record = info(-1, remote=True)
    call = AsyncMock(return_value=(0, json.dumps({"ok": True, "written": 2})))
    monkeypatch.setattr(registry, "_remote_call", call)
    assert await registry._write_remote(record, "é") == "Wrote 2 bytes to PID -1."
    assert "Failed to write" in await registry._write_remote(record, "éé")
