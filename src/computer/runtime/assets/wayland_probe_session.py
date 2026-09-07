#!/usr/bin/python3
"""Private behavior measurement. Internal Mutter EIS never leaves this namespace."""
from __future__ import annotations

import ctypes
import importlib
import json
import os
import re
import resource
import selectors
import signal
import socket
import struct
import subprocess
import time
from pathlib import Path
from typing import Any

_private = importlib.import_module("wayland_probe_private")
assert_private_environment = _private.assert_private_environment
require_same_stack = _private.require_same_stack


class TrialError(RuntimeError):
    pass


class Trial:
    def __init__(self, marker):
        self.marker = marker
        self.children: list[subprocess.Popen[bytes]] = []
        self.outputs: dict[int, list[dict[str, Any]]] = {}
        self.buffers: dict[int, bytearray] = {}
        self.selector = selectors.DefaultSelector()
        self.rows: list[dict[str, Any]] = []
        self.deadline = time.monotonic() + 70
        self.compositor: subprocess.Popen[bytes] | None = None
        self.receiver: subprocess.Popen[bytes] | None = None
        self.sender: subprocess.Popen[bytes] | None = None
        self.session: str | None = None
        # GI's system-installed connection object is a dynamic boundary.
        self.bus: Any | None = None
        self.owner: str | None = None
        self.checks: set[str] = set()
        self.total_output = 0
        self.stage = "init"

    def spawn(self, argv: list[str], *, capture: bool = False,
              pass_fds: tuple[int, ...] = ()) -> subprocess.Popen[bytes]:
        child = subprocess.Popen(argv, stdin=subprocess.PIPE if capture else subprocess.DEVNULL,
                                 stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, env=dict(os.environ),
                                 pass_fds=pass_fds, start_new_session=True)
        self.children.append(child)
        if capture:
            stdout = child.stdout
            if stdout is None:
                raise TrialError("probe_private_capture_pipe_missing")
            self.outputs[child.pid] = []
            self.buffers[child.pid] = bytearray()
            os.set_blocking(stdout.fileno(), False)
            self.selector.register(stdout, selectors.EVENT_READ, child.pid)
        return child

    def pump(self, delay=0.05):
        if time.monotonic() >= self.deadline:
            raise TrialError("probe_private_deadline")
        for key, _ in self.selector.select(delay):
            chunk = os.read(key.fd, 8192)
            if not chunk:
                self.selector.unregister(key.fileobj)
                continue
            self.total_output += len(chunk)
            if self.total_output > 262144:
                raise TrialError("probe_private_output_limit")
            buffer = self.buffers[key.data]
            buffer.extend(chunk)
            if len(buffer) > 16384:
                raise TrialError("probe_private_line_limit")
            while b"\n" in buffer:
                line, _, remainder = buffer.partition(b"\n")
                buffer[:] = remainder
                row = json.loads(line)
                self.outputs[key.data].append(row)
                if row.get("kind") == "error" or row.get("event") == "error":
                    raise TrialError("probe_private_telemetry_or_sender_error")
                if self.receiver and key.data == self.receiver.pid:
                    if row.get("pid") != self.receiver.pid:
                        raise TrialError("probe_receiver_identity_mismatch")
                    self.rows.append(row)

    def wait(self, predicate, code, seconds=5):
        deadline = min(self.deadline, time.monotonic() + seconds)
        while time.monotonic() < deadline:
            self.pump()
            if self.compositor and self.compositor.poll() is not None:
                raise TrialError("probe_private_compositor_exited")
            if self.receiver and self.receiver.poll() is not None:
                raise TrialError("probe_private_receiver_exited")
            if predicate():
                return
        raise TrialError(code)

    def command(self, op, expect=None):
        sender = self.sender
        if sender is None or sender.stdin is None:
            raise TrialError("probe_sender_not_connected")
        before = len(self.outputs[sender.pid])
        sender.stdin.write(json.dumps({"op": op}).encode() + b"\n")
        sender.stdin.flush()
        if expect:
            self.wait(lambda: any(row.get("event") == expect
                      for row in self.outputs[sender.pid][before:]),
                      "probe_sender_command_failed", 10)

    def call(self, path, interface, method, parameters=None, fd=False):
        gio = importlib.import_module("gi.repository.Gio")
        bus = self.bus
        if bus is None:
            raise TrialError("probe_private_bus_not_connected")
        if fd:
            return bus.call_with_unix_fd_list_sync(self.owner, path, interface, method,
                parameters, None, gio.DBusCallFlags.NONE, 4000, None, None)
        return bus.call_sync(self.owner, path, interface, method,
            parameters, None, gio.DBusCallFlags.NONE, 4000, None)

    def connect_sender(self):
        glib = importlib.import_module("gi.repository.GLib")
        assert_private_environment()
        compositor = self.compositor
        if compositor is None:
            raise TrialError("probe_private_compositor_missing")
        if self.marker["identity"].get("compositor_name") == "kwin_wayland":
            result, fd_list = importlib.import_module("wayland_probe_kwin").connect(self, glib)
        else:
            result, fd_list = self.call(self.session, "org.gnome.Mutter.RemoteDesktop.Session",
                                       "ConnectToEIS", glib.Variant("(a{sv})", ({},)), fd=True)
        fds = fd_list.steal_fds()
        try:
            index = result.unpack()[0]
            if index != 0 or len(fds) != 1:
                raise TrialError("probe_eis_fd_shape_invalid")
            fd = fds[0]
            with socket.socket(fileno=os.dup(fd)) as peer:
                pid, uid, _gid = struct.unpack(
                    "3i", peer.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
                if pid != compositor.pid or uid != os.getuid():
                    raise TrialError("probe_eis_compositor_peer_mismatch")
            sender = self.spawn(["/usr/bin/python3", "-s", "/probe/assets/wayland_probe_sender.py",
                                 "--fd", str(fd)], capture=True, pass_fds=(fd,))
        finally:
            for fd in fds:
                os.close(fd)
        self.sender = sender
        self.command("handoff", "ready")

    def event_after(self, index, event_type, *, button=None, key=None):
        return any(row.get("kind") == "event" and row.get("type") == event_type
                   and (button is None or row.get("button") == button)
                   and (key is None or row.get("key") == key) for row in self.rows[index:])

    def clean_after(self, index, *, require_focus=True):
        samples = [row for row in self.rows[index:] if row.get("kind") == "sample"]
        return bool(samples and (not require_focus or (
                        samples[-1].get("active") and samples[-1].get("focused")))
                    and samples[-1].get("keys") == [] and samples[-1].get("buttons") == []
                    and not samples[-1].get("state", 0) & 257)

    def run(self):
        self.stage = "gi_import"
        gi = importlib.import_module("gi")
        gi.require_version("Gio", "2.0")
        gio = importlib.import_module("gi.repository.Gio")
        glib = importlib.import_module("gi.repository.GLib")
        identity = self.marker["identity"]
        self.stage = "bus_start"
        self.spawn(["/usr/bin/dbus-daemon", "--session", "--nofork", "--nopidfile",
                    "--address=unix:path=/run/probe/bus"])
        self.spawn(["/usr/bin/dbus-daemon", "--session", "--nofork", "--nopidfile",
                    "--address=unix:path=/run/probe/system-bus"])
        self.wait(lambda: Path("/run/probe/bus").is_socket()
                  and Path("/run/probe/system-bus").is_socket(),
                  "probe_private_bus_start_failed")
        os.environ["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/run/probe/bus"
        os.environ["DBUS_SYSTEM_BUS_ADDRESS"] = "unix:path=/run/probe/system-bus"
        argv = ["/usr/bin/gnome-shell", "--wayland", "--no-x11", "--wayland-display=wayland-probe"]
        if identity["backend"] == "native":
            argv += ["--headless", "--virtual-monitor", "800x600"]
        elif identity["backend"] == "x11-nested":
            os.mkdir("/tmp/.X11-unix", mode=0o1777)
            self.spawn(["/usr/bin/Xvfb", ":97", "-screen", "0", "800x600x24", "-nolisten", "tcp",
                        "-noreset"])
            self.wait(lambda: Path("/tmp/.X11-unix/X97").is_socket(),
                      "probe_private_xvfb_start_failed")
            os.environ["DISPLAY"] = ":97"
            argv += ["--nested"]
        else:
            raise TrialError("probe_backend_unsupported")
        if identity.get("compositor_name") == "kwin_wayland":
            adapter = importlib.import_module("wayland_probe_kwin")
            argv = adapter.compositor_argv(identity["backend"])
        assert_private_environment()
        self.compositor = self.spawn(argv)
        self.stage = "compositor_start"
        self.wait(lambda: Path("/run/probe/wayland-probe").is_socket(),
                  "probe_compositor_start_failed", 20)
        if identity["backend"] == "x11-nested":
            # Only our isolated Xvfb. Give the nested compositor outer pointer
            # focus; otherwise virtual events can target an unfocused surface.
            assert_private_environment()
            subprocess.run(["/usr/bin/xdotool", "mousemove", "400", "300", "click", "1"],
                           check=True, timeout=3,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.bus = gio.DBusConnection.new_for_address_sync(
            "unix:path=/run/probe/bus",
            gio.DBusConnectionFlags.AUTHENTICATION_CLIENT
            | gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
        bus = self.bus
        if bus is None:
            raise TrialError("probe_private_bus_not_connected")

        def dbus(method, value):
            return bus.call_sync(
                "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
                method, glib.Variant("(s)", (value,)), None,
                gio.DBusCallFlags.NONE, 3000, None).unpack()[0]
        self.stage = "dbus_owner"
        if identity.get("compositor_name") == "kwin_wayland":
            importlib.import_module("wayland_probe_kwin").setup(self, identity, dbus)
        else:
            self.setup_gnome(identity, dbus, bus, gio, glib)
        self.measure(identity)

    def setup_gnome(self, identity, dbus, bus, gio, glib):
        if self.compositor is None:
            raise TrialError("probe_private_compositor_missing")
        self.wait(lambda: dbus("NameHasOwner", "org.gnome.Mutter.RemoteDesktop"),
                  "probe_private_remote_desktop_unavailable", 15)
        self.owner = dbus("GetNameOwner", "org.gnome.Mutter.RemoteDesktop")
        if dbus("GetConnectionUnixProcessID", self.owner) != self.compositor.pid:
            raise TrialError("probe_private_bus_owner_mismatch")
        shell_owner = dbus("GetNameOwner", "org.gnome.Shell")
        if dbus("GetConnectionUnixProcessID", shell_owner) != self.compositor.pid:
            raise TrialError("probe_private_shell_owner_mismatch")
        self.stage = "shell_version"
        versions = []
        def version_ready():
            try:
                versions.append(bus.call_sync(
                    shell_owner, "/org/gnome/Shell", "org.freedesktop.DBus.Properties", "Get",
                    glib.Variant("(ss)", ("org.gnome.Shell", "ShellVersion")), None,
                    gio.DBusCallFlags.NONE, 1000, None).unpack()[0])
                return True
            except glib.Error:
                return False
        self.wait(version_ready, "probe_private_shell_not_ready", 12)
        if versions[-1] != identity["version"]:
            raise TrialError("probe_private_compositor_version_mismatch")
        self.stage = "rd_session"
        self.session = self.call(
            "/org/gnome/Mutter/RemoteDesktop", "org.gnome.Mutter.RemoteDesktop",
            "CreateSession").unpack()[0]
        self.call(self.session, "org.gnome.Mutter.RemoteDesktop.Session", "Start")

    def measure(self, identity):
        if self.compositor is None:
            raise TrialError("probe_private_compositor_missing")
        self.stage = "sender_connect"
        self.connect_sender()
        self.command("escape", "escape_sent")
        self.stage = "receiver_start"
        self.receiver = self.spawn(
            ["/usr/bin/python3", "-s", "/probe/assets/wayland_probe_receiver.py"], capture=True)
        self.wait(lambda: any(row.get("kind") == "receiver_ready" for row in self.rows),
                  "probe_receiver_start_failed", 10)
        self.command("escape", "escape_sent")
        focus_index = len(self.rows)
        self.wait(lambda: len([
                    row for row in self.rows[focus_index:] if row.get("kind") == "sample"]) >= 8,
                  "probe_receiver_samples_not_ready")
        if identity["backend"] == "x11-nested":
            assert_private_environment()
            windows = subprocess.run(
                ["/usr/bin/xdotool", "search", "--pid", str(self.compositor.pid)],
                check=True, timeout=3, capture_output=True, text=True).stdout.split()
            if not windows or not all(value.isdecimal() for value in windows):
                raise TrialError("probe_nested_outer_window_missing")
            subprocess.run(
                ["/usr/bin/xdotool", "windowfocus", windows[-1], "mousemove", "250", "250",
                 "click", "1", "key", "Escape"],
                check=True, timeout=3, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            focus_index = len(self.rows)
        self.wait(lambda: self.clean_after(focus_index), "probe_receiver_focus_not_ready")
        baseline = len(self.rows)
        self.stage = "receiver_baseline"
        self.command("fresh", "fresh_sent")
        self.wait(lambda: self.event_after(baseline, "key_press", key=97)
                  and self.clean_after(baseline),
                  "probe_receiver_initial_input_not_delivered")
        require_same_stack(identity, self.compositor.pid)
        self.checks.add("exact_mapped_stack")
        held_index = len(self.rows)
        self.stage = "held_input"
        self.command("hold", "held_sent")
        self.wait(lambda: self.event_after(held_index, "button_press", button=1)
                  and self.event_after(held_index, "key_press", key=65505)
                  and any(row.get("kind") == "sample" and row.get("keys") == [65505]
                          and row.get("buttons") == [1] and row.get("state", 0) & 257 == 257
                          for row in self.rows[held_index:]), "probe_held_input_not_received")
        self.checks.update(("held_button_received", "held_key_received"))
        release_index = len(self.rows)
        self.stage = "held_eof_release"
        self.command("eof")
        sender = self.sender
        if sender is None:
            raise TrialError("probe_sender_not_connected")
        sender.wait(timeout=3)
        if sender.returncode != 0:
            raise TrialError("probe_sender_exit_failed")
        self.checks.add("sole_sender_eof")
        self.wait(lambda: self.event_after(release_index, "button_release", button=1)
                  and self.event_after(release_index, "key_release", key=65505)
                  and self.clean_after(release_index, require_focus=False),
                  "compositor_held_button_eof_release_failed", 4)
        self.checks.update(("button_release_received", "key_release_received"))
        receiver_pid = self.receiver.pid
        self.stage = "fresh_input"
        self.connect_sender()
        self.command("escape", "escape_sent")
        self.wait(lambda: self.clean_after(release_index), "probe_receiver_refocus_failed")
        fresh_index = len(self.rows)
        self.command("fresh", "fresh_sent")
        self.wait(lambda: self.event_after(fresh_index, "button_press", button=1)
                  and self.event_after(fresh_index, "button_release", button=1)
                  and self.event_after(fresh_index, "key_press", key=97)
                  and self.event_after(fresh_index, "key_release", key=97)
                  and self.clean_after(fresh_index), "probe_same_receiver_fresh_input_failed")
        if (self.receiver.pid != receiver_pid or self.receiver.poll() is not None
                or self.compositor.poll() is not None):
            raise TrialError("probe_same_receiver_or_compositor_lost")
        require_same_stack(identity, self.compositor.pid)
        self.checks.update(("same_receiver_fresh_input", "private_compositor_survived"))

    def cleanup(self):
        # Single-threaded helper never reaps a live child's PID before signaling.
        for child in reversed(self.children):
            if child.poll() is None:
                try:
                    child.terminate()
                except ProcessLookupError:
                    pass
        end = time.monotonic() + 1
        while time.monotonic() < end:
            if all(child.poll() is not None for child in self.children):
                break
            time.sleep(0.025)
        for child in self.children:
            if child.poll() is None:
                try:
                    child.kill()
                except ProcessLookupError:
                    pass
            child.wait(timeout=1)
        # Activation daemons are adopted by our subreaper after parents exit.
        end = time.monotonic() + 2
        while time.monotonic() < end:
            children = Path(f"/proc/self/task/{os.getpid()}/children").read_text().split()
            for value in children:
                try:
                    os.kill(int(value), signal.SIGKILL)
                except ProcessLookupError:
                    pass
            while True:
                try:
                    pid, _ = os.waitpid(-1, os.WNOHANG)
                except ChildProcessError:
                    pid = 0
                if pid == 0:
                    break
            if not Path(f"/proc/self/task/{os.getpid()}/children").read_text().split():
                self.selector.close()
                self.checks.add("private_cleanup_reaped")
                return
            time.sleep(0.025)
        raise TrialError("probe_private_cleanup_incomplete")


def main():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    marker = assert_private_environment()
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:
        raise RuntimeError("probe_private_subreaper_failed")
    trial = Trial(marker)
    result = {"nonce": marker["nonce"], "binding_digest": marker["identity"]["binding_digest"],
              "passed": False}
    try:
        trial.run()
        result["passed"] = True
    except Exception as exc:
        code = str(exc)
        result["code"] = (code if re.fullmatch(r"[a-z][a-z0-9_]{0,95}", code)
                          else "probe_private_" + trial.stage + "_failed")
        result["diagnostic"] = {"stage": trial.stage, "type": type(exc).__name__,
                                "detail": str(exc)[:512]}
        result["stack_detail"] = getattr(exc, "stack_detail", None)
        result["errors"] = [row for rows in trial.outputs.values() for row in rows
                            if row.get("kind") == "error" or row.get("event") == "error"][-4:]
        result["receiver_events"] = [row for row in trial.rows if row.get("kind") == "event"][-16:]
        result["receiver_tail"] = trial.rows[-2:]
    finally:
        try:
            trial.cleanup()
        except Exception:
            result["passed"] = False
            result["code"] = "probe_private_cleanup_incomplete"
    result["checks"] = sorted(trial.checks)
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
