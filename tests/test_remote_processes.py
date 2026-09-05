"""Hermetic contracts for ProcessRegistry's remote-process lifecycle."""

from __future__ import annotations

import base64
import json
import re
import shlex
import time
from types import SimpleNamespace

import pytest

from src.tools.process_manager import (
    MAX_CONCURRENT,
    MAX_LIFETIME_SECONDS,
    ProcessInfo,
    ProcessRegistry,
)


class _Lease:
    """In-memory generation lease; never opens an SSH connection."""

    def __init__(self, alias: str = "remote") -> None:
        self.target = SimpleNamespace(alias=alias)
        self.release_count = 0
        self.run_count = 0

    async def run(self, factory):
        self.run_count += 1
        return await factory()

    def release(self) -> None:
        self.release_count += 1


def _remote_info(
    lease: _Lease | None,
    *,
    pid: int = -1,
    host: str = "remote",
    status: str = "running",
    remote_dir: str = "/tmp/odin-process-test",
) -> ProcessInfo:
    return ProcessInfo(
        pid=pid,
        command="sleep 100",
        host=host,
        start_time=time.time() - 2,
        status=status,
        remote=True,
        remote_dir=remote_dir,
        remote_pid=101,
        remote_pgid=101,
        remote_sid=99,
        remote_start_id="77",
        remote_token="test-token",
        remote_lease=lease,
    )


def _start_token(command: str) -> str:
    match = re.search(r'\$d" ([^ ]+) ', command)
    assert match is not None
    return match.group(1)


def _reply(**values: object) -> tuple[int, str]:
    return 0, json.dumps({"ok": True, **values})


@pytest.fixture
def no_lifetime_tasks(monkeypatch):
    """Close auto-lifetime coroutines instead of leaving detached test tasks."""

    def close(coro, **_kwargs):
        coro.close()

    monkeypatch.setattr("src.async_utils.fire_and_forget", close)


@pytest.mark.asyncio
async def test_remote_start_releases_lease_for_capacity_and_unavailable_executor():
    lease = _Lease()
    registry = ProcessRegistry()
    registry._processes = {
        number: ProcessInfo(number, "sleep", "remote", time.time())
        for number in range(MAX_CONCURRENT)
    }

    result = await registry.start_remote(lease, "sleep 1")
    assert "Cannot start" in result
    assert lease.release_count == 1

    unavailable = _Lease()
    result = await ProcessRegistry().start_remote(unavailable, "sleep 1")
    assert result == "Failed to start process: remote execution is unavailable"
    assert unavailable.release_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("result", "expected"),
    [
        ((1, "remote refused"), "remote refused"),
        ((0, "not-json"), "not-json"),
    ],
)
async def test_remote_start_unsettled_reply_is_unknown(result, expected):
    calls = []

    async def remote_exec(_target, _command, _timeout):
        calls.append(_command)
        return result if len(calls) == 1 else (0, "cleanup attempted")

    lease = _Lease()
    response = await ProcessRegistry(remote_exec=remote_exec).start_remote(lease, "sleep 1")
    assert "outcome_unknown=true" in response
    assert expected in response
    assert lease.release_count == 1
    assert len(calls) == 2
    assert "rm -rf" in calls[1]


@pytest.mark.asyncio
async def test_remote_start_transport_loss_is_unknown_and_releases():
    calls = 0

    async def remote_exec(_target, _command, _timeout):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ConnectionError("link vanished")
        return 0, "cleanup attempted"

    lease = _Lease()
    response = await ProcessRegistry(remote_exec=remote_exec).start_remote(lease, "sleep 1")
    assert "SSH transport failed after dispatch" in response
    assert "outcome_unknown=true" in response
    assert lease.release_count == 1
    assert calls == 2


@pytest.mark.asyncio
async def test_remote_start_success_tracks_negative_handle_and_identity(no_lifetime_tasks):
    async def remote_exec(_target, command, _timeout):
        token = _start_token(command)
        return 0, json.dumps({"token": token, "pid": 101, "pgid": 101, "sid": 99, "start_id": "77"})

    lease = _Lease()
    registry = ProcessRegistry(remote_exec=remote_exec)
    response = await registry.start_remote(lease, "printf ready")
    assert response == "Process started (PID -1): printf ready"
    info = registry._processes[-1]
    assert (info.remote_pid, info.remote_pgid, info.remote_sid, info.remote_start_id) == (
        101,
        101,
        99,
        "77",
    )
    assert info.remote_lease is lease


def test_remote_scripts_have_cross_platform_identity_and_no_base64_binary_dependency():
    from src.tools.process_manager import _REMOTE_CONTROLLER, _REMOTE_SUPERVISOR

    assert 'check_output(["ps","-o","lstart="' in _REMOTE_SUPERVISOR
    assert 'check_output(["ps","-o","lstart="' in _REMOTE_CONTROLLER
    registry = ProcessRegistry()
    info = _remote_info(_Lease())
    controller = registry._remote_controller_command(info, "status")
    assert "python3 -c" in controller
    assert "base64 -d" not in controller


@pytest.mark.asyncio
async def test_remote_polls_are_serialized_per_handle():
    active = 0
    peak = 0

    async def remote_exec(_target, _command, _timeout):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await __import__("asyncio").sleep(0)
        active -= 1
        return _reply(status="running", output="", cursor=0, size=0)

    registry = ProcessRegistry(remote_exec=remote_exec)
    registry._processes[-1] = _remote_info(_Lease())
    await __import__("asyncio").gather(registry.poll(-1), registry.poll(-1))
    assert peak == 1


@pytest.mark.asyncio
async def test_remote_poll_running_then_exited_updates_cursor_output_and_lease():
    replies = iter(
        [
            _reply(
                status="running",
                output=base64.b64encode(b"one\n").decode(),
                cursor=4,
                size=4,
            ),
            _reply(
                status="exited",
                exit={"exit_code": 0},
                output=base64.b64encode(b"two\n").decode(),
                cursor=8,
                size=8,
            ),
        ]
    )

    async def remote_exec(_target, _command, _timeout):
        return next(replies)

    lease = _Lease()
    registry = ProcessRegistry(remote_exec=remote_exec)
    registry._processes[-1] = _remote_info(lease)

    running = await registry.poll(-1, wait_seconds=999)
    assert "status=running" in running
    assert "one\n" in running
    assert registry._processes[-1].remote_cursor == 4

    exited = await registry.poll(-1)
    assert "status=completed exit_code=0" in exited
    assert "two\n" in exited
    assert registry._processes[-1].status == "completed"
    assert lease.release_count == 1
    assert registry._processes[-1].remote_lease is None


@pytest.mark.asyncio
async def test_remote_poll_reports_unknown_for_controller_failure_and_invalid_output():
    async def failed(_target, _command, _timeout):
        return 4, json.dumps({"ok": False, "error": "identity unavailable"})

    registry = ProcessRegistry(remote_exec=failed)
    registry._processes[-1] = _remote_info(_Lease())
    response = await registry.poll(-1)
    assert "status=unknown outcome_unknown=true" in response
    assert "identity unavailable" in response
    assert registry._processes[-1].transport_unknown is True

    async def invalid(_target, _command, _timeout):
        return _reply(status="running", output="not-base64!", cursor=0, size=0)

    registry = ProcessRegistry(remote_exec=invalid)
    registry._processes[-1] = _remote_info(_Lease())
    response = await registry.poll(-1)
    assert response.endswith("invalid reply")
    assert registry._processes[-1].transport_unknown is True


@pytest.mark.asyncio
async def test_remote_poll_transport_loss_and_cached_terminal_result():
    async def lost(_target, _command, _timeout):
        raise OSError("network down")

    registry = ProcessRegistry(remote_exec=lost)
    registry._processes[-1] = _remote_info(_Lease())
    response = await registry.poll(-1)
    assert "status=unknown outcome_unknown=true" in response
    assert "network down" in response

    terminal = _remote_info(None, status="failed")
    terminal.exit_code = 19
    terminal.output_buffer.append("final\n")
    terminal.total_output_bytes = 6
    registry._processes[-2] = terminal
    response = await registry.poll(-2)
    assert "status=failed exit_code=19" in response
    assert response.endswith("final\n")


@pytest.mark.asyncio
async def test_remote_write_success_failure_and_transport_loss():
    async def success(_target, _command, _timeout):
        return _reply(written=3)

    lease = _Lease()
    registry = ProcessRegistry(remote_exec=success)
    registry._processes[-1] = _remote_info(lease)
    assert await registry.write(-1, "abc") == "Wrote 3 bytes to PID -1."

    async def failed(_target, _command, _timeout):
        return 7, json.dumps({"ok": False, "error": "stdin changed"})

    registry = ProcessRegistry(remote_exec=failed)
    registry._processes[-1] = _remote_info(_Lease())
    response = await registry.write(-1, "abc")
    assert "outcome_unknown=true: stdin changed" in response
    assert registry._processes[-1].transport_unknown is True

    async def lost(_target, _command, _timeout):
        raise ConnectionError("dropped")

    registry = ProcessRegistry(remote_exec=lost)
    registry._processes[-1] = _remote_info(_Lease())
    assert "SSH transport failed" in await registry.write(-1, "abc")


@pytest.mark.asyncio
async def test_remote_kill_success_failure_and_transport_loss():
    async def success(_target, _command, _timeout):
        return _reply(killed=True, empty=True)

    lease = _Lease()
    registry = ProcessRegistry(remote_exec=success)
    registry._processes[-1] = _remote_info(lease)
    assert await registry.kill(-1) == "Process -1 killed."
    assert registry._processes[-1].status == "failed"
    assert registry._processes[-1].exit_code == -9
    assert lease.release_count == 1

    async def failed(_target, _command, _timeout):
        return 9, json.dumps({"ok": False, "error": "still alive"})

    registry = ProcessRegistry(remote_exec=failed)
    registry._processes[-1] = _remote_info(_Lease())
    response = await registry.kill(-1)
    assert "outcome_unknown=true: still alive" in response
    assert registry._processes[-1].transport_unknown is True

    async def lost(_target, _command, _timeout):
        raise ConnectionError("vanished")

    registry = ProcessRegistry(remote_exec=lost)
    registry._processes[-1] = _remote_info(_Lease())
    assert "SSH transport failed" in await registry.kill(-1)


@pytest.mark.asyncio
async def test_force_revoke_host_counts_only_running_matching_remote_processes():
    async def remote_exec(_target, command, _timeout):
        if "/one" in command:
            return _reply(killed=True, empty=True)
        return 9, json.dumps({"ok": False, "error": "identity changed"})

    registry = ProcessRegistry(remote_exec=remote_exec)
    registry._processes = {
        -1: _remote_info(_Lease(), remote_dir="/one"),
        -2: _remote_info(_Lease(), remote_dir="/two"),
        -3: _remote_info(_Lease(), host="other", remote_dir="/three"),
        -4: _remote_info(_Lease(), status="completed", remote_dir="/four"),
    }

    assert await registry.force_revoke_host("remote") == {
        "attempted": 2,
        "killed": 1,
        "unknown": 1,
    }


@pytest.mark.asyncio
async def test_remote_shutdown_kills_running_jobs_and_cleanup_removes_old_terminal(monkeypatch):
    async def remote_exec(_target, _command, _timeout):
        return _reply(killed=True, empty=True)

    registry = ProcessRegistry(remote_exec=remote_exec)
    registry._processes[-1] = _remote_info(_Lease())
    assert await registry.shutdown() == 1
    assert registry._processes[-1].status == "failed"

    old = _remote_info(None, pid=-2, status="completed")
    old.start_time -= MAX_LIFETIME_SECONDS + 1
    fresh = _remote_info(None, pid=-3, status="failed")
    registry._processes[-2] = old
    registry._processes[-3] = fresh
    monkeypatch.setattr("src.tools.process_manager.reap_adopted_zombies", lambda _pids: 0)
    assert registry.cleanup() == 1
    assert -2 not in registry._processes
    assert -3 in registry._processes


def test_remote_controller_builder_and_parser_are_shell_safe():
    registry = ProcessRegistry()
    info = _remote_info(None, remote_dir="/tmp/a path", pid=-9)
    info.remote_token = "token; not-a-command"
    command = registry._remote_controller_command(info, "write", "a b", 1.25)
    argv = shlex.split(command)
    assert argv[-5:] == ["/tmp/a path", "token; not-a-command", "write", "a b", "1.25"]
    assert registry._parse_remote_reply('noise\n{"ok": true}') == {"ok": True}
    assert registry._parse_remote_reply("[]") is None
    assert registry._parse_remote_reply("not json") is None


@pytest.mark.asyncio
async def test_remote_lifetime_expiry_kills_the_tracked_job(monkeypatch):
    registry = ProcessRegistry()
    registry._processes[-1] = _remote_info(_Lease())
    killed = []

    async def no_wait(_seconds):
        return None

    async def kill(pid):
        killed.append(pid)
        registry._processes[pid].status = "failed"
        return f"Process {pid} killed."

    monkeypatch.setattr("src.tools.process_manager.asyncio.sleep", no_wait)
    monkeypatch.setattr(registry, "kill", kill)

    await registry._enforce_lifetime(-1, 1)

    assert killed == [-1]
