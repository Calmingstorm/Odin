"""Operator kills remain distinct from command failure on every transport."""
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.tools.process_manager import ProcessInfo, ProcessRegistry


@pytest.mark.parametrize("pid", [17, -17])
async def test_remote_kill_then_poll_preserves_cause(monkeypatch, pid):
    from tests.test_remote_processes import _Lease

    registry = ProcessRegistry()
    info = ProcessInfo(pid=pid, command="test", start_time=0, remote=True,
                       host="test-host", remote_dir="/tmp/test-job")
    registry._processes[pid] = info
    info.remote_lease = _Lease()
    registry._remote_exec = AsyncMock(return_value=(0, json.dumps({
        "ok": True, "status": "exited", "exit": {"exit_code": -15},
    })))
    monkeypatch.setattr(registry, "_remote_call", AsyncMock(side_effect=[
        (0, json.dumps({"ok": True, "killed": True, "exit": {"exit_code": -15}})),
        (0, json.dumps({"ok": True, "status": "exited", "exit": {"exit_code": -15}})),
    ]))
    assert "killed" in await registry.kill(pid)
    assert info.status == "killed"
    assert info.exit_code == -15
    read_lease = _Lease()
    try:
        assert "killed" in await registry.poll(pid, output_lease=read_lease)
    finally:
        read_lease.release()
    assert info.status == "killed"


async def test_local_kill_preserves_observed_exit(monkeypatch):
    registry = ProcessRegistry()
    process = MagicMock(returncode=-15)
    info = ProcessInfo(pid=17, host="test-host", command="test", start_time=0, process=process)
    registry._processes[17] = info
    monkeypatch.setattr("src.tools.ssh.terminate_process_tree", AsyncMock())
    assert "killed" in await registry.kill(17)
    assert info.status == "killed"
    assert info.exit_code == -15
    assert "killed" in registry.list_all()


@pytest.mark.parametrize("reply", [{"ok": False}, {"ok": True, "already_exited": True}])
async def test_remote_unknown_or_already_exited_is_not_killed(monkeypatch, reply):
    registry = ProcessRegistry()
    info = ProcessInfo(pid=-17, command="test", start_time=0, remote=True,
                       host="test-host", remote_dir="/tmp/test-job")
    registry._processes[-17] = info
    monkeypatch.setattr(registry, "_remote_call", AsyncMock(return_value=(0, json.dumps(reply))))
    result = await registry.kill(-17)
    assert not result.endswith(" killed.")
    assert info.status != "killed"
