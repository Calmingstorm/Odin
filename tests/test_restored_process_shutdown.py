"""Retained evidence from a previous image must not veto this image's exec."""

import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src import restart
from src.discord.wiring import shutdown_services
from src.tools.process_manager import ProcessCleanupError, ProcessInfo, ProcessRegistry


@pytest.fixture(autouse=True)
def isolated_retention(monkeypatch):
    # Restoring real manifests schedules 24-hour evidence expiry, not execution.
    monkeypatch.setattr("src.async_utils.fire_and_forget", lambda coro, **kw: coro.close())
    restart.reset()
    yield
    restart.reset()


@pytest.mark.parametrize("remote", [True, False], ids=["remote", "local"])
@pytest.mark.parametrize("legacy", [True, False], ids=["v4.10.0", "current"])
async def test_restored_completed_manifest_does_not_veto_shutdown(
    tmp_path, monkeypatch, caplog, remote, legacy,
):
    now = time.time()
    generation = "a" * 32
    # Exact v4.10.0 _persist_output keys: settlement proof was NOT persisted.
    record = {
        "pid": -2 if remote else 12345,
        "generation": generation,
        "host": "server" if remote else "localhost",
        "host_alias": "server" if remote else "localhost",
        "host_identity": "fixture-identity",
        "owner_id": "fixture-owner",
        "start_time": now - 120,
        "status": "completed",
        "exit_code": 0,
        "total_output_bytes": 0,
        "retained_bytes": 0,
        "finished_at": now - 60,
        "capture_error": None,
        "remote": remote,
        "remote_dir": "/tmp/fixture-retained-job" if remote else "",
        "remote_token": "fixture-token" if remote else "",
        "output_revoked": False,
        "output_masked": False,
        "origin_channel": "fixture-channel",
        "scope_id": "fixture-scope",
        "host_binding": None,
        "reserved_bytes": 0,
    }
    if not legacy:
        record.update(session_confirmed_empty=False, containment="")
    manifest = tmp_path / f"{generation}.json"
    manifest.write_text(json.dumps(record, separators=(",", ":")))
    original_manifest = manifest.read_bytes()
    registry = ProcessRegistry(retention_dir=tmp_path)
    info = registry.output_info(record["pid"])
    assert info is not None and info.restored
    assert info.remote is remote and info.status == "completed" and info.exit_code == 0
    assert not info.session_confirmed_empty
    assert info.process is None and info.remote_lease is None and info.host_lease is None

    # No termination or transport may be attempted for read-only evidence.
    guards = []
    for name in ("terminate_generation", "_kill_remote", "_kill_group_until_gone", "_remote_call"):
        guard = AsyncMock(side_effect=AssertionError("retained evidence is read-only"))
        monkeypatch.setattr(registry, name, guard)
        guards.append(guard)

    assert await registry.shutdown() == 0
    bot = SimpleNamespace(tool_executor=SimpleNamespace(_process_registry=registry))
    await shutdown_services(bot)
    assert restart.reexec_blocked() is None
    assert "cleanup could not be verified" not in caplog.text.lower()
    assert "restart vetoed" not in caplog.text.lower()
    assert registry.output_info(info.pid) is info
    assert not info.session_confirmed_empty  # Exemption is not fabricated cleanup proof.
    assert manifest.read_bytes() == original_manifest
    for guard in guards:
        guard.assert_not_awaited()


@pytest.mark.parametrize("status", ["running", "completed"])
async def test_live_remote_unproven_cleanup_still_vetoes_shutdown(monkeypatch, status):
    registry = ProcessRegistry()
    info = ProcessInfo(
        pid=-3, command="fixture", host="server", start_time=time.time(),
        remote=True, status=status, exit_code=0 if status == "completed" else None,
    )
    registry._processes[info.pid] = info
    registry._retained_generations[info.generation] = info
    # The real remote-kill path gets a successful transport response but no
    # affirmative settlement proof. Terminal status alone is still insufficient.
    remote_call = AsyncMock(return_value=(0, json.dumps({"ok": True, "already_exited": True})))
    monkeypatch.setattr(registry, "_remote_call", remote_call)
    with pytest.raises(ProcessCleanupError, match=r"PID\(s\) \[-3\]"):
        await registry.shutdown()
    remote_call.assert_awaited_once()
    assert not info.restored and not info.session_confirmed_empty

    bot = SimpleNamespace(tool_executor=SimpleNamespace(_process_registry=registry))
    await shutdown_services(bot)
    assert "process cleanup unverified" in restart.reexec_blocked()
    assert "[-3]" in restart.reexec_blocked()
