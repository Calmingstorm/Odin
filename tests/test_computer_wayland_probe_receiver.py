"""Receiver unit coverage: fake GTK only, never connect a human GUI session."""

import builtins
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ASSET = (Path(__file__).resolve().parents[1] / "src/computer/runtime/assets"
         / "wayland_probe_receiver.py")
spec = importlib.util.spec_from_file_location("probe_receiver_unit", ASSET)
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


@pytest.fixture(autouse=True)
def no_native_gi(monkeypatch):
    original = builtins.__import__
    original_dynamic = importlib.import_module

    def safe_import(name, *args, **kwargs):
        if name == "gi" or name.startswith("gi."):
            raise AssertionError("Tests must not import real GI")
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", safe_import)

    def safe_dynamic(name, *args, **kwargs):
        if name == "gi" or name.startswith("gi."):
            raise AssertionError("Tests must not import real GI")
        return original_dynamic(name, *args, **kwargs)

    monkeypatch.setattr(importlib, "import_module", safe_dynamic)


class Widget:
    def __init__(self, **kwargs):
        self.calls = []
        self.signals = {}
        self.surface = SimpleNamespace(get_device_position=lambda _pointer: (None, 250, 250, 256))
        self.active = self.focused = True

    def connect(self, name, callback):
        self.signals[name] = callback

    def get_window(self):
        return self.surface

    def is_active(self):
        return self.active

    def has_toplevel_focus(self):
        return self.focused

    def has_focus(self):
        return self.focused

    def __getattr__(self, name):
        return lambda *args: self.calls.append((name, args))


@pytest.fixture
def app():
    records, timers, idle, lifecycle = [], [], [], []
    gtk = SimpleNamespace(Window=Widget, DrawingArea=Widget,
                          main=lambda: lifecycle.append("main"),
                          main_quit=lambda: lifecycle.append("quit"))
    gdk = SimpleNamespace(EventMask=SimpleNamespace(
        BUTTON_PRESS_MASK=1, BUTTON_RELEASE_MASK=2, KEY_PRESS_MASK=4,
        KEY_RELEASE_MASK=8, POINTER_MOTION_MASK=16, FOCUS_CHANGE_MASK=32),
        EventType=SimpleNamespace(BUTTON_PRESS="press"))
    glib = SimpleNamespace(timeout_add=lambda *args: timers.append(args),
                           timeout_add_seconds=lambda *args: timers.append(args),
                           idle_add=lambda *args: idle.append(args))
    display = SimpleNamespace(
        get_default_seat=lambda: SimpleNamespace(get_pointer=lambda: object()))
    instance = receiver.Receiver(gtk, gdk, glib, display,
                                 output=lambda kind, **data: records.append({"kind": kind, **data}))
    return SimpleNamespace(instance=instance, records=records, timers=timers,
                           idle=idle, lifecycle=lifecycle)


def event(*, key=97, button=1, code=38, kind="press", valid=True):
    return SimpleNamespace(type=kind, get_keyval=lambda: (valid, key),
                           get_button=lambda: (valid, button),
                           get_keycode=lambda: (valid, code))


def test_typed_union_fields_are_integers_not_union_objects():
    ev = event(button=3)
    ev.button = object()
    assert receiver.typed_event(ev, button_event=True) == {"key": None, "button": 3}
    assert receiver.typed_event(ev, key_event=True) == {"key": 97, "button": None}
    with pytest.raises(ValueError, match="get_button"):
        receiver.typed_event(event(valid=False), button_event=True)


def test_actual_callbacks_preserve_exact_pressed_ledger(app):
    obj = app.instance
    obj.area.signals["button-press-event"](None, event(button=1))
    obj.area.signals["button-press-event"](None, event(button=3))
    obj.win.signals["key-press-event"](None, event(key=65505, code=50))
    obj.win.signals["key-press-event"](None, event(key=97))
    obj.win.signals["key-press-event"](None, event(key=97))
    assert obj.ledger() == {"keys": [97, 65505], "buttons": [1, 3]}
    obj.win.signals["key-release-event"](None, event(key=65505, code=50))
    # Keyval changes with modifiers, but hardware release still clears it.
    obj.win.signals["key-release-event"](None, event(key=65))
    obj.area.signals["button-release-event"](None, event(button=1))
    assert app.records[-1] == {"kind": "event", "type": "button_release",
                               "key": None, "button": 1, "keys": [], "buttons": [3]}
    obj.area.signals["button-release-event"](None, event(button=3))
    assert obj.ledger() == {"keys": [], "buttons": []}


def test_double_click_notice_is_not_a_second_physical_press(app):
    assert app.instance.on_button_press(None, event(kind="double")) is False
    assert not app.records


def test_sample_uses_real_pointer_mask_and_focus_without_clearing_ledger(app):
    obj = app.instance
    obj.on_button_press(None, event())
    obj.win.active = False
    obj.area.focused = False
    assert obj.sample() is True
    assert app.records[-1] == {"kind": "sample", "active": False, "focused": False,
                               "toplevel_focus": True, "pointer_x": 250, "pointer_y": 250,
                               "state": 256, "keys": [], "buttons": [1],
                               "state_source":
                                   "Gdk.Window.get_device_position(default_seat.pointer)"}
    obj.win.focused = False
    obj.area.focused = True
    obj.sample()
    assert app.records[-1]["focused"] is False
    assert obj.buttons == {1}


@pytest.mark.parametrize("failure", ["window", "seat", "pointer", "shape", "mask", "raises"])
def test_sample_failure_is_explicit_never_fabricated_zero_state(app, failure):
    obj = app.instance
    if failure == "window":
        obj.win.surface = None
    elif failure == "seat":
        obj.display.get_default_seat = lambda: None
    elif failure == "pointer":
        obj.display.get_default_seat = lambda: SimpleNamespace(get_pointer=lambda: None)
    elif failure == "shape":
        obj.win.surface.get_device_position = lambda _: ()
    elif failure == "mask":
        obj.win.surface.get_device_position = lambda _: (None, 250, 250, None)
    else:
        def broken(_pointer):
            raise RuntimeError("telemetry unavailable")
        obj.win.surface.get_device_position = broken
    assert obj.sample() is False
    assert app.records[0]["kind"] == "error"
    assert app.records[0]["where"] == "sample"
    assert "state" not in app.records[0]
    assert app.lifecycle == ["quit"]
    assert obj.failed
    assert obj.sample() is False
    assert len(app.records) == 1


def test_bad_event_fails_and_stops_without_emitting_event(app):
    app.instance.on_key_press(None, event(valid=False))
    assert [row["kind"] for row in app.records] == ["error"]
    assert app.instance.run() == 1


def test_missing_hardware_keycode_is_explicit_error(app):
    ev = event()
    ev.get_keycode = lambda: (False, 0)
    app.instance.on_key_press(None, ev)
    assert app.records[-1]["kind"] == "error"
    assert "get_keycode" in app.records[-1]["reason"]
    assert app.instance.ledger() == {"keys": [], "buttons": []}


def test_readiness_only_after_mapping_and_bounded_timers(app):
    obj = app.instance
    assert not app.records
    assert obj.run() == 0
    assert ("set_default_size", (800, 600)) in obj.win.calls
    assert ("set_size_request", (800, 600)) in obj.area.calls
    assert ("fullscreen", ()) in obj.win.calls
    assert ("present", ()) in obj.win.calls
    assert app.timers == [(55, obj.expire)]
    assert obj.on_map(None, None) is False
    app.idle[0][0]()
    assert app.records[0]["kind"] == "receiver_ready"
    assert app.records[0]["backend"] == "wayland"
    assert app.timers[-1] == (100, obj.sample)
    obj.on_ready()
    assert len(app.records) == 1
    obj.expire()
    assert app.records[-1]["kind"] == "receiver_stopped"
    assert app.lifecycle[-1] == "quit"


def test_ready_missing_surface_is_error_not_ready(app):
    app.instance.area.surface = None
    app.instance.on_ready()
    assert [row["kind"] for row in app.records] == ["error"]


def test_stdout_contract_contains_pid_and_monotonic(capsys):
    receiver.emit("sample", active=True, focused=True, keys=[97], buttons=[1], state=256)
    payload = json.loads(capsys.readouterr().out)
    assert payload["kind"] == "sample"
    assert isinstance(payload["pid"], int) and payload["pid"] > 0
    assert isinstance(payload["monotonic"], float) and payload["monotonic"] > 0


def test_guard_must_pass_before_any_graphical_import(monkeypatch, capsys):
    calls = []

    def denied():
        calls.append("guard")
        raise PermissionError("private marker absent")

    monkeypatch.setitem(sys.modules, "wayland_probe_private",
                        SimpleNamespace(assert_private_environment=denied))
    monkeypatch.setattr(sys, "argv", [str(ASSET)])
    monkeypatch.setattr(receiver.signal, "signal", lambda *args: None)
    monkeypatch.setattr(receiver.signal, "alarm", lambda seconds: calls.append(seconds))
    monkeypatch.setattr(receiver, "initialize_gtk", lambda: pytest.fail("guard bypass"))
    assert receiver.main() == 1
    assert calls == [60, "guard", 0]
    assert json.loads(capsys.readouterr().out)["kind"] == "error"


def test_arbitrary_cli_configuration_refused_before_guard(monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", [str(ASSET), "--display=:0"])
    monkeypatch.setattr(receiver.signal, "signal", lambda *args: pytest.fail("started watchdog"))
    assert receiver.main() == 2
    assert json.loads(capsys.readouterr().out)["where"] == "arguments"


def test_guard_then_gui_order_and_watchdog_cleanup(monkeypatch, app):
    calls = []
    monkeypatch.setitem(sys.modules, "wayland_probe_private",
                        SimpleNamespace(assert_private_environment=lambda: calls.append("guard")))
    monkeypatch.setattr(sys, "argv", [str(ASSET)])
    monkeypatch.setattr(receiver.signal, "signal", lambda *args: None)
    monkeypatch.setattr(receiver.signal, "alarm", lambda seconds: calls.append(seconds))
    monkeypatch.setattr(receiver, "initialize_gtk", lambda: calls.append("gui") or ())
    monkeypatch.setattr(receiver, "Receiver", lambda: app.instance)
    assert receiver.main() == 0
    assert calls == [60, "guard", "gui", 0]


@pytest.mark.parametrize("native,initialized", [(True, True), (False, True), (True, False)])
def test_native_wayland_required_no_x_fallback(monkeypatch, native, initialized):
    calls = []

    class WaylandDisplay:
        __gtype__ = SimpleNamespace(name="GdkWaylandDisplay")

    display = WaylandDisplay() if native else object()
    fake = SimpleNamespace(
        Gdk=SimpleNamespace(set_allowed_backends=lambda value: calls.append(value),
                            Display=SimpleNamespace(get_default=lambda: display)),
        GdkWayland=SimpleNamespace(WaylandDisplay=WaylandDisplay), GLib=object(),
        Gtk=SimpleNamespace(init_check=lambda args: (initialized, args)))
    original = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "gi":
            return SimpleNamespace(require_version=lambda *args: calls.append(args))
        if name == "gi.repository":
            return fake
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    def fake_dynamic(name, *args, **kwargs):
        if name == "gi":
            return SimpleNamespace(require_version=lambda *args: calls.append(args))
        if name.startswith("gi.repository."):
            return getattr(fake, name.rsplit(".", 1)[-1])
        raise AssertionError("Unexpected dynamic import in GTK fixture: " + name)

    monkeypatch.setattr(importlib, "import_module", fake_dynamic)
    monkeypatch.setenv("GDK_BACKEND", "x11")
    if native and initialized:
        assert receiver.initialize_gtk()[-1] is display
    else:
        with pytest.raises(RuntimeError, match="Wayland"):
            receiver.initialize_gtk()
    assert receiver.os.environ["GDK_BACKEND"] == "wayland"
    assert "wayland" in calls


def test_hard_watchdog_exits_nonzero_even_if_output_fails(monkeypatch):
    def broken(*args, **kwargs):
        raise BrokenPipeError("parent pipe gone")

    def exited(code):
        raise SystemExit(code)

    monkeypatch.setattr(receiver.os, "set_blocking", lambda *args: None)
    monkeypatch.setattr(receiver.os, "write", broken)
    monkeypatch.setattr(receiver.os, "_exit", exited)
    with pytest.raises(SystemExit) as caught:
        receiver.watchdog(None, None)
    assert caught.value.code == 124


def test_hard_watchdog_uses_nonblocking_fd_not_python_stdout(monkeypatch):
    calls = []

    def exited(code):
        raise SystemExit(code)

    monkeypatch.setattr(receiver.os, "set_blocking", lambda *args: calls.append(args))
    monkeypatch.setattr(receiver.os, "write", lambda *args: calls.append(args))
    monkeypatch.setattr(receiver.os, "_exit", exited)
    with pytest.raises(SystemExit):
        receiver.watchdog(None, None)
    assert calls[0] == (1, False)
    assert calls[1][0] == 1
    assert json.loads(calls[1][1])["where"] == "watchdog"
