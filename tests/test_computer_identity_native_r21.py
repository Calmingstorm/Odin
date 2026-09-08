"""Native field guards exercised with fake devices, real identity validation."""

import threading
from types import SimpleNamespace

import pytest

from src.computer.runtime.accessibility import PrimitiveError
from tests.test_computer_runtime_primitives import Node, accessibility, ready


class Field(Node):
    def __init__(self):
        super().__init__(name="Colour", role="entry")
        self.text = "old"

    def get_text_iface(self):
        return SimpleNamespace(
            get_character_count=lambda: len(self.text),
            get_text=lambda start, end: self.text[start:end],
        )

    def get_editable_text_iface(self):
        def set_text(text):
            self.calls.append(("set_text", text))
            self.text = text
            return True

        return SimpleNamespace(set_text_contents=set_text)


@pytest.mark.parametrize("change", [None, "node", "ancestry", "focus", "extent", "pointer"])
def test_native_identity_not_unrelated_raster_is_authority(change):
    target = Field()
    a11y, root = accessibility([target])
    desktop, observation = ready(accessibility_backend=a11y)
    runner = desktop._runner
    desktop._runner = lambda argv, **kwargs: (
        "120 100" if argv[1] == "getdisplaygeometry" else runner(argv, **kwargs)
    )
    desktop._capture = lambda: (bytes(120 * 100 * 3), 120, 100, "RGB")
    desktop._root_extent = (120, 100)
    observation = desktop.snapshot(packed=True)
    handle = observation["accessibility"][1]["handle"]
    action = {
        "type": "replace_field",
        "target": handle,
        "text": "new",
        "source_revision": observation["source_revision"],
        "expected_window": observation["window"],
        "observation_id": observation["observation_id"],
        "expected": {"type": "field_text_equals", "target": handle, "text": "new"},
    }
    capture = desktop._capture

    def changed_pixels():
        pixels, width, height, mode = capture()
        return b"\x01" + pixels[1:], width + (change == "extent"), height, mode

    desktop._capture = changed_pixels
    if change == "node":
        target.name = "Changed"
    elif change == "ancestry":
        target.parent = None
    elif change == "focus":
        desktop.commands.focus = 99
    elif change == "pointer":
        action = {k: v for k, v in action.items() if k not in {"target", "text"}}
        action.update(type="click", x=25, y=26, expected={"type": "pointer_at", "x": 25, "y": 26})
    if change in {"extent", "pointer"}:
        with pytest.raises(PrimitiveError, match="Private pixels changed"):
            desktop.grounded_execute(action, threading.Event())
    else:
        receipt = desktop.grounded_execute(action, threading.Event())
        assert receipt["injected"] is (change is None)
        assert target.calls == ([("set_text", "new")] if change is None else [])
    with pytest.raises(PrimitiveError, match="Stale"):
        desktop.grounded_execute(action, threading.Event())
