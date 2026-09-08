"""Private GTK receiver; typed union extraction is testable without GTK."""

import json
import os
import time
from pathlib import Path


def typed_event(event, *, key_event=False, button_event=False):
    # Gdk.Event is a union: .button can be EventButton, not an integer.
    def scalar(method, cast, required=False):
        ok, value = getattr(event, method)()
        if not ok:
            if required:
                raise ValueError("missing typed event field: " + method)
            return None
        return cast(value)

    ok, x, y = event.get_coords()
    return dict(
        key=scalar("get_keyval", int, True) if key_event else None,
        button=scalar("get_button", int, True) if button_event else None,
        x=float(x) if ok else None,
        y=float(y) if ok else None,
        state=scalar("get_state", int),
    )


def recurring(callback, error):
    """A telemetry error is visible but must never unregister the timer."""
    try:
        callback()
    except Exception as exc:
        error(type(exc).__name__ + ": " + str(exc))
    return True


def main():
    import gi

    gi.require_version("Gtk", "3.0")
    from gi.repository import Gdk, GLib, Gtk

    assert Path("/.dockerenv").exists() and os.environ["HOME"] == "/tmp/home"
    win = Gtk.Window(title="Isolated native event receiver")
    win.set_default_size(700, 450)
    win.maximize()
    win.add_events(Gdk.EventMask.ALL_EVENTS_MASK)
    entry = Gtk.Entry()
    entry.set_placeholder_text("Harmless native Wayland receiver")
    win.add(entry)
    pressed_keys, pressed_buttons = set(), set()

    def log(kind, **values):
        print(
            json.dumps(dict(kind=kind, monotonic=time.monotonic(), pid=os.getpid(), **values)),
            flush=True,
        )

    def event(_win, ev):
        try:
            data = typed_event(
                ev,
                key_event=ev.type in (Gdk.EventType.KEY_PRESS, Gdk.EventType.KEY_RELEASE),
                button_event=ev.type in (Gdk.EventType.BUTTON_PRESS, Gdk.EventType.BUTTON_RELEASE),
            )
            if ev.type == Gdk.EventType.KEY_PRESS:
                pressed_keys.add(data["key"])
            if ev.type == Gdk.EventType.KEY_RELEASE:
                pressed_keys.discard(data["key"])
            if ev.type == Gdk.EventType.BUTTON_PRESS:
                pressed_buttons.add(data["button"])
            if ev.type == Gdk.EventType.BUTTON_RELEASE:
                pressed_buttons.discard(data["button"])
            device = ev.get_device()
            log(
                "event",
                type=str(ev.type),
                **data,
                keys=sorted(pressed_keys),
                buttons=sorted(pressed_buttons),
                device=device.get_name() if device else None,
            )
        except Exception as exc:
            log("telemetry_error", where="event", reason=str(exc))
        return False

    entry.connect("event", event)

    def sample():
        pointer = Gdk.Display.get_default().get_default_seat().get_pointer()
        result = win.get_window().get_device_position(pointer)
        log(
            "sample",
            pointer_x=int(result[-3]),
            pointer_y=int(result[-2]),
            state=int(result[-1]),
            state_source="Gdk.Window.get_device_position(default_seat.pointer)",
            keys=sorted(pressed_keys),
            buttons=sorted(pressed_buttons),
            text=entry.get_text(),
            focused=entry.has_focus(),
            active=win.is_active(),
            toplevel_focus=win.has_toplevel_focus(),
        )

    win.show_all()
    entry.grab_focus()
    log("receiver_start", backend=type(Gdk.Display.get_default()).__name__)
    GLib.timeout_add(
        100,
        lambda: recurring(
            sample, lambda reason: log("telemetry_error", where="sample", reason=reason)
        ),
    )
    Gtk.main()


if __name__ == "__main__":
    main()
