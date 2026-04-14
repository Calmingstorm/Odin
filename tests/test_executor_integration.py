"""Tests for ToolExecutor dispatch including execute_plan."""

from __future__ import annotations

import json

import pytest

from src.tools.executor import ToolExecutor


@pytest.mark.asyncio
async def test_execute_plan_via_tool_executor():
    """The execute_plan tool works through the main ToolExecutor dispatch."""
    executor = ToolExecutor()
    plan = json.dumps({
        "name": "via-executor",
        "steps": [
            {"id": "s1", "tool": "shell", "params": {"command": "echo integration-test"}},
        ],
    })
    result = await executor.execute("execute_plan", {"plan": plan, "format": "json"})
    parsed = json.loads(result)
    assert parsed["success"] is True
    assert "integration-test" in parsed["steps"]["s1"]["output"]["stdout"]


@pytest.mark.asyncio
async def test_execute_unknown_tool():
    executor = ToolExecutor()
    result = await executor.execute("nonexistent_tool", {})
    assert "unknown tool" in result.lower()


@pytest.mark.asyncio
async def test_metrics_recorded():
    executor = ToolExecutor()
    plan = json.dumps({
        "name": "metrics-test",
        "steps": [{"id": "a", "tool": "shell", "params": {"command": "true"}}],
    })
    await executor.execute("execute_plan", {"plan": plan})
    metrics = executor.get_metrics()
    assert "execute_plan" in metrics
    assert metrics["execute_plan"]["calls"] == 1
