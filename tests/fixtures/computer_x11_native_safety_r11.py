"""Private-Xvfb R11 repros for native X11 input safety boundaries."""
from __future__ import annotations

import json
import os
import select
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from Xlib import X, display  # noqa: E402

from src.computer.runtime.x11_attached import worker_environment  # noqa: E402
from src.computer.runtime.x11_guardian import InjectionHelper  # noqa: E402
from src.computer.runtime.x11_owned_device import (  # noqa: E402
    X11DeviceError,
    _endpoint_keymap,
    open_input,
)


def settle(child):
    if child.poll() is None:
        child.terminate()
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=2)
    assert not Path(f"/proc/{child.pid}").exists(), "exact child was not reaped"


def rows(identity):
    table = {r[1]: r for r in identity}
    prefix = next(name[:-8] for name in table if name.startswith("Odin persistent ")
                  and name.endswith(" pointer"))
    return table[prefix + " keyboard"], table[prefix + " XTEST keyboard"]


def set_layout(env, name, device_id, layout):
    subprocess.run(["/usr/bin/setxkbmap", "-display", name, "-device", str(device_id),
                    "-layout", layout], env=env, check=True, timeout=3,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def edges(connection, seconds=.12):
    seen, deadline = [], time.monotonic() + seconds
    while time.monotonic() < deadline:
        connection.sync()
        while connection.pending_events():
            event = connection.next_event()
            if event.type in (X.KeyPress, X.KeyRelease):
                seen.append({"event": event.type, "detail": event.detail})
        time.sleep(.005)
    return seen


def exchange(helper, command, timeout=1):
    helper.sock.sendall(json.dumps(command).encode() + b"\n")
    received, deadline = b"", time.monotonic() + timeout
    while b"\n" not in received:
        assert time.monotonic() < deadline, "injector ACK timeout"
        if select.select([helper.sock], [], [], .01)[0]:
            data = helper.sock.recv(4096)
            assert data, "injector EOF before ACK"
            received += data
    assert received == b'{"ok":true}\n', received


def main():
    number = 32000 + os.getpid() % 20000
    name = f":{number}"
    lock, socket_path = Path(f"/tmp/.X{number}-lock"), Path(f"/tmp/.X11-unix/X{number}")
    assert number > 20000 and not lock.exists() and not socket_path.exists()
    base = worker_environment("")
    os.environ.clear()
    os.environ.update(base)
    server = receiver = native = helper = None
    try:
        with tempfile.TemporaryDirectory(prefix="odin-x11-native-r11-") as tmp:
            authority = str(Path(tmp) / "authority")
            subprocess.run(["/usr/bin/xauth", "-f", authority, "add", name, ".",
                            os.urandom(16).hex()], env=base, check=True, timeout=2,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            env = worker_environment(authority)
            os.environ.update(env)
            server = subprocess.Popen(["/usr/bin/Xvfb", name, "-screen", "0", "800x600x24",
                "-auth", authority, "-nolisten", "tcp", "-noreset", "-extension", "GLX"], env=env,
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            deadline = time.monotonic() + 3
            while not (lock.exists() and socket_path.exists()):
                assert server.poll() is None and time.monotonic() < deadline
                time.sleep(.02)
            assert int(lock.read_text()) == server.pid
            receiver = display.Display(name)
            root = receiver.screen().root
            window = root.create_window(20, 20, 320, 180, 0, receiver.screen().root_depth,
                X.InputOutput, X.CopyFromParent, background_pixel=0xffffff,
                event_mask=X.KeyPressMask | X.KeyReleaseMask)
            window.map()
            receiver.sync()

            native = open_input(name, mode="independent")
            master, slave = rows(native.identity())
            # Alter just the persistent master while the XTEST keyboard remains
            # US. This must be rejected before a single input edge can exist.
            set_layout(env, name, master[0], "fr")
            set_layout(env, name, slave[0], "us")
            native.close()
            native = open_input(name, mode="independent")
            native.focus(window.id)
            checked_master, checked_slave = rows(native.identity())
            master_map = _endpoint_keymap(native._display, checked_master[0])
            slave_map = _endpoint_keymap(native._display, checked_slave[0])
            assert master_map != slave_map, "setxkbmap did not create the required mismatch"
            try:
                native.text_keys("a")
            except X11DeviceError as exc:
                assert str(exc) == "injected_keyboard_mapping_mismatch"
                mismatch_reason = str(exc)
            else:
                raise AssertionError("mixed master/XTEST keymaps accepted")
            assert edges(receiver) == [], "key edge emitted despite mapping rejection"
            master, slave = rows(native.identity())
            set_layout(env, name, master[0], "us")
            set_layout(env, name, slave[0], "us")
            native.close()
            native = open_input(name, mode="independent")
            native.focus(window.id)
            chord = native.text_keys("a")[0]
            helper = InjectionHelper(name, env, mode="independent",
                expected_device_identity=native.identity(),
                keyboard_mapping_identity=native.keyboard_mapping_identity)
            # First harmless ACK is the readiness barrier before testing pressure.
            exchange(helper, {"op": "move", "args": [40, 40]})
            assert not edges(receiver, .03)
            for code in chord:
                exchange(helper, {"op": "key", "args": [code, True]})
            for code in reversed(chord):
                exchange(helper, {"op": "key", "args": [code, False]})
            matching_edges = edges(receiver)
            assert matching_edges
            assert helper.fence() and helper.process.returncode is not None
            helper = None
            assert not any(native.owned_release_state().values())

            set_layout(env, name, master[0], "us")
            set_layout(env, name, slave[0], "us")
            native.close()
            native = open_input(name, mode="independent")
            native.focus(window.id)
            key = native.text_keys("a")[0][-1]
            helper = InjectionHelper(name, env, mode="independent",
                expected_device_identity=native.identity(),
                keyboard_mapping_identity=native.keyboard_mapping_identity)
            exchange(helper, {"op": "move", "args": [45, 45]})
            native._x.XGrabServer(native._display)
            # Confirm the grab reached Xvfb before placing the key request on the
            # already-ready helper socket. Without this, a scheduling race merely
            # tests an ungrabbed server.
            native._x.XSync(native._display, 0)
            try:
                helper.sock.sendall(json.dumps({"op": "key", "args": [key, True]}).encode() + b"\n")
                time.sleep(2.25)
            finally:
                native._x.XUngrabServer(native._display)
                native._x.XSync(native._display, 0)
            helper.process.wait(timeout=2)
            grab_edges = edges(receiver)
            assert grab_edges == [], "late queued key down escaped after lease"
            assert not any(native.owned_release_state().values())
            assert helper.fence()
            assert not Path(f"/proc/{helper.process.pid}").exists()
            helper = None

            master, _slave = rows(native.identity())
            xinput_env = dict(env, DISPLAY=name)
            subprocess.run(["/usr/bin/xinput", "disable", str(master[0])], env=xinput_env,
                check=True, timeout=3, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                try:
                    open_input(name, mode="auto")
                except X11DeviceError as exc:
                    disabled_reason = str(exc)
                else:
                    raise AssertionError("disabled persistent master silently fell back")
            finally:
                subprocess.run(["/usr/bin/xinput", "enable", str(master[0])], env=xinput_env,
                    check=True, timeout=3, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            print(json.dumps({"matching_edges": matching_edges, "mismatch_reason": mismatch_reason,
                "grab_key_edges": grab_edges, "helper_reaped": True,
                "owned_release_state_empty": True,
                "disabled_master_reason": disabled_reason}, sort_keys=True), flush=True)
    finally:
        if helper is not None:
            helper.fence()
        if native is not None:
            native.close()
        if receiver is not None:
            receiver.close()
        if server is not None:
            settle(server)
        assert not socket_path.exists() and not lock.exists()


if __name__ == "__main__":
    main()
