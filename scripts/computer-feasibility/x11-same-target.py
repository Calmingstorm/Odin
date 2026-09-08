#!/usr/bin/python3
"""Trusted single GTK process, two windows, two entries in each; receipts only."""

import json
import os
import time
from pathlib import Path

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gdk, GLib, Gtk  # noqa: E402 -- GI version selected above.

assert os.environ.get("XI2_PRIVATE_SANDBOX") == "1"
assert os.environ.get("DISPLAY") == ":177" and os.getuid() != 0
assert not Path("/proc/self").exists() and Path("/harness/x11-passwd").is_file()
windows = {}
entries = {}


def record(kind, **values):
    print(json.dumps(dict(t=time.monotonic(), pid=os.getpid(), kind=kind, **values)), flush=True)


def state(kind, **values):
    record(
        kind,
        texts={k: e.get_text() for k, e in entries.items()},
        focus={k: w.get_focus().get_name() if w.get_focus() else None for k, w in windows.items()},
        **values,
    )


def event(widget, ev):
    if ev.type not in (
        Gdk.EventType.KEY_PRESS,
        Gdk.EventType.KEY_RELEASE,
        Gdk.EventType.BUTTON_PRESS,
        Gdk.EventType.BUTTON_RELEASE,
        Gdk.EventType.FOCUS_CHANGE,
        Gdk.EventType.MOTION_NOTIFY,
    ):
        return False
    dev, source = ev.get_device(), ev.get_source_device()
    state(
        "event",
        widget=widget.get_name(),
        event=str(ev.type),
        device=dev.get_name() if dev else None,
        source=source.get_name() if source else None,
        keyval=ev.keyval
        if ev.type in (Gdk.EventType.KEY_PRESS, Gdk.EventType.KEY_RELEASE)
        else None,
        modifiers=int(ev.get_state()[1]),
    )
    return False


record(
    "version", gtk=f"{Gtk.get_major_version()}.{Gtk.get_minor_version()}.{Gtk.get_micro_version()}"
)
for role, x in [("human", 20), ("robot", 420)]:
    win = Gtk.Window(title="Same-process XI2 " + role)
    win.set_name(role + "-window")
    windows[role] = win
    win.move(x, 20)
    win.set_default_size(340, 250)
    fixed = Gtk.Fixed()
    win.add(fixed)
    for label, y in [("top", 50), ("bottom", 130)]:
        name = role + "-" + label
        entry = Gtk.Entry()
        entry.set_name(name)
        entries[name] = entry
        entry.set_size_request(320, 40)
        fixed.put(entry, 10, y)
        entry.add_events(Gdk.EventMask.ALL_EVENTS_MASK)
        entry.connect("event", event)
        entry.connect("changed", lambda e: state("text", widget=e.get_name(), value=e.get_text()))
    win.connect("event", event)
    win.connect(
        "set-focus",
        lambda w, e: state("set-focus", window=w.get_name(), target=e.get_name() if e else None),
    )
    win.connect("destroy", Gtk.main_quit)
    win.show_all()
    entries[role + "-top"].grab_focus()


def ready():
    for role, win in windows.items():
        Path("/workspace/" + role + ".xid").write_text(str(win.get_window().get_xid()))
        record(
            "ready", role=role, xid=win.get_window().get_xid(), position=list(win.get_position())
        )
    state("ready-state")
    return False


GLib.timeout_add(200, ready)
if os.environ.get("XI2_SAFE_LIFECYCLE") == "1":

    def normal_eof(source, condition):
        if condition & GLib.IO_HUP or not os.read(0, 1):
            record("normal-controller-eof-app-shutdown")
            Gtk.main_quit()
            return False
        return True

    GLib.io_add_watch(0, GLib.IO_IN | GLib.IO_HUP, normal_eof)
Gtk.main()
