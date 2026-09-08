"""Exercise independent effect contracts, not injected backend verdicts."""

import pytest

from src.computer.effects import (
    effect_receipt,
    execution_receipt,
    expectation_arguments,
    region_effect,
)
from src.computer.models import ComputerError
from tests.test_computer_r19_effects import png, raster_result, receipt


@pytest.mark.parametrize(
    "expected",
    [
        {"type": "visual_change"},
        {"type": "pointer_at", "x": 0, "y": 4},
        {"type": "region_changed", "x": 1, "y": 2, "width": 3, "height": 4},
        {"type": "field_text_equals", "target": "native-handle", "text": "blue"},
    ],
)
def test_valid_effect_contract(expected):
    expectation_arguments(expected)


@pytest.mark.parametrize(
    "expected",
    [
        {"type": "semantic_guess"},
        {"type": []},
        {"type": "field_text_equals", "target": "native-handle", "text": "\x00"},
        {"type": "field_text_equals", "target": "native-handle", "text": "\ud800"},
        {"type": "field_text_equals", "target": "bad handle", "text": "blue"},
    ],
)
def test_invalid_contract_fails_closed(expected):
    with pytest.raises(ComputerError):
        expectation_arguments(expected)


def test_partial_dispatch_retains_counts_without_semantic_identity():
    result = execution_receipt(
        {
            "released": True,
            "injected": True,
            "reason": "input_dispatch_expired",
            "targeting_path": "explicit_pixel_region",
            "diagnostics": {"phase": "dispatch", "steps_planned": 35, "steps_completed": 1},
        },
        {"status": "unknown"},
    )
    assert result["status"] == "interrupted"
    assert result["diagnostics"]["steps_completed"] == 1
    assert result["targeting"]["text_readback"] is False


@pytest.mark.parametrize(
    "state,satisfied", [("destroyed", True), ("unmapped", True), ("viewable", False)]
)
def test_native_window_state_contract(state, satisfied):
    raw, obs = receipt(None)
    raw["postcondition"].update(
        target_state=state, target_state_method="native_window_state_after_release"
    )
    result = effect_receipt(raw, obs, {"type": "window_gone"})
    assert result["verification"]["target_disappeared"] is satisfied


@pytest.mark.parametrize("actual,status", [("blue", "verified"), ("red", "not_satisfied")])
def test_field_exact_native_readback(actual, status):
    raw, obs = receipt(None)
    raw["postcondition"].update(
        type="field_text_equals",
        target="handle",
        method="accessibility_text_after_release",
        actual={"text": actual, "text_complete": True},
    )
    result = effect_receipt(
        raw, obs, {"type": "field_text_equals", "target": "handle", "text": "blue"}
    )
    assert result["status"] == status


def test_field_refusal_stays_unavailable():
    raw, obs = receipt(None)
    raw.update(status="unavailable", injected=False)
    assert (
        effect_receipt(raw, obs, {"type": "field_text_equals", "target": "handle", "text": "blue"})[
            "status"
        ]
        == "unavailable"
    )


def test_region_measurement_and_geometry_guard():
    result = raster_result()
    expected = {"type": "region_changed", "x": 20, "y": 40, "width": 140, "height": 20}
    before, after = png(), png(lambda d: d.line([(20, 50), (150, 50)], fill="red", width=5))
    region_effect(result, expected, before, after, binding_matches=True)
    assert result["status"] == "verified"
    region_effect(result, expected, before, before, binding_matches=True)
    assert result["status"] == "not_satisfied"
    with pytest.raises(ComputerError, match="postcondition_region_changed_geometry"):
        region_effect(result, expected, before, png(size=(10, 10)), binding_matches=True)
    region_effect(result, expected, None, None, binding_matches=False)
