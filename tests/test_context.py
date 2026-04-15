"""Tests for ExecutionContext — step-result and plan-input interpolation."""

import pytest

from src.odin.context import ExecutionContext
from src.odin.types import StepResult, StepStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ctx_with_results(**kwargs) -> ExecutionContext:
    ctx = ExecutionContext(inputs=kwargs.pop("_inputs", None))
    for step_id, output in kwargs.items():
        ctx.record(step_id, StepResult(status=StepStatus.SUCCESS, output=output))
    return ctx


# ---------------------------------------------------------------------------
# Step-result interpolation (prior work — regression coverage)
# ---------------------------------------------------------------------------

class TestStepResultInterpolation:
    def test_full_ref_returns_raw(self):
        ctx = _ctx_with_results(a={"key": "val"})
        assert ctx.resolve_params({"x": "${a.output}"}) == {"x": {"key": "val"}}

    def test_nested_key_access(self):
        ctx = _ctx_with_results(a={"nested": {"deep": 42}})
        assert ctx.resolve_params({"x": "${a.output.nested.deep}"}) == {"x": 42}

    def test_implicit_output(self):
        ctx = _ctx_with_results(a={"k": "v"})
        assert ctx.resolve_params({"x": "${a.k}"}) == {"x": "v"}

    def test_embedded_ref_stringified(self):
        ctx = _ctx_with_results(a="world")
        assert ctx.resolve_params({"x": "hello ${a.output}!"}) == {"x": "hello world!"}

    def test_list_index(self):
        ctx = _ctx_with_results(a=["x", "y", "z"])
        assert ctx.resolve_params({"x": "${a.output.1}"}) == {"x": "y"}

    def test_steps_prefix_syntax(self):
        ctx = _ctx_with_results(a="val")
        assert ctx.resolve_params({"x": "{steps.a.output}"}) == {"x": "val"}

    def test_non_output_field(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.FAILED, error="oops", attempts=3))
        r = ctx.resolve_params({"s": "${a.status}", "e": "${a.error}", "n": "${a.attempts}"})
        assert r["s"] == StepStatus.FAILED
        assert r["e"] == "oops"
        assert r["n"] == 3

    def test_unknown_step_raises(self):
        ctx = _ctx_with_results()
        with pytest.raises(KeyError, match="not found"):
            ctx.resolve_params({"x": "${nope.output}"})

    def test_bad_key_raises(self):
        ctx = _ctx_with_results(a={"k": 1})
        with pytest.raises(KeyError, match="not found"):
            ctx.resolve_params({"x": "${a.output.missing}"})


# ---------------------------------------------------------------------------
# Plan-input interpolation (new feature)
# ---------------------------------------------------------------------------

class TestPlanInputInterpolation:
    def test_full_ref_returns_raw(self):
        ctx = ExecutionContext(inputs={"target": {"host": "example.com", "port": 443}})
        r = ctx.resolve_params({"server": "${inputs.target}"})
        assert r == {"server": {"host": "example.com", "port": 443}}

    def test_nested_key(self):
        ctx = ExecutionContext(inputs={"target": {"host": "example.com", "port": 443}})
        r = ctx.resolve_params({"h": "${inputs.target.host}"})
        assert r == {"h": "example.com"}

    def test_embedded_ref_stringified(self):
        ctx = ExecutionContext(inputs={"env": "prod", "region": "us-east-1"})
        r = ctx.resolve_params({"url": "https://${inputs.env}.${inputs.region}.api.internal"})
        assert r == {"url": "https://prod.us-east-1.api.internal"}

    def test_bare_brace_syntax(self):
        ctx = ExecutionContext(inputs={"x": 99})
        r = ctx.resolve_params({"v": "{inputs.x}"})
        assert r == {"v": 99}

    def test_list_input(self):
        ctx = ExecutionContext(inputs={"tags": ["a", "b", "c"]})
        r = ctx.resolve_params({"first": "${inputs.tags.0}", "last": "${inputs.tags.2}"})
        assert r == {"first": "a", "last": "c"}

    def test_deep_nesting(self):
        ctx = ExecutionContext(inputs={"cfg": {"db": {"host": "localhost", "port": 5432}}})
        r = ctx.resolve_params({"dsn": "pg://${inputs.cfg.db.host}:${inputs.cfg.db.port}/app"})
        assert r == {"dsn": "pg://localhost:5432/app"}

    def test_mixed_step_and_input_refs(self):
        ctx = ExecutionContext(inputs={"base_url": "https://api.example.com"})
        ctx.record("auth", StepResult(status=StepStatus.SUCCESS, output={"token": "abc123"}))
        r = ctx.resolve_params({"url": "${inputs.base_url}/data", "auth": "Bearer ${auth.output.token}"})
        assert r == {"url": "https://api.example.com/data", "auth": "Bearer abc123"}

    def test_input_in_nested_param_dict(self):
        ctx = ExecutionContext(inputs={"retries": 5})
        r = ctx.resolve_params({"config": {"max_retries": "${inputs.retries}"}})
        assert r == {"config": {"max_retries": 5}}

    def test_input_in_param_list(self):
        ctx = ExecutionContext(inputs={"flag": "--verbose"})
        r = ctx.resolve_params({"args": ["run", "${inputs.flag}"]})
        assert r == {"args": ["run", "--verbose"]}

    # -- error cases ---------------------------------------------------------

    def test_missing_input_key_raises(self):
        ctx = ExecutionContext(inputs={"a": 1})
        with pytest.raises(KeyError, match="input 'nope' not found.*available: a"):
            ctx.resolve_params({"x": "${inputs.nope}"})

    def test_missing_input_key_empty_inputs(self):
        ctx = ExecutionContext()
        with pytest.raises(KeyError, match="input 'x' not found.*available: none"):
            ctx.resolve_params({"x": "${inputs.x}"})

    def test_bad_nested_path_raises(self):
        ctx = ExecutionContext(inputs={"a": {"b": 1}})
        with pytest.raises(KeyError, match="not found"):
            ctx.resolve_params({"x": "${inputs.a.c}"})

    def test_bad_list_index_raises(self):
        ctx = ExecutionContext(inputs={"a": [1, 2]})
        with pytest.raises(KeyError, match="invalid index"):
            ctx.resolve_params({"x": "${inputs.a.99}"})

    def test_empty_input_ref_raises(self):
        ctx = ExecutionContext(inputs={"a": 1})
        with pytest.raises(KeyError, match="empty input reference"):
            ctx.resolve_params({"x": "${inputs.}"})

    def test_error_is_step_local_not_plan_crash(self):
        """Bad input ref in one param doesn't prevent resolving others."""
        ctx = ExecutionContext(inputs={"ok": "fine"})
        # Good ref resolves fine
        assert ctx.resolve_params({"x": "${inputs.ok}"}) == {"x": "fine"}
        # Bad ref raises KeyError (step executor catches this per-step)
        with pytest.raises(KeyError):
            ctx.resolve_params({"x": "${inputs.missing}"})


# ---------------------------------------------------------------------------
# Condition evaluation
# ---------------------------------------------------------------------------

class TestConditionEvaluation:
    def test_truthy_bool_true(self):
        ctx = ExecutionContext(inputs={"flag": True})
        assert ctx.evaluate_condition("${inputs.flag}") is True

    def test_truthy_bool_false(self):
        ctx = ExecutionContext(inputs={"flag": False})
        assert ctx.evaluate_condition("${inputs.flag}") is False

    def test_truthy_nonempty_string(self):
        ctx = ExecutionContext(inputs={"val": "yes"})
        assert ctx.evaluate_condition("${inputs.val}") is True

    def test_truthy_empty_string(self):
        ctx = ExecutionContext(inputs={"val": ""})
        assert ctx.evaluate_condition("${inputs.val}") is False

    def test_truthy_none(self):
        ctx = ExecutionContext(inputs={"val": None})
        assert ctx.evaluate_condition("${inputs.val}") is False

    def test_truthy_zero(self):
        ctx = ExecutionContext(inputs={"val": 0})
        assert ctx.evaluate_condition("${inputs.val}") is False

    def test_truthy_nonzero_int(self):
        ctx = ExecutionContext(inputs={"val": 42})
        assert ctx.evaluate_condition("${inputs.val}") is True

    def test_truthy_nonempty_list(self):
        ctx = ExecutionContext(inputs={"val": [1, 2]})
        assert ctx.evaluate_condition("${inputs.val}") is True

    def test_truthy_empty_list(self):
        ctx = ExecutionContext(inputs={"val": []})
        assert ctx.evaluate_condition("${inputs.val}") is False

    def test_false_string_literals(self):
        for val in ("false", "False", "FALSE", "0", "no", "null", "none", "None"):
            ctx = ExecutionContext(inputs={"val": val})
            assert ctx.evaluate_condition("${inputs.val}") is False, f"'{val}' should be falsy"

    def test_equality_match(self):
        ctx = ExecutionContext(inputs={"env": "prod"})
        assert ctx.evaluate_condition("${inputs.env} == prod") is True

    def test_equality_mismatch(self):
        ctx = ExecutionContext(inputs={"env": "staging"})
        assert ctx.evaluate_condition("${inputs.env} == prod") is False

    def test_inequality_match(self):
        ctx = ExecutionContext(inputs={"env": "staging"})
        assert ctx.evaluate_condition("${inputs.env} != prod") is True

    def test_inequality_mismatch(self):
        ctx = ExecutionContext(inputs={"env": "prod"})
        assert ctx.evaluate_condition("${inputs.env} != prod") is False

    def test_step_result_in_condition(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.SUCCESS, output="ready"))
        assert ctx.evaluate_condition("${a.output} == ready") is True

    def test_step_status_in_condition(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.FAILED, error="boom"))
        # Enum values stringify to their .value ("failed"), not repr ("StepStatus.FAILED")
        assert ctx.evaluate_condition("${a.status} == failed") is True

    def test_missing_ref_raises(self):
        ctx = ExecutionContext()
        with pytest.raises(KeyError):
            ctx.evaluate_condition("${inputs.missing}")

    # -- step-output references in conditions --------------------------------

    def test_step_output_equality_dollar_brace(self):
        ctx = _ctx_with_results(check={"status": "ready"})
        assert ctx.evaluate_condition("${check.output.status} == ready") is True

    def test_step_output_equality_dollar_brace_mismatch(self):
        ctx = _ctx_with_results(check={"status": "pending"})
        assert ctx.evaluate_condition("${check.output.status} == ready") is False

    def test_step_output_truthiness_bool(self):
        ctx = _ctx_with_results(gate=True)
        assert ctx.evaluate_condition("${gate.output}") is True

    def test_step_output_truthiness_false(self):
        ctx = _ctx_with_results(gate=False)
        assert ctx.evaluate_condition("${gate.output}") is False

    def test_step_output_truthiness_nonempty_dict(self):
        ctx = _ctx_with_results(gate={"key": "val"})
        assert ctx.evaluate_condition("${gate.output}") is True

    def test_step_output_truthiness_empty_dict(self):
        ctx = _ctx_with_results(gate={})
        assert ctx.evaluate_condition("${gate.output}") is False

    def test_step_output_nested_dict_in_condition(self):
        ctx = _ctx_with_results(fetch={"response": {"code": 200, "ok": True}})
        assert ctx.evaluate_condition("${fetch.output.response.code} == 200") is True

    def test_step_output_list_index_in_condition(self):
        ctx = _ctx_with_results(scan={"hosts": ["alpha", "beta", "gamma"]})
        assert ctx.evaluate_condition("${scan.output.hosts.0} == alpha") is True

    def test_step_output_list_index_mismatch(self):
        ctx = _ctx_with_results(scan={"hosts": ["alpha", "beta"]})
        assert ctx.evaluate_condition("${scan.output.hosts.1} == alpha") is False

    def test_step_output_implicit_output_in_condition(self):
        """${step.key} implicitly resolves through .output."""
        ctx = _ctx_with_results(check="go")
        assert ctx.evaluate_condition("${check.output} == go") is True

    def test_step_output_inequality_in_condition(self):
        ctx = _ctx_with_results(env_check="staging")
        assert ctx.evaluate_condition("${env_check.output} != prod") is True

    def test_dollar_brace_steps_prefix(self):
        """${steps.step_name.output} should work the same as {steps.step_name.output}."""
        ctx = _ctx_with_results(check="go")
        assert ctx.evaluate_condition("${steps.check.output} == go") is True

    def test_dollar_brace_steps_prefix_truthiness(self):
        ctx = _ctx_with_results(gate=True)
        assert ctx.evaluate_condition("${steps.gate.output}") is True

    def test_dollar_brace_steps_prefix_nested(self):
        ctx = _ctx_with_results(fetch={"data": {"ready": True}})
        assert ctx.evaluate_condition("${steps.fetch.output.data.ready}") is True

    def test_bare_brace_steps_in_condition(self):
        ctx = _ctx_with_results(check="go")
        assert ctx.evaluate_condition("{steps.check.output} == go") is True

    def test_bare_brace_steps_nested_in_condition(self):
        ctx = _ctx_with_results(api={"result": {"count": 5}})
        assert ctx.evaluate_condition("{steps.api.output.result.count} == 5") is True

    def test_step_output_none_is_falsy(self):
        ctx = _ctx_with_results(check=None)
        assert ctx.evaluate_condition("${check.output}") is False

    def test_step_output_zero_is_falsy(self):
        ctx = _ctx_with_results(check=0)
        assert ctx.evaluate_condition("${check.output}") is False

    def test_step_output_empty_list_is_falsy(self):
        ctx = _ctx_with_results(check=[])
        assert ctx.evaluate_condition("${check.output}") is False

    # -- numeric comparisons ---------------------------------------------------

    def test_gt_true(self):
        ctx = ExecutionContext(inputs={"count": 10})
        assert ctx.evaluate_condition("${inputs.count} > 5") is True

    def test_gt_false(self):
        ctx = ExecutionContext(inputs={"count": 3})
        assert ctx.evaluate_condition("${inputs.count} > 5") is False

    def test_gt_equal_is_false(self):
        ctx = ExecutionContext(inputs={"count": 5})
        assert ctx.evaluate_condition("${inputs.count} > 5") is False

    def test_gte_true(self):
        ctx = ExecutionContext(inputs={"count": 5})
        assert ctx.evaluate_condition("${inputs.count} >= 5") is True

    def test_gte_false(self):
        ctx = ExecutionContext(inputs={"count": 4})
        assert ctx.evaluate_condition("${inputs.count} >= 5") is False

    def test_lt_true(self):
        ctx = ExecutionContext(inputs={"duration": 2})
        assert ctx.evaluate_condition("${inputs.duration} < 10") is True

    def test_lt_false(self):
        ctx = ExecutionContext(inputs={"duration": 15})
        assert ctx.evaluate_condition("${inputs.duration} < 10") is False

    def test_lte_true(self):
        ctx = ExecutionContext(inputs={"duration": 10})
        assert ctx.evaluate_condition("${inputs.duration} <= 10") is True

    def test_lte_false(self):
        ctx = ExecutionContext(inputs={"duration": 11})
        assert ctx.evaluate_condition("${inputs.duration} <= 10") is False

    def test_numeric_comparison_with_floats(self):
        ctx = ExecutionContext(inputs={"ratio": "0.75"})
        assert ctx.evaluate_condition("${inputs.ratio} >= 0.5") is True
        assert ctx.evaluate_condition("${inputs.ratio} < 0.5") is False

    def test_numeric_comparison_with_negative(self):
        ctx = ExecutionContext(inputs={"delta": -3})
        assert ctx.evaluate_condition("${inputs.delta} < 0") is True
        assert ctx.evaluate_condition("${inputs.delta} > 0") is False

    def test_numeric_comparison_non_numeric_returns_false(self):
        ctx = ExecutionContext(inputs={"val": "abc"})
        assert ctx.evaluate_condition("${inputs.val} > 5") is False

    def test_numeric_comparison_from_step_output(self):
        ctx = _ctx_with_results(scan={"count": 42})
        assert ctx.evaluate_condition("${scan.output.count} > 10") is True
        assert ctx.evaluate_condition("${scan.output.count} <= 41") is False

    def test_numeric_comparison_step_output_nested(self):
        ctx = _ctx_with_results(fetch={"response": {"code": 200}})
        assert ctx.evaluate_condition("${fetch.output.response.code} >= 200") is True
        assert ctx.evaluate_condition("${fetch.output.response.code} < 200") is False

    def test_equality_still_works_with_numbers(self):
        """== remains string comparison — '10 == 10' should still pass."""
        ctx = ExecutionContext(inputs={"val": 10})
        assert ctx.evaluate_condition("${inputs.val} == 10") is True

    def test_inequality_still_works_with_numbers(self):
        ctx = ExecutionContext(inputs={"val": 10})
        assert ctx.evaluate_condition("${inputs.val} != 20") is True


# ---------------------------------------------------------------------------
# Interpolation stringification — booleans, enums, None  (regression)
# ---------------------------------------------------------------------------

class TestInterpolationStringification:
    """Embedded references must stringify booleans, enums, and None in a
    user-friendly way so that condition comparisons work naturally."""

    # -- booleans in conditions -----------------------------------------------

    def test_bool_true_eq_true(self):
        ctx = ExecutionContext(inputs={"flag": True})
        assert ctx.evaluate_condition("${inputs.flag} == true") is True

    def test_bool_false_eq_false(self):
        ctx = ExecutionContext(inputs={"flag": False})
        assert ctx.evaluate_condition("${inputs.flag} == false") is True

    def test_bool_true_ne_false(self):
        ctx = ExecutionContext(inputs={"flag": True})
        assert ctx.evaluate_condition("${inputs.flag} != false") is True

    def test_bool_false_ne_true(self):
        ctx = ExecutionContext(inputs={"flag": False})
        assert ctx.evaluate_condition("${inputs.flag} != true") is True

    def test_bool_true_eq_false_is_false(self):
        ctx = ExecutionContext(inputs={"flag": True})
        assert ctx.evaluate_condition("${inputs.flag} == false") is False

    # -- booleans from step outputs -------------------------------------------

    def test_step_output_bool_comparison(self):
        ctx = _ctx_with_results(gate=True)
        assert ctx.evaluate_condition("${gate.output} == true") is True

    def test_step_output_bool_false_comparison(self):
        ctx = _ctx_with_results(gate=False)
        assert ctx.evaluate_condition("${gate.output} == false") is True

    # -- enum values in conditions --------------------------------------------

    def test_step_status_enum_eq_value(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.SUCCESS, output="ok"))
        assert ctx.evaluate_condition("${a.status} == success") is True

    def test_step_status_enum_eq_wrong_value(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.SUCCESS, output="ok"))
        assert ctx.evaluate_condition("${a.status} == failed") is False

    def test_step_status_enum_ne(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.SKIPPED, error="skip"))
        assert ctx.evaluate_condition("${a.status} != success") is True

    def test_step_status_timeout_eq(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.TIMEOUT, error="slow"))
        assert ctx.evaluate_condition("${a.status} == timeout") is True

    # -- None in conditions ---------------------------------------------------

    def test_none_eq_none_string(self):
        ctx = ExecutionContext(inputs={"val": None})
        assert ctx.evaluate_condition("${inputs.val} == none") is True

    def test_none_ne_something(self):
        ctx = ExecutionContext(inputs={"val": None})
        assert ctx.evaluate_condition("${inputs.val} != ready") is True

    # -- embedded stringification in params (not just conditions) --------------

    def test_bool_embedded_in_param_string(self):
        ctx = ExecutionContext(inputs={"verbose": True})
        r = ctx.resolve_params({"flag": "--verbose=${inputs.verbose}"})
        assert r == {"flag": "--verbose=true"}

    def test_bool_false_embedded_in_param_string(self):
        ctx = ExecutionContext(inputs={"debug": False})
        r = ctx.resolve_params({"flag": "debug=${inputs.debug}"})
        assert r == {"flag": "debug=false"}

    def test_enum_embedded_in_param_string(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.SUCCESS, output="data"))
        r = ctx.resolve_params({"msg": "step status: ${a.status}"})
        assert r == {"msg": "step status: success"}

    def test_none_embedded_in_param_string(self):
        ctx = ExecutionContext(inputs={"val": None})
        r = ctx.resolve_params({"msg": "value is ${inputs.val}"})
        assert r == {"msg": "value is none"}

    # -- full-value refs still preserve raw types -----------------------------

    def test_full_ref_bool_preserves_type(self):
        ctx = ExecutionContext(inputs={"flag": True})
        r = ctx.resolve_params({"x": "${inputs.flag}"})
        assert r == {"x": True}
        assert isinstance(r["x"], bool)

    def test_full_ref_none_preserves_type(self):
        ctx = ExecutionContext(inputs={"val": None})
        r = ctx.resolve_params({"x": "${inputs.val}"})
        assert r["x"] is None

    def test_full_ref_enum_preserves_type(self):
        ctx = ExecutionContext()
        ctx.record("a", StepResult(status=StepStatus.FAILED, error="boom"))
        r = ctx.resolve_params({"s": "${a.status}"})
        assert r["s"] is StepStatus.FAILED
