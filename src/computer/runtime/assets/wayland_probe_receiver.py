#!/usr/bin/python3
"""Bounded GTK3 event receiver, executable only in the private probe namespace.

This asset uses the system Python's GI packages. Importing it does not import GI,
connect to a display, or inspect the host session. The sibling private guard runs
before any graphical initialization. No command-line configuration is accepted.
"""

import json
import os
import signal
import sys
import time

SAMPLE_INTERVAL_MS = 100
LIFETIME_SECONDS = 55
WATCHDOG_SECONDS = 60


def emit(kind, **values):
    print(json.dumps({"kind": kind, "pid": os.getpid(),
                      "monotonic": time.monotonic(), **values}), flush=True)


def typed_event(event, *, key_event=False, button_event=False):
    """Read GDK's typed union accessors, never event.button union attributes."""
    def scalar(method):
        ok, value = getattr(event, method)()
        if not ok:
            raise ValueError("missing typed event field: " + method)
        return int(value)

    return {"key": scalar("get_keyval") if key_event else None,
            "button": scalar("get_button") if button_event else None}


class Receiver:
    """Callbacks are independently testable using fake GTK/GDK objects."""

    def __init__(self, gtk, gdk, glib, display, *, output=emit):
        self.Gtk, self.Gdk, self.GLib = gtk, gdk, glib
        self.display, self.output = display, output
        self.keys, self.buttons = set(), set()
        # Match releases by hardware code so a modifier change between press
        # and release cannot strand the original keyval in the pressed ledger.
        self.keycodes = {}
        self.failed = False
        self.ready = False
        self.win = gtk.Window(title="Odin private Wayland probe receiver")
        self.win.set_default_size(800, 600)
        self.win.set_decorated(False)
        self.win.set_accept_focus(True)
        self.win.set_focus_on_map(True)
        self.area = gtk.DrawingArea()
        self.area.set_can_focus(True)
        self.area.set_size_request(800, 600)
        masks = (gdk.EventMask.BUTTON_PRESS_MASK | gdk.EventMask.BUTTON_RELEASE_MASK
                 | gdk.EventMask.KEY_PRESS_MASK | gdk.EventMask.KEY_RELEASE_MASK
                 | gdk.EventMask.POINTER_MOTION_MASK | gdk.EventMask.FOCUS_CHANGE_MASK)
        self.area.add_events(masks)
        self.win.add_events(masks)
        self.win.add(self.area)
        self.area.connect("button-press-event", self.on_button_press)
        self.area.connect("button-release-event", self.on_button_release)
        self.win.connect("key-press-event", self.on_key_press)
        self.win.connect("key-release-event", self.on_key_release)
        self.win.connect("map-event", self.on_map)
        self.win.connect("delete-event", self.on_close)

    def ledger(self):
        return {"keys": sorted(self.keys), "buttons": sorted(self.buttons)}

    def fail(self, where, exc):
        self.failed = True
        try:
            self.output("error", where=where, reason=f"{type(exc).__name__}: {exc}")
        finally:
            self.Gtk.main_quit()

    def record(self, event, event_type):
        if self.failed:
            return True
        try:
            is_key = event_type.startswith("key_")
            data = typed_event(event, key_event=is_key, button_event=not is_key)
            pressed = event_type.endswith("_press")
            if is_key:
                ok, keycode = event.get_keycode()
                if not ok:
                    raise ValueError("missing typed event field: get_keycode")
                keycode = int(keycode)
                if pressed:
                    # Autorepeat is a repeated press, not another held key.
                    self.keycodes.setdefault(keycode, data["key"])
                else:
                    self.keycodes.pop(keycode, None)
                self.keys = set(self.keycodes.values())
            elif pressed:
                self.buttons.add(data["button"])
            else:
                self.buttons.discard(data["button"])
            self.output("event", type=event_type, **data, **self.ledger())
        except Exception as exc:
            self.fail("event", exc)
        return True

    def on_button_press(self, _widget, event):
        # GTK also delivers synthetic double/triple-click notices through this
        # signal; those are not additional physical button-down transitions.
        if event.type != self.Gdk.EventType.BUTTON_PRESS:
            return False
        return self.record(event, "button_press")

    def on_button_release(self, _widget, event):
        return self.record(event, "button_release")

    def on_key_press(self, _widget, event):
        return self.record(event, "key_press")

    def on_key_release(self, _widget, event):
        return self.record(event, "key_release")

    def sample(self):
        if self.failed:
            return False
        try:
            surface = self.win.get_window()
            if surface is None:
                raise RuntimeError("receiver has no realized GDK window")
            seat = self.display.get_default_seat()
            if seat is None:
                raise RuntimeError("Wayland display has no default seat")
            pointer = seat.get_pointer()
            if pointer is None:
                raise RuntimeError("Wayland seat has no pointer")
            # Native GTK3 tuple: (child_window, x, y, modifier_mask). The
            # mask is measured independently of the callback ledger.
            result = surface.get_device_position(pointer)
            if len(result) != 4:
                raise ValueError("unexpected GDK pointer telemetry shape")
            _child, x, y, state = result
            self.output("sample", active=bool(self.win.is_active()),
                        focused=bool(self.win.has_toplevel_focus() and self.area.has_focus()),
                        toplevel_focus=bool(self.win.has_toplevel_focus()),
                        pointer_x=int(x), pointer_y=int(y), state=int(state),
                        state_source="Gdk.Window.get_device_position(default_seat.pointer)",
                        **self.ledger())
        except Exception as exc:
            self.fail("sample", exc)
            return False
        return True

    def on_map(self, _widget, _event):
        self.GLib.idle_add(self.on_ready)
        return False

    def on_ready(self):
        if self.failed or self.ready:
            return False
        try:
            if self.win.get_window() is None or self.area.get_window() is None:
                raise RuntimeError("receiver mapped without native windows")
            self.area.grab_focus()
            self.win.present()
            self.ready = True
            self.output("receiver_ready", backend="wayland",
                        display_type=type(self.display).__name__)
            self.GLib.timeout_add(SAMPLE_INTERVAL_MS, self.sample)
        except Exception as exc:
            self.fail("ready", exc)
        return False

    def on_close(self, *_args):
        self.fail("window", RuntimeError("receiver window unexpectedly closed"))
        return True

    def expire(self):
        self.output("receiver_stopped", reason="bounded_lifetime", **self.ledger())
        self.Gtk.main_quit()
        return False

    def run(self):
        self.win.fullscreen()
        self.win.show_all()
        self.area.grab_focus()
        self.win.present()
        self.GLib.timeout_add_seconds(LIFETIME_SECONDS, self.expire)
        self.Gtk.main()
        return 1 if self.failed else 0


def initialize_gtk():
    # The guard has already validated a disposable namespace. There is no X11
    # fallback, even if the inherited environment or installed GTK prefers it.
    os.environ["GDK_BACKEND"] = "wayland"
    import gi
    gi.require_version("Gtk", "3.0")
    gi.require_version("Gdk", "3.0")
    from gi.repository import Gdk, GLib, Gtk

    Gdk.set_allowed_backends("wayland")
    initialized, _argv = Gtk.init_check([])
    if not initialized:
        raise RuntimeError("GTK native Wayland initialization failed")
    display = Gdk.Display.get_default()
    # GTK3 distributions need not ship a separate GdkWayland typelib. The
    # concrete GObject type is authoritative even without that optional typelib.
    if (display is None
            or getattr(getattr(display, "__gtype__", None), "name", None) != "GdkWaylandDisplay"):
        raise RuntimeError("native GDK Wayland display required; fallback refused")
    return Gtk, Gdk, GLib, display


def watchdog(_signum, _frame):
    try:
        # Do not flush Python stdout here: a stalled parent may have filled its
        # pipe, and the signal may have interrupted that same stream's lock.
        os.set_blocking(1, False)
        payload = {"kind": "error", "pid": os.getpid(), "monotonic": time.monotonic(),
                   "where": "watchdog", "reason": "receiver exceeded 60-second lifetime"}
        os.write(1, (json.dumps(payload) + "\n").encode("utf-8"))
    finally:
        os._exit(124)


def main():
    if len(sys.argv) != 1:
        emit("error", where="arguments", reason="receiver accepts no command-line arguments")
        return 2
    signal.signal(signal.SIGALRM, watchdog)
    signal.alarm(WATCHDOG_SECONDS)
    try:
        from wayland_probe_private import assert_private_environment

        assert_private_environment()
        return Receiver(*initialize_gtk()).run()
    except Exception as exc:
        emit("error", where="startup", reason=f"{type(exc).__name__}: {exc}")
        return 1
    finally:
        signal.alarm(0)


if __name__ == "__main__":
    raise SystemExit(main())
