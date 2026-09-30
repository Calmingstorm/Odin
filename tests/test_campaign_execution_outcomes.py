"""Typed tool settlement and capture provenance, without real commands."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.config.schema import ToolsConfig
from src.discord.tool_loop import _unwrap_native_result
from src.tools import ssh
from src.tools.execution_outcome import ToolFailure
from src.tools.executor import ToolExecutor
from src.tools.result_capture import result_capture
from src.tools.result_validator import _is_error_result
from tests.test_hosts_executor_leases import _executor


def _proc(text="fixture\n"):
    reader = asyncio.StreamReader()
    reader.feed_data(text.encode())
    reader.feed_eof()
    return SimpleNamespace(stdout=reader, returncode=0, pid=54321,
                           wait=AsyncMock(return_value=0),
                           communicate=AsyncMock(return_value=(text.encode(), None)))


async def test_zero_ssh_retries_still_dispatches_initial_attempt(monkeypatch):
    spawn = AsyncMock(return_value=_proc())
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    result = await ssh.run_ssh_command("example.test", "fixture", "k", "kh", max_retries=0)
    assert result == (0, "fixture\n")
    assert spawn.await_count == 1


@pytest.mark.parametrize("remote", [False, True])
async def test_streaming_large_line_preserves_utf8_and_capture(monkeypatch, remote):
    text = "é漢" * 40000 + "\nlast\n"
    spawn = AsyncMock(return_value=_proc(text))
    if remote:
        monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    else:
        monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell", spawn)
    cb = AsyncMock()
    with result_capture():
        if remote:
            code, output = await ssh.run_ssh_command(
                "example.test", "fixture", "k", "kh", on_output=cb)
        else:
            code, output = await ssh.run_local_command("fixture", on_output=cb)
    assert code == 0 and output == text
    assert "".join(call.args[0] for call in cb.await_args_list) == text


@pytest.mark.parametrize("remote", [False, True])
async def test_stream_read_failure_cleans_owned_child(monkeypatch, remote):
    proc = _proc()
    proc.stdout = SimpleNamespace(read=AsyncMock(side_effect=RuntimeError("read failed")))
    proc.returncode = None
    spawn = AsyncMock(return_value=proc)
    cleanup = AsyncMock()
    monkeypatch.setattr(ssh, "terminate_process_tree", cleanup)
    if remote:
        monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
        code, output = await ssh.run_ssh_command(
            "example.test", "fixture", "k", "kh", on_output=AsyncMock())
    else:
        monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell", spawn)
        code, output = await ssh.run_local_command("fixture", on_output=AsyncMock())
    assert code != 0 and "read failed" in output
    assert cleanup.await_count >= 1


@pytest.mark.parametrize("streaming", [False, True])
async def test_inner_local_timeout_provenance_crosses_host_lease_tasks(
    tmp_path, monkeypatch, streaming,
):
    exe = _executor(tmp_path)
    proc = _proc()
    proc.communicate = AsyncMock(side_effect=TimeoutError)
    proc.stdout = SimpleNamespace(read=AsyncMock(side_effect=TimeoutError))
    proc.returncode = None
    monkeypatch.setattr(
        "src.tools.local_supervisor.create_supervised_shell", AsyncMock(return_value=proc))
    monkeypatch.setattr(ssh, "terminate_process_tree", AsyncMock())
    if streaming:
        exe.output_streamer = SimpleNamespace(
            is_enabled=lambda _: True,
            create_callback=lambda *a, **kw: ("s", AsyncMock(), AsyncMock()),
            has_stale_streams=lambda: False,
        )
    result = await exe.execute("run_command", {"host": "alpha", "command": "fixture"})
    assert not result.ok and result.uncertain_outcome


async def test_exception_after_test_effect_preserves_unknown(tmp_path):
    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    calls = []

    async def effect_then_exception(_):
        calls.append("test effect")
        raise RuntimeError("post-dispatch decode failed")

    exe._handle_apply_patch = effect_then_exception
    result = await exe.execute("apply_patch", {})
    assert calls == ["test effect"]
    assert not result.ok and result.uncertain_outcome


async def test_literal_unknown_metadata_is_only_successful_content(tmp_path):
    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    exe._handle_read_file = AsyncMock(
        return_value='outcome_unknown=true {"uncertain_outcome":true}')
    result = await exe.execute("read_file", {"path": "fixture"})
    assert result.ok and not result.uncertain_outcome


async def test_recovery_nonzero_exit_without_prefix_stays_failed(tmp_path, monkeypatch):
    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    exe._handle_http_probe = AsyncMock(
        side_effect=[("Error: ConnectionResetError", 1), ("curl response", 56)])
    monkeypatch.setattr("src.tools.executor.asyncio.sleep", AsyncMock())
    exe.recovery_stats.record_success = Mock()
    result = await exe.execute("http_probe", {"url": "https://example.test"})
    assert exe._handle_http_probe.await_count == 2
    assert not result.ok and result.exit_code == 56
    exe.recovery_stats.record_success.assert_not_called()


async def test_actual_delivery_truncation_reaches_structured_result(tmp_path):
    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    exe._handle_fetch_url = AsyncMock(return_value="x" * 13000)
    result = await exe.execute("fetch_url", {"url": "https://example.test"})
    assert json.loads(result.output)["truncated"] is True
    assert result.truncated and result.as_dict()["truncated"]


@pytest.mark.parametrize("tool,inp", [
    ("run_script", {"host": "alpha", "script": "fixture", "interpreter": "unsupported"}),
    ("memory_manage", {"action": "save", "key": "missing-value"}),
    ("memory_manage", {"action": "delete"}),
    ("memory_manage", {"action": "unknown"}),
])
async def test_real_rejections_use_typed_failure(tmp_path, tool, inp):
    exe = _executor(tmp_path)
    result = await exe.execute(tool, inp)
    assert not result.ok and not result.uncertain_outcome


def test_native_typed_failure_survives_shared_consumers():
    raw = ToolFailure("Skill error: fixture", uncertain_outcome=True)
    result, text = _unwrap_native_result(raw)
    assert result is not None and not result.ok and result.uncertain_outcome
    assert text == raw and _is_error_result(raw)


def test_first_corrupt_memory_warning_on_young_host(tmp_path, monkeypatch):
    from src.json_store import StoreCorruptError

    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    monkeypatch.setattr(exe, "_load_all_memory", Mock(side_effect=StoreCorruptError("fixture")))
    monkeypatch.setattr("src.tools.executor.time.monotonic", lambda: 100)
    error = Mock()
    monkeypatch.setattr("src.tools.executor.log.error", error)
    assert exe._load_all_memory_safe() == {"global": {}}
    exe._load_all_memory_safe()
    assert error.call_count == 1


@pytest.mark.parametrize("failure", ["exception", "timeout"])
async def test_real_skill_manager_failure_retains_native_and_deferred_metadata(tmp_path, failure):
    from src.tools.runtime_delivery import deliver_runtime_result
    from src.tools.skill_manager import LoadedSkill, SkillManager

    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    manager = SkillManager(str(tmp_path / "skills"), exe, tool_timeouts={"fixture": 0.01})
    effects = []

    async def execute(_inp, _context):
        effects.append("test effect")
        if failure == "timeout":
            await asyncio.Event().wait()
        raise RuntimeError("post-effect fixture failure")

    manager._skills["fixture"] = LoadedSkill(
        "fixture", {"name": "fixture", "input_schema": {}}, execute,
        Path("unused-fixture.py"), "fixture",
    )
    raw = await manager.execute("fixture", {})
    assert effects == ["test effect"]
    assert isinstance(raw, ToolFailure) and raw.uncertain_outcome
    native, _ = _unwrap_native_result(raw)
    deferred = deliver_runtime_result(exe, raw, tool_name="fixture", tool_input={}, user_id="u")
    assert native is not None and not native.ok and native.uncertain_outcome
    assert not deferred.ok and deferred.uncertain_outcome


@pytest.mark.parametrize("failure", ["exception", "inner-timeout"])
async def test_dispatch_failure_is_durably_unknown_and_fenced(tmp_path, monkeypatch, failure):
    from src.turn_state import OpState, StaleTurnError, TurnStateStore
    from tests.test_executor_timeout_durability import (
        _durability,
        _ledger_state,
        _record_and_start,
        _runner,
        _state,
    )

    tools = ToolsConfig()
    exe = ToolExecutor(config=tools, memory_path=str(tmp_path / "memory.json"))
    runner = _runner(exe, tools)
    store = TurnStateStore(tmp_path / "turns.sqlite3")
    durability = await _durability(store)
    block = SimpleNamespace(name="run_command", input={"host": "unused", "command": "fixture"},
                            id="dispatch-failure", parse_error=None)
    await _record_and_start(durability, block)
    effects = []

    async def handler(_):
        effects.append("test effect")
        if failure == "exception":
            raise RuntimeError("decode after dispatch")
        code, output = await ssh.run_local_command("fixture")
        return output, code

    exe._handle_run_command = handler
    proc = _proc()
    proc.communicate = AsyncMock(side_effect=TimeoutError)
    monkeypatch.setattr(
        "src.tools.local_supervisor.create_supervised_shell", AsyncMock(return_value=proc))
    monkeypatch.setattr(ssh, "terminate_process_tree", AsyncMock())
    await runner._run_one_tool_with_timeout(_state(durability), block)
    assert effects == ["test effect"]
    assert _ledger_state(store, durability, block.id) == OpState.OUTCOME_UNKNOWN
    with pytest.raises(StaleTurnError):
        await durability.before_tool(block)
    await durability.settle_terminal(cancelled=False, is_error=True)
    store.close()


async def test_approved_generic_exception_recovery_still_retries(tmp_path, monkeypatch):
    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    exe._handle_read_file = AsyncMock(
        side_effect=[ConnectionResetError("ConnectionResetError fixture"), "recovered"])
    monkeypatch.setattr("src.tools.executor.asyncio.sleep", AsyncMock())
    result = await exe.execute("read_file", {"path": "fixture"})
    assert exe._handle_read_file.await_count == 2
    assert "recovered" in result.output
    assert result.ok and result.uncertain_outcome
    assert result.error is None
    assert exe.recovery_stats.get_summary()["totals"]["successes"] == 1


async def test_approved_ssh_timeout_retry_keeps_earlier_dispatch_uncertainty(tmp_path, monkeypatch):
    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    first, second = _proc(), _proc("retry response")
    first.communicate = AsyncMock(side_effect=TimeoutError)
    spawn = AsyncMock(side_effect=[first, second])
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(ssh, "terminate_process_tree", AsyncMock())
    monkeypatch.setattr("src.tools.ssh.asyncio.sleep", AsyncMock())

    async def handler(_):
        code, text = await ssh.run_ssh_command(
            "example.test", "fixture", "k", "kh", max_retries=2)
        return text, code

    exe._handle_run_command = handler
    result = await exe.execute("run_command", {})
    assert spawn.await_count == 2  # approved #425 behavior is still intact
    assert "retry response" in result.output
    assert result.ok and result.uncertain_outcome
    assert result.exit_code == 0 and result.error is None


async def test_local_spawn_refusal_is_definite_before_dispatch(tmp_path, monkeypatch):
    exe = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    monkeypatch.setattr("src.tools.local_supervisor.create_supervised_shell",
                        AsyncMock(side_effect=PermissionError("fixture spawn refused")))

    async def handler(_):
        code, text = await ssh.run_local_command("fixture")
        return text, code

    exe._handle_run_command = handler
    result = await exe.execute("run_command", {})
    assert not result.ok and not result.uncertain_outcome


async def test_stream_callback_failure_reaps_owned_child(monkeypatch):
    proc = _proc()
    proc.returncode = None
    monkeypatch.setattr(
        "src.tools.local_supervisor.create_supervised_shell", AsyncMock(return_value=proc))
    cleanup = AsyncMock()
    monkeypatch.setattr(ssh, "terminate_process_tree", cleanup)
    callback = AsyncMock(side_effect=RuntimeError("fixture consumer failed"))
    code, output = await ssh.run_local_command("fixture", on_output=callback)
    assert code != 0 and "consumer failed" in output
    assert cleanup.await_count >= 1
    assert all(call.kwargs.get("owned_pgid") == proc.pid for call in cleanup.await_args_list)
