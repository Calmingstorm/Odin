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
