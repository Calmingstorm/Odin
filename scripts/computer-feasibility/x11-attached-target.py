#!/usr/bin/python3
"""Disposable GTK3 SendEvent receiver, not a production application."""

import json
import os
import time
from pathlib import Path

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gdk, GdkX11, GLib, Gtk  # noqa: F401,E402

assert os.environ.get("XI2_PRIVATE_SANDBOX") == "1"
assert os.environ.get("DISPLAY") == ":177" and os.getuid() != 0
assert not Path("/proc/self").exists() and Path("/harness/x11-passwd").is_file()
windows, entries, canvases, ink, held = {}, {}, {}, {}, {}


def snapshot(kind, **values):
    print(
        json.dumps(
            dict(
                kind=kind,
                t=time.monotonic(),
                texts={r: e.get_text() for r, e in entries.items()},
                ink_pixels={r: len(points) for r, points in ink.items()},
                held={
                    name: {k: sorted(v) for k, v in state.items()} for name, state in held.items()
                },
                **values,
            )
        ),
        flush=True,
    )


def receipt(widget, event):
    state = held[widget.get_name()]
    kind = event.type
    key = button = None
    if kind in (Gdk.EventType.KEY_PRESS, Gdk.EventType.KEY_RELEASE):
        key = int(event.hardware_keycode)
        (state["keys"].add if kind == Gdk.EventType.KEY_PRESS else state["keys"].discard)(key)
    elif kind in (Gdk.EventType.BUTTON_PRESS, Gdk.EventType.BUTTON_RELEASE):
        button = int(event.get_button()[1])
        (state["buttons"].add if kind == Gdk.EventType.BUTTON_PRESS else state["buttons"].discard)(
            button
        )
    elif kind != Gdk.EventType.MOTION_NOTIFY:
        return False
    device = event.get_device()
    snapshot(
        "event",
        widget=widget.get_name(),
        event=int(kind),
        keycode=key,
        button=button,
        x=float(event.get_coords()[1]),
        y=float(event.get_coords()[2]),
        state=int(event.get_state()[1]),
        synthetic=bool(event.send_event),
        device=device.get_name() if device else None,
    )
    return False


def scribble(widget, event, role):
    paint = event.type == Gdk.EventType.BUTTON_PRESS and event.get_button()[1] == 1
    paint |= event.type == Gdk.EventType.MOTION_NOTIFY and 1 in held[widget.get_name()]["buttons"]
    if paint:
        _, ex, ey = event.get_coords()
        x, y = int(ex), int(ey)
        for dx in range(-4, 5):
            for dy in range(-4, 5):
                if (
                    0 <= x + dx < widget.get_allocated_width()
                    and 0 <= y + dy < widget.get_allocated_height()
                ):
                    ink[role].add((x + dx, y + dy))
        widget.queue_draw()
        snapshot("scribble", role=role)
    return False


def draw(widget, ctx, role):
    ctx.set_source_rgb(1, 1, 1)
    ctx.paint()
    ctx.set_source_rgb(0, 0, 0)
    for x, y in ink[role]:
        ctx.rectangle(x, y, 1, 1)
    ctx.fill()
    return False


for role, x in [("robot", 10), ("human", 460)]:
    window = Gtk.Window(title="Attached corpus " + role)
    window.move(x, 10)
    window.set_default_size(420, 480)
    window.set_resizable(False)
    layout = Gtk.Fixed()
    window.add(layout)
    entry = Gtk.Entry()
    entry.set_size_request(400, 40)
    layout.put(entry, 10, 20)
    canvas = Gtk.DrawingArea()
    canvas.set_size_request(400, 370)
    layout.put(canvas, 10, 90)
    windows[role], entries[role], canvases[role] = window, entry, canvas
    ink[role] = set()
    for widget, suffix in [(entry, "entry"), (canvas, "canvas")]:
        widget.set_name(role + "-" + suffix)
        held[widget.get_name()] = dict(keys=set(), buttons=set())
        widget.add_events(Gdk.EventMask.ALL_EVENTS_MASK)
        widget.connect("event", receipt)
    entry.connect("changed", lambda e, r=role: snapshot("text", role=r, value=e.get_text()))
    canvas.connect("event", scribble, role)
    canvas.connect("draw", draw, role)
    window.connect("destroy", Gtk.main_quit)
    window.show_all()
    entry.grab_focus()


def ready():
    data = {}
    for role, window in windows.items():
        data[role] = {"xid": window.get_window().get_xid()}
        for name, widget in [("entry", entries[role]), ("canvas", canvases[role])]:
            a = widget.get_allocation()
            data[role][name] = dict(
                xid=widget.get_window().get_xid(), x=a.x, y=a.y, width=a.width, height=a.height
            )
    Path("/workspace/attached-ready.json").write_text(json.dumps(data))
    snapshot("ready", windows=data)
    return False


def normal_eof(source, condition):
    if condition & GLib.IO_HUP or not os.read(0, 1):
        snapshot("normal-controller-eof-app-shutdown")
        Gtk.main_quit()
        return False
    return True


GLib.timeout_add(200, ready)
GLib.io_add_watch(0, GLib.IO_IN | GLib.IO_HUP, normal_eof)
Gtk.main()
