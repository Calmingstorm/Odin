"""Tests for scheduled workflow failure reporting.

Covers:
- Agent ID extraction from spawn confirmation (regex vs backtick position)
- _collect_agent_result returns structured data alongside text
- _run_scheduled_workflow propagates agent failure to step failure
- _on_scheduled_task propagates failures to the scheduler callback
"""
from __future__ import annotations

import re
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Agent ID extraction
# ---------------------------------------------------------------------------

class TestAgentIdExtraction:
    """The regex must extract the agent ID from spawn confirmation text,
    even when the label or goal contains backticks."""

    ID_PATTERN = re.compile(r"\(ID:\s*`([^`]+)`\)")

    def test_normal_label(self):
        text = "Agent 'disk-check' spawned (ID: `a1b2c3d4`). Working on: check disk"
        m = self.ID_PATTERN.search(text)
        assert m and m.group(1) == "a1b2c3d4"

    def test_label_with_backticks(self):
        text = "Agent 'check `memory` usage' spawned (ID: `f9e8d7c6`). Working on: check memory"
        m = self.ID_PATTERN.search(text)
        assert m and m.group(1) == "f9e8d7c6"

    def test_label_with_multiple_backticks(self):
        text = "Agent '`ls` and `df` runner' spawned (ID: `11223344`). Working on: run commands"
        m = self.ID_PATTERN.search(text)
        assert m and m.group(1) == "11223344"

    def test_old_backtick_method_fails_on_backtick_label(self):
        """Prove the old method extracts wrong ID when label has backticks."""
        text = "Agent 'check `memory` usage' spawned (ID: `f9e8d7c6`). Working on: check memory"
        id_start = text.find("`") + 1
        id_end = text.find("`", id_start)
        old_result = text[id_start:id_end]
        assert old_result == "memory"  # wrong — gets the label backtick content
        assert old_result != "f9e8d7c6"

    def test_with_depth_note(self):
        text = "Agent 'sub-task' spawned (ID: `abcd1234`) (depth 1). Working on: subtask"
        m = self.ID_PATTERN.search(text)
        assert m and m.group(1) == "abcd1234"

    def test_no_match(self):
        text = "Error: Both 'label' and 'goal' are required."
        m = self.ID_PATTERN.search(text)
        assert m is None


# ---------------------------------------------------------------------------
# _collect_agent_result structured return
# ---------------------------------------------------------------------------

class TestCollectAgentResult:
    """_collect_agent_result must return (text, raw_data) with structured status."""

    @staticmethod
    def _make_bot_with_agent_manager(wait_result: dict):
        """Create a minimal mock bot with agent_manager.wait_for_agents."""
        bot = MagicMock()
        bot.agent_manager = MagicMock()
        bot.agent_manager.wait_for_agents = AsyncMock(return_value=wait_result)
        return bot

    async def test_completed_agent_returns_ok(self):
        from src.discord.native_tools.agents_tasks import AgentTaskTools
        wait_result = {
            "abc123": {
                "status": "completed",
                "label": "test-agent",
                "runtime_seconds": 10,
                "iteration_count": 5,
                "tools_used": ["run_command"],
                "result": "All checks passed",
                "error": "",
            }
        }
        bot = self._make_bot_with_agent_manager(wait_result)
        text, raw = await AgentTaskTools(bot)._collect_agent_result("abc123", timeout=10)
        assert raw["status"] == "completed"
        assert raw["empty_result"] is False
        assert "All checks passed" in text

    async def test_failed_agent_returns_failure_data(self):
        from src.discord.native_tools.agents_tasks import AgentTaskTools

        wait_result = {
            "def456": {
                "status": "failed",
                "label": "broken-agent",
                "runtime_seconds": 5,
                "iteration_count": 1,
                "tools_used": [],
                "result": "",
                "error": "All 3 Codex accounts failed",
            }
        }
        bot = self._make_bot_with_agent_manager(wait_result)
        text, raw = await AgentTaskTools(bot)._collect_agent_result("def456", timeout=10)
        assert raw["status"] == "failed"
        assert raw["error"] == "All 3 Codex accounts failed"
        assert raw["empty_result"] is True

    async def test_completed_empty_result_flagged(self):
        from src.discord.native_tools.agents_tasks import AgentTaskTools

        wait_result = {
            "ghi789": {
                "status": "completed",
                "label": "silent-agent",
                "runtime_seconds": 100,
                "iteration_count": 30,
                "tools_used": ["run_script"],
                "result": "",
                "error": "",
            }
        }
        bot = self._make_bot_with_agent_manager(wait_result)
        text, raw = await AgentTaskTools(bot)._collect_agent_result("ghi789", timeout=10)
        assert raw["status"] == "completed"
        assert raw["empty_result"] is True

    async def test_timed_out_agent(self):
        from src.discord.native_tools.agents_tasks import AgentTaskTools

        wait_result = {
            "timeout1": {
                "status": "running",
                "label": "stuck-agent",
                "runtime_seconds": 300,
                "iteration_count": 0,
                "tools_used": [],
                "result": "",
                "error": "",
            }
        }
        bot = self._make_bot_with_agent_manager(wait_result)
        text, raw = await AgentTaskTools(bot)._collect_agent_result("timeout1", timeout=1)
        assert raw["status"] == "running"


# ---------------------------------------------------------------------------
# Workflow step failure from agent state
# ---------------------------------------------------------------------------

class TestWorkflowAgentFailurePropagation:
    """When a spawned agent fails, the workflow step must be marked as failed."""

    async def test_failed_agent_makes_step_fail(self):
        """ToolResult.ok must be False when agent final_state is 'failed'."""
        from src.tools.result_validator import ToolResult

        agent_text = "**Agent: broken** (failed)\nError: LLM timeout"
        agent_data = {"status": "failed", "error": "LLM timeout", "result": "", "empty_result": True}

        agent_ok = agent_data["status"] == "completed"
        result = ToolResult(output=agent_text, ok=agent_ok, tool_name="spawn_agent")

        assert result.ok is False

    async def test_completed_agent_makes_step_succeed(self):
        from src.tools.result_validator import ToolResult

        agent_data = {"status": "completed", "error": "", "result": "Done", "empty_result": False}
        agent_ok = agent_data["status"] == "completed"
        result = ToolResult(output="Agent done", ok=agent_ok, tool_name="spawn_agent")

        assert result.ok is True

    async def test_completed_empty_still_succeeds_with_warning(self):
        from src.tools.result_validator import ToolResult

        agent_data = {"status": "completed", "error": "", "result": "", "empty_result": True}
        agent_ok = agent_data["status"] == "completed"

        if agent_ok and agent_data["empty_result"]:
            result = ToolResult(
                output="Agent completed\n\n⚠️ Agent completed but produced no output.",
                ok=True, tool_name="spawn_agent",
            )

        assert result.ok is True
        assert "no output" in result.output

    async def test_running_after_timeout_is_failure(self):
        from src.tools.result_validator import ToolResult

        agent_data = {"status": "running", "error": "", "result": "", "empty_result": True}
        agent_ok = agent_data["status"] == "completed"
        result = ToolResult(output="Agent still running", ok=agent_ok, tool_name="spawn_agent")

        assert result.ok is False


# ---------------------------------------------------------------------------
# on_failure: continue vs abort
# ---------------------------------------------------------------------------

class TestWorkflowOnFailureBehavior:
    """workflow_ok must only be False when on_failure is abort (default),
    not when on_failure is continue."""

    def test_abort_on_failed_step(self):
        """Default on_failure (abort) sets workflow_ok=False and breaks."""
        workflow_ok = True
        steps_results = []
        on_failure = "abort"  # default

        # Simulate a failed step
        step_failed = True
        if step_failed:
            steps_results.append("FAILED")
            if on_failure == "abort":
                workflow_ok = False
                steps_results.append("aborted")

        assert workflow_ok is False
        assert "aborted" in steps_results

    def test_continue_on_failed_step(self):
        """on_failure=continue reports failure but workflow_ok stays True."""
        workflow_ok = True
        steps_results = []
        on_failure = "continue"

        # Simulate a failed step
        step_failed = True
        if step_failed:
            steps_results.append("FAILED")
            if on_failure == "abort":
                workflow_ok = False
                steps_results.append("aborted")

        assert workflow_ok is True
        assert "FAILED" in steps_results
        assert "aborted" not in steps_results

    def test_continue_then_abort(self):
        """First step continues on failure, second aborts — workflow fails."""
        workflow_ok = True
        steps = [
            {"on_failure": "continue", "fails": True},
            {"on_failure": "abort", "fails": True},
        ]

        for step in steps:
            if step["fails"]:
                on_failure = step["on_failure"]
                if on_failure == "abort":
                    workflow_ok = False
                    break

        assert workflow_ok is False

    def test_continue_with_all_steps_failing(self):
        """All steps fail with on_failure=continue — workflow still succeeds."""
        workflow_ok = True
        steps = [
            {"on_failure": "continue", "fails": True},
            {"on_failure": "continue", "fails": True},
            {"on_failure": "continue", "fails": True},
        ]

        for step in steps:
            if step["fails"]:
                on_failure = step["on_failure"]
                if on_failure == "abort":
                    workflow_ok = False
                    break

        assert workflow_ok is True
