"""Cancellation and retry tests with process execution fully stubbed."""

import asyncio
import signal

import pytest

from src.odin.context import ExecutionContext
from src.odin.executor import StepExecutor
from src.odin.registry import ToolRegistry
from src.odin.tools import shell
from src.odin.tools.process import ProcessRunTool
from src.odin.types import StepSpec, StepStatus


class HangingTool:
    calls = 0
    cancelled = 0

    async def execute(self, params, ctx):
        type(self).calls += 1
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            type(self).cancelled += 1
            raise


async def test_deadline_cancels_each_attempt_and_retries():
    HangingTool.calls = HangingTool.cancelled = 0
    registry = ToolRegistry()
    registry.register("hang", HangingTool)
    result = await StepExecutor(registry).execute_step(
        StepSpec(id="hang", tool="hang", timeout=0.01, retries=2), ExecutionContext()
    )
    assert result.status == StepStatus.TIMEOUT
    assert result.attempts == 3
    assert HangingTool.calls == HangingTool.cancelled == 3


async def test_retry_after_timeout_can_succeed():
    class FirstAttemptHangs:
        calls = 0

        async def execute(self, params, ctx):
            type(self).calls += 1
            if type(self).calls == 1:
                await asyncio.Event().wait()
            return "completed"

    registry = ToolRegistry()
    registry.register("once", FirstAttemptHangs)
    result = await StepExecutor(registry).execute_step(
        StepSpec(id="once", tool="once", timeout=0.01, retries=1), ExecutionContext()
    )
    assert result.status == StepStatus.SUCCESS
    assert result.output == "completed"
    assert result.attempts == 2


class FakeProcess:
    pid = 123456
    returncode = None

    def __init__(self):
        self.waited = False
        self.started = asyncio.Event()
        self.ready = asyncio.Event()

    async def communicate(self):
        self.started.set()
        await self.ready.wait()
        return b"", b""

    async def wait(self):
        self.waited = True
        return -signal.SIGTERM


@pytest.mark.parametrize("tool", [shell.ShellTool, ProcessRunTool])
async def test_cancel_shell_kills_process_group_and_reaps(monkeypatch, tool):
    proc = FakeProcess()
    spawned = []
    sent = []

    async def fake_subprocess(*args, **kwargs):
        spawned.append(kwargs)
        return proc

    def fake_killpg(pid, sig):
        sent.append((pid, sig))
        proc.ready.set()

    monkeypatch.setattr(asyncio, "create_subprocess_shell", fake_subprocess)
    monkeypatch.setattr(shell.os, "killpg", fake_killpg)
    task = asyncio.create_task(tool().execute({"command": "not executed"}, ExecutionContext()))
    await proc.started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert spawned[0]["start_new_session"] is True
    assert sent == [(proc.pid, signal.SIGTERM), (proc.pid, signal.SIGKILL)]
    assert proc.waited


async def test_shell_timeout_reaps_before_retry(monkeypatch):
    processes = []
    signals = []

    async def fake_subprocess(*args, **kwargs):
        assert not processes or processes[-1].waited
        proc = FakeProcess()
        proc.pid += len(processes)
        processes.append(proc)
        return proc

    def fake_killpg(pid, sig):
        signals.append((pid, sig))
        next(p for p in processes if p.pid == pid).ready.set()

    monkeypatch.setattr(asyncio, "create_subprocess_shell", fake_subprocess)
    monkeypatch.setattr(shell.os, "killpg", fake_killpg)
    registry = ToolRegistry()
    registry.register("shell", shell.ShellTool)
    result = await StepExecutor(registry).execute_step(
        StepSpec(id="shell", tool="shell", params={"command": "not executed"},
                 timeout=0.01, retries=1), ExecutionContext()
    )
    assert result.status == StepStatus.TIMEOUT
    assert result.attempts == 2
    assert len(processes) == 2
    assert all(p.waited for p in processes)
    assert signals == [
        (processes[0].pid, signal.SIGTERM), (processes[0].pid, signal.SIGKILL),
        (processes[1].pid, signal.SIGTERM), (processes[1].pid, signal.SIGKILL),
    ]
