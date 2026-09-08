#!/usr/bin/env python3
"""GTK event evidence in an isolated compositor, never a control backend."""
import json
import os
import sys
import time

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gdk, GLib, Gtk  # noqa: E402

if os.environ.get("ODIN_HYPRLAND_ISOLATED_PROOF") != "1":
    raise SystemExit("Refusing outside explicitly marked isolated proof")
name = sys.argv[1] if len(sys.argv) == 2 else "phase3-receiver-a"
window = Gtk.Window(title=name)
window.set_wmclass(name, name)
window.set_default_size(700, 500)
area = Gtk.DrawingArea()
area.set_can_focus(True)
area.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK
                | Gdk.EventMask.KEY_PRESS_MASK | Gdk.EventMask.KEY_RELEASE_MASK
                | Gdk.EventMask.FOCUS_CHANGE_MASK | Gdk.EventMask.POINTER_MOTION_MASK)
window.add(area)


def record(event, **fields):
    print(json.dumps({"event": event, "receiver": name,
                      "monotonic_ns": time.monotonic_ns(), **fields}), flush=True)


def key(_widget, event, state):
    record("key", state=state, key=int(event.hardware_keycode) - 8, modifiers=int(event.state))
    return True


def button(_widget, event, state):
    record("button", state=state, button=int(event.button), modifiers=int(event.state))
    return True


def draw(_widget, cr):
    cr.set_source_rgb(0.12, 0.2, 0.28)
    cr.paint()
    cr.set_source_rgb(0.8, 0.85, 0.9)
    cr.move_to(40, 80)
    cr.set_font_size(25)
    cr.show_text(name)
    return False


area.connect("draw", draw)
area.connect("key-press-event", key, 1)
area.connect("key-release-event", key, 0)
area.connect("button-press-event", button, 1)
area.connect("button-release-event", button, 0)
window.connect("focus-in-event", lambda *_: record("focus", state=1))
window.connect("focus-out-event", lambda *_: record("focus", state=0))
window.connect("destroy", Gtk.main_quit)
window.show_all()
area.grab_focus()
GLib.timeout_add(100, lambda: (record("ready", pid=os.getpid()), False)[1])
Gtk.main()
