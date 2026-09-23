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

    def test_non_string_source_is_rejected(self):
        with pytest.raises(PlanValidationError, match="expected dict or str, got int"):
            load_plan(42)

    @pytest.mark.parametrize("data, message", [
        ('[1]', "plan must be an object"),
        ({"name": "t", "steps": [], "description": 1}, "description must be a string"),
        ({"name": "t", "steps": [], "inputs": []}, "inputs must be an object"),
        ({"name": "t", "steps": [{"id": "a"}]}, "tool must be a nonempty string"),
        ({"name": "t", "steps": [{"id": "a", "tool": "echo", "when": 1}]}, "when must be a string"),
    ])
    def test_additional_validation_branches(self, data, message):
        with pytest.raises(PlanValidationError, match=message):
            load_plan(data)

    def test_json_syntax_error_is_wrapped(self):
        with pytest.raises(PlanValidationError, match="could not load plan"):
            load_plan('{"broken":')

    def test_json_file_and_unsupported_file(self, tmp_path):
        path = tmp_path / "plan.json"
        path.write_text('{"name":"file plan","steps":[{"id":"a","tool":"echo"}]}')
        assert load_plan(str(path)).name == "file plan"
        with pytest.raises(PlanValidationError, match="unsupported plan file format"):
            load_plan(str(tmp_path / "plan.toml"))

    def test_file_read_error_is_wrapped(self, tmp_path):
        with pytest.raises(PlanValidationError, match="could not load plan"):
            load_plan(str(tmp_path / "missing.json"))

    def test_yaml_file_loads_and_parse_error_is_wrapped(self, tmp_path):
        pytest.importorskip("yaml")
        path = tmp_path / "plan.yaml"
        path.write_text("name: yaml plan\nsteps:\n  - id: a\n    tool: echo\n")
        assert load_plan(str(path)).name == "yaml plan"
        path.write_text("name: [unterminated")
        with pytest.raises(PlanValidationError, match="could not parse YAML plan"):
            load_plan(str(path))

    def test_yaml_missing_dependency_is_reported(self, monkeypatch, tmp_path):
        import builtins

        original_import = builtins.__import__

        def without_yaml(name, *args, **kwargs):
            if name == "yaml":
                raise ImportError("not installed")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", without_yaml)
        with pytest.raises(PlanValidationError, match="PyYAML required"):
            load_plan(str(tmp_path / "plan.yaml"))

    def test_string_dependency_and_optional_fields(self):
        plan = load_plan({
            "name": "options", "description": "desc", "inputs": {"x": 1},
            "steps": [{"id": "b", "tool": "echo", "depends_on": "a", "when": "ok"}],
        })
        step = plan.steps[0]
        assert step.depends_on == ("a",)
        assert step.when == "ok"
        assert plan.description == "desc"
        assert plan.inputs == {"x": 1}
