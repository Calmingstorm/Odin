"""Aborted workflows retain a result for every unexecuted trailing step."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.discord.background_task import _send_progress, run_background_task
from src.tools.result_validator import ToolResult
from tests.fakes import FakeChannel
from tests.test_background_task_failure_visibility import (
    _FakeExecutor,
    _FakeSkillManager,
    make_task,
)


@pytest.mark.parametrize("failure", ["structured", "string", "exception", "blocked", "invalid"])
async def test_abort_records_trailing_skip_and_counts_it(failure):
    steps = [
        {"tool_name": "run_command", "tool_input": {"command": f"step{i}"},
         "description": f"step {i}"}
        for i in range(3)
    ]
    outputs = ["ready"]
    if failure == "structured":
        outputs.append(ToolResult(output="failed", ok=False, tool_name="run_command"))
    elif failure == "string":
        outputs.append("Error executing run_command: failed")
    elif failure == "exception":
        outputs.append(RuntimeError("failed"))
    elif failure == "blocked":
        steps[1]["tool_name"] = "delegate_task"
    elif failure == "invalid":
        steps[1]["tool_input"] = {}

    task = make_task(steps)
    summary_channel = task.channel
    executor = _FakeExecutor([])
    if failure == "invalid":
        task.nested_payload_validated = True
        executor._tool_catalog = MagicMock()
        executor._tool_catalog.merged_definitions.return_value = [
            {"name": "run_command", "input_schema": {
                "type": "object", "required": ["command"],
                "properties": {"command": {"type": "string"}},
            }}
        ]

    execute = AsyncMock(side_effect=outputs)
    with patch("src.discord.background_task._execute_tool", execute):
        await run_background_task(task, executor, _FakeSkillManager())

    assert task.status == "failed"
    assert [r.status for r in task.results] == ["ok", "error", "skipped"]
    assert [r.index for r in task.results] == [0, 1, 2]
    trailing = task.results[2]
    assert (trailing.tool_name, trailing.description) == ("run_command", "step 2")
    assert "aborted" in trailing.output.lower()
    assert trailing.elapsed_ms == 0
    assert execute.await_count == (1 if failure in ("blocked", "invalid") else 2)
    channel = FakeChannel()
    task.channel = channel
    await _send_progress(task, None)
    assert "OK: 1 | Errors: 1 | Skipped: 1" in channel.sent_texts[0]
    assert "Step 3 (step 2)" in channel.sent_texts[0]
    assert "Task aborted after 2 of 3 steps" in " ".join(summary_channel.sent_texts)


async def test_abort_retains_condition_skip_and_multiple_tail_steps():
    task = make_task([
        {"tool_name": "run_command", "condition": "absent"},
        {"tool_name": "run_command"},
        {"tool_name": "run_command"},
        {"tool_name": "run_command"},
    ])
    execute = AsyncMock(return_value="Error: failed")
    with patch("src.discord.background_task._execute_tool", execute):
        await run_background_task(task, _FakeExecutor([]), _FakeSkillManager())
    assert [r.status for r in task.results] == ["skipped", "error", "skipped", "skipped"]
    assert [r.index for r in task.results] == [0, 1, 2, 3]
    assert task.results[0].output == "Condition not met: absent"


async def test_continue_error_does_not_skip_tail():
    task = make_task([
        {"tool_name": "run_command", "on_failure": "continue"},
        {"tool_name": "run_command"},
    ])
    execute = AsyncMock(side_effect=["Error: failed", "ready"])
    with patch("src.discord.background_task._execute_tool", execute):
        await run_background_task(task, _FakeExecutor([]), _FakeSkillManager())
    assert task.status == "completed"
    assert [r.status for r in task.results] == ["error", "ok"]
    assert execute.await_count == 2
