#!/usr/bin/python3
"""Disposable GTK receiver: exact owned EOF shutdown, no source-policy bypass."""

import json
import os
import time
from pathlib import Path

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gdk, GdkX11, GLib, Gtk  # noqa: E402,F401

assert os.environ.get("DISPLAY") == ":177" and os.geteuid() == 65534
assert Path("/proc/self").exists() and not Path("/tmp/.X11-unix/X0").exists()
window = Gtk.Window(title="Private owned input receiver")
window.set_default_size(700, 400)
box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
entry = Gtk.Entry()
entry.set_size_request(680, 60)
canvas = Gtk.DrawingArea()
canvas.set_size_request(680, 320)
box.pack_start(entry, False, False, 0)
box.pack_start(canvas, True, True, 0)
window.add(box)
held_keys, held_buttons = set(), set()


def record(kind, **values):
    print(
        json.dumps(
            {
                "kind": kind,
                "t": time.monotonic(),
                "keys": sorted(held_keys),
                "buttons": sorted(held_buttons),
                **values,
            }
        ),
        flush=True,
    )


def event(widget, value):
    if value.type in (Gdk.EventType.KEY_PRESS, Gdk.EventType.KEY_RELEASE):
        code = int(value.hardware_keycode)
        (held_keys.add if value.type == Gdk.EventType.KEY_PRESS else held_keys.discard)(code)
    elif value.type in (Gdk.EventType.BUTTON_PRESS, Gdk.EventType.BUTTON_RELEASE):
        code = int(value.get_button()[1])
        (held_buttons.add if value.type == Gdk.EventType.BUTTON_PRESS else held_buttons.discard)(
            code
        )
    else:
        return False
    record("event", event=int(value.type), code=code)
    return False


for widget in (window, entry, canvas):
    widget.add_events(Gdk.EventMask.ALL_EVENTS_MASK)
    widget.connect("event", event)
entry.connect("changed", lambda e: record("text", text=e.get_text()))
window.show_all()
entry.grab_focus()


def ready():
    Path("/workspace/owned-target.json").write_text(
        json.dumps({"xid": window.get_window().get_xid()})
    )
    record("ready")
    return False


def eof(source, condition):
    if condition & GLib.IO_HUP or not os.read(0, 1):
        record("normal-eof-shutdown")
        Gtk.main_quit()
        return False
    return True


GLib.timeout_add(100, ready)
GLib.io_add_watch(0, GLib.IO_IN | GLib.IO_HUP, eof)
Gtk.main()
