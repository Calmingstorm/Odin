"""Released partial dispatch requires new pixels, never replay or release intervention."""
from types import SimpleNamespace

import pytest

from src.computer.effects import execution_receipt
from src.computer.error_guidance import failure_guidance


def receipt(**updates):
    return {
        "status": "interrupted",
        "reason": "hyprland_dispatch_interrupted_after_release",
        "released": True,
        "injected": True,
        "diagnostics": {"phase": "release", "steps_planned": 36, "steps_completed": 2},
        **updates,
    }


def test_normalized_clean_interruption_requests_fresh_observation():
    result = failure_guidance(execution_receipt(receipt(), {"status": "unknown"}))
    assert result["status"] == "interrupted"
    assert result["reason"] == "hyprland_dispatch_interrupted_after_release"
    assert result["execution"]["released"] is True
    assert result["next_action"] == "observe_and_reconcile"
    assert result["recoverable"] is True
    assert result["terminal"] is False
    assert result["replay_permitted"] is False
    assert "Never repeat" in result["instruction"]


@pytest.mark.parametrize("negative", [
    {"released": False}, {"release_confirmed": False}, {"terminal": True},
    {"uncertain_outcome": True}, {"state": "quarantined"},
    {"state": "unknown"},
    {"cleanup": {"complete": False}}, {"held_input": True},
])
def test_normalization_preserves_discontinuity_fence(negative):
    result = failure_guidance(execution_receipt(receipt(**negative), {"status": "unknown"}))
    assert result["terminal"] is True
    assert result["next_action"] == "operator_intervention_required"
    assert result["replay_permitted"] is False


def test_direct_clean_interrupted_receipt_is_recoverable():
    result = failure_guidance(receipt())
    assert result["next_action"] == "observe_fresh"


@pytest.mark.parametrize("release", [None, False, "true"])
def test_interrupted_without_boolean_release_proof_still_fences(release):
    assert failure_guidance(receipt(released=release))["terminal"] is True


def test_unknown_status_is_not_clean_interruption():
    assert failure_guidance(receipt(status="unknown"))["terminal"] is True


@pytest.mark.parametrize("negative", [
    {"status": "unknown"}, {"released": False}, {"terminal": True},
    {"held_input": True}, {"cleanup": {"complete": False}},
])
def test_nested_verification_contradictions_still_fence(negative):
    assert failure_guidance(receipt(verification=negative))["terminal"] is True


def test_explicit_terminal_parameter_still_fences():
    assert failure_guidance(receipt(), terminal=True)["terminal"] is True


@pytest.mark.parametrize("kind", ["visual_change", "region_changed", "dialog_appeared",
                                  "menu_appeared", "field_text_equals", "window_gone"])
@pytest.mark.parametrize("fact", ["held_input", "fresh_session_required"])
def test_all_effect_expectations_keep_safety_contradictions(kind, fact):
    from src.computer.effects import effect_receipt

    observation = SimpleNamespace(source=SimpleNamespace(
        source_id="source", source_revision=1, consent_generation=1))
    result = effect_receipt(receipt(**{fact: True}), observation, {"type": kind})
    assert result["verification"][fact] is True
    # Fresh session is a continuity requirement, not evidence of held input.
    assert failure_guidance(result)["terminal"] is (fact == "held_input")
