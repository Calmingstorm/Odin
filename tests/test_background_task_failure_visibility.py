"""Background-task step failure visibility (soak finding, 2026-07-05).

Before this fix, run_background_task collapsed the executor's ToolResult to
a string and _is_error_output only recognized three literal prefixes — so a
structurally-failed tool (ok=False, e.g. "Unknown or disallowed host: X")
was recorded as a SUCCESSFUL step and the completion message claimed
"All N steps succeeded."

Now: ToolResult.ok is consumed directly (structured signal first), the
failed output gets the canonical "Error (tool reported failure):" marking,
and the string heuristic additionally recognizes the executor's own error
prefixes for plain-string branches.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from src.discord.background_task import (
    BackgroundTask,
    _is_error_output,
    create_task_id,
    run_background_task,
)
from src.tools.result_validator import ToolResult
from tests.fakes import FakeChannel


@pytest.fixture(autouse=True)
def _isolated_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def make_task(steps, channel=None):
    return BackgroundTask(
        task_id=create_task_id(),
        description="failure visibility test",
        steps=steps,
        channel=channel or FakeChannel(id=555),
        requester="tester",
        requester_id="4242",
    )


class _FakeExecutor:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    def check_permission(self, tool_name, user_id):
        return None  # allow

    async def execute(self, tool_name, tool_input, user_id=None):
        self.calls.append((tool_name, tool_input, user_id))
        return self.results.pop(0)


class _FakeSkillManager:
    def has_skill(self, name):
        return False


async def run(task, executor):
    await run_background_task(task, executor, _FakeSkillManager())


class TestStructuredFailureVisibility:
    async def test_ok_false_steps_are_recorded_as_errors(self):
        executor = _FakeExecutor(
            [
                ToolResult(
                    output="Unknown or disallowed host: playground",
                    ok=False,
                    tool_name="run_command",
                ),
                ToolResult(
                    output="Unknown or disallowed host: playground",
                    ok=False,
                    tool_name="run_command",
                ),
            ]
        )
        channel = FakeChannel(id=555)
        task = make_task(
            [
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "playground", "command": "echo hi"},
                    "on_failure": "continue",
                },
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "playground", "command": "date"},
                    "on_failure": "continue",
                },
            ],
            channel=channel,
        )
        await run(task, executor)
        assert [r.status for r in task.results] == ["error", "error"]
        # The completion message no longer lies
        all_text = " ".join(channel.sent_texts)
        assert "All 2 steps succeeded" not in all_text
        assert "0 succeeded, 2 failed" in all_text

    async def test_ok_true_steps_still_succeed(self):
        executor = _FakeExecutor(
            [
                ToolResult(output="step1", tool_name="run_command"),
                ToolResult(output="Sun Jul  5 12:00:00 AM EDT 2026", tool_name="run_command"),
            ]
        )
        channel = FakeChannel(id=555)
        task = make_task(
            [
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "localhost", "command": "echo step1"},
                },
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "localhost", "command": "date"},
                },
            ],
            channel=channel,
        )
        await run(task, executor)
        assert [r.status for r in task.results] == ["ok", "ok"]
        assert "All 2 steps succeeded" in " ".join(channel.sent_texts)

    async def test_failed_output_carries_canonical_error_marking(self):
        executor = _FakeExecutor(
            [
                ToolResult(output="quietly wrong", ok=False, tool_name="run_command"),
            ]
        )
        task = make_task(
            [
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "h", "command": "x"},
                    "on_failure": "continue",
                }
            ],
        )
        await run(task, executor)
        assert task.results[0].status == "error"
        assert task.results[0].output.startswith("Error (tool reported failure):")

    async def test_default_on_failure_abort_stops_on_ok_false(self):
        executor = _FakeExecutor(
            [
                ToolResult(
                    output="Unknown or disallowed host: playground",
                    ok=False,
                    tool_name="run_command",
                ),
                ToolResult(output="never runs", tool_name="run_command"),
            ]
        )
        task = make_task(
            [
                {"tool_name": "run_command", "tool_input": {"host": "playground", "command": "a"}},
                {"tool_name": "run_command", "tool_input": {"host": "playground", "command": "b"}},
            ],
        )
        await run(task, executor)
        assert task.status == "failed"
        assert len(executor.calls) == 1  # second step never executed

    async def test_audit_error_field_populated_for_ok_false(self):
        executor = _FakeExecutor(
            [
                ToolResult(
                    output="Unknown or disallowed host: playground",
                    ok=False,
                    tool_name="run_command",
                ),
            ]
        )
        audit = AsyncMock()
        task = make_task(
            [
                {
                    "tool_name": "run_command",
                    "tool_input": {"host": "playground", "command": "a"},
                    "on_failure": "continue",
                }
            ],
        )
        await run_background_task(task, executor, _FakeSkillManager(), audit_logger=audit)
        audit.log_execution.assert_awaited()
        kwargs = audit.log_execution.await_args.kwargs
        assert kwargs.get("error"), "audit entry must carry the error field for a failed step"



    async def test_mcp_audit_metadata_survives_background_path(self):
        metadata = {
            "mcp_server": "srv",
            "mcp_tool": "write",
            "config_generation": 3,
            "negotiated_version": "2025-06-18",
            "outcome": "failed",
        }
        executor = _FakeExecutor(
            [
                ToolResult(
                    output="rejected",
                    ok=False,
                    tool_name="mcp_srv_write",
                    audit_metadata=metadata,
                )
            ]
        )
        audit = AsyncMock()
        task = make_task(
            [{"tool_name": "mcp_srv_write", "tool_input": {}, "on_failure": "continue"}]
        )
        await run_background_task(task, executor, _FakeSkillManager(), audit_logger=audit)
        assert task.results[0].audit_metadata == metadata
        assert audit.log_execution.await_args.kwargs["audit_metadata"] == metadata


class TestStringHeuristic:
    def test_canonical_executor_prefixes_detected(self):
        assert _is_error_output("Unknown or disallowed host: playground") is True
        assert _is_error_output("Command failed with exit code 1") is True
        assert _is_error_output("Script failed: boom") is True
        assert _is_error_output("Blocked by command governor") is True
        assert _is_error_output("Error (tool reported failure):\nquietly wrong") is True

    def test_legacy_prefixes_still_detected(self):
        assert _is_error_output("Error executing run_command: boom") is True
        assert _is_error_output("Unknown tool: frobnicate") is True
        assert _is_error_output("Permission denied: tier too low") is True

    def test_normal_output_not_flagged(self):
        assert _is_error_output("Sun Jul  5 12:00:00 AM EDT 2026") is False
        assert _is_error_output("step1") is False
        assert _is_error_output("") is False
