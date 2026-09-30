"""Inert lifecycle regressions: no child, SSH connection, signal or reap is real.

Exercise real settlement decisions with mocked OS and transport boundaries.
A failed teardown must retain authority, not turn leader exit into cleanup proof.
"""
from __future__ import annotations

import asyncio
import json
import shlex
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, call

import pytest

from src.tools import process_manager as pm
from src.tools import ssh
from src.tools.local_supervisor import SupervisedShell


@pytest.fixture(autouse=True)
def inert_os_boundary(monkeypatch):
    """Fail closed if a test accidentally reaches a real spawn or signal path."""
    blocked = Mock(side_effect=AssertionError("real process operation forbidden"))
    monkeypatch.setattr(asyncio, "create_subprocess_exec", blocked)
    monkeypatch.setattr(asyncio, "create_subprocess_shell", blocked)
    monkeypatch.setattr(ssh.os, "killpg", blocked)
    monkeypatch.setattr(pm, "_terminate_session_until_empty", AsyncMock(
        side_effect=AssertionError("real ownership scan forbidden")))
    monkeypatch.setattr(ssh, "terminate_process_tree", AsyncMock())


class Lease:
    def __init__(self):
        self.target = SimpleNamespace(alias="fixture")
        self.release = Mock()

    async def run(self, factory):
        return await factory()


class InertSupervisedShell(SupervisedShell):
    """Preserve isinstance routing without constructing a monitor or socket."""
    def __init__(self, verdict=True, error=None):
        self.pid = 765432
        self.returncode = -15
        self.terminate_tree = AsyncMock(return_value=verdict, side_effect=error)


def local_info(process):
    return pm.ProcessInfo(765432, "fixture", "fixture", time.time(),
                          process=process, host_lease=Lease())


def remote_info():
    return pm.ProcessInfo(-4, "fixture", "fixture", time.time(), remote=True,
                          remote_dir="/inert/fixture", remote_token="fixture-proof",
                          remote_lease=Lease(), reserved_bytes=2048)


@pytest.fixture
def registry(monkeypatch):
    reg = pm.ProcessRegistry()
    # No detached 24-hour expiry tasks in unit tests.
    monkeypatch.setattr(reg, "_schedule_output_expiry", Mock())
    return reg


@pytest.mark.parametrize("verdict,error", [(True, None), (False, None),
                                           (False, OSError("control lost"))])
async def test_supervised_cleanup_uses_positive_verdict_only(registry, verdict, error):
    proc = InertSupervisedShell(verdict, error)
    info = local_info(proc)
    assert await registry._kill_group_until_gone(info) is verdict
    assert info.session_confirmed_empty is verdict
    proc.terminate_tree.assert_awaited_once_with(grace=.5)
    info.host_lease.release.assert_not_called()


@pytest.mark.parametrize("proof", [True, False])
async def test_revoke_checks_independent_proof_after_teardown_and_persist_errors(
    registry, monkeypatch, proof,
):
    info = local_info(SimpleNamespace(pid=765432, returncode=-9))
    lease = info.host_lease
    teardown = AsyncMock(side_effect=TimeoutError("supervisor timeout"))
    scan = AsyncMock(return_value=proof)
    monkeypatch.setattr(ssh, "terminate_process_tree", teardown)
    monkeypatch.setattr(registry, "_kill_group_until_gone", scan)
    monkeypatch.setattr(registry, "_persist_output", Mock(side_effect=OSError("disk full")))
    assert await registry._terminate_bound_host_job(info) is proof
    teardown.assert_awaited_once_with(info.process, grace=5.0)
    scan.assert_awaited_once_with(info)
    if proof:
        assert info.status == "killed" and info.exit_code == -9
        assert info.session_confirmed_empty and info.finished_at is not None
        lease.release.assert_called_once_with()
        assert info.host_lease is None
    else:
        assert info.status == "running" and info.finished_at is None
        lease.release.assert_not_called()
        assert info.host_lease is lease


async def test_unreaped_leader_cannot_turn_group_scan_into_success(registry, monkeypatch):
    proc = SimpleNamespace(pid=765432, returncode=None)
    info = local_info(proc)
    scan = AsyncMock(return_value=True)
    wait = AsyncMock(return_value=False)
    monkeypatch.setattr(pm, "_terminate_session_until_empty", scan)
    monkeypatch.setattr(pm, "_wait_leader_exit", wait)
    assert await registry._kill_group_until_gone(info, timeout=.2) is False
    wait.assert_awaited_once_with(proc, timeout=1.0)
    assert scan.await_args.kwargs["teardown"] is False
    assert scan.await_args.kwargs["term_first"] is False
    info.host_lease.release.assert_not_called()


async def test_shutdown_retries_final_proof_and_reports_scan_exception(registry, monkeypatch):
    info = local_info(SimpleNamespace(pid=765432, returncode=0))
    registry._processes[info.pid] = info
    monkeypatch.setattr(registry, "terminate_generation", AsyncMock(return_value=False))
    scan = AsyncMock(side_effect=OSError("ownership table unreadable"))
    monkeypatch.setattr(registry, "_kill_group_until_gone", scan)
    with pytest.raises(pm.ProcessCleanupError, match="765432"):
        await registry.shutdown()
    scan.assert_awaited_once_with(info)
    info.host_lease.release.assert_not_called()


async def test_revoke_remote_exception_and_expiry_failure_clear_epoch(registry, monkeypatch):
    info = remote_info()
    registry._processes[info.pid] = info
    monkeypatch.setattr(registry, "_kill_remote", AsyncMock(side_effect=ConnectionError("lost")))
    monkeypatch.setattr(registry, "_expire_output", Mock(side_effect=OSError("spool failed")))
    assert await registry.force_revoke_host("fixture") == {
        "attempted": 1, "killed": 0, "unknown": 1,
    }
    assert registry._revoking_aliases == {}
    assert registry._local_revoke_epochs["fixture"] == 1
    info.remote_lease.release.assert_not_called()
    assert not info.session_confirmed_empty


@pytest.mark.parametrize("code,reply", [
    (0, {"ok": True, "empty": True, "containment": "process_group"}),
    (0, {"ok": True, "empty": 1, "containment": "owned_descendants"}),
    (0, {"ok": 1, "empty": True, "containment": "owned_descendants"}),
    (255, {"ok": True, "empty": True, "containment": "owned_descendants"}),
    (0, ["not a proof frame"]),
])
async def test_remote_kill_rejects_wrong_proof_without_retiring_authority(
    registry, monkeypatch, code, reply,
):
    info = remote_info()
    lease = info.remote_lease
    monkeypatch.setattr(registry, "_remote_call", AsyncMock(return_value=(code, json.dumps(reply))))
    result = await registry._kill_remote(info)
    assert "outcome_unknown=true" in result
    assert info.transport_unknown and not info.session_confirmed_empty
    assert info.status == "running" and info.finished_at is None
    assert info.reserved_bytes == 2048 and info.remote_lease is lease
    lease.release.assert_not_called()


@pytest.mark.parametrize("exit_code,status", [(0, "completed"), (23, "failed")])
async def test_remote_already_exited_proof_retires_once_and_preserves_timestamp(
    registry, monkeypatch, exit_code, status,
):
    info = remote_info()
    lease = info.remote_lease
    info.finished_at = 1234.5
    reply = {"ok": True, "empty": True, "containment": "owned_descendants",
             "already_exited": True, "exit": {"exit_code": exit_code}}
    monkeypatch.setattr(registry, "_remote_call", AsyncMock(return_value=(0, json.dumps(reply))))
    result = await registry._kill_remote(info)
    assert "already exited" in result
    assert info.status == status and info.exit_code == exit_code
    assert info.session_confirmed_empty and info.finished_at == 1234.5
    assert info.reserved_bytes == 0 and info.remote_lease is None
    lease.release.assert_called_once_with()
    registry._retire_execution_lease(info)
    lease.release.assert_called_once_with()


@pytest.mark.parametrize("operation", ["write", "kill"])
async def test_real_remote_call_transport_loss_preserves_lease(registry, operation):
    info = remote_info()
    lease = info.remote_lease
    registry._remote_exec = AsyncMock(side_effect=ConnectionResetError("transport vanished"))
    result = (await registry._write_remote(info, "é") if operation == "write"
              else await registry._kill_remote(info))
    assert "SSH transport failed" in result and "outcome_unknown=true" in result
    assert info.transport_unknown and not info.session_confirmed_empty
    assert info.remote_lease is lease and info.reserved_bytes == 2048
    lease.release.assert_not_called()
    assert registry._remote_exec.await_args.args[0] is lease.target


async def test_unsettled_remote_cleanup_transport_failure_is_not_proof(registry):
    lease = Lease()
    registry._remote_exec = AsyncMock(side_effect=ConnectionError("controller lost"))
    assert not await registry._teardown_unsettled_remote(lease, "/inert/fixture", "proof")
    assert registry._remote_exec.await_args.args[2] == 15
    lease.release.assert_not_called()


def subprocess_reply(text=b"ok\n", rc=0, error=None):
    reader = asyncio.StreamReader()
    reader.feed_data(text)
    reader.feed_eof()
    return SimpleNamespace(pid=765432, returncode=rc, stdout=reader,
                           communicate=AsyncMock(return_value=(text, b""), side_effect=error),
                           wait=AsyncMock(return_value=rc))


def inert_pool(events):
    async def acquire(*args, **kwargs):
        events.append("acquire")
        return True

    def release(*args):
        events.append("release")

    return SimpleNamespace(is_connected=Mock(return_value=True),
                           acquire=AsyncMock(side_effect=acquire),
                           get_ssh_args=Mock(return_value=["inert-ssh", "fixture"]),
                           ensure_master_registered=AsyncMock(), release=Mock(side_effect=release))


async def test_pooled_timeout_retry_reaps_before_next_dispatch_and_releases(monkeypatch):
    events = []
    pool = inert_pool(events)
    failed = subprocess_reply(rc=None, error=TimeoutError())
    success = subprocess_reply()
    replies = iter([failed, success])

    async def spawn(*args, **kwargs):
        events.append("spawn")
        return next(replies)

    async def cleanup(proc):
        assert proc is failed
        events.append("reap")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(side_effect=spawn))
    monkeypatch.setattr(ssh, "terminate_process_tree", AsyncMock(side_effect=cleanup))
    monkeypatch.setattr(ssh, "compute_backoff", Mock(return_value=0))
    assert await ssh.run_ssh_command("fixture", "fixture", "k", "kh", pool=pool,
                                     target_id="identity", max_retries=2) == (0, "ok\n")
    assert events == ["acquire", "spawn", "reap", "release", "acquire", "spawn", "release"]
    assert pool.release.call_args_list == [call("fixture", "root", "identity")] * 2
    pool.ensure_master_registered.assert_not_awaited()


@pytest.mark.parametrize("stage", ["acquire", "spawn", "communicate"])
async def test_pooled_cancel_releases_only_acquired_lease_and_reaps_child(monkeypatch, stage):
    events = []
    pool = inert_pool(events)
    proc = subprocess_reply(rc=None, error=asyncio.CancelledError())
    spawn = AsyncMock(return_value=proc)
    if stage == "acquire":
        pool.acquire.side_effect = asyncio.CancelledError()
    elif stage == "spawn":
        spawn.side_effect = asyncio.CancelledError()
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    cleanup = ssh.terminate_process_tree
    with pytest.raises(asyncio.CancelledError):
        await ssh.run_ssh_command("fixture", "fixture", "k", "kh", pool=pool, max_retries=3)
    assert pool.release.call_count == (stage != "acquire")
    assert spawn.await_count == (stage != "acquire")
    if stage == "communicate":
        cleanup.assert_awaited_once_with(proc)
    else:
        cleanup.assert_not_awaited()


async def test_pooled_registration_error_reaps_client_and_releases_without_retry(monkeypatch):
    pool = inert_pool([])
    pool.ensure_master_registered.side_effect = OSError("registration failed")
    proc = subprocess_reply()
    spawn = AsyncMock(return_value=proc)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    code, output = await ssh.run_ssh_command("fixture", "fixture", "k", "kh",
                                            pool=pool, max_retries=3)
    assert code == 1 and "registration failed" in output
    ssh.terminate_process_tree.assert_awaited_once_with(proc)
    pool.release.assert_called_once_with("fixture", "root", "")
    spawn.assert_awaited_once()


@pytest.mark.parametrize("error", [TimeoutError(), asyncio.CancelledError()])
async def test_callback_eof_does_not_hide_failed_exit_wait(monkeypatch, error):
    proc = subprocess_reply(b"prefix\nunterminated", rc=None)
    proc.wait.side_effect = error
    callback = AsyncMock()
    if isinstance(error, asyncio.CancelledError):
        with pytest.raises(asyncio.CancelledError):
            await ssh._read_lines_with_callback(proc, 3, callback, owned_pgid=proc.pid)
    else:
        code, output = await ssh._read_lines_with_callback(proc, 3, callback, owned_pgid=proc.pid)
        assert code == 1 and output.startswith("prefix\nunterminated")
        assert "Command timed out after 3 seconds" in output
    assert callback.await_args_list == [call("prefix\n"), call("unterminated")]
    ssh.terminate_process_tree.assert_awaited_once_with(proc, owned_pgid=proc.pid)


async def test_callback_consumer_failure_propagates_and_cleans_owned_child():
    proc = subprocess_reply(b"accepted\n", rc=None)
    callback = AsyncMock(side_effect=RuntimeError("consumer disconnected"))
    with pytest.raises(RuntimeError, match="consumer disconnected"):
        await ssh._read_lines_with_callback(proc, 3, callback, owned_pgid=proc.pid)
    ssh.terminate_process_tree.assert_awaited_once_with(proc, owned_pgid=proc.pid)
    proc.wait.assert_not_awaited()


async def test_binary_remote_cancel_reaps_and_preserves_cancellation(monkeypatch):
    proc = subprocess_reply(rc=None, error=asyncio.CancelledError())
    spawn = AsyncMock(return_value=proc)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    with pytest.raises(asyncio.CancelledError):
        await ssh.read_binary_file("fixture", "-weird 'path'", max_bytes=10,
                                   port=2222, host_key_alias="fixture-key")
    ssh.terminate_process_tree.assert_awaited_once_with(proc)
    args = spawn.await_args.args
    assert args[-1] == "head -c 11 -- " + shlex.quote("-weird 'path'")
    assert "HostKeyAlias=fixture-key" in args
    assert args[args.index("-p") + 1] == "2222"


async def test_binary_remote_no_stderr_reports_exit_code_not_empty_error(monkeypatch):
    proc = subprocess_reply(b"partial", rc=127)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=proc))
    data, error = await ssh.read_binary_file("fixture", "/fixture", max_bytes=10)
    assert data is None and error == "remote read failed (exit 127)"
    ssh.terminate_process_tree.assert_not_awaited()
