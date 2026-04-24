"""Tests for ToolExecutor dispatch including execute_plan."""

from __future__ import annotations

import asyncio
import json

import pytest

from src.config.schema import ToolsConfig
from src.tools.executor import ToolExecutor


@pytest.mark.asyncio
async def test_execute_plan_via_tool_executor():
    """The execute_plan tool routes shell commands through ToolExecutor security pipeline."""
    from src.config.schema import ToolHost
    cfg = ToolsConfig()
    cfg.hosts = {"localhost": ToolHost(address="localhost", ssh_user="", os="linux")}
    executor = ToolExecutor(config=cfg)
    plan = json.dumps({
        "name": "via-executor",
        "steps": [
            {"id": "s1", "tool": "shell", "params": {"command": "echo integration-test"}},
        ],
    })
    result = await executor.execute("execute_plan", {"plan": plan, "format": "json"})
    parsed = json.loads(str(result))
    assert parsed["success"] is True
    assert "integration-test" in parsed["steps"]["s1"]["output"]["stdout"]


@pytest.mark.asyncio
async def test_execute_unknown_tool():
    executor = ToolExecutor()
    result = await executor.execute("nonexistent_tool", {})
    assert "unknown tool" in str(result).lower()


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


@pytest.mark.asyncio
async def test_execute_timeout_returns_error():
    """Tool handler that exceeds timeout returns a timeout error string."""
    config = ToolsConfig(command_timeout_seconds=1)
    executor = ToolExecutor(config=config)

    # Monkey-patch a handler that sleeps longer than the timeout
    async def _slow_handler(inp: dict) -> str:
        await asyncio.sleep(10)
        return "should not reach"

    executor._handle_slow_tool = _slow_handler  # type: ignore[attr-defined]

    result = await executor.execute("slow_tool", {})
    assert "timed out" in str(result)
    assert "1s" in str(result)

    metrics = executor.get_metrics()
    assert "slow_tool" in metrics
    assert metrics["slow_tool"]["errors"] == 1
    assert metrics["slow_tool"]["timeouts"] == 1


@pytest.mark.asyncio
async def test_execute_timeout_does_not_affect_fast_tools():
    """Tools that complete within the timeout work normally."""
    config = ToolsConfig(command_timeout_seconds=30)
    executor = ToolExecutor(config=config)

    async def _fast_handler(inp: dict) -> str:
        return "done"

    executor._handle_fast_tool = _fast_handler  # type: ignore[attr-defined]

    result = await executor.execute("fast_tool", {})
    assert str(result) == "done"

    metrics = executor.get_metrics()
    assert metrics["fast_tool"]["calls"] == 1
    assert metrics["fast_tool"]["errors"] == 0
    assert metrics["fast_tool"]["timeouts"] == 0


@pytest.mark.asyncio
async def test_metrics_include_timeouts_field():
    """Metrics dict includes a 'timeouts' counter alongside calls and errors."""
    executor = ToolExecutor()

    async def _ok_handler(inp: dict) -> str:
        return "ok"

    executor._handle_ok_tool = _ok_handler  # type: ignore[attr-defined]
    await executor.execute("ok_tool", {})

    metrics = executor.get_metrics()
    assert "timeouts" in metrics["ok_tool"]
    assert metrics["ok_tool"]["timeouts"] == 0
