"""Display-free public action, crop and private primitive contracts."""

from threading import Event

import pytest
from jsonschema import Draft202012Validator

from src.computer.gui_actions import action_arguments, crop_arguments
from src.computer.models import ComputerError
from src.computer.runtime.primitives import NativeDesktop, parse_key_chord
from src.tools.defs.computer import computer_definitions


def request(operation, **fields):
    return dict(session_id="session", generation=1, consent_generation=1, source_id="source",
                source_revision=1, action_id="action", observation_id="observation",
                operation=operation, expect={"type": "visual_change"}, **fields)


@pytest.mark.parametrize("key", ["ctrl+alt+t", "Super_L", "F24", "XF86AudioMute",
                                  "super+shift+alt+ctrl+Greek_alpha", "U1F600"])
def test_generic_chords_not_an_enum(key):
    action_arguments(request("key", key=key))
    assert parse_key_chord(key)[1] == key.split("+")[-1]


@pytest.mark.parametrize("key", ["", "ctrl+ctrl+a", "ctrl+alt+ctrl+a", "CTRL+a", "--window",
                                  "a b", "a\n", "ctrl+", "a;b", "a" * 129, None, True])
def test_chord_schema_matches_validation(key):
    inp = request("key", key=key)
    assert not Draft202012Validator(computer_definitions()[2]["input_schema"]).is_valid(inp)
    with pytest.raises(ComputerError):
        action_arguments(inp)


@pytest.mark.parametrize("direction", ["up", "down", "left", "right"])
@pytest.mark.parametrize("count", [1, 20])
def test_scroll_exact_shape(direction, count):
    inp = request("scroll", x=1, y=2, direction=direction, count=count)
    action_arguments(inp)
    schema = Draft202012Validator(computer_definitions()[2]["input_schema"])
    assert schema.is_valid(inp)
    for bad in [{**inp, "delta": 1}, {**inp, "text": "stray"},
                {**inp, "count": 0}, {**inp, "count": 21}, {**inp, "direction": "north"}]:
        assert not schema.is_valid(bad)
        with pytest.raises(ComputerError):
            action_arguments(bad)


def test_crop_contract_and_extent():
    crop = dict(x=3840, y=0, width=3440, height=1440)
    assert crop_arguments(crop, 7280, 1440) == crop
    schema = Draft202012Validator(computer_definitions()[1]["input_schema"]["properties"]["crop"])
    assert schema.is_valid(crop)
    with pytest.raises(ComputerError):
        crop_arguments(crop, 3840, 1440)
    for bad in [{**crop, "x": -1}, {**crop, "x": True}, {**crop, "height": 0},
                {**crop, "width": 1.5}, {**crop, "extra": 1}, {"x": 0}, None]:
        assert not schema.is_valid(bad)
        with pytest.raises(ComputerError):
            crop_arguments(bad)


@pytest.mark.parametrize("operation,fields,button,count", [
    ("double_click", {}, 1, 2), ("right_click", {}, 3, 1), ("middle_click", {}, 2, 1),
    ("scroll", {"direction": "up", "count": 2}, 4, 2),
    ("scroll", {"direction": "down", "count": 2}, 5, 2),
    ("scroll", {"direction": "left", "count": 2}, 6, 2),
    ("scroll", {"direction": "right", "count": 2}, 7, 2),
])
def test_private_button_routing_without_display(operation, fields, button, count):
    desktop = NativeDesktop(command_runner=lambda *a, **kw: "")
    desktop._expected = dict(x=0, y=0, width=100, height=100)
    desktop._cancelled = Event()
    calls = []
    desktop._guard = lambda: None
    desktop._pointer = lambda *p: None
    desktop._input = lambda *args: calls.append(args)
    desktop._run = lambda *args: calls.append(args)
    desktop._physical(dict(type=operation, x=10, y=20, **fields))
    assert calls[0] == ("mousemove", 10, 20)
    assert calls.count(("mousedown", button)) == count
    assert calls.count(("mouseup", button)) == count
    assert not desktop._buttons
