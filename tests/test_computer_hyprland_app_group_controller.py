"""Same-application target handshake through real tool dispatch, synthetic OS IO."""

from unittest.mock import AsyncMock, PropertyMock

import pytest

from src.computer.error_guidance import guidance
from src.computer.store import canonical_hash
from tests.computer.test_hyprland_backend import scope
from tests.test_computer_hyprland_turnloop_r33 import action, call, normal, observe, start

__all__ = ["normal"]


def dialog_scope():
    return scope(surface_token="200", native_scope_serial=2, focus_digest="d" * 64,
                 wm_class="color-dialog", modal=True, modal_kind="safe_application",
                 modal_title_digest="e" * 64)


async def test_sibling_target_change_delivers_new_binding_without_refocus_or_pause(
    normal, monkeypatch,
):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    runtime = controller._live[grant["session_id"]].backend
    monkeypatch.setattr(type(runtime), "application_window_group", PropertyMock(
        return_value={"identity": "captured-authenticated-group"}), raising=False)
    runtime.recover_focus = AsyncMock(return_value=True)
    old = action(normal, grant, "old-main-binding")
    runtime._scope_provider.snapshot = AsyncMock(side_effect=lambda _: dialog_scope())
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert "Image loaded" in result["content"], result
    receipt = controller.store.receipt(grant["session_id"], old["action_id"], canonical_hash(old))
    assert receipt["reason"] == "hyprland_application_group_target_changed"
    assert receipt["execution"] == {"injected": False, "sent": False, "released": True}
    assert not normal.transports[0].commands
    runtime.recover_focus.assert_not_awaited()
    assert controller.store.get_session(grant["session_id"]).state == "active"
    assert controller.store.get_recovery_pending(grant["session_id"]) is None
    assert not runtime._paused
    new = action(normal, grant, "fresh-dialog-binding")
    assert new["observation_id"] != old["observation_id"]
    new.update(operation="key", key="Tab", expected_modal=runtime._frame.modal)
    new.pop("x")
    new.pop("y")
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **new))
    assert "Image loaded" in result["content"], result
    assert len(normal.transports[0].commands) == 1
    await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert len(normal.transports[0].commands) == 1


@pytest.mark.parametrize("expected", [None, "wrong-modal"])
async def test_missing_or_old_modal_binding_never_pauses_clean_hyprland(normal, expected):
    grant = await start(normal)
    controller = normal.service.controller
    runtime = controller._live[grant["session_id"]].backend
    runtime._scope_provider.snapshot = AsyncMock(side_effect=lambda _: dialog_scope())
    await observe(normal, grant)
    request = action(normal, grant, "unacknowledged-dialog")
    if expected is not None:
        request["expected_modal"] = expected
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **request))
    assert "hyprland_fresh_modal_binding_required" in result["content"], result
    assert not normal.transports[0].commands
    assert controller.store.get_session(grant["session_id"]).state == "active"
    assert controller.store.get_recovery_pending(grant["session_id"]) is None
    assert not runtime._paused


async def test_native_prepare_delivers_new_pixels_without_original_click(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    runtime = controller._live[grant["session_id"]].backend
    monkeypatch.setattr(type(runtime), "application_window_group", PropertyMock(
        return_value={"identity": "captured-authenticated-group"}), raising=False)
    old = action(normal, grant, "prepare-existing-dialog")

    async def prepare_only(_):
        runtime._scope_provider.snapshot = AsyncMock(side_effect=lambda _: dialog_scope())
        return {
            "status": "unavailable", "injected": False, "released": True,
            "reason": "hyprland_application_group_target_changed",
            "release_basis": "not_required_no_input_sent",
            "diagnostics": {"phase": "preflight"},
        }

    runtime.act = AsyncMock(side_effect=prepare_only)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert "Image loaded" in result["content"], result
    assert not normal.transports[0].commands
    assert controller.store.get_session(grant["session_id"]).state == "active"
    assert controller.store.get_recovery_pending(grant["session_id"]) is None
    assert action(normal, grant)["observation_id"] != old["observation_id"]
    await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    runtime.act.assert_awaited_once()


@pytest.mark.parametrize("reason", [
    "hyprland_application_group_target_changed", "hyprland_fresh_modal_binding_required",
    "hyprland_fresh_observation_required",
])
def test_group_handshake_guidance_never_replays_or_requires_release_intervention(reason):
    result = guidance(reason, safe_receipt=True)
    assert result["recoverable"] and not result["terminal"]
    assert result["replay_permitted"] is False
    assert guidance(reason, terminal=True)["terminal"]


@pytest.mark.parametrize("changed", ["valid", "same", "foreign", "release", "binding", "partial"])
def test_member_transition_evidence_is_bound_and_never_claims_new_dialog(changed):
    from src.computer.effects import effect_receipt, measured_appearance
    from tests.test_computer_r19_effects import receipt

    raw, observation = receipt(None)
    raw["postcondition"]["application_group_transition"] = {
        "method": "native_application_group_member_transition", "before": "old", "after": "new",
    }
    if changed == "same":
        raw["postcondition"]["application_group_transition"]["after"] = "old"
    elif changed == "foreign":
        raw["postcondition"]["target_application_matches"] = False
    elif changed == "release":
        raw["released"] = False
    elif changed == "binding":
        raw["postcondition"]["source_revision"] = 2
    elif changed == "partial":
        raw["diagnostics"] = {"steps_planned": 3, "steps_completed": 1}
    result = effect_receipt(raw, observation, {"type": "visual_change"})
    transition = result["verification"].get("application_group_transition")
    assert bool(transition) is (changed == "valid")
    assert not measured_appearance(result)
    if transition:
        assert transition["newly_mapped"] == "unmeasured"
        assert "before" not in transition and "after" not in transition


@pytest.mark.parametrize("released", [True, False])
def test_native_preinput_target_reason_survives_effects_but_never_hides_release(released):
    from src.computer.effects import effect_receipt
    from src.computer.error_guidance import failure_guidance
    from tests.test_computer_r19_effects import receipt

    raw, observation = receipt(None)
    raw.update(status="unavailable", injected=False, released=released,
               reason="hyprland_application_group_target_layer_surface",
               diagnostics={"phase": "preflight"})
    result = failure_guidance(effect_receipt(raw, observation, {"type": "visual_change"}))
    assert result["recoverable"] is released
    assert result["terminal"] is not released
    assert result["replay_permitted"] is False
    assert result["reason"] == ("hyprland_application_group_target_layer_surface"
                                if released else "input_release_unknown")
