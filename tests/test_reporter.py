"""Tests for the Reporter formatting utilities."""

from __future__ import annotations

import json

from src.odin.reporter import Reporter
from src.odin.types import PlanResult, StepResult, StepStatus


def _make_result() -> PlanResult:
    r = PlanResult(plan_name="test-plan", started_at=100.0, finished_at=100.5)
    r.step_results["a"] = StepResult(
        step_id="a", status=StepStatus.SUCCESS, output="ok",
        started_at=100.0, finished_at=100.2, attempts=1,
    )
    r.step_results["b"] = StepResult(
        step_id="b", status=StepStatus.FAILED, error="boom",
        started_at=100.2, finished_at=100.5, attempts=2,
    )
    return r


def test_to_dict():
    d = Reporter.to_dict(_make_result())
    assert d["plan"] == "test-plan"
    assert d["success"] is False
    assert "a" in d["steps"]
    assert d["steps"]["a"]["status"] == "success"
    assert d["steps"]["b"]["status"] == "failed"


def test_to_json():
    j = Reporter.to_json(_make_result())
    parsed = json.loads(j)
    assert parsed["plan"] == "test-plan"


def test_to_summary():
    s = Reporter.to_summary(_make_result())
    assert "test-plan" in s
    assert "FAILED" in s
    assert "[OK]" in s
    assert "[FAIL]" in s
    assert "boom" in s
