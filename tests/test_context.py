"""Tests for ExecutionContext variable resolution."""

from __future__ import annotations

import pytest

from src.odin.context import ExecutionContext
from src.odin.types import StepResult, StepStatus


@pytest.fixture
def populated_ctx():
    ctx = ExecutionContext()
    ctx.record(
        StepResult(
            step_id="step1",
            status=StepStatus.SUCCESS,
            output={"key": "value", "nested": {"inner": 42}},
        )
    )
    ctx.record(
        StepResult(
            step_id="step2",
            status=StepStatus.SUCCESS,
            output="plain-string",
        )
    )
    return ctx


def test_full_ref(populated_ctx):
    params = {"data": "${step1.output}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["data"] == {"key": "value", "nested": {"inner": 42}}


def test_nested_key_ref(populated_ctx):
    params = {"val": "${step1.output.key}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["val"] == "value"


def test_deep_nested_ref(populated_ctx):
    params = {"val": "${step1.output.nested.inner}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["val"] == 42


def test_embedded_ref(populated_ctx):
    params = {"msg": "result is ${step2.output}!"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["msg"] == "result is plain-string!"


def test_unknown_step_raises(populated_ctx):
    with pytest.raises(KeyError, match="not found"):
        populated_ctx.resolve_params({"x": "${unknown.output}"})


def test_no_refs_passthrough(populated_ctx):
    params = {"a": 1, "b": "hello"}
    assert populated_ctx.resolve_params(params) == {"a": 1, "b": "hello"}


# ── {steps.X.field} syntax ────────────────────────────────────

def test_steps_prefix_full_ref(populated_ctx):
    """``{steps.step1.output}`` returns the full output object."""
    params = {"data": "{steps.step1.output}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["data"] == {"key": "value", "nested": {"inner": 42}}


def test_steps_prefix_nested_key(populated_ctx):
    """``{steps.step1.output.key}`` drills into the output dict."""
    params = {"val": "{steps.step1.output.key}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["val"] == "value"


def test_steps_prefix_deep_nested(populated_ctx):
    params = {"val": "{steps.step1.output.nested.inner}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["val"] == 42


def test_steps_prefix_embedded(populated_ctx):
    """Embedded {steps.X.output} inside a larger string."""
    params = {"msg": "got {steps.step2.output} here"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["msg"] == "got plain-string here"


def test_steps_prefix_unknown_step(populated_ctx):
    with pytest.raises(KeyError, match="not found"):
        populated_ctx.resolve_params({"x": "{steps.nope.output}"})


def test_steps_prefix_bad_nested_key(populated_ctx):
    with pytest.raises(KeyError, match="cannot resolve"):
        populated_ctx.resolve_params({"x": "{steps.step1.output.nonexistent}"})


# ── Mixed syntax in one param dict ────────────────────────────

def test_mixed_syntax_in_params(populated_ctx):
    """Both ${} and {steps.} refs in the same dict resolve correctly."""
    params = {
        "a": "${step2.output}",
        "b": "{steps.step1.output.key}",
    }
    resolved = populated_ctx.resolve_params(params)
    assert resolved["a"] == "plain-string"
    assert resolved["b"] == "value"


def test_mixed_syntax_in_single_string(populated_ctx):
    """Both syntaxes embedded in a single string."""
    params = {"msg": "${step2.output} and {steps.step1.output.key}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["msg"] == "plain-string and value"


# ── Accessing non-output fields ───────────────────────────────

def test_access_status_field(populated_ctx):
    params = {"s": "${step1.status}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["s"] == StepStatus.SUCCESS


def test_access_status_via_steps_prefix(populated_ctx):
    params = {"s": "{steps.step1.status}"}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["s"] == StepStatus.SUCCESS


def test_access_error_field():
    ctx = ExecutionContext()
    ctx.record(
        StepResult(
            step_id="e", status=StepStatus.FAILED, error="something broke"
        )
    )
    params = {"err": "${e.error}"}
    resolved = ctx.resolve_params(params)
    assert resolved["err"] == "something broke"


def test_access_attempts_field():
    ctx = ExecutionContext()
    ctx.record(
        StepResult(step_id="r", status=StepStatus.FAILED, attempts=3)
    )
    assert ctx.resolve_params({"n": "${r.attempts}"})["n"] == 3


# ── List-index access ─────────────────────────────────────────

def test_list_index_access():
    ctx = ExecutionContext()
    ctx.record(
        StepResult(
            step_id="ls",
            status=StepStatus.SUCCESS,
            output=["alpha", "beta", "gamma"],
        )
    )
    assert ctx.resolve_params({"v": "${ls.output.1}"})["v"] == "beta"


# ── Nested params (dicts / lists) ─────────────────────────────

def test_resolve_nested_dict(populated_ctx):
    params = {"outer": {"inner": "${step2.output}"}}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["outer"]["inner"] == "plain-string"


def test_resolve_nested_list(populated_ctx):
    params = {"items": ["${step2.output}", "literal"]}
    resolved = populated_ctx.resolve_params(params)
    assert resolved["items"] == ["plain-string", "literal"]


# ── Error message quality ─────────────────────────────────────

def test_bad_single_segment_raises():
    ctx = ExecutionContext()
    with pytest.raises(KeyError, match="need at least"):
        ctx.resolve_params({"x": "${oops}"})


def test_bad_nested_field_message(populated_ctx):
    """Error message includes the traversal path for debugging."""
    with pytest.raises(KeyError, match="cannot resolve"):
        populated_ctx.resolve_params({"x": "${step1.output.nested.bad}"})
