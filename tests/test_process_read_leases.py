"""Remote evidence uses real registry references, never day-long read leases."""

import asyncio
import base64
import json
import shlex
import time
from types import SimpleNamespace

import pytest

from src.config.schema import ToolHost
from src.tools.executor import ToolExecutor
from src.tools.handlers.system import SystemTools
from src.tools.hosts import HostRegistry
from src.tools.output_authorization import (
    host_binding,
    request_delivery_channel,
    request_host_authorizer,
    request_scope_id,
)
from src.tools.process_manager import OUTPUT_RETENTION_SECONDS, ProcessInfo, ProcessRegistry


@pytest.fixture
def harness(tmp_path):
    config = ToolHost(address="remote.example.test", ssh_user="tester")
    hosts = HostRegistry({"remote": config}, trust_dir=tmp_path / "trust")
    target = hosts.get("remote", targetable_only=True)
    assert target is not None
    state = {"allowed": True, "user": "owner", "calls": [], "acquired": []}

    async def remote_exec(target, command, timeout):
        state["calls"].append((target, command))
        assert hosts.has_active_leases("remote")
        if state.get("entered"):
            state["entered"].set()
            await state["resume"].wait()
        if state.get("error"):
            raise RuntimeError("transport failed")
        data = b"retained evidence\n"
        return 0, json.dumps({
            "ok": True, "status": state.get("status", "exited"),
            "output": base64.b64encode(data).decode(), "cursor": len(data),
            "size": len(data), "emitted": len(data), "start": 0,
            "exit": {"exit_code": 0, "finished_at": time.time()},
        })

    registry = ProcessRegistry(remote_exec=remote_exec, retention_dir=tmp_path / "evidence")
    # These tests invoke expiry explicitly instead of scheduling 24-hour tasks.
    registry._schedule_output_expiry = lambda info: None
    info = ProcessInfo(
        pid=-1, command="fixture", host="remote", host_alias="remote",
        host_identity=target.runtime_key, host_binding=host_binding(target),
        owner_id="owner", origin_channel="channel", scope_id="scope",
        start_time=time.time(), remote=True, remote_dir=str(tmp_path / "remote-job"),
        remote_token="fixture-identity", remote_lease=hosts.acquire("remote"),
    )
    registry._processes[info.pid] = info
    handler = SystemTools.__new__(SystemTools)
    handler._deps = SimpleNamespace(
        config=lambda: SimpleNamespace(), current_user_id=lambda: state["user"],
        host_registry=lambda: hosts,
    )
    handler._process_registry = lambda: registry
    handler._resolve_host = lambda alias: hosts.get(alias, targetable_only=True)
    handler._govern_command = lambda *args: (True, "", None)

    def acquire(alias):
        lease = hosts.acquire(alias)
        state["acquired"].append(lease)
        return lease

    handler._acquire_host = acquire
    context = [
        (request_delivery_channel, request_delivery_channel.set("channel")),
        (request_scope_id, request_scope_id.set("scope")),
        (request_host_authorizer, request_host_authorizer.set(lambda alias: state["allowed"])),
    ]
    yield SimpleNamespace(hosts=hosts, config=config, state=state, info=info,
                          registry=registry, handler=handler)
    if info.remote_lease is not None:
        info.remote_lease.release()
    for variable, token in reversed(context):
        variable.reset(token)


async def read(h):
    return await h.handler._handle_manage_process({
        "action": "poll", "pid": -1, "cursor": h.info.generation + ":0", "offset": 0,
    })


def no_references(h):
    assert not h.hosts.has_active_leases("remote")
    assert not h.hosts.draining_aliases()
    assert sum(h.hosts._lease_counts.values()) == 0
    assert h.info.remote_lease is None
    assert h.info.output_lease is None


@pytest.mark.asyncio
async def test_completed_and_repeated_reads_release_real_host_references(harness):
    h = harness
    execution = h.info.remote_lease
    assert h.hosts.has_active_leases("remote")
    output, code = await read(h)
    assert code == 0 and json.loads(output)["text"] == "retained evidence\n"
    assert execution._released
    no_references(h)
    for _ in range(3):
        assert (await read(h))[1] == 0
        no_references(h)
    leases = h.state["acquired"]
    assert len(leases) == 3 and len({id(lease) for lease in leases}) == 3
    assert all(lease._released for lease in leases)
    h.hosts.publish({})
    no_references(h)


@pytest.mark.asyncio
@pytest.mark.parametrize("terminal_discovery", [False, True])
async def test_concurrent_reads_and_terminal_transition_are_independent(
    harness, terminal_discovery,
):
    h = harness
    if not terminal_discovery:
        await read(h)
    h.state.update(entered=asyncio.Event(), resume=asyncio.Event())
    first = asyncio.create_task(read(h))
    await asyncio.wait_for(h.state["entered"].wait(), 2)
    second = asyncio.create_task(read(h))
    await asyncio.sleep(0)
    # Queued reads hold no reference; exactly one active execution/read lease.
    assert sum(h.hosts._lease_counts.values()) == 1
    assert h.info.output_lease is None
    h.state["resume"].set()
    results = await asyncio.gather(first, second)
    assert all(code == 0 and json.loads(output)["text"] == "retained evidence\n"
               for output, code in results)
    no_references(h)
    assert all(lease._released for lease in h.state["acquired"])


@pytest.mark.asyncio
@pytest.mark.parametrize("denial", ["user", "grant", "rebind", "disable"])
async def test_post_exit_denials_never_acquire_or_read(harness, denial):
    h = harness
    await read(h)
    if denial == "user":
        h.state["user"] = "other"
    elif denial == "grant":
        h.state["allowed"] = False
    else:
        update = ({"address": "replacement.example.test"}
                  if denial == "rebind" else {"enabled": False})
        h.hosts.publish({"remote": h.config.model_copy(update=update)})
    output, code = await read(h)
    assert code == 1 and "evidence" not in output
    assert len(h.state["calls"]) == 1 and not h.state["acquired"]
    no_references(h)


@pytest.mark.asyncio
async def test_acquired_lease_must_match_persisted_binding(harness):
    h = harness
    await read(h)
    other = HostRegistry({"remote": h.config.model_copy(update={"address": "other.example.test"})})
    h.handler._acquire_host = other.acquire
    output, code = await read(h)
    assert code == 1 and "retained evidence" not in output
    assert not other.has_active_leases("remote")
    assert len(h.state["calls"]) == 1
    no_references(h)


@pytest.mark.asyncio
@pytest.mark.parametrize("ending", ["cancel", "revoke", "grant", "rebind", "exception"])
async def test_inflight_read_cleanup_and_authorization(harness, ending):
    h = harness
    await read(h)
    h.state.update(entered=asyncio.Event(), resume=asyncio.Event())
    task = asyncio.create_task(read(h))
    await asyncio.wait_for(h.state["entered"].wait(), 2)
    assert sum(h.hosts._lease_counts.values()) == 1
    if ending == "cancel":
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        if ending == "revoke":
            assert h.hosts.force_revoke("remote") == 1
        elif ending == "grant":
            h.state["allowed"] = False
        elif ending == "rebind":
            replacement = h.config.model_copy(update={"address": "other.example.test"})
            h.hosts.publish({"remote": replacement})
            assert h.hosts.draining_aliases() == ("remote",)
        else:
            h.state["error"] = True
        if ending != "revoke":
            h.state["resume"].set()
        output, _ = await asyncio.wait_for(task, 2)
        assert "retained evidence" not in output
    no_references(h)
    assert h.state["acquired"][-1]._released


@pytest.mark.asyncio
async def test_unhandled_registry_exception_releases_read_lease(harness):
    h = harness
    await read(h)

    async def fail(*args, **kwargs):
        assert kwargs["acquire_output_lease"]() is not None
        raise RuntimeError("registry failed")

    h.registry.poll = fail
    with pytest.raises(RuntimeError, match="registry failed"):
        await read(h)
    no_references(h)


@pytest.mark.asyncio
@pytest.mark.parametrize("ending", ["missing", "rebind", "grant"])
async def test_acquisition_failure_and_authorization_race_do_not_leak(harness, ending):
    h = harness
    await read(h)
    acquire = h.handler._acquire_host

    def changed(alias):
        if ending == "missing":
            return None
        lease = acquire(alias)
        if ending == "rebind":
            replacement = h.config.model_copy(update={"address": "other.example.test"})
            h.hosts.publish({"remote": replacement})
        else:
            h.state["allowed"] = False
        return lease

    h.handler._acquire_host = changed
    output, code = await read(h)
    assert code == 1 and "retained evidence" not in output
    assert len(h.state["calls"]) == 1
    no_references(h)


@pytest.mark.asyncio
async def test_default_and_cursor_reads_also_release(harness):
    h = harness
    await read(h)
    for request in (
        {"action": "poll", "pid": -1},
        {"action": "poll", "pid": -1, "cursor": h.info.generation + ":0"},
    ):
        output, code = await h.handler._handle_manage_process(request)
        assert code == 0 and "retained evidence" in output
        no_references(h)
    assert len(h.state["acquired"]) == 2


@pytest.mark.asyncio
async def test_restored_running_evidence_stays_read_only(harness, tmp_path):
    h = harness
    h.state["status"] = "running"
    h.registry._persist_output(h.info)
    h.info.remote_lease.release()
    restored = ProcessRegistry(
        remote_exec=h.registry._remote_exec, retention_dir=tmp_path / "evidence",
    )
    h.registry = restored
    h.info = restored.output_info(-1)
    assert h.info.restored and h.info.remote_lease is None
    h.handler._process_registry = lambda: restored
    assert (await read(h))[1] == 0
    no_references(h)
    for action in ("write", "kill"):
        output, code = await h.handler._handle_manage_process(
            {"action": action, "pid": -1, "input_text": "hello"},
        )
        assert code == 1
        assert any(text in output for text in ("read-only", "not running", "already unknown"))
    assert len(h.state["calls"]) == 1
    argv = shlex.split(h.state["calls"][0][1])
    assert "status" in argv and "write" not in argv and "kill" not in argv
    h.hosts.publish({"remote": h.config.model_copy(update={"address": "replacement.example.test"})})
    assert (await read(h))[1] == 1
    assert len(h.state["calls"]) == 1
    no_references(h)


@pytest.mark.asyncio
@pytest.mark.parametrize("ending", ["success", "error", "cancel", "rebind"])
async def test_expiry_gets_only_a_temporary_bound_cleanup_lease(harness, ending):
    h = harness
    await read(h)
    executor = ToolExecutor.__new__(ToolExecutor)
    executor.host_registry = h.hosts
    h.registry._acquire_output_lease = executor._acquire_process_cleanup_lease
    h.info.finished_at = time.time() - OUTPUT_RETENTION_SECONDS - 1
    if ending == "rebind":
        h.hosts.publish({"remote": h.config.model_copy(update={"address": "other.example.test"})})
    elif ending == "error":
        h.state["error"] = True
    elif ending == "cancel":
        h.state.update(entered=asyncio.Event(), resume=asyncio.Event())
    task = asyncio.create_task(h.registry._expire_output_at_deadline(h.info))
    if ending == "cancel":
        await asyncio.wait_for(h.state["entered"].wait(), 2)
        assert sum(h.hosts._lease_counts.values()) == 1
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    else:
        await task
    no_references(h)
    assert h.info.output_revoked
    assert len(h.state["calls"]) == (1 if ending == "rebind" else 2)
