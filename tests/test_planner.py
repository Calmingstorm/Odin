"""Tests for the Odin DAG planner."""

from __future__ import annotations

import pytest

from src.odin.planner import Planner, PlanValidationError
from src.odin.types import PlanSpec, StepSpec, StepStatus


@pytest.mark.asyncio
async def test_linear_execution(ts_registry, linear_plan):
    """Steps execute in dependency order: A then B then C."""
    planner = Planner(ts_registry)
    result = await planner.execute(linear_plan)

    assert result.success
    assert len(result.step_results) == 3
    # A finishes before B starts
    a = result.step_results["a"]
    b = result.step_results["b"]
    c = result.step_results["c"]
    assert a.finished_at <= b.output["start"]
    assert b.finished_at <= c.output["start"]


@pytest.mark.asyncio
async def test_diamond_parallel_execution(ts_registry, diamond_plan):
    """B and C run in parallel (overlap in time)."""
    planner = Planner(ts_registry)
    result = await planner.execute(diamond_plan)

    assert result.success
    b_out = result.step_results["b"].output
    c_out = result.step_results["c"].output
    # B and C should overlap: B starts before C ends AND C starts before B ends
    assert b_out["start"] < c_out["end"]
    assert c_out["start"] < b_out["end"]


@pytest.mark.asyncio
async def test_failure_cascade(ts_registry):
    """When B fails, C (which depends on B) is skipped."""
    plan = PlanSpec(
        name="fail-cascade",
        steps=(
            StepSpec(id="a", tool="ts", params={"sleep": 0.01}),
            StepSpec(id="b", tool="fail", depends_on=("a",)),
            StepSpec(id="c", tool="ts", params={"sleep": 0.01}, depends_on=("b",)),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert not result.success
    assert result.step_results["a"].status == StepStatus.SUCCESS
    assert result.step_results["b"].status == StepStatus.FAILED
    assert result.step_results["c"].status == StepStatus.SKIPPED


@pytest.mark.asyncio
async def test_continue_on_failure(ts_registry):
    """With continue_on_failure, dependents still run after failure."""
    plan = PlanSpec(
        name="continue",
        steps=(
            StepSpec(id="a", tool="fail", continue_on_failure=True),
            StepSpec(id="b", tool="ts", params={"sleep": 0.01}, depends_on=("a",)),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert not result.success  # overall still fails because a failed
    assert result.step_results["a"].status == StepStatus.FAILED
    assert result.step_results["b"].status == StepStatus.SUCCESS


@pytest.mark.asyncio
async def test_timeout(ts_registry):
    """Step with short timeout should time out."""
    plan = PlanSpec(
        name="timeout",
        steps=(
            StepSpec(id="s", tool="slow", params={"sleep": 10}, timeout=0.1),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert not result.success
    assert result.step_results["s"].status == StepStatus.TIMED_OUT


@pytest.mark.asyncio
async def test_retry(ts_registry):
    """Retry count is recorded in step result."""
    plan = PlanSpec(
        name="retry",
        steps=(
            StepSpec(id="f", tool="fail", retries=2),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert result.step_results["f"].attempts == 3  # 1 original + 2 retries
    assert result.step_results["f"].status == StepStatus.FAILED


def test_validate_unknown_tool(ts_registry):
    plan = PlanSpec(
        name="bad-tool",
        steps=(StepSpec(id="x", tool="nonexistent"),),
    )
    planner = Planner(ts_registry)
    errors = planner.validate(plan)
    assert any("unknown tool" in e.lower() for e in errors)


def test_validate_cycle(ts_registry):
    plan = PlanSpec(
        name="cycle",
        steps=(
            StepSpec(id="a", tool="ts", depends_on=("b",)),
            StepSpec(id="b", tool="ts", depends_on=("a",)),
        ),
    )
    planner = Planner(ts_registry)
    errors = planner.validate(plan)
    assert any("cycle" in e.lower() for e in errors)


def test_validate_dangling_dep(ts_registry):
    plan = PlanSpec(
        name="dangling",
        steps=(StepSpec(id="a", tool="ts", depends_on=("missing",)),),
    )
    planner = Planner(ts_registry)
    errors = planner.validate(plan)
    assert any("unknown step" in e.lower() for e in errors)


def test_validate_duplicate_id(ts_registry):
    plan = PlanSpec(
        name="dupes",
        steps=(
            StepSpec(id="a", tool="ts"),
            StepSpec(id="a", tool="ts"),
        ),
    )
    planner = Planner(ts_registry)
    errors = planner.validate(plan)
    assert any("duplicate" in e.lower() for e in errors)


@pytest.mark.asyncio
async def test_bad_variable_ref_fails_step_not_plan(ts_registry):
    """A bad ${ref} in params should fail that step, not crash the plan."""
    plan = PlanSpec(
        name="bad-ref",
        steps=(
            StepSpec(id="a", tool="ts", params={"sleep": 0.01}),
            StepSpec(
                id="b",
                tool="ts",
                params={"value": "${nonexistent.output}"},
                depends_on=("a",),
            ),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert not result.success
    assert result.step_results["a"].status == StepStatus.SUCCESS
    assert result.step_results["b"].status == StepStatus.FAILED
    assert "setup failed" in result.step_results["b"].error.lower()


@pytest.mark.asyncio
async def test_bad_ref_cascades_to_dependents(ts_registry):
    """When step setup fails, its dependents are cascade-skipped."""
    plan = PlanSpec(
        name="bad-ref-cascade",
        steps=(
            StepSpec(id="a", tool="ts", params={"sleep": 0.01}),
            StepSpec(
                id="b",
                tool="ts",
                params={"value": "${missing.output}"},
                depends_on=("a",),
            ),
            StepSpec(id="c", tool="ts", params={"sleep": 0.01}, depends_on=("b",)),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert result.step_results["a"].status == StepStatus.SUCCESS
    assert result.step_results["b"].status == StepStatus.FAILED
    assert result.step_results["c"].status == StepStatus.SKIPPED


@pytest.mark.asyncio
async def test_bad_nested_ref_on_failed_output(ts_registry):
    """Accessing nested field of a failed step's None output fails gracefully."""
    plan = PlanSpec(
        name="none-output",
        steps=(
            StepSpec(id="a", tool="fail", continue_on_failure=True),
            StepSpec(
                id="b",
                tool="echo",
                params={"data": "${a.output.key}"},
                depends_on=("a",),
            ),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert result.step_results["a"].status == StepStatus.FAILED
    assert result.step_results["b"].status == StepStatus.FAILED
    assert "setup failed" in result.step_results["b"].error.lower()


# ── Parameter interpolation integration tests ─────────────────


@pytest.mark.asyncio
async def test_interpolation_output_into_next_step(ts_registry):
    """Step B receives step A's output via ${A.output.value}."""
    plan = PlanSpec(
        name="interp-basic",
        steps=(
            StepSpec(id="producer", tool="echo", params={"payload": "hello-world"}),
            StepSpec(
                id="consumer",
                tool="echo",
                params={"received": "${producer.output.payload}"},
                depends_on=("producer",),
            ),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert result.success
    assert result.step_results["consumer"].output["received"] == "hello-world"


@pytest.mark.asyncio
async def test_interpolation_steps_prefix_syntax(ts_registry):
    """{steps.X.output.field} works end-to-end through the planner."""
    plan = PlanSpec(
        name="interp-steps-prefix",
        steps=(
            StepSpec(id="src", tool="echo", params={"data": 42}),
            StepSpec(
                id="dst",
                tool="echo",
                params={"val": "{steps.src.output.data}"},
                depends_on=("src",),
            ),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert result.success
    assert result.step_results["dst"].output["val"] == 42


@pytest.mark.asyncio
async def test_interpolation_embedded_in_string(ts_registry):
    """Placeholder embedded in a larger string resolves correctly."""
    plan = PlanSpec(
        name="interp-embedded",
        steps=(
            StepSpec(id="fetch", tool="echo", params={"url": "example.com"}),
            StepSpec(
                id="use",
                tool="echo",
                params={"msg": "Fetched from ${fetch.output.url}!"},
                depends_on=("fetch",),
            ),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert result.success
    assert result.step_results["use"].output["msg"] == "Fetched from example.com!"


@pytest.mark.asyncio
async def test_interpolation_chain_three_steps(ts_registry):
    """A → B → C chain where each step references its predecessor."""
    plan = PlanSpec(
        name="interp-chain",
        steps=(
            StepSpec(id="a", tool="echo", params={"v": "start"}),
            StepSpec(
                id="b",
                tool="echo",
                params={"v": "mid-${a.output.v}"},
                depends_on=("a",),
            ),
            StepSpec(
                id="c",
                tool="echo",
                params={"v": "{steps.b.output.v}"},
                depends_on=("b",),
            ),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert result.success
    assert result.step_results["b"].output["v"] == "mid-start"
    assert result.step_results["c"].output["v"] == "mid-start"


@pytest.mark.asyncio
async def test_literal_params_unchanged(ts_registry):
    """Non-placeholder params pass through unmodified."""
    plan = PlanSpec(
        name="literal-params",
        steps=(
            StepSpec(id="x", tool="echo", params={"a": 1, "b": "hello", "c": [1, 2]}),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert result.success
    assert result.step_results["x"].output == {"a": 1, "b": "hello", "c": [1, 2]}


@pytest.mark.asyncio
async def test_bad_ref_steps_prefix_fails_locally(ts_registry):
    """{steps.missing.output} fails the step, not the plan."""
    plan = PlanSpec(
        name="bad-steps-ref",
        steps=(
            StepSpec(id="ok", tool="echo", params={"v": 1}),
            StepSpec(
                id="bad",
                tool="echo",
                params={"x": "{steps.missing.output}"},
                depends_on=("ok",),
            ),
        ),
    )
    planner = Planner(ts_registry)
    result = await planner.execute(plan)

    assert not result.success
    assert result.step_results["ok"].status == StepStatus.SUCCESS
    assert result.step_results["bad"].status == StepStatus.FAILED
    assert "setup failed" in result.step_results["bad"].error.lower()
