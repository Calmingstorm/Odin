"""Tests for StepExecutor."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest

from src.odin.context import ExecutionContext
from src.odin.executor import StepExecutor
from src.odin.registry import ToolRegistry
from src.odin.tools.base import BaseTool
from src.odin.types import StepSpec, StepStatus


class SuccessTool(BaseTool):
    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> str:
        return "ok"


class FailOnceTool(BaseTool):
    call_count = 0

    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> str:
        FailOnceTool.call_count += 1
        if FailOnceTool.call_count <= 1:
            raise RuntimeError("transient failure")
        return "recovered"


class SlowTool(BaseTool):
    async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> str:
        await asyncio.sleep(10)
        return "done"


@pytest.fixture
def custom_registry() -> ToolRegistry:
    reg = ToolRegistry()
    reg.register("success", SuccessTool)
    reg.register("fail_once", FailOnceTool)
    reg.register("slow", SlowTool)
    return reg


@pytest.mark.asyncio
async def test_successful_execution(custom_registry):
    ctx = ExecutionContext()
    executor = StepExecutor(custom_registry, ctx)
    spec = StepSpec(id="s1", tool="success")
    result = await executor.execute_step(spec)
    assert result.status == StepStatus.SUCCESS
    assert result.output == "ok"
    assert result.attempts == 1
    assert result.duration >= 0


@pytest.mark.asyncio
async def test_timeout(custom_registry):
    ctx = ExecutionContext()
    executor = StepExecutor(custom_registry, ctx)
    spec = StepSpec(id="s1", tool="slow", timeout=0.05)
    result = await executor.execute_step(spec)
    assert result.status == StepStatus.TIMED_OUT
    assert "Timed out" in result.error


@pytest.mark.asyncio
async def test_retry_recovers(custom_registry):
    FailOnceTool.call_count = 0
    ctx = ExecutionContext()
    executor = StepExecutor(custom_registry, ctx)
    spec = StepSpec(id="s1", tool="fail_once", retries=1)
    result = await executor.execute_step(spec)
    assert result.status == StepStatus.SUCCESS
    assert result.output == "recovered"
    assert result.attempts == 2


@pytest.mark.asyncio
async def test_failure_no_retry(custom_registry):
    FailOnceTool.call_count = 0
    ctx = ExecutionContext()
    executor = StepExecutor(custom_registry, ctx)
    spec = StepSpec(id="s1", tool="fail_once", retries=0)
    result = await executor.execute_step(spec)
    assert result.status == StepStatus.FAILED
    assert "transient failure" in result.error


@pytest.mark.asyncio
async def test_params_resolved_from_context(custom_registry):
    """Executor resolves ${ref} in params before passing to tool."""
    from src.odin.types import StepResult

    ctx = ExecutionContext()
    ctx.record(
        StepResult(step_id="prev", status=StepStatus.SUCCESS, output="world"),
    )
    reg = ToolRegistry()

    class EchoTool(BaseTool):
        async def execute(self, params: dict[str, Any], ctx: ExecutionContext) -> str:
            return params["msg"]

    reg.register("echo", EchoTool)
    executor = StepExecutor(reg, ctx)
    spec = StepSpec(id="s1", tool="echo", params={"msg": "hello ${prev.output}"})
    result = await executor.execute_step(spec)
    assert result.status == StepStatus.SUCCESS
    assert result.output == "hello world"
