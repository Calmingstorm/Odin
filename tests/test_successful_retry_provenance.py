"""Final retry settlement is independent of earlier dispatch uncertainty.

Real executor, host leases, handlers and SSH retry code; only the subprocess
boundary is faked. No command, SSH connection or service reaches a live host.
"""
from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolHost, ToolsConfig
from src.tools import executor as executor_module
from src.tools import ssh
from src.tools.execution_outcome import ToolFailure, ToolSuccess, result_text
from src.tools.executor import ToolExecutor
from src.tools.hosts import HostRegistry
from src.tools.result_validator import ToolResult


class _SSHClient:
    """A dispatched client settles only when communicate or cleanup completes."""

    def __init__(self, *, failure=None, code=0, output="1: recovered\n"):
        self.pid = 54321
        self.returncode = None
        self.failure = failure
        self.code = code
        self.output = output
        self.communications = 0
        self.cleaned = False

    async def communicate(self):
        self.communications += 1
        if self.failure is not None:
            raise self.failure
        self.returncode = self.code
        return self.output.encode(), None

    async def cleanup(self):
        assert self.returncode is None
        self.returncode = -15
        self.cleaned = True


def _executor(tmp_path, *, attempts):
    config = ToolsConfig(
        ssh_pool={"enabled": False},
        ssh_retry={"max_retries": attempts, "base_delay": 0, "max_delay": 0},
    )
    registry = HostRegistry(
        {"remote": ToolHost(address="192.0.2.10")},
        trust_dir=tmp_path / "trust",
    )
    return ToolExecutor(config=config, host_registry=registry,
                        memory_path=str(tmp_path / "memory.json"))


def _fake_clients(monkeypatch, *clients):
    pending = iter(clients)

    async def spawn(*args, **kwargs):
        assert args[0] == "ssh"
        assert "root@192.0.2.10" in args
        assert kwargs["stdout"] is ssh.asyncio.subprocess.PIPE
        if clients[0] is not clients[-1] and clients[0].communications:
            assert clients[0].cleaned, "retry must follow timeout cleanup"
        return next(pending)

    async def cleanup(proc, **kwargs):
        assert proc in clients
        await proc.cleanup()

    spawn_mock = AsyncMock(side_effect=spawn)
    monkeypatch.setattr(ssh.asyncio, "create_subprocess_exec", spawn_mock)
    monkeypatch.setattr(ssh, "terminate_process_tree", AsyncMock(side_effect=cleanup))
    return spawn_mock


@pytest.mark.parametrize("final_code", [0, 7])
async def test_real_run_command_internal_ssh_retry_settlement(tmp_path, monkeypatch, final_code):
    exe = _executor(tmp_path, attempts=2)
    first = _SSHClient(failure=TimeoutError("client lost settlement"))
    second = _SSHClient(code=final_code, output="retry response")
    third = _SSHClient(output="separate invocation")
    spawn = _fake_clients(monkeypatch, first, second, third)

    result = await exe.execute("run_command", {"host": "remote", "command": "fixture"})

    assert spawn.await_count == 2
    assert first.cleaned and first.communications == second.communications == 1
    assert result.ok is (final_code == 0)
    assert result.exit_code == final_code
    assert result.uncertain_outcome
    assert (result.error is None) is result.ok
    assert "retry response" in result.output
    assert exe.recovery_stats.get_summary()["totals"]["attempts"] == 0

    separate = await exe.execute("run_command", {"host": "remote", "command": "fixture"})
    assert spawn.await_count == 3
    assert separate.ok and not separate.uncertain_outcome
    assert separate.output == "separate invocation"


@pytest.mark.parametrize("final_code", [0, 7])
async def test_real_read_file_executor_recovery_settlement(tmp_path, monkeypatch, final_code):
    exe = _executor(tmp_path, attempts=1)
    first = _SSHClient(failure=ConnectionResetError("ConnectionResetError: peer closed"))
    second = _SSHClient(code=final_code, output="Error: ConnectionResetError is file content")
    spawn = _fake_clients(monkeypatch, first, second)
    decide = executor_module._decide_recovery_action
    monkeypatch.setattr(executor_module, "_decide_recovery_action",
                        lambda **kw: replace(decide(**kw), delay_seconds=0))

    result = await exe.execute("read_file", {"host": "remote", "path": "/fixture.txt"})

    assert spawn.await_count == 2
    assert first.cleaned and first.communications == second.communications == 1
    assert result.ok is (final_code == 0)
    assert result.exit_code == final_code
    assert result.uncertain_outcome
    assert (result.error is None) is result.ok
    summary = exe.recovery_stats.get_summary()["totals"]
    assert "SSH error:" not in result.output
    assert "effective_shell=" not in result.output
    assert ("Command failed" in result.output) is (final_code != 0)
    assert summary["attempts"] == 1
    assert summary["successes"] == int(final_code == 0)
    assert summary["failures"] == int(final_code != 0)


async def test_real_read_file_error_like_content_does_not_recover(tmp_path, monkeypatch):
    exe = _executor(tmp_path, attempts=1)
    client = _SSHClient(output="Error: ConnectionResetError is file content")
    spawn = _fake_clients(monkeypatch, client)

    result = await exe.execute("read_file", {"host": "remote", "path": "/fixture.txt"})

    assert spawn.await_count == 1
    assert result.ok and result.exit_code == 0 and not result.uncertain_outcome
    assert result.output.startswith(client.output)
    assert exe.recovery_stats.get_summary()["totals"]["attempts"] == 0


async def test_real_run_command_exhausted_timeouts_remain_failed(tmp_path, monkeypatch):
    exe = _executor(tmp_path, attempts=2)
    clients = [_SSHClient(failure=TimeoutError()) for _ in range(2)]
    spawn = _fake_clients(monkeypatch, *clients)

    result = await exe.execute("run_command", {"host": "remote", "command": "fixture"})

    assert spawn.await_count == 2 and all(proc.cleaned for proc in clients)
    assert not result.ok and result.uncertain_outcome
    assert result.exit_code == 1 and result.error is not None


@pytest.mark.parametrize("formatted", [False, True])
async def test_nested_success_wrapper_keeps_success_and_uncertainty(tmp_path, formatted):
    exe = _executor(tmp_path, attempts=1)

    async def handler(_):
        text = result_text(ToolResult(output="nested retry settled", ok=True,
                                      uncertain_outcome=True))
        assert isinstance(text, ToolSuccess) and not isinstance(text, ToolFailure)
        return f"formatted {text}" if formatted else text

    exe._handle_test_tool = handler
    result = await exe.execute("test_tool", {})
    assert result.ok and result.uncertain_outcome and result.error is None
    assert "nested retry settled" in result.output


async def test_returned_success_wrapper_keeps_provenance_without_active_context(tmp_path):
    exe = _executor(tmp_path, attempts=1)
    text = result_text(ToolResult(output="Error: ConnectionResetError is captured content",
                                  ok=True, uncertain_outcome=True))
    exe._handle_test_tool = AsyncMock(return_value=text)
    result = await exe.execute("test_tool", {})
    assert result.ok and result.uncertain_outcome and result.error is None
    exe._handle_test_tool.assert_awaited_once()
