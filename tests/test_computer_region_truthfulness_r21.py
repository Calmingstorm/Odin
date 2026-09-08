"""A later screenshot cannot erase failed native application/release evidence."""

from copy import deepcopy

import pytest

from src.computer.effects import region_effect
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_r19_effects import png, raster_result

EXPECTED = {"type": "region_changed", "x": 0, "y": 0, "width": 20, "height": 10}


@pytest.mark.parametrize("binding", [False, None])
def test_changed_region_cannot_replace_missing_native_application_evidence(binding):
    result = raster_result()
    result.update(status="not_satisfied")
    result["verification"].update(status="not_satisfied", target_application_matches=binding)
    previous = deepcopy(result)
    region_effect(
        result,
        EXPECTED,
        png(),
        png(lambda draw: draw.rectangle((0, 0, 19, 9), fill="red")),
        binding_matches=True,
    )
    assert result == previous


@pytest.mark.parametrize("fact", ["injected", "released"])
def test_changed_region_requires_acknowledged_execution_and_release(fact):
    result = raster_result()
    result["execution"][fact] = False
    previous = deepcopy(result)
    region_effect(
        result,
        EXPECTED,
        png(),
        png(lambda draw: draw.rectangle((0, 0, 19, 9), fill="red")),
        binding_matches=True,
    )
    assert result == previous


@pytest.mark.parametrize("changed", [False, True])
def test_bound_native_region_still_measures_requested_effect(changed):
    result = raster_result()
    region_effect(
        result,
        EXPECTED,
        png(),
        png(lambda draw: draw.rectangle((0, 0, 19, 9), fill="red")) if changed else png(),
        binding_matches=True,
    )
    assert result["status"] == ("verified" if changed else "not_satisfied")
    assert result["verification"]["scope"] == "region_raster_change_only"


async def test_native_app_mismatch_is_not_verified_by_controller_recapture(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, _state, calls):
        backend = controller._live[action["session_id"]].backend
        act = backend.act

        async def lose_native_application(payload):
            result = await act(payload)
            result["postcondition"]["target_application_matches"] = False
            return result

        monkeypatch.setattr(backend, "act", lose_native_application)
        action.update(operation="click", x=2, y=2, expect=EXPECTED)
        result = await controller.act(context, action)
        assert result["status"] != "verified"
        assert result["verification"]["target_application_matches"] is False
        assert result["execution"]["released"] is True
        replay = await controller.act(context, action)
        assert replay["status"] != "verified"
        assert len(calls) == 1
