"""Tests for plan loading."""

import json

import pytest

from src.odin.plan_loader import load_plan
from src.odin.planner import PlanValidationError


class TestLoadPlan:
    def test_from_dict(self):
        plan = load_plan({"name": "t", "steps": [{"id": "a", "tool": "echo"}]})
        assert plan.name == "t"
        assert len(plan.steps) == 1

    def test_from_json_string(self):
        data = json.dumps({"name": "t", "steps": [{"id": "a", "tool": "echo"}]})
        plan = load_plan(data)
        assert plan.name == "t"

    def test_deps_as_list(self):
        plan = load_plan({
            "name": "t",
            "steps": [
                {"id": "a", "tool": "echo"},
                {"id": "b", "tool": "echo", "depends_on": ["a"]},
            ],
        })
        assert plan.steps[1].depends_on == ("a",)

    def test_options(self):
        plan = load_plan({
            "name": "t",
            "steps": [{
                "id": "a",
                "tool": "echo",
                "timeout": 10,
                "retries": 3,
                "continue_on_failure": True,
            }],
        })
        s = plan.steps[0]
        assert s.timeout == 10.0
        assert s.retries == 3
        assert s.continue_on_failure is True

    def test_inputs_loaded(self):
        plan = load_plan({
            "name": "t",
            "steps": [{"id": "a", "tool": "echo", "params": {"msg": "${inputs.x}"}}],
            "inputs": {"x": "hello"},
        })
        assert plan.inputs == {"x": "hello"}

    def test_missing_name_raises(self):
        with pytest.raises(PlanValidationError, match="name"):
            load_plan({"steps": [{"id": "a", "tool": "echo"}]})

    def test_missing_steps_raises(self):
        with pytest.raises(PlanValidationError, match="step"):
            load_plan({"name": "t"})

    @pytest.mark.parametrize("value", ["false", "true", 0, 1, None, [], {}])
    def test_continue_on_failure_is_strict_boolean(self, value):
        with pytest.raises(PlanValidationError, match="continue_on_failure must be a boolean"):
            load_plan({"name": "t", "steps": [
                {"id": "a", "tool": "echo", "continue_on_failure": value}
            ]})

    @pytest.mark.parametrize("value", [0, -1, True, "5", float("nan"), float("inf")])
    def test_bad_timeout(self, value):
        with pytest.raises(PlanValidationError, match="timeout"):
            load_plan({"name": "t", "steps": [{"id": "a", "tool": "echo", "timeout": value}]})

    @pytest.mark.parametrize("value", ["2", 1.5, -1, True])
    def test_bad_retries(self, value):
        with pytest.raises(PlanValidationError, match="retries"):
            load_plan({"name": "t", "steps": [{"id": "a", "tool": "echo", "retries": value}]})

    @pytest.mark.parametrize("data", [
        None, [], {"name": "t", "steps": [None]},
        {"name": "t", "steps": [{"tool": "echo"}]},
        {"name": "t", "steps": [{"id": "a", "tool": "echo", "depends_on": 7}]},
        {"name": "t", "steps": [{"id": "a", "tool": "echo", "params": []}]},
    ])
    def test_malformed_structure_is_validation_error(self, data):
        with pytest.raises(PlanValidationError):
            load_plan(data if data is not None else {"name": "t", "steps": [None]})
