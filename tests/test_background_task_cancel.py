"""cancel_task now actually interrupts an in-flight step.

Before this fix cancellation only set an event checked BETWEEN steps, so a
long-running step ran to completion, posted its summary, and could still fire
an LLM follow-up while the tool claimed cancellation succeeded. Now
``request_cancel`` marks the task cancelled, cancels the runner's asyncio task,
and waits for it to settle; the runner skips the summary and follow-up on
cancellation.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from src.discord.background_task import (
    BackgroundTask,
    create_task_id,
    run_background_task,
)
from src.discord.native_tools.agents_tasks import AgentTaskTools
from src.tools.result_validator import ToolResult
from tests.fakes import FakeChannel


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def make_task(steps, channel=None):
    return BackgroundTask(
        task_id=create_task_id(),
        description="cancel test",
        steps=steps,
        channel=channel or FakeChannel(id=555),
        requester="tester",
        requester_id="4242",
    )


class _FakeSkillManager:
    def has_skill(self, name):
        return False


class _InstantExecutor:
    def check_permission(self, *a):
        return None

    async def execute(self, tool_name, tool_input, user_id=None):
        return ToolResult(output="ok", tool_name=tool_name)


class _BlockingExecutor:
    """Blocks inside a step until released, recording whether it was cancelled."""

    def __init__(self):
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.cancelled_during = False

    def check_permission(self, *a):
        return None

    async def execute(self, tool_name, tool_input, user_id=None):
        self.started.set()
        try:
            await self.release.wait()
        except asyncio.CancelledError:
            self.cancelled_during = True
            raise
        return ToolResult(output="ok", tool_name=tool_name)


def _spawn(task, executor):
    """Spawn run_background_task exactly like the production wrapper: catch
    CancelledError, keep status cancelled, re-raise so the task settles."""

    async def _run():
        try:
            await run_background_task(task, executor, _FakeSkillManager())
        except asyncio.CancelledError:
            task.status = "cancelled"
            raise

    t = asyncio.create_task(_run())
    task._asyncio_task = t
    return t


async def test_request_cancel_interrupts_active_step():
    executor = _BlockingExecutor()
    channel = FakeChannel(id=555)
    task = make_task(
        [{"tool_name": "run_command", "tool_input": {"command": "sleep"}}], channel=channel
    )
    t = _spawn(task, executor)
    await asyncio.wait_for(executor.started.wait(), timeout=2)  # inside the step

    cancelled = await task.request_cancel()
    assert cancelled is True
    assert task.status == "cancelled"
    assert executor.cancelled_during is True  # the running step WAS interrupted
    assert t.done()
    # No summary line was posted (cancellation won).
    joined = " ".join(channel.sent_texts)
    assert "succeeded" not in joined


async def test_graceful_cancel_between_steps_skips_summary():
    executor = _InstantExecutor()
    channel = FakeChannel(id=555)
    task = make_task(
        [{"tool_name": "run_command", "tool_input": {}}], channel=channel
    )
    task.cancel()  # cooperative event set before the loop starts
    await run_background_task(task, executor, _FakeSkillManager())
    assert task.status == "cancelled"
    joined = " ".join(channel.sent_texts)
    assert "succeeded" not in joined
    assert "0 succeeded" not in joined


async def test_request_cancel_idempotent_and_completed_wins():
    executor = _InstantExecutor()
    task = make_task([{"tool_name": "run_command", "tool_input": {}}])
    await run_background_task(task, executor, _FakeSkillManager())
    assert task.status == "completed"
    # A task that reached terminal state first cannot be cancelled.
    assert await task.request_cancel() is False
    assert task.status == "completed"


async def test_repeat_cancel_is_idempotent():
    executor = _BlockingExecutor()
    task = make_task([{"tool_name": "run_command", "tool_input": {}}])
    t = _spawn(task, executor)
    await asyncio.wait_for(executor.started.wait(), timeout=2)
    assert await task.request_cancel() is True
    # Second cancel: already terminal, returns False, no error.
    assert await task.request_cancel() is False
    assert task.status == "cancelled"
    assert t.done()


async def test_cancel_task_handler_interrupts_running_step():
    """The cancel_task TOOL handler must drive request_cancel (not the old
    cooperative cancel) so a running step is actually interrupted."""
    executor = _BlockingExecutor()
    task = make_task([{"tool_name": "run_command", "tool_input": {}}])
    t = _spawn(task, executor)
    await asyncio.wait_for(executor.started.wait(), timeout=2)

    tools = AgentTaskTools.__new__(AgentTaskTools)
    tools._channel_state = SimpleNamespace(background_tasks={task.task_id: task})
    result = await tools._handle_cancel_task({"task_id": task.task_id})

    assert "cancelled" in result.lower()
    assert task.status == "cancelled"
    assert executor.cancelled_during is True  # interrupted THROUGH the handler
    assert t.done()


async def test_cancel_task_handler_not_found_and_not_running():
    tools = AgentTaskTools.__new__(AgentTaskTools)
    task = make_task([{"tool_name": "x", "tool_input": {}}])
    task.status = "completed"
    tools._channel_state = SimpleNamespace(background_tasks={task.task_id: task})
    assert "No task found" in await tools._handle_cancel_task({"task_id": "ghost"})
    assert "not running" in (
        await tools._handle_cancel_task({"task_id": task.task_id})
    ).lower()


async def test_cleanup_exception_during_cancel_stays_cancelled():
    """A regular exception surfacing while cancellation is in flight must NOT be
    masked as 'failed' (which would fire the summary + forbidden follow-up)."""

    class _CancelThenRaise:
        def __init__(self, task):
            self.task = task

        def check_permission(self, *a):
            return None

        async def execute(self, name, inp, user_id=None):
            self.task._cancel_event.set()  # cancel requested mid-step
            raise RuntimeError("cleanup boom")  # then a cleanup exception

    channel = FakeChannel(id=555)
    task = make_task(
        [{"tool_name": "run_command", "tool_input": {}, "on_failure": "abort"}], channel=channel
    )
    await run_background_task(task, _CancelThenRaise(task), _FakeSkillManager())
    assert task.status == "cancelled"  # not "failed"
    joined = " ".join(channel.sent_texts)
    assert "aborted" not in joined and "succeeded" not in joined  # no summary


async def test_cancel_during_followup_is_honored():
    """The task stays cancellable through the (long) LLM follow-up: a cancel
    arriving mid-follow-up interrupts it instead of being refused as completed."""
    executor = _InstantExecutor()
    started = asyncio.Event()
    release = asyncio.Event()
    ran_to_completion = {"v": False}

    async def slow_followup(messages, system, max_tokens):
        started.set()
        await release.wait()
        ran_to_completion["v"] = True
        return "narrative"

    task = make_task([{"tool_name": "run_command", "tool_input": {}}])

    async def _run():
        try:
            await run_background_task(
                task, executor, _FakeSkillManager(), codex_callback=slow_followup
            )
        except asyncio.CancelledError:
            task.status = "cancelled"
            raise

    t = asyncio.create_task(_run())
    task._asyncio_task = t
    await asyncio.wait_for(started.wait(), timeout=2)  # inside the follow-up

    cancelled = await task.request_cancel()
    assert cancelled is True  # NOT refused as already-completed
    assert task.status == "cancelled"
    assert ran_to_completion["v"] is False  # the follow-up was interrupted
    assert t.done()


async def test_followup_not_posted_when_callback_swallows_cancel():
    """A follow-up callback that catches CancelledError and returns must NOT
    have its response posted after a cancel has won."""
    executor = _InstantExecutor()
    channel = FakeChannel(id=555)
    started = asyncio.Event()

    async def swallowing_followup(messages, system, max_tokens):
        started.set()
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            return "SWALLOWED-SHOULD-NOT-POST"  # swallow + return normally
        return "normal"

    task = make_task([{"tool_name": "run_command", "tool_input": {}}], channel=channel)

    async def _run():
        try:
            await run_background_task(
                task, executor, _FakeSkillManager(), codex_callback=swallowing_followup
            )
        except asyncio.CancelledError:
            task.status = "cancelled"
            raise

    t = asyncio.create_task(_run())
    task._asyncio_task = t
    await asyncio.wait_for(started.wait(), timeout=2)
    await task.request_cancel()

    assert task.status == "cancelled"
    assert not any("SWALLOWED" in s for s in channel.sent_texts)
    assert t.done()


async def test_followup_prompt_and_final_render_use_terminal_status():
    """task.status is kept 'running' through finalization, but the follow-up
    prompt and the final progress render must show the terminal status."""
    executor = _InstantExecutor()
    channel = FakeChannel(id=555)
    captured = {}

    async def capture_followup(messages, system, max_tokens):
        captured["prompt"] = messages[0]["content"]
        return "summary"

    task = make_task([{"tool_name": "run_command", "tool_input": {}}], channel=channel)
    await run_background_task(
        task, executor, _FakeSkillManager(), codex_callback=capture_followup
    )
    assert task.status == "completed"
    assert "Status: completed" in captured["prompt"]
    assert "Status: running" not in captured["prompt"]


async def test_cancel_before_any_step_runs():
    executor = _InstantExecutor()
    channel = FakeChannel(id=555)
    task = make_task(
        [{"tool_name": "run_command", "tool_input": {}}], channel=channel
    )
    # Event set, no asyncio task assigned yet (mirrors an immediate cancel).
    task.cancel()
    await run_background_task(task, executor, _FakeSkillManager())
    assert task.status == "cancelled"
    # The single step never ran.
    assert all(r.status == "cancelled" for r in task.results) or not any(
        r.status == "ok" for r in task.results
    )
