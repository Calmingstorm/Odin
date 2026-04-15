"""Tests for the DAG planner — execution, validation, and input interpolation."""

import pytest

from src.odin.planner import Planner, PlanValidationError
from src.odin.types import PlanSpec, StepSpec, StepStatus


class TestExecution:
    async def test_linear(self, ts_registry, linear_plan):
        p = Planner(ts_registry)
        r = await p.execute(linear_plan)
        assert r.success
        assert r.steps["c"].status == StepStatus.SUCCESS

    async def test_diamond(self, ts_registry, diamond_plan):
        p = Planner(ts_registry)
        r = await p.execute(diamond_plan)
        assert r.success
        assert set(r.steps) == {"a", "b", "c", "d"}

    async def test_failure_cascades(self, ts_registry):
        plan = PlanSpec(
            name="cascade",
            steps=(
                StepSpec(id="a", tool="fail", params={"fail_count": 999}),
                StepSpec(id="b", tool="echo", params={"message": "hi"}, depends_on=("a",)),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert not r.success
        assert r.steps["a"].status == StepStatus.FAILED
        assert r.steps["b"].status == StepStatus.SKIPPED

    async def test_step_result_interpolation_chain(self, ts_registry):
        plan = PlanSpec(
            name="chain",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "first"}),
                StepSpec(id="b", tool="echo", params={"message": "got ${a.output}"}, depends_on=("a",)),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert r.steps["b"].output == "got first"


class TestValidation:
    def test_unknown_tool(self, ts_registry):
        plan = PlanSpec(name="bad", steps=(StepSpec(id="a", tool="nope"),))
        p = Planner(ts_registry)
        errors = p.validate(plan)
        assert any("unknown tool" in e for e in errors)

    def test_dangling_dep(self, ts_registry):
        plan = PlanSpec(name="bad", steps=(StepSpec(id="a", tool="echo", depends_on=("z",)),))
        p = Planner(ts_registry)
        errors = p.validate(plan)
        assert any("unknown step" in e for e in errors)

    def test_duplicate_id(self, ts_registry):
        plan = PlanSpec(
            name="bad",
            steps=(StepSpec(id="a", tool="echo"), StepSpec(id="a", tool="echo")),
        )
        p = Planner(ts_registry)
        errors = p.validate(plan)
        assert any("duplicate" in e for e in errors)


# ---------------------------------------------------------------------------
# Plan inputs — end-to-end through the planner
# ---------------------------------------------------------------------------

class TestPlanInputs:
    async def test_inputs_from_spec(self, ts_registry):
        plan = PlanSpec(
            name="with_inputs",
            steps=(StepSpec(id="a", tool="echo", params={"message": "${inputs.greeting}"}),),
            inputs={"greeting": "hello world"},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert r.steps["a"].output == "hello world"

    async def test_runtime_inputs_override_spec(self, ts_registry):
        plan = PlanSpec(
            name="override",
            steps=(StepSpec(id="a", tool="echo", params={"message": "${inputs.x}"}),),
            inputs={"x": "default"},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan, inputs={"x": "override"})
        assert r.success
        assert r.steps["a"].output == "override"

    async def test_mixed_input_and_step_refs(self, ts_registry):
        plan = PlanSpec(
            name="mixed",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "${inputs.prefix}"}),
                StepSpec(
                    id="b",
                    tool="echo",
                    params={"message": "${a.output}-${inputs.suffix}"},
                    depends_on=("a",),
                ),
            ),
            inputs={"prefix": "hello", "suffix": "world"},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert r.steps["b"].output == "hello-world"

    async def test_bad_input_ref_fails_step_not_plan(self, ts_registry):
        plan = PlanSpec(
            name="bad_ref",
            steps=(
                StepSpec(id="good", tool="echo", params={"message": "ok"}),
                StepSpec(id="bad", tool="echo", params={"message": "${inputs.nope}"}),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        # The bad step fails, good step succeeds
        assert r.steps["good"].status == StepStatus.SUCCESS
        assert r.steps["bad"].status == StepStatus.FAILED
        assert "param resolution failed" in r.steps["bad"].error

    async def test_complex_input_object(self, ts_registry):
        plan = PlanSpec(
            name="complex",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "${inputs.cfg.db.host}"}),
            ),
            inputs={"cfg": {"db": {"host": "localhost", "port": 5432}}},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert r.steps["a"].output == "localhost"

    async def test_input_as_full_object_passthrough(self, ts_registry):
        data = {"servers": ["a", "b"], "count": 2}
        plan = PlanSpec(
            name="passthrough",
            steps=(StepSpec(id="a", tool="echo", params={"message": "${inputs.data}"}),),
            inputs={"data": data},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert r.steps["a"].output == data


# ---------------------------------------------------------------------------
# Conditional step execution — ``when`` clause
# ---------------------------------------------------------------------------

class TestConditionalExecution:
    async def test_when_true_runs_step(self, ts_registry):
        plan = PlanSpec(
            name="cond",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "ok"}, when="${inputs.run}"),
            ),
            inputs={"run": True},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert r.steps["a"].status == StepStatus.SUCCESS

    async def test_when_false_skips_step(self, ts_registry):
        plan = PlanSpec(
            name="cond",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "ok"}, when="${inputs.run}"),
            ),
            inputs={"run": False},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success  # skip is not a failure
        assert r.steps["a"].status == StepStatus.SKIPPED
        assert r.steps["a"].error == "condition not met"

    async def test_when_none_always_runs(self, ts_registry):
        """Steps without a when clause always execute (backwards compatible)."""
        plan = PlanSpec(
            name="no_when",
            steps=(StepSpec(id="a", tool="echo", params={"message": "hi"}),),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert r.steps["a"].status == StepStatus.SUCCESS

    async def test_when_string_equality(self, ts_registry):
        plan = PlanSpec(
            name="eq",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "deploy"},
                         when="${inputs.env} == prod"),
            ),
            inputs={"env": "prod"},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["a"].status == StepStatus.SUCCESS

    async def test_when_string_equality_false(self, ts_registry):
        plan = PlanSpec(
            name="eq",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "deploy"},
                         when="${inputs.env} == prod"),
            ),
            inputs={"env": "staging"},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["a"].status == StepStatus.SKIPPED

    async def test_when_inequality(self, ts_registry):
        plan = PlanSpec(
            name="neq",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "not prod"},
                         when="${inputs.env} != prod"),
            ),
            inputs={"env": "staging"},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["a"].status == StepStatus.SUCCESS

    async def test_when_references_step_output(self, ts_registry):
        plan = PlanSpec(
            name="step_ref",
            steps=(
                StepSpec(id="check", tool="echo", params={"message": "go"}),
                StepSpec(id="act", tool="echo", params={"message": "acted"},
                         depends_on=("check",), when="${check.output} == go"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["act"].status == StepStatus.SUCCESS

    async def test_when_skip_does_not_cascade(self, ts_registry):
        """A when-skipped step should NOT cascade-skip its dependents."""
        plan = PlanSpec(
            name="no_cascade",
            steps=(
                StepSpec(id="optional", tool="echo", params={"message": "x"},
                         when="${inputs.run_optional}"),
                StepSpec(id="always", tool="echo", params={"message": "yes"},
                         depends_on=("optional",)),
            ),
            inputs={"run_optional": False},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["optional"].status == StepStatus.SKIPPED
        assert r.steps["always"].status == StepStatus.SUCCESS

    async def test_when_missing_ref_skips(self, ts_registry):
        """Bad interpolation in when expression skips the step (doesn't crash)."""
        plan = PlanSpec(
            name="bad_when",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "ok"},
                         when="${inputs.nonexistent}"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["a"].status == StepStatus.SKIPPED

    def test_when_loaded_from_dict(self):
        from src.odin.plan_loader import load_plan
        plan = load_plan({
            "name": "t",
            "steps": [{"id": "a", "tool": "echo", "when": "${inputs.go}"}],
            "inputs": {"go": True},
        })
        assert plan.steps[0].when == "${inputs.go}"

    async def test_when_with_runtime_input_override(self, ts_registry):
        """Runtime inputs can toggle conditional steps."""
        plan = PlanSpec(
            name="toggle",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "ran"},
                         when="${inputs.enabled}"),
            ),
            inputs={"enabled": False},
        )
        p = Planner(ts_registry)
        # Default: disabled
        r = await p.execute(plan)
        assert r.steps["a"].status == StepStatus.SKIPPED
        # Override: enabled
        r = await p.execute(plan, inputs={"enabled": True})
        assert r.steps["a"].status == StepStatus.SUCCESS

    # -- branching on prior step outputs ------------------------------------

    async def test_when_step_output_nested_path(self, ts_registry):
        """Condition can reference nested dict paths in prior step output."""
        plan = PlanSpec(
            name="nested_branch",
            steps=(
                StepSpec(id="check", tool="echo",
                         params={"message": {"env": "prod", "ready": True}}),
                StepSpec(id="deploy", tool="echo",
                         params={"message": "deployed"},
                         depends_on=("check",),
                         when="${check.output.env} == prod"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["deploy"].status == StepStatus.SUCCESS

    async def test_when_step_output_nested_mismatch_skips(self, ts_registry):
        plan = PlanSpec(
            name="nested_skip",
            steps=(
                StepSpec(id="check", tool="echo",
                         params={"message": {"env": "staging"}}),
                StepSpec(id="deploy", tool="echo",
                         params={"message": "deployed"},
                         depends_on=("check",),
                         when="${check.output.env} == prod"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["deploy"].status == StepStatus.SKIPPED

    async def test_when_step_output_truthiness(self, ts_registry):
        """Condition on step output truthy value (non-string)."""
        plan = PlanSpec(
            name="truthy_branch",
            steps=(
                StepSpec(id="gate", tool="echo",
                         params={"message": {"items": [1, 2, 3]}}),
                StepSpec(id="process", tool="echo",
                         params={"message": "processing"},
                         depends_on=("gate",),
                         when="${gate.output.items}"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["process"].status == StepStatus.SUCCESS

    async def test_when_step_output_falsy_skips(self, ts_registry):
        """Empty list output should cause condition to skip."""
        plan = PlanSpec(
            name="falsy_branch",
            steps=(
                StepSpec(id="gate", tool="echo",
                         params={"message": {"items": []}}),
                StepSpec(id="process", tool="echo",
                         params={"message": "processing"},
                         depends_on=("gate",),
                         when="${gate.output.items}"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["process"].status == StepStatus.SKIPPED

    async def test_when_dollar_brace_steps_prefix(self, ts_registry):
        """${steps.X.output} form works in when conditions."""
        plan = PlanSpec(
            name="steps_prefix",
            steps=(
                StepSpec(id="check", tool="echo", params={"message": "go"}),
                StepSpec(id="act", tool="echo", params={"message": "acted"},
                         depends_on=("check",),
                         when="${steps.check.output} == go"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["act"].status == StepStatus.SUCCESS

    async def test_when_bare_brace_steps_prefix(self, ts_registry):
        """{steps.X.output} form works in when conditions."""
        plan = PlanSpec(
            name="bare_steps",
            steps=(
                StepSpec(id="check", tool="echo", params={"message": "go"}),
                StepSpec(id="act", tool="echo", params={"message": "acted"},
                         depends_on=("check",),
                         when="{steps.check.output} == go"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["act"].status == StepStatus.SUCCESS

    async def test_when_multi_step_chain_branching(self, ts_registry):
        """Three-step chain: A produces data, B branches on A, C branches on B."""
        plan = PlanSpec(
            name="chain_branch",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "ready"}),
                StepSpec(id="b", tool="echo", params={"message": "processed"},
                         depends_on=("a",),
                         when="${a.output} == ready"),
                StepSpec(id="c", tool="echo", params={"message": "final"},
                         depends_on=("b",),
                         when="${b.output} == processed"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["a"].status == StepStatus.SUCCESS
        assert r.steps["b"].status == StepStatus.SUCCESS
        assert r.steps["c"].status == StepStatus.SUCCESS

    async def test_when_step_output_inequality(self, ts_registry):
        plan = PlanSpec(
            name="neq_step",
            steps=(
                StepSpec(id="check", tool="echo", params={"message": "staging"}),
                StepSpec(id="warn", tool="echo", params={"message": "not prod!"},
                         depends_on=("check",),
                         when="${check.output} != prod"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["warn"].status == StepStatus.SUCCESS

    async def test_when_numeric_gt_runs_step(self, ts_registry):
        plan = PlanSpec(
            name="numeric_gt",
            steps=(
                StepSpec(id="count", tool="echo", params={"message": 15}),
                StepSpec(id="alert", tool="echo", params={"message": "threshold exceeded"},
                         depends_on=("count",),
                         when="${count.output} > 10"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["alert"].status == StepStatus.SUCCESS

    async def test_when_numeric_gt_skips_step(self, ts_registry):
        plan = PlanSpec(
            name="numeric_gt_skip",
            steps=(
                StepSpec(id="count", tool="echo", params={"message": 3}),
                StepSpec(id="alert", tool="echo", params={"message": "threshold exceeded"},
                         depends_on=("count",),
                         when="${count.output} > 10"),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["alert"].status == StepStatus.SKIPPED

    async def test_when_numeric_lte_from_input(self, ts_registry):
        plan = PlanSpec(
            name="numeric_lte",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "go"},
                         when="${inputs.retries} <= 3"),
            ),
            inputs={"retries": 2},
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.steps["a"].status == StepStatus.SUCCESS


# ---------------------------------------------------------------------------
# Parallel execution — independent steps run concurrently
# ---------------------------------------------------------------------------

class TestParallelExecution:
    async def test_diamond_parallel_speedup(self, ts_registry):
        """Diamond plan B and C (both depend on A only) run concurrently.

        B and C each sleep 0.1s. Sequential would take ~0.2s; parallel < 0.15s.
        """
        plan = PlanSpec(
            name="diamond",
            steps=(
                StepSpec(id="a", tool="ts", params={"sleep": 0.01}),
                StepSpec(id="b", tool="ts", params={"sleep": 0.1}, depends_on=("a",)),
                StepSpec(id="c", tool="ts", params={"sleep": 0.1}, depends_on=("a",)),
                StepSpec(id="d", tool="ts", params={"sleep": 0.01}, depends_on=("b", "c")),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert set(r.steps) == {"a", "b", "c", "d"}

        # B and C should have overlapping time windows
        b_start = r.steps["b"].output["start"]
        b_end = r.steps["b"].output["end"]
        c_start = r.steps["c"].output["start"]
        c_end = r.steps["c"].output["end"]
        assert b_start < c_end and c_start < b_end, "B and C should overlap in time"

    async def test_wide_fan_out_parallel(self, ts_registry):
        """Many independent steps all run concurrently from a single root."""
        n = 5
        steps = [StepSpec(id="root", tool="ts", params={"sleep": 0.01})]
        for i in range(n):
            steps.append(
                StepSpec(id=f"fan_{i}", tool="ts", params={"sleep": 0.1}, depends_on=("root",))
            )
        plan = PlanSpec(name="fan_out", steps=tuple(steps))
        p = Planner(ts_registry)

        import time
        t0 = time.monotonic()
        r = await p.execute(plan)
        elapsed = time.monotonic() - t0

        assert r.success
        # 5 x 0.1s sequential = 0.5s; parallel should be ~0.1s + overhead
        assert elapsed < 0.3, f"Fan-out took {elapsed:.3f}s — expected parallel execution"

    async def test_independent_roots_parallel(self, ts_registry):
        """Steps with no dependencies at all run concurrently."""
        plan = PlanSpec(
            name="roots",
            steps=(
                StepSpec(id="a", tool="ts", params={"sleep": 0.1}),
                StepSpec(id="b", tool="ts", params={"sleep": 0.1}),
                StepSpec(id="c", tool="ts", params={"sleep": 0.1}),
            ),
        )
        p = Planner(ts_registry)

        import time
        t0 = time.monotonic()
        r = await p.execute(plan)
        elapsed = time.monotonic() - t0

        assert r.success
        # 3 x 0.1s sequential = 0.3s; parallel should be ~0.1s
        assert elapsed < 0.2, f"Independent roots took {elapsed:.3f}s — expected parallel"

    async def test_parallel_failure_still_cascades(self, ts_registry):
        """When one parallel branch fails, its dependents are still skipped."""
        plan = PlanSpec(
            name="parallel_fail",
            steps=(
                StepSpec(id="root", tool="echo", params={"message": "ok"}),
                StepSpec(id="ok_branch", tool="ts", params={"sleep": 0.01}, depends_on=("root",)),
                StepSpec(id="bad_branch", tool="fail", params={"message": "boom"}, depends_on=("root",)),
                StepSpec(id="after_ok", tool="echo", params={"message": "yes"}, depends_on=("ok_branch",)),
                StepSpec(id="after_bad", tool="echo", params={"message": "no"}, depends_on=("bad_branch",)),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert not r.success
        assert r.steps["ok_branch"].status == StepStatus.SUCCESS
        assert r.steps["bad_branch"].status == StepStatus.FAILED
        assert r.steps["after_ok"].status == StepStatus.SUCCESS
        assert r.steps["after_bad"].status == StepStatus.SKIPPED

    async def test_serial_chain_still_works(self, ts_registry):
        """A purely serial chain executes correctly with the async planner."""
        plan = PlanSpec(
            name="serial",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "1"}),
                StepSpec(id="b", tool="echo", params={"message": "got ${a.output}"}, depends_on=("a",)),
                StepSpec(id="c", tool="echo", params={"message": "got ${b.output}"}, depends_on=("b",)),
            ),
        )
        p = Planner(ts_registry)
        r = await p.execute(plan)
        assert r.success
        assert r.steps["c"].output == "got got 1"
