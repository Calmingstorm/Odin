"""Failure and lifecycle contracts for generation-bound process evidence."""

import base64
import io
import json
import shlex
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.tools import process_manager as pm
from tests.test_process_output_retention import page
from tests.test_remote_processes import _Lease, _remote_info


@pytest.fixture(autouse=True)
def no_background(monkeypatch):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


@pytest.fixture
def evidence():
    reg = pm.ProcessRegistry()
    raw = "public 世界\n".encode()
    info = pm.ProcessInfo(101, "fixture", "localhost", time.time(),
                          status="completed", finished_at=time.time(),
                          retained_bytes=len(raw), total_output_bytes=len(raw),
                          spool=io.BytesIO(raw))
    reg._processes[info.pid] = info
    reg._retained_generations[info.generation] = info
    yield reg, info
    reg._expire_output(info)


@pytest.mark.parametrize("limit", [True, False, 3, 8001, 4.5, "4"])
async def test_invalid_page_size_does_not_read_evidence(evidence, limit):
    reg, info = evidence
    info.spool.seek(2)
    assert "limit must be an integer" in await reg.poll(info.pid, offset=0, limit=limit)
    assert info.spool.tell() == 2


@pytest.mark.parametrize("offset", [True, -1, 0.5, "0"])
async def test_invalid_offset_does_not_read_evidence(evidence, offset):
    reg, info = evidence
    info.spool.seek(2)
    assert "nonnegative integer" in await reg.poll(info.pid, offset=offset)
    assert info.spool.tell() == 2


@pytest.mark.parametrize("suffix", ["", ":no-number", ":0:extra"])
async def test_malformed_cursor_cannot_fall_back_to_preview(evidence, suffix):
    reg, info = evidence
    response = await reg.poll(info.pid, cursor=info.generation + suffix)
    assert "invalid cursor" in response and "public" not in response
    assert page(await reg.poll(info.pid, offset=0))["text"] == "public 世界\n"


async def test_conflicting_cursor_and_out_of_range_rejected_without_consumption(evidence):
    reg, info = evidence
    cursor = info.generation + ":0"
    assert "not both" in await reg.poll(info.pid, cursor=cursor, offset=0)
    assert "exceeds retained" in await reg.poll(info.pid, offset=info.retained_bytes + 1)
    assert "boundary" in await reg.poll(info.pid, offset=8)
    assert page(await reg.poll(info.pid, cursor=cursor))["text"] == "public 世界\n"


@pytest.mark.parametrize("action", ["poll", "write", "kill"])
async def test_initial_access_denial_prevents_io(evidence, action):
    reg, info = evidence
    info.status = "running"
    info.process = SimpleNamespace(stdin=Mock(), returncode=None)
    kwargs = {"authorized": lambda _: False}
    result = (await reg.write(info.pid, "never send", **kwargs) if action == "write"
              else await getattr(reg, action)(info.pid, **kwargs))
    assert "access denied" in result
    info.process.stdin.write.assert_not_called()
    assert info.status == "running" and info.spool.tell() == 0


@pytest.mark.parametrize("action", ["write", "kill"])
async def test_restored_evidence_never_regains_execution_even_if_status_changes(evidence, action):
    reg, info = evidence
    info.restored = True
    info.status = "running"
    result = (await reg.write(info.pid, "never send") if action == "write"
              else await reg.kill(info.pid))
    assert "read-only" in result
    assert info.status == "running"


async def test_stdin_drain_failure_is_not_success(evidence):
    reg, info = evidence
    info.status = "running"
    stdin = SimpleNamespace(
        write=Mock(), drain=AsyncMock(side_effect=BrokenPipeError("closed pipe")))
    info.process = SimpleNamespace(stdin=stdin)
    result = await reg.write(info.pid, "hello")
    assert "Failed to write" in result and "closed pipe" in result
    stdin.write.assert_called_once_with(b"hello")
    assert info.status == "running"


async def test_kill_failure_preserves_running_state(evidence, monkeypatch):
    reg, info = evidence
    info.status = "running"
    info.process = SimpleNamespace(returncode=None)
    terminate = AsyncMock(side_effect=OSError("cannot verify termination"))
    monkeypatch.setattr("src.tools.ssh.terminate_process_tree", terminate)
    assert "Failed to kill" in await reg.kill(info.pid)
    terminate.assert_awaited_once_with(info.process, grace=5.0)
    assert info.status == "running" and info.exit_code is None


async def test_remote_start_requires_lease_and_spawn_failure_has_no_record(monkeypatch):
    reg = pm.ProcessRegistry()
    spawn = AsyncMock(side_effect=OSError("resource unavailable"))
    monkeypatch.setattr(pm.asyncio, "create_subprocess_shell", spawn)
    assert "generation-bound host lease" in await reg.start("example.test", "fixture")
    spawn.assert_not_awaited()
    assert "Failed to start process" in await reg.start("localhost", "fixture")
    assert not reg._processes and not reg._retained_generations and not reg._own_children


def test_list_does_not_disclose_unauthorized_process_commands(evidence):
    reg, info = evidence
    assert "fixture" not in reg.list_all(authorized=lambda _: False)
    assert str(info.pid) not in reg.list_all(authorized=lambda _: False)
    assert "fixture" in reg.list_all(authorized=lambda _: True)


async def test_remote_execution_without_lease_never_dispatches():
    remote = AsyncMock()
    reg = pm.ProcessRegistry(remote_exec=remote)
    info = _remote_info(None)
    with pytest.raises(RuntimeError, match="lease is unavailable"):
        await reg._remote_call(info, "never execute", 15)
    remote.assert_not_awaited()
    assert "unavailable or revoked" in await reg._poll_remote(info, 0)


@pytest.mark.parametrize("mode", ["transport", "not-json", "not-object", "error", "base64"])
async def test_remote_poll_invalid_replies_preserve_execution_and_prior_capture(mode):
    async def remote(*args):
        if mode == "transport":
            raise OSError("disconnected")
        return 0, {"not-json": "garbage", "not-object": "[]",
                   "error": '{"ok":false,"error":"denied"}',
                   "base64": '{"ok":true,"output":"%%%"}'}[mode]

    reg = pm.ProcessRegistry(remote_exec=remote)
    lease = _Lease()
    info = _remote_info(lease)
    reg._processes[info.pid] = info
    info.retained_bytes = 10
    result = await reg.poll(info.pid, offset=0)
    assert "outcome_unknown=true" in result
    assert info.status == "running" and info.retained_bytes == 10
    assert info.remote_lease is lease and lease.release_count == 0


@pytest.mark.parametrize("expired", [False, True])
async def test_remote_reply_validates_newly_observed_expiry_and_offset(expired):
    finished = time.time() - (pm.OUTPUT_RETENTION_SECONDS + 1 if expired else 0)
    remote = AsyncMock(return_value=(0, json.dumps({
        "ok": True, "output": base64.b64encode(b"abc").decode(), "size": 3,
        "cursor": 3, "emitted": 3, "start": 0, "status": "exited",
        "exit": {"exit_code": 0, "finished_at": finished},
    })))
    reg = pm.ProcessRegistry(remote_exec=remote)
    lease = _Lease()
    info = _remote_info(lease)
    reg._processes[info.pid] = info
    result = await reg.poll(info.pid, offset=4)
    assert ("expired" if expired else "exceeds retained") in result
    assert info.remote_lease is None and info.status == "completed"
    assert lease.release_count == int(expired)
    assert info.output_revoked is expired
    reg._expire_output(info)


async def test_failed_remote_expiry_still_revokes_local_evidence(tmp_path, caplog):
    remote = AsyncMock(side_effect=OSError("offline"))
    reg = pm.ProcessRegistry(remote_exec=remote, retention_dir=tmp_path)
    lease = _Lease()
    info = _remote_info(None, status="completed")
    info.output_lease = lease
    info.finished_at = time.time() - pm.OUTPUT_RETENTION_SECONDS - 1
    reg._persist_output(info)
    await reg._expire_output_at_deadline(info)
    command = remote.await_args.args[1]
    assert shlex.split(command)[-3] == "expire"
    assert info.output_revoked and info.output_lease is None
    assert lease.release_count == 1 and not list(tmp_path.glob("*.json"))
    assert "could not be confirmed" in caplog.text


def test_cleanup_expires_old_generation_without_removing_reused_pid(evidence):
    reg, old = evidence
    old.finished_at = time.time() - pm.OUTPUT_RETENTION_SECONDS - 1
    current = pm.ProcessInfo(old.pid, "new job", "localhost", time.time())
    reg._processes[old.pid] = current
    reg._retained_generations[current.generation] = current
    assert reg.cleanup() == 0
    assert reg.output_info(old.pid) is current
    assert reg.output_info(old.pid, old.generation + ":0") is None
    assert old.output_revoked and old.spool is None
    assert current.generation in reg._retained_generations


async def test_reader_transport_failure_retains_complete_prefix(evidence):
    reg, info = evidence
    info.process = SimpleNamespace(stdout=SimpleNamespace(
        read=AsyncMock(side_effect=OSError("stream lost"))))
    await reg._read_output(info)
    assert page(await reg.poll(info.pid, offset=0))["text"] == "public 世界\n"


async def test_watcher_missing_process_and_failed_wait_publish_failure(evidence, monkeypatch):
    reg, info = evidence
    await reg._watch_exit(info)
    info.status = "running"
    info.finished_at = None
    info.process = SimpleNamespace(returncode=None)
    wait = AsyncMock(side_effect=OSError("wait failed"))
    monkeypatch.setattr(pm, "_wait_leader_exit", wait)
    await reg._watch_exit(info)
    assert info.status == "failed" and info.exit_code is None
    assert info.finished_at is None


def test_invalid_json_key_escape_does_not_abort_other_secret_masking():
    raw = b'{"bad\\q": "public", "password": "fixture hidden"}'
    masked = pm._scrub_process_bytes(raw)
    assert len(masked) == len(raw) and b"fixture hidden" not in masked
    assert b'"bad\\q": "public"' in masked


async def test_utf8_preview_trim_keeps_true_byte_coordinates(evidence):
    reg, info = evidence
    raw = ("世界" * 4000 + "\n").encode()
    info.spool.close()
    info.spool = io.BytesIO(raw)
    info.retained_bytes = info.total_output_bytes = len(raw)
    result = await reg.poll(info.pid, max_chars=1100)
    text, metadata = result.split("\n[output retention] ")
    meta = json.loads(metadata)
    start, end = meta["shown_intervals"][0]
    shown = text.split("\n", 1)[1]
    assert shown.encode() == raw[start:end]
    assert "�" not in shown and end == len(raw)
    assert len(result) <= 1100 and meta["cursor"] == info.generation + ":0"
