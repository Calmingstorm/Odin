"""Characterization: scheduler/digest/monitor callbacks (_on_scheduled_task,
_run_scheduled_workflow, _execute_scheduled_tool,
_on_schedule_failure).

Pins the action routing, workflow step semantics (conditions, on_failure
abort vs continue), the structured RBAC failure, and the raise-on-failure
contract the scheduler's backoff depends on.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.tools.result_validator import ToolResult
from tests.fakes import FakeChannel, FakeLLM, make_bot


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def bot_and_channel():
    bot = make_bot(fake_llm=FakeLLM([]))
    channel = FakeChannel(id=777)
    bot.get_channel = lambda cid: channel if int(cid) == 777 else None
    return bot, channel


def schedule(**kw) -> dict:
    base = {"id": "sched-1", "channel_id": "777", "description": "test schedule"}
    base.update(kw)
    return base


class TestScheduledTaskRouting:
    async def test_reminder_posts_to_channel(self, bot_and_channel):
        bot, channel = bot_and_channel
        await bot.scheduled_events._on_scheduled_task(
            schedule(action="reminder", message="water the servers")
        )
        assert channel.sent_texts == ["**Scheduled reminder:** water the servers"]

    async def test_missing_channel_id_is_silently_skipped(self, bot_and_channel):
        bot, channel = bot_and_channel
        await bot.scheduled_events._on_scheduled_task(
            schedule(action="reminder", channel_id="", message="x")
        )
        assert channel.sent == []

    async def test_unknown_action_is_ignored_without_raise(self, bot_and_channel):
        bot, channel = bot_and_channel
        await bot.scheduled_events._on_scheduled_task(schedule(action="mystery"))
        assert channel.sent == []

    async def test_check_success_posts_result(self, bot_and_channel):
        bot, channel = bot_and_channel
        bot.tool_executor.execute = AsyncMock(
            return_value=ToolResult(output="disk 42% used", tool_name="run_command"),
        )
        await bot.scheduled_events._on_scheduled_task(
            schedule(
                action="check",
                tool_name="run_command",
                tool_input={"host": "h", "command": "df"},
            )
        )
        assert len(channel.sent_texts) == 1
        assert channel.sent_texts[0].startswith("**Scheduled: test schedule**")
        assert "disk 42% used" in channel.sent_texts[0]

    async def test_check_failure_posts_and_raises(self, bot_and_channel):
        """The raise is the scheduler's failure signal — its backoff/alerting
        depends on it. Do not swallow it."""
        bot, channel = bot_and_channel
        bot.tool_executor.execute = AsyncMock(
            return_value=ToolResult(output="host unreachable", ok=False, tool_name="run_command"),
        )
        with pytest.raises(RuntimeError, match="Scheduled check failed"):
            await bot.scheduled_events._on_scheduled_task(
                schedule(
                    action="check",
                    tool_name="run_command",
                    tool_input={"host": "h", "command": "df"},
                )
            )
        assert channel.sent_texts[0].startswith("**Scheduled check failed:**")


class TestScheduledWorkflow:
    async def test_on_failure_abort_is_default_and_stops_workflow(self, bot_and_channel):
        bot, channel = bot_and_channel
        bot.tool_executor.execute = AsyncMock(
            side_effect=[
                ToolResult(output="boom", ok=False, tool_name="run_command"),
                ToolResult(output="never runs", tool_name="run_command"),
            ]
        )
        sched = schedule(
            action="workflow",
            steps=[
                {"tool_name": "run_command", "tool_input": {"host": "h", "command": "a"}},
                {"tool_name": "run_command", "tool_input": {"host": "h", "command": "b"}},
            ],
        )
        with pytest.raises(RuntimeError, match="Scheduled workflow failed"):
            await bot.scheduled_events._on_scheduled_task(sched)
        assert bot.tool_executor.execute.await_count == 1
        summary = channel.sent_texts[0]
        assert "FAILED" in summary
        assert "Workflow aborted" in summary

    async def test_on_failure_continue_keeps_going_and_workflow_succeeds(self, bot_and_channel):
        """Pinned as-is: a failed step with on_failure=continue does NOT mark
        the workflow failed — workflow_ok stays True and nothing raises."""
        bot, channel = bot_and_channel
        bot.tool_executor.execute = AsyncMock(
            side_effect=[
                ToolResult(output="boom", ok=False, tool_name="run_command"),
                ToolResult(output="second ran fine", tool_name="run_command"),
            ]
        )
        sched = schedule(
            action="workflow",
            steps=[
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "h", "command": "a"},
                    "on_failure": "continue",
                },
                {"tool_name": "run_command", "tool_input": {"host": "h", "command": "b"}},
            ],
        )
        await bot.scheduled_events._on_scheduled_task(sched)  # no raise
        assert bot.tool_executor.execute.await_count == 2
        summary = channel.sent_texts[0]
        assert "FAILED" in summary and "second ran fine" in summary
        assert "Workflow aborted" not in summary

    async def test_condition_skips_step_on_missing_substring(self, bot_and_channel):
        bot, channel = bot_and_channel
        bot.tool_executor.execute = AsyncMock(
            side_effect=[
                ToolResult(output="all healthy", tool_name="run_command"),
                ToolResult(output="should not run", tool_name="run_command"),
            ]
        )
        sched = schedule(
            action="workflow",
            steps=[
                {"tool_name": "run_command", "tool_input": {"host": "h", "command": "status"}},
                # condition "error" not present in prev output → skipped
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "h", "command": "restart"},
                    "condition": "error",
                },
            ],
        )
        await bot.scheduled_events._on_scheduled_task(sched)
        assert bot.tool_executor.execute.await_count == 1
        assert "skipped" in channel.sent_texts[0]

    async def test_negated_condition_skips_when_substring_present(self, bot_and_channel):
        bot, channel = bot_and_channel
        bot.tool_executor.execute = AsyncMock(
            side_effect=[
                ToolResult(output="ERROR: broken", tool_name="run_command"),
                ToolResult(output="should not run", tool_name="run_command"),
            ]
        )
        sched = schedule(
            action="workflow",
            steps=[
                {"tool_name": "run_command", "tool_input": {"host": "h", "command": "status"}},
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "h", "command": "cleanup"},
                    "condition": "!error",
                },
            ],
        )
        await bot.scheduled_events._on_scheduled_task(sched)
        assert bot.tool_executor.execute.await_count == 1
        assert "skipped" in channel.sent_texts[0]


class TestExecuteScheduledTool:
    async def test_rbac_denial_returns_structured_failure(self, bot_and_channel):
        bot, channel = bot_and_channel
        bot.tool_executor.check_permission = lambda tool, uid: "RBAC denied: nope"
        result = await bot.scheduled_events._execute_scheduled_tool(
            "run_command",
            {"host": "h", "command": "x"},
            channel,
            "someuser",
        )
        assert isinstance(result, ToolResult)
        assert result.ok is False
        assert result.error == "permission_denied"
        assert "RBAC denied" in result.output

    async def test_dispatch_exception_wrapped_as_execution_error(self, bot_and_channel):
        bot, channel = bot_and_channel
        bot.tool_executor.execute = AsyncMock(side_effect=RuntimeError("ssh exploded"))
        result = await bot.scheduled_events._execute_scheduled_tool(
            "run_command",
            {"host": "h", "command": "x"},
            channel,
            None,
        )
        assert result.ok is False
        assert result.error == "execution_error"
        assert "ssh exploded" in result.output

    async def test_string_result_wrapped_ok(self, bot_and_channel):
        bot, channel = bot_and_channel
        result = await bot.scheduled_events._execute_scheduled_tool(
            "parse_time",
            {"text": "tomorrow 3pm"},
            channel,
            None,
        )
        assert isinstance(result, ToolResult)
        assert result.ok is True


class TestAlerts:
    async def test_schedule_failure_alert_posts_threshold_message(self, bot_and_channel):
        bot, channel = bot_and_channel
        await bot.scheduled_events._on_schedule_failure(
            schedule(last_error="timeout talking to host"),
            consecutive=3,
        )
        text = channel.sent_texts[0]
        assert "Scheduled task failing" in text
        assert "3 consecutive failures" in text
        assert "timeout talking to host" in text
