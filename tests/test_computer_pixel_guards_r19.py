"""Pixel plans preflight wholly; private state loss forbids dispatch, not cleanup."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime.accessibility import PrimitiveError
from src.computer.runtime.isolated_pixels import IsolatedPixelInput, validate_field
from src.computer.runtime.pixel_fields import pixel_field_bounds, pixel_field_steps
from tests.test_computer_isolated_pixels_r17 import action, helper


@pytest.mark.parametrize(
    "region",
    [
        None,
        {},
        {"x": 0, "y": 0, "width": True, "height": 1},
        {"x": 0, "y": 0, "width": 0, "height": 1},
        {"x": -1, "y": 0, "width": 1, "height": 1},
    ],
)
def test_private_region_validation_before_native_access(region):
    with pytest.raises(PrimitiveError, match="invalid_field_region"):
        validate_field(action() | {"region": region})


@pytest.mark.parametrize(
    "region",
    [
        None,
        {},
        {"x": 0, "y": 0, "width": True, "height": 1},
        {"x": 0, "y": 0, "width": 1, "height": 0},
    ],
)
def test_plan_invalid_region_never_resolves_keys(region):
    native = Mock()
    with pytest.raises(ValueError, match="invalid_point"):
        pixel_field_steps(action() | {"region": region}, native, error=ValueError)
    assert not native.mock_calls


@pytest.mark.parametrize(
    "rect,monitor,accepted",
    [
        ((2, 3, 10, 5), (2, 3, 10, 5), True),
        ((3, 3, 10, 5), (0, 0, 100, 100), False),
        ((0, 0, 100, 100), (2, 4, 10, 5), False),
        ((0, 0, 100, 100), (2, 3, 9, 5), False),
    ],
)
def test_entire_field_must_fit_both_window_and_monitor(rect, monitor, accepted):
    mon = SimpleNamespace(**dict(zip(("x", "y", "width", "height"), monitor, strict=True)))
    if accepted:
        assert pixel_field_bounds(action(), {"rect": rect}, mon, error=ValueError) is None
    else:
        with pytest.raises(ValueError, match="point_outside_application"):
            pixel_field_bounds(action(), {"rect": rect}, mon, error=ValueError)


@pytest.mark.parametrize("text", ["\n", "\t", "\ud800", "x" * 513, None])
def test_plan_invalid_text_never_resolves_keys(text):
    native = Mock()
    with pytest.raises(ValueError, match="invalid_text"):
        pixel_field_steps(action(text), native, error=ValueError)
    assert not native.mock_calls


def checked_input():
    obj = object.__new__(IsolatedPixelInput)
    obj.desktop = SimpleNamespace(
        _guard=Mock(),
        _assert_field_window=Mock(),
        _pixel_focus_at_observation=42,
        _run=Mock(return_value="42"),
        _pointer_target=Mock(return_value=True),
        _expected={"id": 42},
    )
    obj.held = {"keys": {37}, "buttons": set()}
    obj.modifier_masks = {37: 4}
    obj.point = (10, 20)
    state = {"base_mods": 4, "latched_mods": 0, "result": 0}

    def get_state(display, keyboard, pointer):
        pointer._obj.base_mods = state["base_mods"]
        pointer._obj.latched_mods = state["latched_mods"]
        return state["result"]

    obj.native = SimpleNamespace(
        physical_events=Mock(return_value=False),
        physical_seen=False,
        _assert_keyboard_mapping=Mock(),
        held=Mock(return_value=obj.held),
        physical_held=Mock(return_value={"keys": set(), "buttons": set()}),
        _x=SimpleNamespace(XkbGetState=Mock(side_effect=get_state)),
        _display=None,
        _keyboard_id=lambda: 256,
        pointer=Mock(return_value=obj.point),
    )
    return obj, state


def test_private_guard_accepts_only_exact_owned_modifiers_and_pointer():
    obj, _ = checked_input()
    obj.check()
    assert obj.desktop._guard.call_count == 2
    obj.desktop._assert_field_window.assert_called_once()
    obj.native._assert_keyboard_mapping.assert_called_once()


@pytest.mark.parametrize(
    "failure,reason",
    [
        ("physical_event", "Private input state changed"),
        ("physical_seen", "Private input state changed"),
        ("held", "Private input is busy or changed"),
        ("physical_held", "Private input is busy or changed"),
        ("xkb", "Private keyboard state unavailable"),
        ("base", "Private keyboard modifiers changed"),
        ("latched", "Private keyboard modifiers changed"),
        ("pointer", "Pixel field pointer target changed"),
        ("window", "Pixel field pointer target changed"),
    ],
)
def test_private_guard_rejects_unowned_state(failure, reason):
    obj, state = checked_input()
    if failure == "physical_event":
        obj.native.physical_events.return_value = True
    elif failure == "physical_seen":
        obj.native.physical_seen = True
    elif failure == "held":
        obj.native.held.return_value = {"keys": set(), "buttons": set()}
    elif failure == "physical_held":
        obj.native.physical_held.return_value = {"keys": {12}}
    elif failure == "xkb":
        state["result"] = 1
    elif failure == "base":
        state["base_mods"] = 0
    elif failure == "latched":
        state["latched_mods"] = 4
    elif failure == "pointer":
        obj.native.pointer.return_value = (11, 20)
    else:
        obj.desktop._pointer_target.return_value = False
    with pytest.raises(PrimitiveError, match=reason):
        obj.check()
    assert obj.desktop._guard.call_count == 1


def test_private_constructor_rejects_external_runner_before_opening_x(monkeypatch):
    native = Mock()
    monkeypatch.setattr("src.computer.runtime.x11_owned_device.ExistingXTest", native)
    with pytest.raises(PrimitiveError, match="private X authority"):
        IsolatedPixelInput(SimpleNamespace(_runner=Mock()))
    native.assert_not_called()


@pytest.mark.parametrize(
    "failure,reason",
    [
        ("extent", "Field outside observed source"),
        ("state", "Private keyboard state unavailable"),
        ("changed_state", "Private keyboard changed during preflight"),
        ("mapping", "Private modifier mapping unavailable"),
        ("mapping_shape", "Private modifier mapping unavailable"),
        ("ambiguous", "Ambiguous private modifier"),
    ],
)
def test_full_preflight_failure_prevents_any_motion(monkeypatch, failure, reason):
    obj, desktop, native, events = helper(monkeypatch)
    if failure == "extent":
        desktop._root_extent = (5, 5)
    elif failure == "state":
        native._text_state = None
    elif failure == "changed_state":

        def changed(text):
            native._text_state = (1, 0, 0)
            return [[56]]

        native.text_keys.side_effect = changed
    elif failure == "mapping":
        native._x.XGetModifierMapping = lambda display: None
    elif failure == "mapping_shape":
        native._x.XGetModifierMapping = lambda display: SimpleNamespace(
            contents=SimpleNamespace(max_keypermod=0)
        )
    else:
        native._x.XGetModifierMapping = lambda display: SimpleNamespace(
            contents=SimpleNamespace(max_keypermod=1, modifiermap=[37, 37, 0, 0, 0, 0, 0, 0])
        )
    with pytest.raises(PrimitiveError, match=reason):
        obj.execute(action())
    assert events == [] and desktop._attempted is False


@pytest.mark.parametrize("failure", ["exception", "still_held", "extra_held"])
def test_release_never_claims_success_or_closes_unconfirmed_ledger(monkeypatch, failure):
    obj, desktop, native, events = helper(monkeypatch)
    desktop._attempted = True
    obj.order = [("key", 37)]
    obj.pending["key"] = {37}
    if failure == "exception":
        native.release_owned = Mock(side_effect=RuntimeError("lost ack"))
    else:
        native.owned_release_state = lambda: {"keys": {37 if failure == "still_held" else 99}}
    assert obj.release() is False
    native.close.assert_not_called()
    assert native.dispatch_check is None
    if failure != "extra_held":
        assert obj.pending["key"] == {37}
    assert all(event[0] == "release" for event in events)
