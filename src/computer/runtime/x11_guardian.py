"""One action, two XTEST connections, a finite nonrenewable owned-input lease.

Persistent XI2 masters are reused without removal. When unavailable the original
shared core XTEST path remains. No physical slave or global key-up is injected.
The controller pipe stays open while input is permitted. Its loss, cancellation,
helper exit and the fixed lease all fence the helper before ledger-only release.
"""
from __future__ import annotations

import contextlib
import json
import os
import select
import socket
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

LEASE_SECONDS = 2.0
DISPATCH_SECONDS = 1.75
MAX_MESSAGE = 65536


class GuardianFailure(RuntimeError):  # noqa: N818 - Runtime adapter failure convention.
    pass


class OwnedLedger:
    """Potential-down before dispatch, never infer ownership from server state."""
    def __init__(self, native):
        self.native = native
        self.keys, self.buttons = set(), set()
        self.uncertain = False

    def prepare(self, kind, code, down):
        mine = self.keys if kind == "key" else self.buttons
        held = self.native.held()["keys" if kind == "key" else "buttons"]
        if down:
            if code in held or code in mine:
                raise GuardianFailure("synthetic_code_already_held")
            mine.add(code)  # Intent may reach the helper even if its ACK is lost.
        elif code not in mine:
            raise GuardianFailure("release_without_owned_intent")

    def acknowledged(self, kind, code, down):
        if not down:
            held = self.native.held()["keys" if kind == "key" else "buttons"]
            if code not in held:
                (self.keys if kind == "key" else self.buttons).discard(code)

    def release(self):
        # No potentially-held code means no native release work. Capture, RandR,
        # focus and even a lost server must not turn a proven empty ledger into
        # spurious release failure. A fenced helper is still required by caller.
        if not self.keys and not self.buttons:
            return True
        errors = []
        try:
            physical = self.native.physical_held()
            self.uncertain |= bool(self.keys & physical["keys"])
        except Exception:
            self.uncertain = True
        for kind, codes in (("button", self.buttons), ("key", self.keys)):
            for code in sorted(codes, reverse=True):
                try:
                    # Even when physical state overlaps, address ONLY synthetic
                    # slave. Core keys may overlap; never "repair" human state.
                    if hasattr(self.native, "release_owned"):
                        self.native.release_owned(kind, code)
                    else:
                        getattr(self.native, kind)(code, False)
                        self.native.sync()
                except Exception:
                    errors.append("owned_release_failed")
        held = (self.native.owned_release_state() if hasattr(self.native, "owned_release_state")
                else self.native.held())
        released = not errors and not (self.keys & held["keys"] or self.buttons & held["buttons"])
        if released:
            self.keys.clear()
            self.buttons.clear()
        return released


class InjectionHelper:
    def __init__(self, display_name, environment, *, mode="shared"):
        self.sock, child_sock = socket.socketpair()
        try:
            self.process = subprocess.Popen(
                [sys.executable, "-I", __file__, "--injector", str(child_sock.fileno())],
                pass_fds=(child_sock.fileno(),), stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=environment)
        except BaseException:
            self.sock.close()
            raise
        finally:
            child_sock.close()
        self.buffer = b""
        self.sock.sendall(json.dumps({"display_name": display_name, "mode": mode}).encode() + b"\n")

    def exchange(self, command, guard):
        guard()
        self.sock.sendall(json.dumps(command).encode() + b"\n")
        while b"\n" not in self.buffer:
            guard()
            if select.select([self.sock], [], [], .005)[0]:
                data = self.sock.recv(4096)
                if not data:
                    raise GuardianFailure("input_helper_eof")
                self.buffer += data
                if len(self.buffer) > 4096:
                    raise GuardianFailure("input_helper_protocol")
        line, self.buffer = self.buffer.split(b"\n", 1)
        if line != b'{"ok":true}':
            raise GuardianFailure("input_helper_failed")

    def fence(self):
        # Normal EOF first. Only this exact owned child may be terminated.
        self.sock.close()
        try:
            self.process.wait(timeout=.15)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=.15)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=.2)
        return self.process.returncode is not None


class Guardian:
    def __init__(self, native, helper, validate, *, controller_fd=0, clock=time.monotonic,
                 lease_seconds=LEASE_SECONDS):
        if not 0 < lease_seconds <= LEASE_SECONDS:
            raise GuardianFailure("invalid_lease")
        self.native, self.helper, self.validate = native, helper, validate
        self.controller_fd, self.clock = controller_fd, clock
        self.deadline = clock() + lease_seconds
        self.dispatch_deadline = min(self.deadline, clock() + DISPATCH_SECONDS)
        self.ledger = OwnedLedger(native)
        self.identity = native.identity()
        self.injected = False
        self.reason = "complete"

    def guard(self):
        from src.computer.runtime import x11_worker_lifecycle
        if x11_worker_lifecycle.REVOKED:
            raise GuardianFailure("supervisor_parent_revoked")
        if self.clock() >= self.deadline:
            raise GuardianFailure("input_lease_expired")
        if self.controller_fd is not None and select.select([self.controller_fd], [], [], 0)[0]:
            message = os.read(self.controller_fd, 4096)
            raise GuardianFailure("controller_eof" if not message else "controller_cancel")
        if self.helper.process.poll() is not None:
            raise GuardianFailure("input_helper_eof")
        if self.native.identity() != self.identity:
            raise GuardianFailure("input_device_identity_changed")
        synthetic = self.native.held()
        if (synthetic["keys"] - self.ledger.keys
                or synthetic["buttons"] - self.ledger.buttons):
            self.ledger.uncertain |= self.injected
            raise GuardianFailure("other_synthetic_input_held")
        physical = self.native.physical_held()
        events = self.native.physical_events()
        if events or physical["keys"] or physical["buttons"]:
            self.ledger.uncertain |= self.injected
            raise GuardianFailure("human_input_overlap")

    def dispatch_guard(self):
        self.guard()
        if self.clock() >= self.dispatch_deadline:
            raise GuardianFailure("input_dispatch_expired")

    def run(self, steps):
        released = False
        try:
            for step in steps:
                self.guard()
                kind = step[0]
                owned_release = (kind in {"key", "button"} and step[2] is False
                                 and step[1] in (self.ledger.keys if kind == "key"
                                                 else self.ledger.buttons))
                # Shortcut key-down can open a modal. Own tracked release must
                # not depend on old focus. All new input still needs that scope;
                # revocation, overlap, identity and the hard lease apply to all.
                if not owned_release:
                    self.dispatch_guard()
                    self.validate(step)
                    self.dispatch_guard()
                if kind == "wait":
                    end = min(self.dispatch_deadline + .01, self.clock() + step[1])
                    while self.clock() < end:
                        self.dispatch_guard()
                        time.sleep(.005)
                    continue
                if kind in {"key", "button"}:
                    self.ledger.prepare(kind, step[1], step[2])
                self.injected = True  # Dispatch may have effects even without ACK.
                self.helper.exchange({"op": kind, "args": list(step[1:])},
                                     self.guard if owned_release else self.dispatch_guard)
                if kind in {"key", "button"}:
                    self.ledger.acknowledged(kind, step[1], step[2])
                self.guard()
        except Exception as exc:
            self.reason = (str(exc) if isinstance(exc, GuardianFailure)
                           or type(exc).__name__ == "X11DeviceError"
                           else "input_scope_or_native_failed")
        finally:
            triggered = self.clock()
            try:
                fenced = self.helper.fence()
                if fenced:
                    # Drain overlap evidence again before and after release.
                    try:
                        self.ledger.uncertain |= (bool(self.native.physical_events())
                                                  and self.injected)
                    except Exception:
                        self.ledger.uncertain = self.injected
                    released = self.ledger.release()
                    try:
                        self.ledger.uncertain |= (bool(self.native.physical_events())
                                                  and self.injected)
                    except Exception:
                        self.ledger.uncertain = self.injected
            except Exception:
                released = False
            latency = (self.clock() - triggered) * 1000
        success = self.reason == "complete" and released and not self.ledger.uncertain
        persistent_idle = False
        if getattr(self.native, "independent_pointer", False) and released:
            try:
                persistent_idle = not any(self.native.owned_release_state().values())
            except Exception:
                persistent_idle = False
        status = "executed" if success else ("unknown" if self.injected else "unavailable")
        independent = getattr(self.native, "independent_pointer", False)
        devices = "persistent_idle" if persistent_idle else "persistent_release_unverified"
        return {"status": status,
                "injected": self.injected, "released": released, "reason": self.reason,
                "overlap_uncertain": self.ledger.uncertain, "release_ms": round(latency, 3),
                "shared_pointer": not independent, "shared_keyboard": not independent,
                "pointer": "independent" if independent else "shared",
                "keyboard_focus": "independent_per_window" if independent else "shared",
                "widget_focus": "shared_within_window",
                "persistent_input_devices": independent,
                "device_identity": self.identity,
                "owned_devices": devices if independent else "not_created",
                "applications_preserved": True}


def input_steps(action, native):
    """Fixed action vocabulary. No model-supplied native code or arbitrary chord."""
    kind = action["type"]
    if kind in {"click", "double_click", "right_click", "middle_click", "scroll"}:
        button = {"right_click": 3, "middle_click": 2}.get(kind, 1)
        count, delay = (2, .08) if kind == "double_click" else (1, .03)
        if kind == "scroll":
            count = action.get("count", 1)
            if type(count) is not int or not 1 <= count <= 20:
                raise GuardianFailure("invalid_scroll_count")
            button = {"up": 4, "down": 5, "left": 6, "right": 7}.get(action.get("direction"))
            if button is None:
                raise GuardianFailure("invalid_scroll_direction")
        steps = [("move", action["x"], action["y"])]
        for i in range(count):
            if i:
                steps.append(("wait", delay))
            steps.extend([("button", button, True), ("button", button, False)])
        return steps
    if kind == "polyline":
        points, duration = action["points"], action["duration"]
        if (not 2 <= len(points) <= 256 or type(duration) not in (float, int)
                or not 0 <= duration <= 1):
            raise GuardianFailure("invalid_polyline")
        steps = [("move", *points[0]), ("button", 1, True)]
        for point in points[1:]:
            steps += [("wait", duration / (len(points) - 1)), ("move", *point)]
        return steps + [("button", 1, False)]
    if kind == "type":
        text = action["text"]
        if type(text) is not str or not 1 <= len(text) <= 512:
            raise GuardianFailure("invalid_text")
        chords = native.text_keys(text)
    elif kind == "key":
        from src.computer.runtime.primitives import parse_key_chord
        modifiers, symbol = parse_key_chord(action["chord"])
        mapping = {"ctrl": "Control_L", "shift": "Shift_L", "alt": "Alt_L", "super": "Super_L"}
        chords = [[native.keycode(mapping[k]) for k in modifiers] + [native.keycode(symbol)]]
    else:
        raise GuardianFailure("unsupported_action")
    return [event for chord in chords for event in
            ([('key', code, True) for code in chord]
             + [('key', code, False) for code in reversed(chord)])]


def execute(request, *, controller_fd=0, authorize=None):
    from src.computer.runtime.x11_app_scope import AppScope
    from src.computer.runtime.x11_attached import attachment_configuration, worker_environment
    from src.computer.runtime.x11_attached_worker import AttachedConnection
    from src.computer.runtime.x11_owned_device import (
        UnsupportedCharacters,
        X11DeviceError,
        open_input,
    )
    config = attachment_configuration(request["display_name"], request["xauthority"],
                                      request["monitor_names"])
    connection = AttachedConnection(config["display_name"])
    native = helper = None
    try:
        if connection.power_status() == "display_asleep":
            raise GuardianFailure("display_asleep")
        topology = connection.topology()
        sources = connection.named_sources(topology, config["monitor_names"])
        selected = request["selected"]
        if selected not in sources:
            raise GuardianFailure("stale_source")
        monitor = topology.monitors[selected["index"]]
        scope = AppScope(connection._display)
        expected = request["scope"]
        scope.assert_snapshot(expected, monitor)
        native = open_input(config["display_name"])
        if native.independent_pointer:
            native.focus(expected["focus_window"])
        try:
            steps = input_steps(request["action"], native)
        except (X11DeviceError, ValueError) as exc:
            idle = not any(native.owned_release_state().values())
            return {"status": "unavailable", "injected": False, "released": True,
                    "reason": str(exc), "unsupported_characters":
                    exc.characters if isinstance(exc, UnsupportedCharacters) else [],
                    "clipboard_fallback": False, "device_identity": native.identity(),
                    "persistent_input_devices": native.independent_pointer,
                    "owned_devices": ("persistent_idle" if idle
                                      else "persistent_release_unverified")
                    if native.independent_pointer else "not_created"}
        pointer: list[tuple[int, int] | None] = [None]
        def validate(step):
            if connection.power_status() == "display_asleep":
                raise GuardianFailure("display_asleep")
            if connection.topology() != topology:
                raise GuardianFailure("stale_source")
            if step[0] == "move":
                if pointer[0] is not None and native.pointer() != pointer[0]:
                    raise GuardianFailure("shared_pointer_changed")
                x, y = step[1:]
                if any(type(v) is not int for v in (x, y)):
                    raise GuardianFailure("invalid_point")
                rx, ry, rw, rh = expected["rect"]
                if not (monitor.x <= x < monitor.x + monitor.width
                        and monitor.y <= y < monitor.y + monitor.height
                        and rx <= x < rx + rw and ry <= y < ry + rh):
                    raise GuardianFailure("point_outside_application")
                scope.assert_snapshot(expected, monitor)
                pointer[0] = (x, y)
            else:
                if pointer[0] is not None:
                    if native.pointer() != pointer[0]:
                        raise GuardianFailure("shared_pointer_changed")
                    scope.assert_snapshot(expected, monitor, point=pointer[0])
                else:
                    scope.assert_snapshot(expected, monitor)
        helper = InjectionHelper(config["display_name"], worker_environment(config["xauthority"]),
                                 mode="independent" if native.independent_pointer else "shared")
        if authorize is not None:
            authorize(helper)
        return Guardian(native, helper, validate, controller_fd=controller_fd).run(steps)
    finally:
        if helper is not None and helper.process.poll() is None:
            helper.fence()
        if native is not None:
            native.close()
        connection.close()


def injector(fd):
    from src.computer.runtime.x11_worker_lifecycle import parent_watch
    parent_watch(injector=True)
    from src.computer.runtime.x11_owned_device import open_input
    stream = socket.socket(fileno=fd).makefile("rwb", buffering=0)
    first = json.loads(stream.readline(MAX_MESSAGE))
    native = open_input(first["display_name"], mode=first.get("mode", "shared"))
    if native.independent_pointer:
        # Dedicated endpoints survive their clients. Keep a second potential-down
        # ledger in the injector so a killed guardian cannot strand held input.
        # Shared fallback preserves its original external-ledger behavior.
        parent_watch(injector=False)
        ledger = OwnedLedger(native)
        deadline = time.monotonic() + LEASE_SECONDS
    else:
        ledger = None
    pending = bytearray()
    try:
        while True:
            if ledger is not None:
                from src.computer.runtime import x11_worker_lifecycle
                if x11_worker_lifecycle.REVOKED or time.monotonic() >= deadline:
                    break
                if not select.select([stream], [], [], .02)[0]:
                    continue
                byte = stream.read(1)
                if not byte:
                    break
                pending.extend(byte)
                if len(pending) > MAX_MESSAGE:
                    raise GuardianFailure("input_helper_protocol")
                if byte != b"\n":
                    continue
                line, pending = bytes(pending), bytearray()
            else:
                line = stream.readline(MAX_MESSAGE)
            if not line:
                break
            command = json.loads(line)
            op, args = command["op"], command.get("args", [])
            if op == "quit":
                if ledger is not None:
                    break
                os._exit(0)  # Deliberate abrupt normal EOF; supervisor still owns ledger.
            if op not in {"key", "button", "move"}:
                raise GuardianFailure("unsupported_helper_operation")
            if ledger is not None and op in {"key", "button"}:
                ledger.prepare(op, *args)
            getattr(native, op)(*args)
            native.sync()
            if ledger is not None and op in {"key", "button"}:
                ledger.acknowledged(op, *args)
            stream.write(b'{"ok":true}\n')
    finally:
        if ledger is not None:
            ledger.release()
        native.close()
        stream.close()


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--injector":
        injector(int(sys.argv[2]))
    else:
        try:
            from src.computer.runtime.x11_worker_lifecycle import (
                acknowledge,
                announce,
                parent_watch,
                read_gate,
            )
            parent_watch()
            gated = "--identity-gate" in sys.argv
            if gated:
                announce("guardian")
            # Read raw fd without buffered read-ahead: following EOF/cancel is
            # independently observed by select(), not hidden in a Python buffer.
            request = read_gate()
            def authorize(helper):
                acknowledge(announce("injector", helper.process.pid))
            with contextlib.redirect_stdout(sys.stderr):
                receipt = execute(request, authorize=authorize if gated else None)
        except Exception:
            receipt = {"status": "unknown", "injected": True, "released": False,
                       "reason": "input_guardian_unavailable"}
        print(json.dumps(receipt, separators=(",", ":")), flush=True)
