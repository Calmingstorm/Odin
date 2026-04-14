"""Tests for plan loading."""

import json
import pytest

from src.odin.plan_loader import load_plan


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
            "steps": [{"id": "a", "tool": "echo", "timeout": 10, "retries": 3, "continue_on_failure": True}],
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
        with pytest.raises(ValueError, match="name"):
            load_plan({"steps": [{"id": "a", "tool": "echo"}]})

    def test_missing_steps_raises(self):
        with pytest.raises(ValueError, match="step"):
            load_plan({"name": "t"})
