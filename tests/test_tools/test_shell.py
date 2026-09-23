"""Tests for ShellTool."""

import asyncio

import pytest

from src.odin.context import ExecutionContext
from src.odin.tools import shell
from src.odin.tools.shell import ShellTool


@pytest.mark.asyncio
async def test_echo(monkeypatch):
    async def create(*args, **kwargs):
        return FakeProcess(b"hello\n", b"", 0)

    monkeypatch.setattr(shell.asyncio, "create_subprocess_shell", create)
    result = await ShellTool().execute({"command": "placeholder"}, ExecutionContext())
    assert result["returncode"] == 0
    assert result["stdout"].strip() == "hello"


@pytest.mark.asyncio
async def test_failing_command_raises(monkeypatch):
    async def create(*args, **kwargs):
        return FakeProcess(b"", b"stubbed failure", 1)

    monkeypatch.setattr(shell.asyncio, "create_subprocess_shell", create)
    with pytest.raises(RuntimeError, match="failed"):
        await ShellTool().execute({"command": "placeholder", "check": True}, ExecutionContext())


@pytest.mark.asyncio
async def test_failing_command_no_check(monkeypatch):
    async def create(*args, **kwargs):
        return FakeProcess(b"", b"", 1)

    monkeypatch.setattr(shell.asyncio, "create_subprocess_shell", create)
    result = await ShellTool().execute(
        {"command": "placeholder", "check": False}, ExecutionContext()
    )
    assert result["returncode"] != 0


@pytest.mark.asyncio
async def test_cwd(tmp_path, monkeypatch):
    calls = []

    async def create(*args, **kwargs):
        calls.append(kwargs)
        return FakeProcess(b"cwd", b"", 0)

    monkeypatch.setattr(shell.asyncio, "create_subprocess_shell", create)
    result = await ShellTool().execute(
        {"command": "placeholder", "cwd": str(tmp_path)}, ExecutionContext()
    )
    assert result["stdout"] == "cwd"
    assert calls[0]["cwd"] == str(tmp_path)


@pytest.mark.asyncio
async def test_env(monkeypatch):
    calls = []

    async def create(*args, **kwargs):
        calls.append(kwargs)
        return FakeProcess(b"odin", b"", 0)

    monkeypatch.setattr(shell.asyncio, "create_subprocess_shell", create)
    await ShellTool().execute(
        {"command": "placeholder", "env": {"MY_VAR": "odin"}}, ExecutionContext()
    )
    assert calls[0]["env"] == {"MY_VAR": "odin"}


class FakeProcess:
    pid = 1234

    def __init__(self, stdout=b"out", stderr=b"err", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode
        self.waited = False

    async def communicate(self):
        return self.stdout, self.stderr

    async def wait(self):
        self.waited = True

    def kill(self):
        self.killed = True


@pytest.mark.asyncio
async def test_execute_uses_stub_process_and_decodes_output(monkeypatch):
    proc = FakeProcess(b"hello\xff", b"warning\xfe", 0)
    calls = []

    async def create(command, **kwargs):
        calls.append((command, kwargs))
        return proc

    monkeypatch.setattr(shell.asyncio, "create_subprocess_shell", create)
    result = await ShellTool().execute(
        {"command": "harmless placeholder", "cwd": "/tmp", "env": {"X": "1"}},
        ExecutionContext(),
    )
    assert result == {"returncode": 0, "stdout": "hello\ufffd", "stderr": "warning\ufffd"}
    assert calls[0][0] == "harmless placeholder"
    assert calls[0][1]["start_new_session"] is True
    assert calls[0][1]["cwd"] == "/tmp"


@pytest.mark.asyncio
async def test_execute_check_failure_contains_stderr(monkeypatch):
    async def create(*args, **kwargs):
        return FakeProcess(b"", b"stubbed failure", 9)

    monkeypatch.setattr(shell.asyncio, "create_subprocess_shell", create)
    with pytest.raises(RuntimeError, match="rc=9.*stubbed failure"):
        await ShellTool().execute({"command": "placeholder", "check": True}, ExecutionContext())


@pytest.mark.asyncio
async def test_terminate_group_escalates_and_reaps_stub(monkeypatch):
    proc = FakeProcess()
    signals = []
    monkeypatch.setattr(shell.os, "name", "posix")
    monkeypatch.setattr(shell.os, "killpg", lambda pid, sig: signals.append((pid, sig)))

    async def no_sleep(_):
        pass

    monkeypatch.setattr(shell.asyncio, "sleep", no_sleep)
    await shell._terminate_group(proc)
    assert signals == [(proc.pid, shell.signal.SIGTERM), (proc.pid, shell.signal.SIGKILL)]
    assert proc.waited


@pytest.mark.asyncio
async def test_terminate_group_ignores_missing_group(monkeypatch):
    proc = FakeProcess()

    def missing_group(*args):
        raise ProcessLookupError

    monkeypatch.setattr(shell.os, "name", "posix")
    monkeypatch.setattr(shell.os, "killpg", missing_group)

    async def no_sleep(_):
        pass

    monkeypatch.setattr(shell.asyncio, "sleep", no_sleep)
    await shell._terminate_group(proc)
    assert proc.waited


@pytest.mark.asyncio
async def test_terminate_group_non_posix_kills_and_waits(monkeypatch):
    proc = FakeProcess()
    monkeypatch.setattr(shell.os, "name", "nt")
    monkeypatch.setattr(shell.os, "killpg", lambda *_: pytest.fail("killpg must not run"))
    await shell._terminate_group(proc)
    assert proc.killed and proc.waited


@pytest.mark.asyncio
async def test_communicate_cancellation_finishes_group_cleanup(monkeypatch):
    proc = FakeProcess()

    async def cancelled():
        raise asyncio.CancelledError

    proc.communicate = cancelled
    cleanups = []

    async def cleanup(target):
        cleanups.append(target)

    monkeypatch.setattr(shell, "_terminate_group", cleanup)
    with pytest.raises(asyncio.CancelledError):
        await shell._communicate_or_cleanup(proc)
    assert cleanups == [proc]


@pytest.mark.asyncio
async def test_communicate_repeated_cancellation_waits_for_cleanup(monkeypatch):
    proc = FakeProcess()

    async def cancelled():
        raise asyncio.CancelledError

    proc.communicate = cancelled
    entered = asyncio.Event()
    release = asyncio.Event()

    async def slow_cleanup(target):
        assert target is proc
        entered.set()
        await release.wait()

    monkeypatch.setattr(shell, "_terminate_group", slow_cleanup)
    task = asyncio.create_task(shell._communicate_or_cleanup(proc))
    await entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task


def test_param_schema():
    assert ShellTool.param_schema() == {
        "command": {"type": "string", "required": True},
        "cwd": {"type": "string"},
        "check": {"type": "boolean", "default": False},
    }
