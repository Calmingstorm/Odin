"""Tests for core data types."""

from src.odin.types import PlanResult, StepResult, StepStatus


def test_step_result_duration():
    r = StepResult(step_id="x", status=StepStatus.SUCCESS, started_at=1.0, finished_at=3.5)
    assert r.duration == 2.5


def test_step_spec_frozen():
    from src.odin.types import StepSpec
    s = StepSpec(id="x", tool="shell")
    try:
        s.id = "y"  # type: ignore[misc]
        assert False, "Should be frozen"
    except AttributeError:
        pass


def test_plan_result_success_all_pass():
    pr = PlanResult(plan_name="t")
    pr.step_results["a"] = StepResult(step_id="a", status=StepStatus.SUCCESS)
    pr.step_results["b"] = StepResult(step_id="b", status=StepStatus.SUCCESS)
    assert pr.success is True


def test_plan_result_success_with_failure():
    pr = PlanResult(plan_name="t")
    pr.step_results["a"] = StepResult(step_id="a", status=StepStatus.SUCCESS)
    pr.step_results["b"] = StepResult(step_id="b", status=StepStatus.FAILED)
    assert pr.success is False


def test_plan_result_empty_is_not_success():
    pr = PlanResult(plan_name="t")
    assert pr.success is False


def test_plan_result_duration():
    pr = PlanResult(plan_name="t", started_at=10.0, finished_at=15.0)
    assert pr.duration == 5.0
