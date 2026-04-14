"""Tests for core data types."""

from src.odin.types import PlanResult, StepResult, StepStatus


def test_step_result_defaults():
    r = StepResult(status=StepStatus.SUCCESS)
    assert r.duration == 0.0
    assert r.attempts == 1
    assert r.output is None
    assert r.error is None


def test_step_result_with_duration():
    r = StepResult(status=StepStatus.SUCCESS, duration=2.5, attempts=3)
    assert r.duration == 2.5
    assert r.attempts == 3


def test_step_spec_frozen():
    from src.odin.types import StepSpec
    s = StepSpec(id="x", tool="shell")
    try:
        s.id = "y"  # type: ignore[misc]
        assert False, "Should be frozen"
    except AttributeError:
        pass


def test_plan_result_success_all_pass():
    pr = PlanResult(name="t", success=True)
    pr.steps["a"] = StepResult(status=StepStatus.SUCCESS)
    pr.steps["b"] = StepResult(status=StepStatus.SUCCESS)
    assert pr.success is True


def test_plan_result_explicit_failure():
    pr = PlanResult(name="t", success=False)
    pr.steps["a"] = StepResult(status=StepStatus.SUCCESS)
    pr.steps["b"] = StepResult(status=StepStatus.FAILED, error="boom")
    assert pr.success is False


def test_plan_result_empty():
    pr = PlanResult(name="t", success=True)
    assert len(pr.steps) == 0


def test_plan_result_steps_dict():
    pr = PlanResult(name="t", success=True)
    pr.steps["a"] = StepResult(status=StepStatus.SUCCESS, duration=5.0)
    assert pr.steps["a"].duration == 5.0
