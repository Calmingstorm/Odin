"""Tests for the DAG planner — execution, validation, and input interpolation."""

import pytest

from odin.planner import Planner, PlanValidationError
from odin.types import PlanSpec, StepSpec, StepStatus


class TestExecution:
    def test_linear(self, ts_registry, linear_plan):
        p = Planner(ts_registry)
        r = p.execute(linear_plan)
        assert r.success
        assert r.steps["c"].status == StepStatus.SUCCESS

    def test_diamond(self, ts_registry, diamond_plan):
        p = Planner(ts_registry)
        r = p.execute(diamond_plan)
        assert r.success
        assert set(r.steps) == {"a", "b", "c", "d"}

    def test_failure_cascades(self, ts_registry):
        plan = PlanSpec(
            name="cascade",
            steps=(
                StepSpec(id="a", tool="fail", params={"fail_count": 999}),
                StepSpec(id="b", tool="echo", params={"message": "hi"}, depends_on=("a",)),
            ),
        )
        p = Planner(ts_registry)
        r = p.execute(plan)
        assert not r.success
        assert r.steps["a"].status == StepStatus.FAILED
        assert r.steps["b"].status == StepStatus.SKIPPED

    def test_step_result_interpolation_chain(self, ts_registry):
        plan = PlanSpec(
            name="chain",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "first"}),
                StepSpec(id="b", tool="echo", params={"message": "got ${a.output}"}, depends_on=("a",)),
            ),
        )
        p = Planner(ts_registry)
        r = p.execute(plan)
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
    def test_inputs_from_spec(self, ts_registry):
        plan = PlanSpec(
            name="with_inputs",
            steps=(StepSpec(id="a", tool="echo", params={"message": "${inputs.greeting}"}),),
            inputs={"greeting": "hello world"},
        )
        p = Planner(ts_registry)
        r = p.execute(plan)
        assert r.success
        assert r.steps["a"].output == "hello world"

    def test_runtime_inputs_override_spec(self, ts_registry):
        plan = PlanSpec(
            name="override",
            steps=(StepSpec(id="a", tool="echo", params={"message": "${inputs.x}"}),),
            inputs={"x": "default"},
        )
        p = Planner(ts_registry)
        r = p.execute(plan, inputs={"x": "override"})
        assert r.success
        assert r.steps["a"].output == "override"

    def test_mixed_input_and_step_refs(self, ts_registry):
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
        r = p.execute(plan)
        assert r.success
        assert r.steps["b"].output == "hello-world"

    def test_bad_input_ref_fails_step_not_plan(self, ts_registry):
        plan = PlanSpec(
            name="bad_ref",
            steps=(
                StepSpec(id="good", tool="echo", params={"message": "ok"}),
                StepSpec(id="bad", tool="echo", params={"message": "${inputs.nope}"}),
            ),
        )
        p = Planner(ts_registry)
        r = p.execute(plan)
        # The bad step fails, good step succeeds
        assert r.steps["good"].status == StepStatus.SUCCESS
        assert r.steps["bad"].status == StepStatus.FAILED
        assert "param resolution failed" in r.steps["bad"].error

    def test_complex_input_object(self, ts_registry):
        plan = PlanSpec(
            name="complex",
            steps=(
                StepSpec(id="a", tool="echo", params={"message": "${inputs.cfg.db.host}"}),
            ),
            inputs={"cfg": {"db": {"host": "localhost", "port": 5432}}},
        )
        p = Planner(ts_registry)
        r = p.execute(plan)
        assert r.success
        assert r.steps["a"].output == "localhost"

    def test_input_as_full_object_passthrough(self, ts_registry):
        data = {"servers": ["a", "b"], "count": 2}
        plan = PlanSpec(
            name="passthrough",
            steps=(StepSpec(id="a", tool="echo", params={"message": "${inputs.data}"}),),
            inputs={"data": data},
        )
        p = Planner(ts_registry)
        r = p.execute(plan)
        assert r.success
        assert r.steps["a"].output == data
