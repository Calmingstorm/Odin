"""Normal service and Discord loop classification, with synthetic OS I/O only."""

import json
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from tests.test_computer_hyprland_turnloop_r33 import action, call, observe, start
from tests.test_computer_hyprland_turnloop_r33 import normal as normal


def receipt():
    return {
        "status": "interrupted",
        "reason": "hyprland_dispatch_interrupted_after_release",
        "execution": {"injected": True, "released": True},
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("pixels", [False, True])
@pytest.mark.parametrize("status", ["not_satisfied", "interrupted"])
async def test_sequence_interruption_preserves_recovery_in_text_and_pixels(
        normal, monkeypatch, pixels, status):
    grant = await start(normal)
    await observe(normal, grant)
    request = action(normal, grant)
    controller = normal.service.controller
    next_action = "inspect_interruption_then_plan_new_action_ids"

    async def interrupted(context, values):
        result = {"status": status, "reason": "sequence_visual_target_changed",
                  "verification": {"status": "interrupted", "next_action": next_action},
                  "execution": {"injected": False, "released": True}}
        if pixels:
            result["next_observation"] = await controller.observe(context, grant)
        return result

    monkeypatch.setattr(controller, "act", interrupted)
    block = call("computer_act", **request)
    with normal.service.foreground(normal.state, block):
        delivered = await normal.service._tool(block.name, request)
    if pixels:
        receipt = delivered["__computer_action_receipt__"]
        assert receipt["status"] == "not_satisfied"
    else:
        assert delivered.ok is False
        assert delivered.uncertain_outcome is False
        assert delivered.error == "computer_not_satisfied"
        receipt = json.loads(delivered.output)
    assert receipt["next_action"] == next_action
    assert receipt["recoverable"] is True
    assert receipt["terminal"] is False


CONTRADICTIONS = [
    {}, {"held_input": True}, {"state": "quarantined"},
    {"terminal": True}, {"uncertain_outcome": True},
    {"cleanup": {"complete": False}}, {"state": "closed"},
    {"execution": {"released": False}}, {"execution": {"released": "true"}},
    {"verification": {"held_input": True}}, {"status": "unknown"},
    {"reason": "different_interruption"},
]


@pytest.mark.asyncio
@pytest.mark.parametrize("changes", CONTRADICTIONS)
async def test_service_clean_interruption_is_failed_not_unknown(normal, monkeypatch, changes):
    grant = await start(normal)
    await observe(normal, grant)
    request = action(normal, grant)
    result = {**receipt(), **deepcopy(changes)}
    monkeypatch.setattr(normal.service.controller, "act", AsyncMock(return_value=result))
    block = call("computer_act", **request)
    with normal.service.foreground(normal.state, block):
        delivered = await normal.service._tool(block.name, request)
    assert delivered.ok is False
    unsafe = bool(changes) and changes not in (
        {"state": "closed"}, {"reason": "different_interruption"},
    )
    assert delivered.uncertain_outcome is unsafe
    assert delivered.error == ("outcome_unknown" if unsafe else "computer_not_satisfied")


@pytest.mark.asyncio
@pytest.mark.parametrize("pixels", [False, True])
@pytest.mark.parametrize("held", [False, True])
async def test_normal_loop_settles_clean_interruption_without_unknown(
        normal, monkeypatch, pixels, held):
    grant = await start(normal)
    await observe(normal, grant)
    request = action(normal, grant)
    controller = normal.service.controller

    async def interrupted(context, values):
        result = receipt()
        if held:
            result["held_input"] = True
        if pixels:
            result["next_observation"] = await controller.observe(context, grant)
        return result

    monkeypatch.setattr(controller, "act", interrupted)
    normal.state.durability.after_tool = AsyncMock()
    normal.runner._audit_tool_outcome.reset_mock()
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **request))
    settled = normal.state.durability.after_tool.call_args.kwargs
    assert settled["ok"] is False
    assert settled["uncertain"] is held
    audited = normal.runner._audit_tool_outcome.call_args.args[6]
    assert audited.ok is False
    assert audited.uncertain_outcome is held
    assert audited.error == ("computer_not_satisfied" if pixels or not held else "outcome_unknown")
    assert "hyprland_dispatch_interrupted_after_release" in result["content"]
    if pixels:
        assert "Image loaded" in result["content"]
        assert not normal.state._computer_frame_error
        expected_status = "interrupted" if held else "not_satisfied"
        assert f'"status":"{expected_status}"' in result["content"]
        if not held:
            assert '"native_status":"interrupted"' in result["content"]
