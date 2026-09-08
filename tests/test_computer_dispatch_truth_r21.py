"""Partial native plans cannot borrow success from a measured pixel change."""

import pytest

from src.computer.effects import effect_receipt, execution_receipt, stroke_effect
from src.computer.runtime import x11_guardian as guardian
from tests.test_computer_dispatch_cleanup_r19 import plan, rig
from tests.test_computer_r19_effects import png, receipt


@pytest.mark.parametrize("expect", ["visual_change", "dialog_appeared", "window_gone"])
def test_real_effect_classifier_cannot_promote_partial_native_plan(expect):
    raw, observation = receipt(None)
    raw["diagnostics"] = {"steps_planned": 37, "steps_completed": 34, "reason": "complete"}
    result = effect_receipt(raw, observation, {"type": expect})
    stroke_effect(
        result,
        {"operation": "polyline", "points": [[20, 50], [150, 50]]},
        png(),
        png(lambda d: d.line([(20, 50), (150, 50)], fill="red", width=5)),
        binding_matches=True,
    )
    assert result["status"] == "interrupted"
    assert result["execution"]["released"]
    assert result["verification"]["status"] == "unavailable"


@pytest.mark.parametrize("status", ["executed", "verified", "not_satisfied"])
@pytest.mark.parametrize(
    "detail,reason",
    [
        ({"steps_planned": 37, "steps_completed": 34}, "complete"),
        ({"steps_planned": 37, "steps_completed": 38}, "complete"),
        ({"steps_planned": 37, "steps_completed": 37}, "input_dispatch_expired"),
        ({"reason": "lease-expired"}, None),
        ({"release": "unknown"}, "complete"),
    ],
)
def test_contradictory_native_success_is_interrupted(status, detail, reason):
    result = execution_receipt(
        {"released": True, "injected": True, "diagnostics": detail, "reason": reason},
        {"status": status, "verification": {"status": "satisfied"}},
    )
    assert result["status"] == "interrupted"
    assert result["execution"] == {"injected": True, "sent": True, "released": True}
    assert result["verification"]["status"] == "unavailable"
    assert result["diagnostics"]["next_action"] == "observe_and_reconcile"
    assert result["diagnostics"]["replay_allowed"] is False


@pytest.mark.parametrize("reason", [None, "complete", "completed"])
def test_complete_native_plan_preserves_measured_success(reason):
    result = execution_receipt(
        {
            "released": True,
            "injected": True,
            "reason": reason,
            "diagnostics": {"steps_planned": 37, "steps_completed": 37},
        },
        {"status": "verified", "verification": {"status": "satisfied"}},
    )
    assert result["status"] == "verified"


def test_stroke_pacing_does_not_accumulate_guard_latency(monkeypatch):
    native, helper, lease = rig(monkeypatch)

    def validate(step):
        if step[0] == "wait":
            helper.now[0] += 0.07

    lease.validate = validate
    receipt = lease.run(plan(native), paced=True)
    assert receipt["status"] == "executed"
    assert receipt["diagnostics"]["steps_completed"] == 35
    assert native.moves == [(i, i % 2) for i in range(17)]
    assert helper.now[0] < 1.4
    assert not native.buttons and helper.fenced
    assert lease.deadline == 2 and lease.dispatch_deadline == 1.75


def test_click_delays_remain_relative_to_native_validation(monkeypatch):
    native, helper, lease = rig(monkeypatch)

    def validate(step):
        if step[0] == "wait":
            helper.now[0] += 0.05

    lease.validate = validate
    steps = guardian.input_steps({"type": "double_click", "x": 5, "y": 5}, native)
    receipt = lease.run(steps)
    assert receipt["status"] == "executed"
    assert helper.now[0] >= 0.1 + 0.05 + 0.08
    assert not native.buttons and helper.fenced
