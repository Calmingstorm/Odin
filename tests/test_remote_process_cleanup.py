"""F5: real remote worker/controller settlement in disposable process groups."""

import asyncio
import json
import sys
from unittest.mock import AsyncMock

import pytest

from src.tools.process_manager import _REMOTE_CONTROLLER, ProcessRegistry
from tests.test_remote_process_streaming import _remote_job


@pytest.mark.asyncio
@pytest.mark.parametrize("exit_code,status", [(0, "completed"), (17, "failed")])
async def test_real_remote_exit_retires_with_scoped_cleanup(tmp_path, exit_code, status):
    producer = f"import sys; print('finished', flush=True); sys.exit({exit_code})"
    async with _remote_job(tmp_path, producer) as (reg, info, lease, supervisor):
        await asyncio.wait_for(supervisor.wait(), 5)
        result = await reg.poll(info.pid)
        assert f"status={status} exit_code={exit_code}" in result
        assert "outcome_unknown=true" not in result
        record = json.loads((tmp_path / "exit.json").read_text())
        assert record["empty"] is True and record["group_empty"] is True
        assert info.containment == record["containment"] == "process_group_only"
        assert info.session_confirmed_empty and info.remote_lease is None
        assert lease.release_count == 1
        page = json.loads(await reg.poll(info.pid, cursor=info.generation + ":0"))
        assert page["text"] == "finished\n"
        assert page["cleanup_caveat"] == "escaped descendants are unverified"


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy", [False, True])
async def test_real_controller_kill_of_unpolled_exited_job(tmp_path, legacy):
    async with _remote_job(tmp_path, "print('finished')") as (reg, info, lease, supervisor):
        await asyncio.wait_for(supervisor.wait(), 5)
        if legacy:
            # Existing workers predate F5 and wrote contradictory empty=False.
            path = tmp_path / "exit.json"
            record = json.loads(path.read_text())
            record["empty"] = False
            path.write_text(json.dumps(record))
        result = await reg.kill(info.pid)
        assert "already exited" in result and "outcome_unknown=true" not in result
        assert "containment=process_group_only" in result
        assert "escaped descendants are unverified" in result
        assert info.status == "completed" and info.session_confirmed_empty
        assert lease.release_count == 1 and info.remote_lease is None
        assert "status=completed exit_code=0" in await reg.poll(info.pid)


@pytest.mark.asyncio
async def test_real_controller_kill_verifies_group_and_preserves_killed_on_poll(tmp_path):
    producer = "import sys; print('waiting', flush=True); sys.stdin.readline()"
    async with _remote_job(tmp_path, producer) as (reg, info, lease, supervisor):
        # The producer cannot exit until it receives input or our scoped signal.
        assert supervisor.returncode is None
        info.transport_unknown = True  # A later verified outcome settles uncertainty.
        result = await reg.kill(info.pid)
        assert result.startswith("Process -1 killed.")
        assert "outcome_unknown=true" not in result
        assert "containment=process_group_only" in result
        assert info.status == "killed" and info.session_confirmed_empty
        assert not info.transport_unknown
        assert lease.release_count == 1 and info.remote_lease is None
        await asyncio.wait_for(supervisor.wait(), 5)
        record = json.loads((tmp_path / "exit.json").read_text())
        assert record["group_empty"] is True
        result = await reg.poll(info.pid)
        assert "status=killed" in result and "outcome_unknown=true" not in result


@pytest.mark.asyncio
async def test_real_controller_unverified_cleanup_retains_execution_authority(tmp_path):
    async with _remote_job(tmp_path, "print('finished')") as (reg, info, lease, supervisor):
        await asyncio.wait_for(supervisor.wait(), 5)
        path = tmp_path / "exit.json"
        record = json.loads(path.read_text())
        record.update(empty=False, group_empty=False)
        path.write_text(json.dumps(record))
        assert "status=unknown" in await reg.poll(info.pid)
        result = await reg.kill(info.pid)
        assert "Failed to kill" in result and "outcome_unknown=true" in result
        assert info.transport_unknown and not info.session_confirmed_empty
        assert info.remote_lease is lease and lease.release_count == 0
        # Restore honest evidence and show that a successful observation recovers.
        record.update(empty=True, group_empty=True)
        path.write_text(json.dumps(record))
        result = await reg.poll(info.pid)
        assert "status=completed" in result and "outcome_unknown=true" not in result
        assert info.remote_lease is None and lease.release_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["poll", "kill"])
async def test_transport_failure_stays_unknown_without_retiring_authority(tmp_path, operation):
    async with _remote_job(tmp_path, "print('finished')") as (reg, info, lease, supervisor):
        await asyncio.wait_for(supervisor.wait(), 5)
        reg._remote_exec = AsyncMock(side_effect=ConnectionError("link lost"))
        result = await getattr(reg, operation)(info.pid)
        assert "outcome_unknown=true" in result and "SSH transport failed" in result
        assert info.transport_unknown and not info.session_confirmed_empty
        assert info.remote_lease is lease and lease.release_count == 0


@pytest.mark.parametrize("record", [
    {"ok": True, "empty": True, "containment": "process_group_only"},
    {"ok": True, "empty": True, "group_empty": 1, "containment": "process_group_only"},
    {"ok": True, "empty": True, "group_empty": False, "containment": "process_group_only"},
    {"ok": True, "empty": True, "group_empty": True,
     "containment": "process_group_only", "unknown": True},
])
def test_group_only_cleanup_requires_literal_scoped_evidence(record):
    assert not ProcessRegistry._remote_cleanup_proven(record)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["alive", "permission", "empty_without_record"])
async def test_actual_controller_probe_failures_and_delayed_record(tmp_path, mode):
    # Run the real helper parser/logic with only kernel probes/signals replaced.
    # No fixture PID can reach a real signaling syscall.
    (tmp_path / "ready.json").write_text(json.dumps({
        "token": "fixture", "pid": 101, "pgid": 101, "sid": 99, "start_id": "",
    }))
    boundary = (
        "import os,time\n"
        "os.getpgid=lambda pid: 101\n"
        "os.getsid=lambda pid: 99\n"
        "clock=iter(range(10000))\n"
        "time.monotonic=lambda: next(clock)\n"
        "time.sleep=lambda seconds: None\n"
        f"mode={mode!r}\n"
        "def probe(pgid,sig):\n"
        " assert pgid == 101\n"
        " if sig: return\n"
        " if mode == 'empty_without_record': raise ProcessLookupError\n"
        " if mode == 'permission': raise PermissionError\n"
        "os.killpg=probe\n"
    )
    controller = await asyncio.create_subprocess_exec(
        sys.executable, "-c", boundary + _REMOTE_CONTROLLER,
        str(tmp_path), "fixture", "kill", "", "0",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    output, _ = await asyncio.wait_for(controller.communicate(), 5)
    reply = json.loads(output)
    if mode == "empty_without_record":
        assert controller.returncode == 0 and reply["ok"] is True
        assert reply["killed"] is True and reply["exit"] is None
        assert ProcessRegistry._remote_cleanup_proven(reply)
        assert reply["containment"] == "process_group_only"
    else:
        assert controller.returncode == 9 and reply["ok"] is False
        assert reply["unknown"] is True
        assert "group still exists" in reply["error"]
        assert not ProcessRegistry._remote_cleanup_proven(reply)
