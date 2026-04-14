"""End-to-end tests for the PlanRunner integration bridge."""

from __future__ import annotations

import json

import pytest

from src.tools.plan_runner import PlanRunner
from src.odin.registry import ToolRegistry


@pytest.fixture
def runner(ts_registry) -> PlanRunner:
    return PlanRunner(registry=ts_registry)


@pytest.mark.asyncio
async def test_run_simple_plan(runner):
    """Execute a simple single-step plan via the runner."""
    plan_json = json.dumps({
        "name": "simple",
        "steps": [{"id": "a", "tool": "echo", "params": {"msg": "hello"}}],
    })
    result = await runner.run({"plan": plan_json})
    assert "SUCCESS" in result
    assert "simple" in result


@pytest.mark.asyncio
async def test_run_plan_json_format(runner):
    """Runner returns valid JSON when format=json."""
    plan = json.dumps({
        "name": "json-out",
        "steps": [{"id": "a", "tool": "echo", "params": {"x": 1}}],
    })
    result = await runner.run({"plan": plan, "format": "json"})
    parsed = json.loads(result)
    assert parsed["success"] is True
    assert parsed["name"] == "json-out"


@pytest.mark.asyncio
async def test_run_plan_with_deps(runner):
    """Multi-step plan with dependencies executes correctly."""
    plan = json.dumps({
        "name": "deps",
        "steps": [
            {"id": "first", "tool": "echo", "params": {"value": "one"}},
            {
                "id": "second",
                "tool": "echo",
                "params": {"prev": "${first.output.value}"},
                "depends_on": "first",
            },
        ],
    })
    result = await runner.run({"plan": plan, "format": "json"})
    parsed = json.loads(result)
    assert parsed["success"] is True
    assert parsed["steps"]["second"]["output"]["prev"] == "one"


@pytest.mark.asyncio
async def test_run_plan_failure(runner):
    """Plan with a failing step reports failure."""
    plan = json.dumps({
        "name": "fail-plan",
        "steps": [
            {"id": "boom", "tool": "fail", "params": {"message": "test error"}},
        ],
    })
    result = await runner.run({"plan": plan})
    assert "FAILED" in result


@pytest.mark.asyncio
async def test_run_plan_cascade_skip(runner):
    """Dependent steps are skipped when a predecessor fails."""
    plan = json.dumps({
        "name": "cascade",
        "steps": [
            {"id": "a", "tool": "fail"},
            {"id": "b", "tool": "echo", "depends_on": "a"},
        ],
    })
    result = await runner.run({"plan": plan, "format": "json"})
    parsed = json.loads(result)
    assert parsed["steps"]["a"]["status"] == "failed"
    assert parsed["steps"]["b"]["status"] == "skipped"


@pytest.mark.asyncio
async def test_run_plan_validation_error(runner):
    """Invalid plan returns a clear error message."""
    plan = json.dumps({
        "name": "bad",
        "steps": [
            {"id": "a", "tool": "ts", "depends_on": "missing"},
        ],
    })
    result = await runner.run({"plan": plan})
    assert "validation failed" in result.lower()


@pytest.mark.asyncio
async def test_run_missing_plan_arg(runner):
    result = await runner.run({})
    assert "required" in result.lower()


@pytest.mark.asyncio
async def test_run_bad_json(runner):
    result = await runner.run({"plan": "{not valid"})
    assert "error" in result.lower()


@pytest.mark.asyncio
async def test_run_plan_dict_input(runner):
    """Plan can be passed as a dict (not just JSON string)."""
    plan = {
        "name": "dict-plan",
        "steps": [{"id": "a", "tool": "echo", "params": {"k": "v"}}],
    }
    result = await runner.run({"plan": plan, "format": "json"})
    parsed = json.loads(result)
    assert parsed["success"] is True


@pytest.mark.asyncio
async def test_run_plan_with_shell(ts_registry):
    """End-to-end with actual shell execution."""
    runner = PlanRunner(registry=ts_registry)
    plan = json.dumps({
        "name": "shell-plan",
        "steps": [
            {"id": "hw", "tool": "shell", "params": {"command": "echo hello-world"}},
        ],
    })
    result = await runner.run({"plan": plan, "format": "json"})
    parsed = json.loads(result)
    assert parsed["success"] is True
    assert "hello-world" in parsed["steps"]["hw"]["output"]["stdout"]
