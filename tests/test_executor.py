"""Tests for the step executor."""

import pytest

from src.odin.context import ExecutionContext
from src.odin.executor import StepExecutor
from src.odin.types import StepResult, StepSpec, StepStatus


class TestStepExecutor:
    async def test_success(self, ts_registry):
        ex = StepExecutor(ts_registry)
        ctx = ExecutionContext()
        spec = StepSpec(id="a", tool="echo", params={"message": "hi"})
        r = await ex.execute_step(spec, ctx)
        assert r.status == StepStatus.SUCCESS
        assert r.output == "hi"

    async def test_unknown_tool(self, ts_registry):
        ex = StepExecutor(ts_registry)
        ctx = ExecutionContext()
        spec = StepSpec(id="a", tool="nope")
        r = await ex.execute_step(spec, ctx)
        assert r.status == StepStatus.FAILED
        assert "unknown tool" in r.error

    async def test_param_resolution_from_context(self, ts_registry):
        ex = StepExecutor(ts_registry)
        ctx = ExecutionContext()
        ctx.record("prev", StepResult(status=StepStatus.SUCCESS, output="data"))
        spec = StepSpec(id="a", tool="echo", params={"message": "${prev.output}"})
        r = await ex.execute_step(spec, ctx)
        assert r.status == StepStatus.SUCCESS
        assert r.output == "data"

    async def test_param_resolution_from_inputs(self, ts_registry):
        ex = StepExecutor(ts_registry)
        ctx = ExecutionContext(inputs={"val": 42})
        spec = StepSpec(id="a", tool="echo", params={"message": "${inputs.val}"})
        r = await ex.execute_step(spec, ctx)
        assert r.status == StepStatus.SUCCESS
        assert r.output == 42

    async def test_bad_ref_fails_step(self, ts_registry):
        ex = StepExecutor(ts_registry)
        ctx = ExecutionContext()
        spec = StepSpec(id="a", tool="echo", params={"message": "${inputs.nope}"})
        r = await ex.execute_step(spec, ctx)
        assert r.status == StepStatus.FAILED
        assert "param resolution failed" in r.error
