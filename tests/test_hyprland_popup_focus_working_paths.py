"""Baseline working paths: real controller/backend/receipts, synthetic OS IPC.

These locks do not qualify native popup reception or live desktop behavior.
"""
# ruff: noqa: F811
from unittest.mock import AsyncMock, PropertyMock

import pytest

from src.computer.models import ComputerError
from src.computer.store import canonical_hash
from tests.computer.test_hyprland_backend import scope
from tests.test_computer_hyprland_turnloop_r33 import (
    NativeTransport,
    action,
    call,
    normal,  # noqa: F401 - shared composed fixture
    observe,
    start,
)
from tests.test_hyprland_multiturn_drawing import (
    clean,
    commands,
    drawing,  # noqa: F401 - shared composed fixture
    invoke,
    stroke,
)


def request(rig, grant, label, operation, **fields):
    result = action(rig, grant, label)
    result.pop("x")
    result.pop("y")
    result.update(operation=operation, **fields)
    return result


async def execute(rig, grant, inp):
    response = await rig.runner._run_one_tool(rig.state, call("computer_act", **inp))
    controller = rig.service.controller
    receipt = controller.store.receipt(grant["session_id"], inp["action_id"], canonical_hash(inp))
    assert receipt is not None, response
    return receipt, response


def focused_scope(*, dialog=False):
    return scope(surface_token="observed-color-dialog" if dialog else "observed-popup-member",
                 focus_digest="d" * 64, native_scope_serial=2,
                 modal=dialog, modal_kind="safe_application" if dialog else None,
                 modal_title_digest="e" * 64 if dialog else None)


@pytest.mark.parametrize("dialog,text", [(True, "#17a9df"), (False, "Airbrush")])
async def test_already_focused_field_real_encoder_and_receipt(normal, dialog, text):
    grant = await start(normal)
    backend = normal.service.controller._live[grant["session_id"]].backend
    backend._scope_provider.snapshot = AsyncMock(side_effect=lambda _: focused_scope(dialog=dialog))
    await observe(normal, grant)
    inp = request(normal, grant, "field", "replace_field_pixels",
                  region={"x": 1, "y": 1, "width": 3, "height": 3}, text=text)
    if dialog:
        inp["expected_modal"] = backend._frame.modal
    receipt, response = await execute(normal, grant, inp)
    assert receipt["status"] == "verified", response
    assert receipt["execution"]["injected"] is True
    assert receipt["execution"]["released"] is True
    assert len(normal.transports[0].commands) == 1
    wire = normal.transports[0].commands[0]
    assert wire.startswith("E ") and text.encode().hex() in wire
    assert "Image loaded" in response["content"]


@pytest.mark.parametrize("operation,fields,wire", [
    ("type", {"text": "42"}, "T 3432"), ("key", {"key": "Tab"}, "J Tab"),
])
async def test_keyboard_after_right_click_uses_fresh_popup_binding(
        normal, monkeypatch, operation, fields, wire):
    grant = await start(normal)
    await observe(normal, grant)
    original = NativeTransport.act
    backend = normal.service.controller._live[grant["session_id"]].backend

    async def right_click_opens_popup(self, command, **kwargs):
        result = await original(self, command, **kwargs)
        if command.startswith("P "):
            backend._scope_provider.snapshot = AsyncMock(side_effect=lambda _: focused_scope())
        return result

    monkeypatch.setattr(NativeTransport, "act", right_click_opens_popup)
    opening = action(normal, grant, "right-click")
    opening["operation"] = "right_click"
    await execute(normal, grant, opening)
    assert len(normal.transports[0].commands) == 1
    assert "273" in normal.transports[0].commands[0]
    await observe(normal, grant)
    inp = request(normal, grant, "popup-keyboard", operation, **fields)
    assert inp["observation_id"] != opening["observation_id"]
    receipt, response = await execute(normal, grant, inp)
    assert receipt["status"] == "verified", response
    assert receipt["execution"]["released"] is True
    assert normal.transports[0].commands[-1] == wire


@pytest.mark.parametrize("key", ["Escape", "Tab", "ctrl+n"])
async def test_observed_dialog_keyboard_chords(normal, key):
    grant = await start(normal)
    backend = normal.service.controller._live[grant["session_id"]].backend
    backend._scope_provider.snapshot = AsyncMock(side_effect=lambda _: focused_scope(dialog=True))
    await observe(normal, grant)
    inp = request(normal, grant, "dialog-key", "key", key=key,
                  expected_modal=backend._frame.modal)
    receipt, response = await execute(normal, grant, inp)
    assert receipt["status"] == "verified", response
    assert receipt["execution"]["released"] is True
    assert normal.transports[0].commands == [f"J {key}"]


async def test_polyline_then_fresh_polyline_and_duplicate_no_replay(drawing):
    await observe(drawing, drawing.grant)
    first = await stroke(drawing, "first-connected-shape")
    await stroke(drawing, "second-connected-shape")
    assert commands(drawing) == 2
    await invoke(drawing, "computer_act", **first)
    assert commands(drawing) == 2
    clean(drawing)


async def test_explicit_group_handshake_requires_new_modal_binding(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    backend = controller._live[grant["session_id"]].backend
    monkeypatch.setattr(type(backend), "application_window_group", PropertyMock(
        return_value={"identity": "captured-authenticated-group"}))
    old = action(normal, grant, "stale-main")
    backend._scope_provider.snapshot = AsyncMock(side_effect=lambda _: focused_scope(dialog=True))
    receipt, response = await execute(normal, grant, old)
    assert receipt["reason"] == "hyprland_application_group_target_changed", response
    assert receipt["execution"] == {"injected": False, "sent": False, "released": True}
    assert not normal.transports[0].commands
    fresh = request(normal, grant, "fresh-dialog", "key", key="Tab",
                    expected_modal=backend._frame.modal)
    assert fresh["observation_id"] != old["observation_id"]
    receipt, response = await execute(normal, grant, fresh)
    assert receipt["status"] == "verified", response
    assert normal.transports[0].commands == ["J Tab"]
    await execute(normal, grant, old)
    assert normal.transports[0].commands == ["J Tab"]
    assert controller.store.get_session(grant["session_id"]).state == "active"


@pytest.mark.parametrize("ack", [True, False])
async def test_clean_partial_field_recovery_never_replays(drawing, monkeypatch, ack):
    rig = drawing
    controller = rig.service.controller
    sid = rig.grant["session_id"]
    backend = controller._live[sid].backend
    await observe(rig, rig.grant)
    owner = controller.store.hyprland_owner(sid)
    original = NativeTransport.act

    async def partial(self, command, **kwargs):
        if command.startswith("E "):
            self.commands.append(command)
            error = ComputerError("synthetic_permit_refusal")
            error.details = {"input_was_sent": True, "diagnostics": {
                "phase": "release", "steps_planned": 19, "steps_completed": 5,
                "release": "confirmed", "reason": "cancelled"}}
            raise error
        return await original(self, command, **kwargs)

    close = backend._guardian.close

    async def clean_close():
        return {**await close(), "release_ack": ack, "release_confirmed": True}

    monkeypatch.setattr(NativeTransport, "act", partial)
    monkeypatch.setattr(backend._guardian, "close", clean_close)
    inp = request(rig, rig.grant, "partial", "replace_field_pixels",
                  region={"x": 1, "y": 1, "width": 3, "height": 3}, text="42")
    receipt, response = await execute(rig, rig.grant, inp)
    assert receipt["status"] == "interrupted", response
    assert receipt["reason"] == "hyprland_dispatch_interrupted_after_release"
    assert receipt["execution"]["released"] is True
    assert receipt["diagnostics"]["next_action"] == "observe_and_reconcile"
    assert controller.store.get_session(sid).state == "active"
    assert controller.store.hyprland_owner(sid) != owner
    await execute(rig, rig.grant, inp)
    assert commands(rig) == 1
    await observe(rig, rig.grant)
    await stroke(rig, "inspected-new-shape")
    assert commands(rig) == 2
    clean(rig)


async def test_shared_native_keyboard_sequence_tolerates_its_own_raster_changes(normal):
    grant = await start(normal)
    await observe(normal, grant)
    inp = request(normal, grant, "keyboard-plan", "sequence", steps=[
        {"action_id": "select", "operation": "key", "key": "ctrl+a",
         "expect": {"type": "visual_change"}},
        {"action_id": "enter", "operation": "type", "text": "42",
         "expect": {"type": "visual_change"}},
        {"action_id": "commit", "operation": "key", "key": "Tab",
         "expect": {"type": "visual_change"}},
    ])
    inp.pop("expect")
    receipt, response = await execute(normal, grant, inp)
    assert receipt["status"] == "verified", response
    assert receipt["execution"]["completed_steps"] == 3
    assert receipt["execution"]["released"] is True
    assert normal.transports[0].commands == ["J ctrl+a", "T 3432", "J Tab"]
    await execute(normal, grant, inp)
    assert len(normal.transports[0].commands) == 3
