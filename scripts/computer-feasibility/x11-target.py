#!/usr/bin/python3
"""Two independent GTK processes, event receipts rather than cursor screenshots."""

import json
import os
import sys
import time
from pathlib import Path

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gdk, GLib, Gtk  # noqa: E402 -- GI version selected above.

assert os.environ.get("XI2_PRIVATE_SANDBOX") == "1"
assert os.environ.get("DISPLAY") == ":177" and os.getuid() != 0
assert not Path("/proc/self").exists() and Path("/harness/x11-passwd").is_file()
role = sys.argv[1]
assert role in ("human", "robot")


def record(kind, **values):
    print(json.dumps(dict(t=time.monotonic(), role=role, kind=kind, **values)), flush=True)


record(
    "version", gtk=f"{Gtk.get_major_version()}.{Gtk.get_minor_version()}.{Gtk.get_micro_version()}"
)
win = Gtk.Window(title="XI2 fixture " + role)
win.set_default_size(340, 380)
win.move(20 if role == "human" else 420, 20)
fixed = Gtk.Fixed()
win.add(fixed)
entry = Gtk.Entry()
entry.set_size_request(320, 40)
fixed.put(entry, 10, 50)
entry.connect("changed", lambda e: record("text", value=e.get_text()))
area = Gtk.DrawingArea()
area.set_size_request(320, 180)
area.add_events(Gdk.EventMask.ALL_EVENTS_MASK)
fixed.put(area, 10, 100)


def event(widget, ev):
    dev = ev.get_device()
    source = ev.get_source_device()
    record(
        "event",
        widget=widget.get_name(),
        event=str(ev.type),
        device=dev.get_name() if dev else None,
        source=source.get_name() if source else None,
        state=int(ev.get_state()[1]),
        xy=list(ev.get_coords()),
    )
    return False


for widget in (entry, area, win):
    widget.connect("event", event)
menu = Gtk.Menu()
item = Gtk.MenuItem(label="harmless menu receipt")
item.connect("activate", lambda *_: record("menu-activated"))
menu.append(item)
menu.show_all()
mb = Gtk.Button(label="Menu")
mb.set_size_request(140, 40)
fixed.put(mb, 10, 0)


def show_menu(widget):
    record("menu-open")
    menu.popup_at_widget(
        widget, Gdk.Gravity.SOUTH_WEST, Gdk.Gravity.NORTH_WEST, Gtk.get_current_event()
    )


mb.connect("clicked", show_menu)
modal = Gtk.Button(label="Modal")
modal.set_size_request(140, 40)
fixed.put(modal, 10, 300)


def show_modal(*_):
    dialog = Gtk.MessageDialog(
        transient_for=win, modal=True, buttons=Gtk.ButtonsType.OK, text="Harmless modal receipt"
    )
    record("modal-open")
    dialog.connect(
        "response", lambda d, response: (record("modal-response", response=response), d.destroy())
    )
    dialog.show_all()


modal.connect("clicked", show_modal)
win.connect("destroy", Gtk.main_quit)
win.show_all()
entry.grab_focus()


def ready():
    Path("/workspace/" + role + ".xid").write_text(str(win.get_window().get_xid()))
    record("ready", xid=win.get_window().get_xid(), position=list(win.get_position()))
    return False


GLib.timeout_add(200, ready)
Gtk.main()
