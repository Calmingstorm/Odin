"""Compound isolated pixel regressions. Pure fakes, never open a display."""

import threading
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime.accessibility import PrimitiveError
from src.computer.runtime.backend import LinuxDesktopBackend, RuntimeFailure
from src.computer.runtime.isolated_pixels import IsolatedPixelInput, validate_field
from src.computer.runtime.protocol import pack_blob


def action(text="abc"):
    return {"type": "replace_field_pixels", "text": text,
            "region": {"x": 2, "y": 3, "width": 10, "height": 5}}


@pytest.mark.parametrize("text", ["", "a" * 512, "Hello é"])
def test_single_line_values(text):
    validate_field(action(text))


@pytest.mark.parametrize("text", ["a" * 513, "a\nb", "\t", "\x7f", "\ud800", None])
def test_invalid_text(text):
    with pytest.raises(PrimitiveError, match="invalid_text"):
        validate_field(action(text))


def helper(monkeypatch):
    events = []
    d = SimpleNamespace(_runner=None, _clock=lambda: 0, _deadline=1.75,
                        _guard=Mock(), _root_extent=(100, 100),
                        _point=lambda x, y: (x, y), _cancelled=threading.Event(),
                        _attempted=False, _injected=False)
    n = SimpleNamespace(_text_state=(0, 0, 0), _display=None, dispatch_check=None,
                        close=Mock(), _keyboard_id=lambda: 256)
    n.key_plan = Mock(side_effect=lambda mods, sym: [37, 38] if mods else [22])
    n.text_keys = Mock(return_value=[[56]])
    n._x = SimpleNamespace(
        XGetModifierMapping=lambda display: SimpleNamespace(
            contents=SimpleNamespace(max_keypermod=1, modifiermap=[0, 0, 37, 0, 0, 0, 0, 0])),
        XFreeModifiermap=Mock())
    monkeypatch.setattr("src.computer.runtime.x11_owned_device.ExistingXTest", lambda _: n)
    monkeypatch.setattr("src.computer.runtime.x11_owned_device._prove_modifier_effects", Mock())
    obj = IsolatedPixelInput(d)
    obj.check = Mock()
    for kind in ("move", "button", "key"):
        setattr(n, kind, lambda *args, kind=kind: events.append((kind, *args)))
    n.release_owned = lambda kind, code: events.append(("release", kind, code))
    n.owned_release_state = lambda: {"keys": set(), "buttons": set()}
    return obj, d, n, events


def test_whole_preflight_precedes_motion(monkeypatch):
    obj, d, n, events = helper(monkeypatch)
    n.text_keys.side_effect = RuntimeError("unsupported_character")
    with pytest.raises(RuntimeError):
        obj.execute(action())
    assert not events and not d._attempted
    assert obj.release() and n.close.called


def test_empty_clears_with_backspace_not_type(monkeypatch):
    obj, d, n, events = helper(monkeypatch)
    obj.execute(action(""))
    assert events == [("move", 6, 5), ("button", 1, True), ("button", 1, False),
                      ("key", 37, True), ("key", 38, True), ("key", 38, False),
                      ("key", 37, False), ("key", 22, True), ("key", 22, False)]
    assert not n.text_keys.called and d._injected
    assert obj.release()


def test_budget_rejects_before_motion(monkeypatch):
    obj, d, n, events = helper(monkeypatch)
    d._deadline = .1
    with pytest.raises(PrimitiveError, match="budget"):
        obj.execute(action())
    assert not events and not d._attempted


def test_failed_down_retained_and_released_no_replay(monkeypatch):
    obj, d, n, events = helper(monkeypatch)
    n.key = Mock(side_effect=RuntimeError("lost acknowledgement"))
    with pytest.raises(RuntimeError):
        obj.execute(action())
    assert obj.pending["key"] == {37}
    assert obj.release()
    assert events[-1] == ("release", "key", 37)
    assert n.key.call_count == 1


def test_raw_focus_change_refuses_before_other_native_queries():
    obj = object.__new__(IsolatedPixelInput)
    obj.desktop = SimpleNamespace(_guard=Mock(), _assert_field_window=Mock(),
                                  _pixel_focus_at_observation=42, _run=Mock(return_value="43"))
    obj.native = SimpleNamespace(physical_events=Mock())
    with pytest.raises(PrimitiveError, match="focus changed"):
        obj.check()
    assert not obj.native.physical_events.called


async def test_adapter_maps_complete_region_consumes_observation():
    b = LinuxDesktopBackend()
    sent = []

    async def rpc(op, **kwargs):
        if op == "observe":
            return {"observation": {"image": pack_blob(bytes(120 * 100 * 3)),
                    "raster_mode": "RGB", "width": 120, "height": 100,
                    "window": {"id": 17}, "observation_id": "worker-observation",
                    "source_revision": 1, "focused": True, "modal_id": None}}
        sent.append(kwargs["action"])
        return {"receipt": {"status": "executed", "injected": True, "released": True}}

    b._rpc = rpc
    frame = await b.observe(crop={"x": 10, "y": 20, "width": 50, "height": 50})
    inp = {**action(""), "source_id": frame.source.source_id, "source_revision": 1,
           "consent_generation": 1, "expected": {"type": "visual_change"}}
    receipt = await b.act(inp)
    assert sent[0]["region"] == {"x": 12, "y": 23, "width": 10, "height": 5}
    assert receipt["targeting_path"] == "explicit_pixel_region"
    with pytest.raises(RuntimeFailure):
        await b.act(inp)
    assert len(sent) == 1
