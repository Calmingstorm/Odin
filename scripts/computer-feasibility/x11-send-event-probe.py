#!/usr/bin/python3
"""Disposable core SendEvent compatibility probe, not a supported input adapter."""

import json
import os
import subprocess
import time
from pathlib import Path

from x11_records import complete_records
from Xlib import XK, X, display, protocol


def record(kind, **values):
    print(json.dumps(dict(kind=kind, **values)), flush=True)


assert os.environ.get("XI2_PRIVATE_SANDBOX") == "1"
assert os.environ.get("DISPLAY") == ":177" and os.getuid() != 0
assert not Path("/proc/self").exists() and Path("/harness/x11-passwd").exists()
Path("/tmp/.X11-unix").mkdir(mode=0o1777)
children = []
logs = {}


def spawn(name, args, **kwargs):
    logs[name] = Path(f"/workspace/{name}.log").open("w")
    child = subprocess.Popen(args, stdout=logs[name], stderr=subprocess.STDOUT, **kwargs)
    children.append((name, child))
    record("child", name=name, pid=child.pid)
    return child


def wait_for(predicate, seconds=3):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError("bounded probe postcondition failed")


try:
    server = spawn(
        "xvfb",
        [
            "Xvfb",
            ":177",
            "-screen",
            "0",
            "900x500x24",
            "-nolisten",
            "tcp",
            "-noreset",
            "-extension",
            "GLX",
        ],
    )
    wait_for(
        lambda: (
            subprocess.run(
                ["xdpyinfo", "-display", ":177"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            ).returncode
            == 0
        )
    )
    app = spawn("gtk", ["/usr/bin/python3", "/harness/x11-same-target.py"], stdin=subprocess.PIPE)
    wait_for(lambda: Path("/workspace/robot.xid").exists())
    d = display.Display(":177")
    root = d.screen().root
    window = d.create_resource_object("window", int(Path("/workspace/robot.xid").read_text()))

    def pointer_state():
        reply = root.query_pointer()
        return (reply.root_x, reply.root_y, reply.mask, reply.child)

    before_pointer = pointer_state()
    before_focus = d.get_input_focus().focus
    # Event-local modifier flags do not touch the server's held-input state.
    keycode = d.keysym_to_keycode(XK.string_to_keysym("a"))
    for cls in (protocol.event.KeyPress, protocol.event.KeyRelease):
        event = cls(
            time=X.CurrentTime,
            root=root,
            window=window,
            child=X.NONE,
            root_x=470,
            root_y=80,
            event_x=50,
            event_y=60,
            state=0,
            detail=keycode,
            same_screen=1,
        )
        # NoEventMask sends directly to the owning client, even when XI2 toolkit
        # selection omitted core masks. This is only a compatibility experiment.
        window.send_event(event, event_mask=X.NoEventMask)
        d.sync()
    time.sleep(0.25)
    records = complete_records(Path("/workspace/gtk.log").read_text())
    delivered = [r for r in records if r.get("kind") == "text" and r.get("value") == "a"]
    record(
        "send_event_result",
        text_receipts=delivered,
        app_alive=app.poll() is None,
        pointer_unchanged=before_pointer == pointer_state(),
        focus_unchanged=before_focus == d.get_input_focus().focus,
        keymap_clear=not any(d.query_keymap()),
    )
    assert app.poll() is None
    assert before_pointer == pointer_state()
    assert before_focus == d.get_input_focus().focus
    assert not any(d.query_keymap())
    d.close()
    app.stdin.close()
    assert app.wait(timeout=2) == 0
    server.terminate()
    assert server.wait(timeout=2) == 0
finally:
    for name, child in reversed(children):
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=2)
        record("reaped", name=name, pid=child.pid, exit_status=child.returncode)
        logs[name].close()
        print(Path(f"/workspace/{name}.log").read_text(), flush=True)
