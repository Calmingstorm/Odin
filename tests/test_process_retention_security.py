"""Real process executor scope fences, canonical masking, and shared quota pins."""
import asyncio
import json
import shlex
import time
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.tools.output_authorization import web_output_scope
from src.tools.process_manager import (
    _REMOTE_SCRUBBER,
    OUTPUT_CAPTURE_BYTES,
    OUTPUT_GLOBAL_QUOTA,
    ProcessInfo,
    ProcessRegistry,
    _scrub_process_bytes,
)
from src.tools.runtime_delivery import execution_delivery_scope
from tests.test_executor_output_retention import executor
from tests.test_process_output_retention import local_job, page
from tests.test_remote_process_streaming import _remote_job
from tests.test_remote_processes import _Lease


@pytest.fixture(autouse=True)
def no_background(monkeypatch):
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())


async def start(ex):
    result = await ex.execute("manage_process", {
        "action": "start", "host": "testhost", "command": "printf 'private evidence\\n'",
    }, user_id="owner")
    assert result.ok, result.output
    reg = ex._ensure_process_registry()
    info = next(iter(reg._processes.values()))
    await reg.poll(info.pid, wait_seconds=10)
    return reg, info


async def poll(ex, pid):
    return await ex.execute("manage_process", {"action": "poll", "pid": pid, "offset": 0},
                            user_id="owner")


async def test_real_executor_channel_restart_repoint_and_legacy_fence(tmp_path):
    ex = executor(tmp_path)
    with execution_delivery_scope("owner", "channel-a"):
        reg, info = await start(ex)
        assert (await poll(ex, info.pid)).ok
    with execution_delivery_scope("owner", "channel-b"):
        denied = await poll(ex, info.pid)
        assert not denied.ok and "private evidence" not in denied.output
    restored = executor(tmp_path)
    with execution_delivery_scope("owner", "channel-a"):
        assert (await poll(restored, info.pid)).ok
        target = restored.host_registry.get("testhost")
        # Simulate generation collision after restart but different SSH identity.
        restored.host_registry.get = lambda *a, **kw: replace(target, ssh_user="different")
        assert not (await poll(restored, info.pid)).ok
    with execution_delivery_scope("owner", ""):
        old = reg._processes[info.pid]
        old.origin_channel, old.host_binding, old.scope_id = "", None, ""
        assert not (await poll(ex, info.pid)).ok
    reg._expire_output(info)


async def test_real_web_process_scope_stable_and_live_revocation(tmp_path):
    ex = executor(tmp_path)
    identity = SimpleNamespace(allowed_tools=[], allowed_hosts=None)
    manager = SimpleNamespace(resolve=lambda raw: identity)
    bot = SimpleNamespace(api_token_manager=manager)
    request = SimpleNamespace(path="/api/execute", headers={
        "Authorization": "Bearer fixture-process-scope"})
    with web_output_scope(bot, request), execution_delivery_scope("owner", "ephemeral-a"):
        reg, info = await start(ex)
        assert info.origin_channel == "api-execute"
        assert len(info.scope_id) == 64
        record = json.loads(next((tmp_path / "data" / "process-output").glob("*.json")).read_text())
        assert "fixture-process-scope" not in json.dumps(record)
    with web_output_scope(bot, request), execution_delivery_scope("owner", "ephemeral-b"):
        assert (await poll(ex, info.pid)).ok
        identity.allowed_hosts = []
        assert not (await poll(ex, info.pid)).ok
        identity.allowed_hosts = None
        real_poll = reg.poll

        async def revoke(*args, **kwargs):
            result = await real_poll(*args, **kwargs)
            identity.allowed_tools = ["run_command"]
            return result

        reg.poll = revoke
        denied = await poll(ex, info.pid)
        assert not denied.ok and "private evidence" not in denied.output
        identity.allowed_tools = []
        reg.poll = real_poll
        manager.resolve = lambda raw: None
        assert not (await poll(ex, info.pid)).ok
    manager.resolve = lambda raw: identity
    request.headers["Authorization"] = "Bearer different-fixture-scope"
    with web_output_scope(bot, request), execution_delivery_scope("owner", "ephemeral-a"):
        assert not (await poll(ex, info.pid)).ok
    reg._expire_output(info)


@pytest.mark.parametrize("key", ['"password"', '"pass\\u0077ord"', '"api_key"',
                                  '"access_token"', '"Authorization"'])
def test_canonical_structured_mask_parity_and_byte_coordinates(key):
    raw = ('世界 { ' + key + ': "fixture-secret 世界 spaced" } suffix\n').encode()
    masked = _scrub_process_bytes(raw)
    namespace = {"re": __import__("re"), "json": json, "PATTERNS": []}
    exec(_REMOTE_SCRUBBER, namespace)
    assert namespace["scrub"](raw) == masked
    assert len(masked) == len(raw)
    assert b"fixture-secret" not in masked
    assert masked.endswith(b" } suffix\n")
    assert _scrub_process_bytes(masked) == masked


@pytest.mark.parametrize("remote", [False, True])
async def test_pages_starting_inside_json_secret_never_disclose(tmp_path, remote):
    text = 'prefix {"pass\\u0077ord":"fixture-secret with spaces 世界"}\npublic\n'
    offset = text.encode().index(b"fixture-secret") + 3
    if remote:
        async with _remote_job(tmp_path, f"print({text!r}, end='')") as (reg, info, _, proc):
            await proc.wait()
            assert page(await reg.poll(info.pid, offset=offset, limit=4))["text"] == "****"
            assert "fixture-secret" not in await reg.poll(info.pid)
    else:
        reg, info = await local_job(tmp_path, text)
        assert page(await reg.poll(info.pid, offset=offset, limit=4))["text"] == "****"
        assert "fixture-secret" not in await reg.poll(info.pid)
        reg._expire_output(info)


async def test_remote_reserves_before_dispatch_and_local_cannot_steal_budget(tmp_path):
    entered, settle = asyncio.Event(), asyncio.Event()
    calls = []

    async def remote_exec(target, script, timeout):
        calls.append(script)
        entered.set()
        await settle.wait()
        args = shlex.split(script.split("nohup python3 ", 1)[1].split(" </dev/null", 1)[0])
        return 0, json.dumps({"token": args[2], "pid": 101, "pgid": 101,
                              "sid": 99, "start_id": "77"})

    reg = ProcessRegistry(remote_exec=remote_exec, retention_dir=tmp_path)
    previous = ProcessInfo(1, "fixture", "fixture", time.time(), status="completed",
                           retained_bytes=OUTPUT_GLOBAL_QUOTA - OUTPUT_CAPTURE_BYTES)
    reg._retained_generations[previous.generation] = previous
    task = asyncio.create_task(reg.start_remote(_Lease(), "fixture"))
    await entered.wait()
    assert reg._spool_quota_remaining() == 0
    rejected = _Lease()
    assert "quota" in await reg.start_remote(rejected, "fixture")
    assert rejected.release_count == 1 and len(calls) == 1
    stream = asyncio.StreamReader()
    stream.feed_data(b"local output")
    stream.feed_eof()
    local = ProcessInfo(2, "fixture", "localhost", time.time(),
                        process=SimpleNamespace(stdout=stream))
    await reg._read_output(local)
    assert local.retained_bytes == 0 and local.capture_error
    settle.set()
    assert "started" in await task
    remote = reg._processes[-1]
    assert remote.reserved_bytes == OUTPUT_CAPTURE_BYTES
    assert reg._pending_remote_reservations == 0 and reg._spool_quota_remaining() == 0
    remote.retained_bytes = 13
    # Snapshot accounting uses max(actual, reservation), never adds both.
    assert reg._spool_quota_remaining() == 0
    reg._persist_output(remote)
    restored = ProcessRegistry(retention_dir=tmp_path)
    assert restored._processes[-1].reserved_bytes == OUTPUT_CAPTURE_BYTES
    reg._expire_output(remote)
    assert remote.reserved_bytes == 0
    assert reg._spool_quota_remaining() == OUTPUT_CAPTURE_BYTES


async def test_local_quota_exact_remainder_and_remote_no_transport_release(tmp_path, monkeypatch):
    monkeypatch.setattr("src.tools.process_manager.OUTPUT_GLOBAL_QUOTA", 3)
    reg = ProcessRegistry()
    stream = asyncio.StreamReader()
    stream.feed_data(b"123456")
    stream.feed_eof()
    info = ProcessInfo(1, "fixture", "localhost", time.time(),
                       process=SimpleNamespace(stdout=stream))
    reg._retained_generations[info.generation] = info
    await reg._read_output(info)
    assert info.retained_bytes == 3 and reg._spool_quota_remaining() == 0
    reg._expire_output(info)
    monkeypatch.setattr("src.tools.process_manager.OUTPUT_GLOBAL_QUOTA", OUTPUT_GLOBAL_QUOTA)
    lease = _Lease()
    assert "unavailable" in await reg.start_remote(lease, "fixture")
    assert reg._pending_remote_reservations == 0 and lease.release_count == 1


@pytest.mark.parametrize("failure", ["transport", "settlement", "cancelled", "concurrency"])
async def test_remote_abort_reservation_and_lease_cleanup(failure, monkeypatch):
    from src.tools import process_manager as pm

    async def remote_exec(*args):
        if failure == "transport":
            raise OSError("fixture disconnect")
        if failure == "cancelled":
            raise asyncio.CancelledError
        return 1, "invalid settlement"

    reg = ProcessRegistry(remote_exec=remote_exec)
    cleanup = AsyncMock()
    monkeypatch.setattr(reg, "_teardown_unsettled_remote", cleanup)
    if failure == "concurrency":
        monkeypatch.setattr(pm, "MAX_CONCURRENT", 0)
    lease = _Lease()
    if failure == "cancelled":
        with pytest.raises(asyncio.CancelledError):
            await reg.start_remote(lease, "fixture")
    else:
        assert (await reg.start_remote(lease, "fixture")).startswith(("Failed", "Cannot"))
    assert reg._pending_remote_reservations == 0
    assert reg._spool_quota_remaining() == OUTPUT_GLOBAL_QUOTA
    assert lease.release_count == 1
    assert cleanup.await_count == (0 if failure == "concurrency" else 1)


async def test_remote_terminal_snapshot_releases_unused_reservation_and_expiry(tmp_path):
    from src.tools.process_manager import OUTPUT_RETENTION_SECONDS

    async with _remote_job(tmp_path, "print('small')") as (reg, info, _, proc):
        info.reserved_bytes = OUTPUT_CAPTURE_BYTES
        reg._retained_generations[info.generation] = info
        assert reg._spool_quota_remaining() == OUTPUT_GLOBAL_QUOTA - OUTPUT_CAPTURE_BYTES
        await proc.wait()
        await reg.poll(info.pid)
        assert info.reserved_bytes == 0 and info.retained_bytes == 6
        assert reg._spool_quota_remaining() == OUTPUT_GLOBAL_QUOTA - 6
        info.finished_at = time.time() - OUTPUT_RETENTION_SECONDS - 1
        await reg._expire_output_at_deadline(info)
        assert info.output_revoked and info.output_lease is None
        assert reg._spool_quota_remaining() == OUTPUT_GLOBAL_QUOTA


async def test_poll_lock_and_wait_recheck_before_spool_read(tmp_path):
    reg, info = await local_job(tmp_path, "private evidence\n")
    allowed = True

    async def settle():
        nonlocal allowed
        allowed = False

    info._reader_task = asyncio.create_task(settle())
    output = await reg.poll(info.pid, offset=0, authorized=lambda _: allowed)
    assert "denied" in output and "private evidence" not in output
    reg._expire_output(info)
    remote = ProcessInfo(-1, "fixture", "fixture", time.time(), remote=True)
    reg._processes[-1] = remote
    await remote._remote_lock.acquire()
    allowed = True
    waiting = asyncio.create_task(reg.poll(-1, offset=0, authorized=lambda _: allowed))
    await asyncio.sleep(0)
    allowed = False
    remote._remote_lock.release()
    assert "denied" in await waiting


@pytest.mark.parametrize("action", ["write", "kill"])
async def test_remote_effect_lock_rechecks_live_permission(action):
    reg = ProcessRegistry()
    info = ProcessInfo(-1, "fixture", "fixture", time.time(), remote=True)
    reg._processes[-1] = info
    allowed = True
    await info._remote_lock.acquire()
    call = (reg.write(-1, "fixture", authorized=lambda _: allowed) if action == "write"
            else reg.kill(-1, authorized=lambda _: allowed))
    task = asyncio.create_task(call)
    await asyncio.sleep(0)
    allowed = False
    info._remote_lock.release()
    assert "denied" in await task


def test_json_incomplete_and_nested_values_mask_without_length_change():
    samples = [b'{"password":"fixture unfinished with spaces',
               b'{"credentials":{"nested":"fixture secret"},"public":1}',
               b'{"password":["fixture", "secret"],"public":1}',
               b'{"password":12345}', b'"pass\\u0077ord": "fixture\\"secret"']
    for raw in samples:
        masked = _scrub_process_bytes(raw)
        assert len(masked) == len(raw)
        assert b"fixture" not in masked
        if b'"public"' in raw:
            assert b'"public":1' in masked
    assert _scrub_process_bytes(b'plain \xff text') == b'plain \xff text'


def test_restore_missing_bad_expired_and_revoked_manifests(tmp_path):
    from src.tools.process_manager import OUTPUT_RETENTION_SECONDS

    reg = ProcessRegistry(retention_dir=tmp_path)
    for index, state in enumerate(["missing", "expired", "revoked"]):
        info = ProcessInfo(index + 1, "fixture", "fixture", time.time(), status="completed",
                           retained_bytes=100, finished_at=time.time(),
                           output_revoked=state == "revoked")
        if state == "expired":
            info.finished_at -= OUTPUT_RETENTION_SECONDS + 1
        reg._persist_output(info)
    (tmp_path / "malformed.json").write_text("not json")
    (tmp_path / ("0" * 32 + ".json")).write_text('{"generation":"wrong"}')
    restored = ProcessRegistry(retention_dir=tmp_path)
    assert list(restored._processes) == [1]
    assert restored._processes[1].retained_bytes == 0
    assert restored._processes[1].capture_error
