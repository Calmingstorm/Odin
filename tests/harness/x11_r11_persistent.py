"""Opt-in disposable Xvfb/GTK native evidence. Never uses an existing display."""
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from src.computer.runtime.x11_capture import X11MonitorCapture  # noqa: E402
from src.computer.runtime.x11_guardian import Guardian, InjectionHelper  # noqa: E402
from src.computer.runtime.x11_owned_device import (  # noqa: E402
    ExistingXTest,
    PersistentXTest,
    UnsupportedCharacters,
)

GTK = '''import gi,sys
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk
w=Gtk.Window(title="R11 persistent fixture"); w.set_default_size(700,450)
t=Gtk.TextView(); w.add(t); w.show_all(); t.grab_focus()
print(w.get_window().get_xid(),flush=True)
def changed(buffer):
 s,e=buffer.get_bounds()
 with open(sys.argv[1],"w") as f: f.write(buffer.get_text(s,e,True))
t.get_buffer().connect("changed",changed)
Gtk.main()
'''


def main():
    # -displayfd asks Xvfb to choose a free display; never assume one is free.
    with tempfile.TemporaryDirectory(prefix="odin-r11-x11-") as tmp:
        read, write = os.pipe()
        xvfb = subprocess.Popen(["Xvfb", "-displayfd", str(write), "-screen", "0", "1000x700x24",
                                 "-nolisten", "tcp"], pass_fds=(write,), stderr=subprocess.DEVNULL)
        os.close(write)
        with os.fdopen(read) as fd:
            display = ":" + fd.readline().strip()
        assert display != ":0"
        env = dict(os.environ, DISPLAY=display, GDK_BACKEND="x11", NO_AT_BRIDGE="1")
        fixture = Path(tmp) / "gtk.py"
        fixture.write_text(GTK)
        target = Path(tmp) / "text"
        gtk = subprocess.Popen(["/usr/bin/python3", str(fixture), str(target)], env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        native = core = None
        try:
            window = int(gtk.stdout.readline())
            # A disposable layout change proves active non-ASCII lookup. This is
            # harness setup only; production code has no keymap mutation calls.
            subprocess.run(["setxkbmap", "-layout", "us", "-variant", "intl"],
                           env=env, check=True)
            native = PersistentXTest(display)
            identity = native.identity()
            keyboard = next(row[0] for row in identity if row[2] == 2)
            native.close()
            subprocess.run(["setxkbmap", "-device", str(keyboard),
                            "-layout", "us", "-variant", "intl"], env=env, check=True)
            native = PersistentXTest(display)
            unicode_chords = native.text_keys("é")
            assert unicode_chords and len(unicode_chords[0]) >= 1
            core = ExistingXTest(display)
            core.move(850, 600)
            native.move(120, 120)
            assert core.pointer() == (850, 600) and native.pointer() == (120, 120)
            native.focus(window)
            before_map = native._keymap_snapshot()
            try:
                native.text_keys("a\U0001f600b")
                raise AssertionError("unsupported character accepted")
            except UnsupportedCharacters as exc:
                assert exc.characters == [{"index": 1, "codepoint": "U+1F600",
                                           "reason": "unsupported_character"}]
            assert native._keymap_snapshot() == before_map and not any(native.held().values())
            results = []
            for trigger in ("normal", "eof", "cancel", "helper_exit", "scope", "lease", "dispatch"):
                read, write = os.pipe()
                helper = InjectionHelper(display, env, mode="independent")
                count = [0]
                def validate(step):
                    count[0] += 1
                    if trigger == "scope" and count[0] == 3:
                        raise RuntimeError("scope lost")
                guard = Guardian(native, helper, validate, controller_fd=read)
                exchange = helper.exchange
                def wrapped(command, check):
                    nonlocal write
                    exchange(command, check)
                    if command["op"] == "button" and command["args"][1]:
                        if trigger == "eof":
                            os.close(write)
                            write = -1
                        elif trigger == "cancel":
                            os.write(write, b"cancel")
                        elif trigger == "helper_exit":
                            helper.process.kill()
                            helper.process.wait()
                        elif trigger == "lease":
                            guard.deadline = time.monotonic()
                        elif trigger == "dispatch":
                            guard.dispatch_deadline = time.monotonic()
                helper.exchange = wrapped
                receipt = guard.run([("move", 120, 120), ("button", 1, True),
                                     ("move", 180, 160), ("button", 1, False)])
                os.close(read)
                if write != -1:
                    os.close(write)
                assert receipt["released"], receipt
                assert receipt["owned_devices"] == "persistent_idle", receipt
                expected = "executed" if trigger == "normal" else "unknown"
                assert receipt["status"] == expected, receipt
                assert not any(native.held().values())
                assert core.pointer() == (850, 600)
                assert gtk.poll() is None
                results.append({"trigger": trigger, **receipt})
                native.close()
                native = PersistentXTest(display)
                assert native.identity() == identity
                native.focus(window)
            # Kill the guardian owner itself, not just the helper. The helper's
            # independent lease/ledger must release its potential-down intent.
            orphan_code = '''import os,sys,time
sys.path.insert(0,sys.argv[2])
from src.computer.runtime.x11_guardian import InjectionHelper
h=InjectionHelper(sys.argv[1],dict(os.environ),mode="independent")
h.exchange({"op":"button","args":[1,True]},lambda:None)
print(h.process.pid,flush=True)
time.sleep(30)
'''
            owner = subprocess.Popen([sys.executable, "-c", orphan_code, display, str(ROOT)],
                                     stdout=subprocess.PIPE, text=True, env=env)
            helper_pid = int(owner.stdout.readline())
            assert native.held()["buttons"] == {1}
            owner.kill()
            owner.wait(timeout=2)
            deadline = time.monotonic() + 3
            while native.held()["buttons"] and time.monotonic() < deadline:
                time.sleep(.02)
            assert not any(native.held().values()), "guardian death stranded input"
            assert gtk.poll() is None
            # Application remains responsive after detach/re-attach cycles.
            subprocess.run(["xdotool", "windowfocus", str(window)], env=env, check=True)
            native.focus(window)
            helper = InjectionHelper(display, env, mode="independent")
            steps = [event for chord in native.text_keys("aliveé") for event in
                     ([("key", c, True) for c in chord]
                      + [("key", c, False) for c in reversed(chord)])]
            receipt = Guardian(native, helper, lambda step: None, controller_fd=None).run(steps)
            assert receipt["status"] == "executed", receipt
            time.sleep(.2)
            assert target.read_text() == "aliveé", target.read_text()
            assert gtk.poll() is None
            capture = X11MonitorCapture(display, enabled=True)
            old_topology = capture.topology()
            root = capture._connection._root
            screen = capture._connection._display.screen()
            original_mm = (screen.width_in_mms, screen.height_in_mms)
            root.xrandr_set_screen_size(1000, 700, original_mm[0] + 1, original_mm[1])
            capture._connection._display.sync()
            root.xrandr_set_screen_size(1000, 700, *original_mm)
            capture._connection._display.sync()
            restored = capture.topology()
            assert restored.event_revision > old_topology.event_revision
            try:
                capture.capture(old_topology, 0)
                raise AssertionError("transient topology accepted stale observation")
            except ValueError as exc:
                assert "topology" in str(exc)
            power_status = capture.power_status()
            capture.close()
            print(json.dumps({"display": display, "gtk_pid": gtk.pid, "gtk_responsive": True,
                              "persistent_ids": identity, "core_pointer": core.pointer(),
                              "owned_pointer": native.pointer(),
                              "keymap_unchanged": before_map == native._keymap_snapshot(),
                              "unicode_active_layout_chords": unicode_chords,
                              "topology_before": old_topology.event_revision,
                              "topology_after_restore": restored.event_revision,
                              "dpms_status": power_status,
                              "guardian_killed_helper_pid": helper_pid,
                              "guardian_death_released": True, "cycles": results}, indent=2))
        finally:
            if native:
                native.close()
            if core:
                core.close()
            gtk.terminate()
            gtk.wait(timeout=3)
            xvfb.terminate()
            xvfb.wait(timeout=3)


if __name__ == "__main__":
    main()
