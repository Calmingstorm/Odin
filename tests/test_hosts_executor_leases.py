"""Hermetic lease-bound executor coverage for the managed-host control plane.

These tests deliberately exercise the seams that must remain late-bound when a
host record is edited, disabled, or force-revoked.  No command reaches a real
host: the executor transport is replaced before every execution path.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.config.schema import ToolHost, ToolsConfig
from src.tools.executor import ToolExecutor
from src.tools.handlers.devops import DevOpsTools
from src.tools.hosts import HostRegistry
from src.tools.result_validator import ToolResult


class _HostAccess:
    def __init__(self, *, allowed: bool = True, default: str = "") -> None:
        self.allowed = allowed
        self.default = default

    def is_host_allowed(self, _user_id: str, _alias: str) -> bool:
        return self.allowed

    def get_default_host(self, _user_id: str) -> str:
        return self.default


class _Processes:
    def cleanup(self) -> None:
        pass

    def output_info(self, _pid, cursor=None):
        return None

    async def poll(self, _pid: int, *, wait_seconds: float, **kwargs) -> str:
        return f"polled after {wait_seconds}"

    def list_all(self, **kwargs) -> str:
        return "[]"


def _executor(tmp_path: Path, *, access=None) -> ToolExecutor:
    registry = HostRegistry(
        {
            "alpha": ToolHost(address="127.0.0.1"),
            "remote": ToolHost(address="192.0.2.10"),
        },
        default_host="alpha",
        trust_dir=tmp_path / "trust",
    )
    return ToolExecutor(
        config=ToolsConfig(),
        host_registry=registry,
        host_access_manager=access,
    )


def test_host_access_fences_apply_to_resolve_and_all_lease_acquisition(tmp_path):
    executor = _executor(tmp_path, access=_HostAccess(allowed=False))
    executor.set_user_context("restricted")
    try:
        assert executor._resolve_host("alpha") is None
        assert executor._acquire_host("alpha") is None
        assert executor.acquire_host_for_user("alpha", "restricted") is None
    finally:
        executor.set_user_context(None)


def test_default_selection_and_handler_registry_accessor_are_live(tmp_path):
    executor = _executor(tmp_path, access=_HostAccess(default="remote"))
    assert executor._resolve_default_host("operator") == "remote"
    assert executor.system_tools._host_registry is executor.host_registry

    executor._host_access = None
    assert executor._resolve_default_host(None) == "alpha"


async def test_execute_and_run_on_host_hold_a_host_lease_without_transport(tmp_path, monkeypatch):
    executor = _executor(tmp_path)
    seen = []

    async def transport(address, command, ssh_user, **kwargs):
        seen.append((address, command, ssh_user, kwargs.get("target")))
        return 0, "completed"

    monkeypatch.setattr(executor, "_exec_command", transport)
    result = await executor.execute("run_command", {"host": "alpha", "command": "echo ok"})
    assert result.ok and result.output == "completed"
    # execute holds the lease in its context; the domain handler intentionally
    # keeps its established three-argument transport call shape.
    assert seen[0][:3] == ("127.0.0.1", "echo ok", "root")


async def test_execute_force_revoke_returns_structured_uncertain_outcome(tmp_path, monkeypatch):
    executor = _executor(tmp_path)
    started = asyncio.Event()

    async def blocked(_address, _command, _ssh_user, **_kwargs):
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(executor, "_exec_command", blocked)
    running = asyncio.create_task(
        executor.execute("run_command", {"host": "alpha", "command": "echo maybe"})
    )
    await started.wait()
    assert executor.host_registry.force_revoke("alpha") == 1
    result = await running
    assert result.ok is False
    assert result.error == "host_force_revoked"
    assert result.uncertain_outcome is True
    assert "outcome_unknown=true" in result.output
    reacquired = executor.host_registry.acquire("alpha")
    assert reacquired is not None
    reacquired.release()

    async def failing_transport(*_args, **_kwargs):
        return 7, "transport failed"

    monkeypatch.setattr(executor, "_exec_command", failing_transport)
    assert await executor._run_on_host("alpha", "false") == (
        "Command failed (exit 7):\ntransport failed",
        7,
    )


async def test_remote_transport_and_retirement_use_the_exact_target(tmp_path, monkeypatch):
    executor = _executor(tmp_path)
    target = executor.host_registry.get("remote", targetable_only=True)
    assert target is not None

    executor._exec_command = AsyncMock(return_value=(0, "ok"))
    assert await executor._exec_remote_target(target, "true", 17) == (0, "ok")
    assert executor._exec_command.await_args.kwargs["target"] is target

    pool = SimpleNamespace(close_target=AsyncMock())
    executor.ssh_pool = pool
    await executor._retire_host_target(target)
    pool.close_target.assert_awaited_once_with(target)


def test_executor_miscellaneous_compatibility_paths(tmp_path):
    executor = _executor(tmp_path)
    executor.command_governor = None
    assert executor._govern_command("anything") == (True, "", "")
    assert executor._host_os("absent") == "linux"

    memory_path = tmp_path / "memory.json"
    memory_path.write_text(json.dumps({"old": "value"}))
    executor._memory_path = memory_path
    assert executor._load_all_memory() == {"global": {"old": "value"}}
    assert json.loads(memory_path.read_text()) == {"global": {"old": "value"}}


async def test_handler_failures_are_hermetic_and_classify_as_nonzero(tmp_path, monkeypatch):
    executor = _executor(tmp_path)

    assert "'command' is required" in await executor.system_tools._handle_run_command(
        {"host": "alpha"}
    )
    monkeypatch.setattr(executor, "_govern_command", lambda *_args: (False, "blocked", ""))
    assert (
        await executor.system_tools._handle_run_command({"host": "alpha", "command": "echo never"})
        == "blocked"
    )

    monkeypatch.setattr(executor, "_govern_command", lambda *_args: (True, "", ""))
    assert "Unsupported interpreter" in await executor.system_tools._handle_run_script(
        {"host": "alpha", "script": "pass", "interpreter": "not-a-runtime"}
    )

    processes = _Processes()
    monkeypatch.setattr(executor.system_tools, "_process_registry", lambda: processes)
    assert await executor.system_tools._handle_manage_process({"action": "poll"}) == (
        "pid is required for poll action.",
        1,
    )
    assert await executor.system_tools._handle_manage_process({"action": "write", "pid": 5}) == (
        "input_text is required for write action.",
        1,
    )
    assert await executor.system_tools._handle_manage_process({"action": "kill"}) == (
        "pid is required for kill action.",
        1,
    )
    assert await executor.system_tools._handle_manage_process({"action": "list"}) == ("[]", 0)

    assert "Unknown or disallowed host" in await executor.devops_tools._handle_git_ops(
        {"action": "status", "host": "absent"}
    )
    assert "Unknown or disallowed host" in await executor.devops_tools._handle_kubectl(
        {"action": "get", "host": "absent"}
    )
    assert isinstance(executor.devops_tools, DevOpsTools)


async def test_validation_exec_acquires_a_lease_and_reports_unknown_alias(tmp_path, monkeypatch):
    executor = _executor(tmp_path)
    calls = []

    async def transport(address, command, ssh_user, **kwargs):
        calls.append((address, command, ssh_user, kwargs))
        return 0, "checked"

    monkeypatch.setattr(executor, "_exec_command", transport)

    async def fake_run_bundle(_checks, *, resolve_host, exec_command, **_kwargs):
        assert resolve_host("alpha") == ("alpha", "", "")
        assert resolve_host("absent") is None
        assert await exec_command("absent", "true", "", timeout=3) == (
            1,
            "unknown host alias: absent",
        )
        assert await exec_command("alpha", "true", "", timeout=3, use_workspace=True) == (
            0,
            "checked",
        )
        return {"verdict": "pass"}

    monkeypatch.setattr("src.tools.post_validation.run_bundle", fake_run_bundle)
    monkeypatch.setattr(
        "src.tools.post_validation.format_report_summary", lambda report: report["verdict"]
    )
    assert (
        await executor.validation_tools._handle_validate_action({"checks": [{"type": "command"}]})
        == "pass"
    )
    assert calls[0][3]["target"].alias == "alpha"
    assert await executor.validation_tools._handle_validate_action({"checks": []}) == (
        "Error: 'checks' must be a non-empty list. See tool description for check schema."
    )


def test_tool_result_as_dict_emits_all_optional_serializable_fields():
    result = ToolResult(
        output="done",
        ok=False,
        error="failed",
        exit_code=9,
        truncated=True,
        duration_ms=12,
        tool_name="run_command",
        risk_level="high",
        risk_reason="destructive",
        uncertain_outcome=True,
    )
    assert result.as_dict() == {
        "ok": False,
        "output": "done",
        "truncated": True,
        "duration_ms": 12,
        "error": "failed",
        "exit_code": 9,
        "tool_name": "run_command",
        "risk_level": "high",
        "risk_reason": "destructive",
        "uncertain_outcome": True,
    }
