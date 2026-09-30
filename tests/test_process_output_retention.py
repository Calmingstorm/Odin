"""Generation-bound process evidence through real local/remote capture and guards."""
from __future__ import annotations

import asyncio
import base64
import json
import os
import shlex
import sys
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from src.discord.response_guards import truncate_tool_output
from src.llm.secret_scrubber import scrub_output_secrets
from src.tools.process_manager import (
    OUTPUT_CAPTURE_BYTES,
    OUTPUT_RETENTION_SECONDS,
    ProcessInfo,
    ProcessRegistry,
)
from tests.test_remote_process_streaming import _Lease


@asynccontextmanager
async def _remote_job(root, producer):
    """Real protocol and inert producers, without signal/removal cleanup.

    Only the destructive kernel/filesystem boundaries are guarded. The real
    supervisor's group-only UNKNOWN evidence is never upgraded to ownership.
    Producers must exit naturally, including after their disposable FIFO ACK.
    """
    from src.tools import process_manager as pm

    guard = (
        "import os,shutil\n"
        "_probe_group=os.killpg\n"
        "def probe_only(pgid,sig):\n"
        " if sig: raise AssertionError('fixture attempted a process signal')\n"
        " return _probe_group(pgid,0)\n"
        "os.killpg=probe_only\n"
        "def forbid_signal(*args): raise AssertionError('fixture attempted a process signal')\n"
        "os.kill=forbid_signal\n"
        "def record_expiry(path):\n"
        " open(path+'/expiry-requested','w').write('identity-bound expiry requested')\n"
        "shutil.rmtree=record_expiry\n"
    )
    os.mkfifo(root / "in", 0o600)
    command = shlex.join(["exec", sys.executable, "-u", "-c", producer])
    supervisor = await asyncio.create_subprocess_exec(
        sys.executable, "-c", guard + pm._REMOTE_SUPERVISOR, str(root), "hermetic-job",
        base64.b64encode(command.encode()).decode(), "30",
        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    async def remote_exec(_target, command, timeout):
        argv = shlex.split(command)
        assert argv[:2] == ["python3", "-c"]
        controller = await asyncio.create_subprocess_exec(
            sys.executable, "-c", guard + argv[2], *argv[3:],
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        output, _ = await asyncio.wait_for(controller.communicate(), timeout)
        return controller.returncode, output.decode()

    try:
        deadline = time.monotonic() + 5
        while not (root / "ready.json").exists():
            assert supervisor.returncode is None, "supervisor exited before readiness"
            assert time.monotonic() < deadline, "supervisor did not become ready"
            await asyncio.sleep(0.02)
        ready = json.loads((root / "ready.json").read_text())
        lease = _Lease()
        info = ProcessInfo(
            -1, command, lease.target.alias, time.time(), remote=True,
            remote_dir=str(root), remote_token=ready["token"],
            remote_pid=ready["pid"], remote_pgid=ready["pgid"],
            remote_sid=ready["sid"], remote_start_id=ready["start_id"], remote_lease=lease,
        )
        registry = ProcessRegistry(remote_exec=remote_exec)
        registry._processes[-1] = info
        yield registry, info, lease, supervisor
    finally:
        # An assertion may fail before the ACK. Complete only our own inert
        # producer, never signal a stale numeric PID/PGID or delete evidence.
        if supervisor.returncode is None and (root / "in").exists():
            fd = os.open(root / "in", os.O_RDWR | os.O_NONBLOCK)
            try:
                os.write(fd, b"ack\n")
            finally:
                os.close(fd)
        output, _ = await asyncio.wait_for(supervisor.communicate(), 15)
        assert supervisor.returncode == 0, output.decode()
        record = json.loads((root / "exit.json").read_text())
        assert record["empty"] is False
        assert record["containment"] == "process_group_only"


def page(raw):
    assert len(raw) <= 12000
    assert truncate_tool_output(raw) == raw
    assert scrub_output_secrets(raw) == raw
    return json.loads(raw)


@pytest.fixture
def no_lifetime(monkeypatch):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


async def local_job(tmp_path, text):
    reg = ProcessRegistry(workspace=str(tmp_path), retention_dir=tmp_path / "evidence")
    command = shlex.join([sys.executable, "-c", f"import sys;sys.stdout.write({text!r})"])
    await reg.start("localhost", command)
    pid = next(iter(reg._processes))
    await reg.poll(pid, wait_seconds=10)
    return reg, reg._processes[pid]


@pytest.mark.asyncio
async def test_local_begin_middle_end_replay_concurrent_restart_and_expiry(tmp_path, no_lifetime):
    text = "".join(f"line-{i:04d} café 世界\n" for i in range(1500))
    reg, info = await local_job(tmp_path, text)
    raw = text.encode()
    preview = await reg.poll(info.pid)
    display, metadata = preview.split("\n[output retention] ")
    assert display.split("\n", 1)[1] == "".join(text.splitlines(keepends=True)[-50:])
    meta = json.loads(metadata)
    assert meta["emitted_bytes"] == meta["retained_bytes"] == len(raw)
    first = page(await reg.poll(info.pid, cursor=meta["cursor"], limit=8000))
    assert first["text"].encode() == raw[:first["shown_bytes"]]
    cursor = first["cursor"]
    outputs = await asyncio.gather(*(reg.poll(info.pid, cursor=cursor) for _ in range(3)))
    assert outputs[0] == outputs[1] == outputs[2]
    middle = page(outputs[0])
    begin, end = middle["shown_intervals"][0]
    assert middle["text"].encode() == raw[begin:end]
    last_start = raw.rfind(b"line-1499")
    end_page = page(await reg.poll(info.pid, offset=last_start))
    assert end_page["text"].encode() == raw[last_start:]
    assert end_page["cursor"] is None
    restored = ProcessRegistry(retention_dir=tmp_path / "evidence")
    assert await restored.poll(info.pid, cursor=cursor) == outputs[0]
    assert "not running" in await restored.write(info.pid, "bad")
    restored_info = restored.output_info(info.pid, cursor)
    restored_info.finished_at = time.time() - OUTPUT_RETENTION_SECONDS - 1
    assert "expired" in await restored.poll(info.pid, cursor=cursor)
    assert not list((tmp_path / "evidence").glob("*.out"))
    info.spool.close()


@pytest.mark.asyncio
async def test_local_escape_heavy_reconstruction_secret_boundary_and_unicode(tmp_path, no_lifetime):
    text = ("\"\\\n\t\x00世界" * 1800) + "password=fixture-secret-value\nend\n"
    reg, info = await local_job(tmp_path, text)
    cursor, offset, parts = info.generation + ":0", 0, []
    while True:
        result = page(await reg.poll(
            info.pid, cursor=cursor, offset=0, limit=8000,
        ))
        start, end = result["shown_intervals"][0]
        assert start == offset and end > start
        parts.append(result["text"])
        offset, cursor = end, result["cursor"]
        if cursor is None:
            break
    assert "fixture-secret-value" not in "".join(parts)
    masked = text.replace("password=fixture-secret-value", "*" * 29).encode()
    assert "".join(parts).encode() == masked
    assert "boundary" in await reg.poll(info.pid, offset=text.encode().index("世".encode()) + 1)
    assert "No process" in await reg.poll(info.pid, cursor="0" * 32 + ":0")
    assert "budget" in await reg.poll(info.pid, offset=0, max_chars=30)
    info.spool.close()


@pytest.mark.asyncio
async def test_local_capture_cap_and_invalid_utf8(tmp_path, no_lifetime):
    reg = ProcessRegistry(workspace=str(tmp_path))
    producer = (
        "import sys;sys.stdout.buffer.write("
        f"b'x'*{OUTPUT_CAPTURE_BYTES-1}+b'\\xe4\\xb8\\x96'+b'z'*100)"
    )
    await reg.start("localhost", shlex.join([sys.executable, "-c", producer]))
    pid = next(iter(reg._processes))
    await reg.poll(pid, wait_seconds=10)
    info = reg._processes[pid]
    result = page(await reg.poll(pid, offset=OUTPUT_CAPTURE_BYTES - 5))
    assert result["retained_bytes"] == OUTPUT_CAPTURE_BYTES - 1
    assert result["text"] == "x" * 4
    assert result["capture_limit_loss_bytes"] == 102
    assert not result["truncated"]
    info.spool.close()
    # Literal malformed bytes, not a fixture assumed to be malformed.
    stream = asyncio.StreamReader()
    stream.feed_data(b"hello\xffworld\n")
    stream.feed_eof()
    invalid = ProcessInfo(987, "fixture", "localhost", time.time(), status="completed",
                          process=SimpleNamespace(stdout=stream))
    reg._processes[987] = invalid
    await reg._read_output(invalid)
    assert page(await reg.poll(987, cursor=invalid.generation + ":0"))["text"] == "hello�world\n"
    invalid.spool.close()


@pytest.mark.asyncio
async def test_remote_begin_middle_end_after_exit_replay_and_read_only(tmp_path):
    text = "".join(f"remote-{i:04d} café 世界\n" for i in range(800))
    producer = f"import sys;sys.stdout.write({text!r})"
    async with _remote_job(tmp_path, producer) as (reg, info, lease, supervisor):
        await supervisor.wait()
        preview = await reg.poll(-1)
        meta = json.loads(preview.split("\n[output retention] ")[1])
        assert "status=unknown exit_code=0 outcome_unknown=true" in preview
        assert info.remote_lease is lease and info.output_lease is None
        assert not info.session_confirmed_empty and lease.release_count == 0
        assert info.finished_at is not None
        first = page(await reg.poll(-1, cursor=meta["cursor"], limit=8000))
        replay = await asyncio.gather(*(reg.poll(-1, cursor=first["cursor"]) for _ in range(3)))
        assert replay[0] == replay[1] == replay[2]
        middle = page(replay[0])
        start, end = middle["shown_intervals"][0]
        assert middle["text"].encode() == text.encode()[start:end]
        last_start = text.encode().rfind(b"remote-0799")
        last = page(await reg.poll(-1, offset=last_start))
        assert last["text"].encode() == text.encode()[last_start:]
        assert not last["truncated"]
        assert "not running" in await reg.write(-1, "bad")
        refused = await reg.kill(-1)
        assert "outcome_unknown=true" in refused and "Failed to kill" in refused
        assert info.remote_lease is lease and lease.release_count == 0
        summary = await reg.force_revoke_host(info.host)
        assert summary == {"attempted": 1, "killed": 0, "unknown": 1}
        assert "revoked" in await reg.poll(-1, cursor=meta["cursor"])
        assert lease.release_count == 0 and info.remote_lease is lease
        assert not info.session_confirmed_empty


@pytest.mark.asyncio
async def test_remote_cap_unicode_and_secret_split(tmp_path):
    producer = (
        "import sys;sys.stdout.buffer.write(b'password=fixture-secret-value\\n'+"
        f"b'x'*{OUTPUT_CAPTURE_BYTES-31}+b'\\xe4\\xb8\\x96'+b'z'*100)"
    )
    async with _remote_job(tmp_path, producer) as (reg, info, lease, supervisor):
        await supervisor.wait()
        first = page(await reg.poll(-1, offset=10, limit=4))
        assert first["text"] == "****"
        last = page(await reg.poll(-1, offset=OUTPUT_CAPTURE_BYTES-5))
        assert last["retained_bytes"] <= OUTPUT_CAPTURE_BYTES
        assert last["capture_limit_loss_bytes"] > 0
        assert "�" not in last["text"]


@pytest.mark.asyncio
async def test_handler_owner_host_rebind_and_revocation_after_wait(tmp_path, no_lifetime):
    from src.tools.handlers.system import SystemTools

    reg, info = await local_job(tmp_path, "private evidence\n")
    info.owner_id, info.host_alias, info.host_identity = "owner", "origin", "identity-1"
    target = SimpleNamespace(runtime_key="identity-1")
    state = {"user": "owner", "allowed": True}
    handler = SystemTools.__new__(SystemTools)
    handler._process_registry = lambda: reg
    handler._deps = SimpleNamespace(
        current_user_id=lambda: state["user"], config=lambda: SimpleNamespace(),
        host_registry=lambda: SimpleNamespace(get=lambda *a, **kw: target),
    )
    handler._resolve_host = lambda alias: state["allowed"] and alias == "origin"
    request = {"action": "poll", "pid": info.pid, "cursor": info.generation + ":0", "offset": 0}
    output, code = await handler._handle_manage_process(request)
    assert code == 0 and page(output)["text"] == "private evidence\n"
    state["user"] = "other"
    assert (await handler._handle_manage_process(request))[1] == 1
    state["user"] = "owner"
    target.runtime_key = "rebound"
    assert (await handler._handle_manage_process(request))[1] == 1
    target.runtime_key = "identity-1"
    real_poll = reg.poll

    async def revoke_after_read(*args, **kwargs):
        value = await real_poll(*args, **kwargs)
        state["allowed"] = False
        return value

    reg.poll = revoke_after_read
    output, code = await handler._handle_manage_process(request)
    assert code == 1 and "private evidence" not in output
    info.spool.close()


@pytest.mark.asyncio
async def test_remote_manifest_restart_generation_and_real_lease_revocation(tmp_path):
    from src.tools.hosts import HostRegistry

    job = tmp_path / "job"
    job.mkdir()
    directory = tmp_path / "retained"
    async with _remote_job(job, "print('restart evidence')") as (reg, info, _, supervisor):
        await supervisor.wait()
        lease = HostRegistry.unmanaged_lease("fixture", ("example.test", "tester", "linux"))
        info.remote_lease = lease
        directory.mkdir()
        reg._retention_dir = directory
        first = page(await reg.poll(-1, cursor=info.generation + ":0", limit=4))
        restored = ProcessRegistry(remote_exec=reg._remote_exec, retention_dir=directory)
        retained = restored.output_info(-1, first["cursor"])
        assert retained.restored and retained.remote_lease is None
        assert retained.status == "unknown" and not retained.session_confirmed_empty
        assert "not running" in await restored.write(-1, "must-not-write")
        assert "read-only" in await restored.kill(-1)
        assert "unavailable" in await restored.poll(-1, cursor=first["cursor"])
        fresh = HostRegistry.unmanaged_lease("fixture", ("example.test", "tester", "linux"))
        try:
            result = page(await restored.poll(-1, cursor=first["cursor"], output_lease=fresh))
            assert result["text"] == "art evidence\n"
            assert retained.output_lease is None
            fresh._revoked.set()
            denied = await restored.poll(-1, offset=0, output_lease=fresh)
            assert "restart evidence" not in denied and "unknown" in denied
        finally:
            fresh.release()


@pytest.mark.asyncio
async def test_generation_reuse_does_not_redirect_old_cursor(tmp_path, no_lifetime):
    reg, original = await local_job(tmp_path, "original evidence\n")
    first = page(await reg.poll(original.pid, cursor=original.generation + ":0", limit=4))
    replacement = ProcessInfo(original.pid, "other", "localhost", time.time())
    reg._processes[original.pid] = replacement
    next_page = page(await reg.poll(original.pid, cursor=first["cursor"]))
    assert next_page["generation"] == original.generation
    assert next_page["text"] == "inal evidence\n"
    original.spool.close()


@pytest.mark.asyncio
async def test_running_split_secret_withheld_and_quota_failure_honest(tmp_path, monkeypatch):
    reg = ProcessRegistry(retention_dir=tmp_path)
    stream = asyncio.StreamReader()
    info = ProcessInfo(98, "fixture", "localhost", time.time(),
                       process=SimpleNamespace(stdout=stream, returncode=None))
    reg._processes[98] = info
    reg._retained_generations[info.generation] = info
    reader = asyncio.create_task(reg._read_output(info))
    stream.feed_data(b"safe\npassword=fixture-")
    await asyncio.sleep(0.01)
    first = page(await reg.poll(98, cursor=info.generation + ":0"))
    assert "fixture-" not in first["text"]
    stream.feed_data(b"credential\n")
    stream.feed_eof()
    await reader
    info.status = "completed"
    terminal = page(await reg.poll(98, cursor=info.generation + ":0"))
    assert "credential" not in terminal["text"]
    assert terminal["text"].startswith("safe\n")
    assert b"fixture-" not in (tmp_path / (info.generation + ".out")).read_bytes()
    info.spool.close()
    monkeypatch.setattr("src.tools.process_manager.OUTPUT_GLOBAL_QUOTA", 0)
    blocked = ProcessInfo(99, "fixture", "localhost", time.time(), status="completed")
    blocked_stream = asyncio.StreamReader()
    blocked_stream.feed_data(b"evidence\n")
    blocked_stream.feed_eof()
    blocked.process = SimpleNamespace(stdout=blocked_stream)
    reg._processes[99] = blocked
    await reg._read_output(blocked)
    result = page(await reg.poll(99, cursor=blocked.generation + ":0"))
    assert result["retained_bytes"] == 0 and result["cursor"] is None
    assert result["capture_error"] and result["not_retained_bytes"] == 9


@pytest.mark.asyncio
async def test_remote_expiry_requests_identity_bound_removal_without_retiring_authority(tmp_path):
    async with _remote_job(tmp_path, "print('expires')") as (reg, info, lease, supervisor):
        await supervisor.wait()
        await reg.poll(-1)
        exit_path = tmp_path / "exit.json"
        record = json.loads(exit_path.read_text())
        # UNKNOWN cleanup retains execution authority. Evidence expiry can
        # request removal through the controller, but is not ownership proof.
        from tests.test_remote_process_streaming import _Lease

        fresh = _Lease()
        try:
            command = reg._remote_controller_command(info, "expire")
            rc, reply = await fresh.run(lambda: reg._remote_exec(fresh.target, command, 15))
            assert rc == 10 and not json.loads(reply)["ok"]
            assert not (tmp_path / "expiry-requested").exists()
            record["finished_at"] = time.time() - OUTPUT_RETENTION_SECONDS - 1
            exit_path.write_text(json.dumps(record))
            info.finished_at = record["finished_at"]
            original_token = info.remote_token
            info.remote_token = "wrong-generation"
            command = reg._remote_controller_command(info, "expire")
            info.remote_token = original_token
            rc, reply = await fresh.run(lambda: reg._remote_exec(fresh.target, command, 15))
            assert rc == 3 and json.loads(reply)["unknown"]
            assert not (tmp_path / "expiry-requested").exists()
        finally:
            fresh.release()
        assert fresh.release_count == 1
        expiry_lease = _Lease()
        reg._acquire_output_lease = lambda retained: expiry_lease if retained is info else None
        await reg._expire_output_at_deadline(info)
        assert expiry_lease.release_count == 1
        assert (tmp_path / "expiry-requested").read_text() == "identity-bound expiry requested"
        assert tmp_path.exists()  # removal boundary is inert in this fixture
        assert info.output_revoked and lease.release_count == 0
        assert info.remote_lease is lease and info.output_lease is None
        assert not info.session_confirmed_empty and info.status == "unknown"
