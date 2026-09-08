"""One action, two XTEST connections, a finite nonrenewable owned-input lease.

Persistent XI2 masters are reused without removal. When unavailable the original
shared core XTEST path remains. No physical slave or global key-up is injected.
The controller pipe stays open while input is permitted. While this guardian
survives and native operations respond, its loss, cancellation, helper exit and
the fixed lease fence the helper before ledger-only release. Abrupt death of this
sole ledger owner on shared X11 has no proven universal server-side release
guarantee; helper-death handling is not guardian-death qualification.
"""

from __future__ import annotations

import contextlib
import json
import math
import os
import select
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Literal, TypeAlias, TypedDict, cast

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

LEASE_SECONDS = 2.0
DISPATCH_SECONDS = 1.75
MAX_MESSAGE = 65536
# Admission reserve, not a latency promise. Slow native round trips are also
# sampled before the first down. Neither estimate extends the fixed lease.
DISPATCH_STEP_SECONDS = 0.005
WAIT_QUANTUM_SECONDS = 0.005
MODIFIER_KEYSYMS = {"ctrl": "Control_L", "alt": "Alt_L", "shift": "Shift_L", "super": "Super_L"}


class ActionDiagnostics(TypedDict):
    phase: Literal["preflight", "dispatch", "release", "verification", "complete"]
    steps_planned: int
    steps_completed: int
    release: Literal["confirmed", "unknown"]
    reason: str


def safe_reason(reason):
    """Only static public reason codes, never exception prose or native data."""
    allowed = {
        "complete",
        "invalid_lease",
        "synthetic_code_already_held",
        "release_without_owned_intent",
        "input_helper_eof",
        "input_helper_protocol",
        "input_helper_failed",
        "session_lease_revoked",
        "supervisor_parent_revoked",
        "input_lease_expired",
        "controller_eof",
        "controller_cancel",
        "input_device_identity_changed",
        "other_synthetic_input_held",
        "human_input_overlap",
        "input_dispatch_expired",
        "input_scope_or_native_failed",
        "owned_release_failed",
        "display_asleep",
        "stale_source",
        "shared_pointer_changed",
        "invalid_point",
        "point_outside_source",
        "point_outside_application",
        "invalid_polyline",
        "invalid_scroll_count",
        "invalid_scroll_direction",
        "invalid_text",
        "unsupported_action",
        "unsupported_key",
        "unsupported_character",
        "injected_keyboard_mapping_unavailable",
        "input_guardian_unavailable",
        "accessible_target_unavailable",
        "accessible_target_changed",
        "native_field_failed",
        "application_identity_unavailable",
        "application_identity_changed",
        "application_scope_unavailable",
        "application_scope_changed",
        "source_scope_unavailable",
        "application_uid_mismatch",
        "application_process_unreadable",
        "no_focused_application",
        "focused_application_outside_source",
    }
    return (
        reason if isinstance(reason, str) and reason in allowed else "input_scope_or_native_failed"
    )


def diagnostics(phase, planned, completed, released, reason) -> ActionDiagnostics:
    return {
        "phase": phase,
        "steps_planned": planned,
        "steps_completed": completed,
        "release": "confirmed" if released else "unknown",
        "reason": safe_reason(reason),
    }


def dispatch_budget(steps, *, step_seconds=DISPATCH_STEP_SECONDS):
    """Reserve a whole plan before any down, including the wait-loop granularity."""
    return sum(
        step_seconds
        + (
            math.ceil(step[1] / WAIT_QUANTUM_SECONDS) * WAIT_QUANTUM_SECONDS
            if step[0] == "wait"
            else 0
        )
        for step in steps
    )


InputStep: TypeAlias = (
    tuple[Literal["move"], int, int]
    | tuple[Literal["button", "key"], int, bool]
    | tuple[Literal["wait"], float]
    | tuple[Literal["semantic"]]
)


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
        held = (
            self.native.owned_release_state()
            if hasattr(self.native, "owned_release_state")
            else self.native.held()
        )
        released = not errors and not (self.keys & held["keys"] or self.buttons & held["buttons"])
        if released:
            self.keys.clear()
            self.buttons.clear()
        return released


class InjectionHelper:
    def __init__(
        self,
        display_name,
        environment,
        *,
        mode="shared",
        expected_device_identity=None,
        keyboard_mapping_identity=None,
        session_prefix=None,
        session_lease_fd=None,
    ):
        self.sock, child_sock = socket.socketpair()
        try:
            self.process = subprocess.Popen(
                [sys.executable, "-I", __file__, "--injector", str(child_sock.fileno())],
                pass_fds=(child_sock.fileno(),)
                + ((session_lease_fd,) if session_prefix is not None else ()),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env=environment,
            )
        except BaseException:
            self.sock.close()
            raise
        finally:
            child_sock.close()
        self.buffer = b""
        self.sock.sendall(
            json.dumps(
                {
                    "display_name": display_name,
                    "mode": mode,
                    "expected_device_identity": expected_device_identity,
                    "keyboard_mapping_identity": keyboard_mapping_identity,
                    **(
                        {"session_prefix": session_prefix, "session_lease_fd": session_lease_fd}
                        if session_prefix is not None
                        else {}
                    ),
                }
            ).encode()
            + b"\n"
        )

    def exchange(self, command, guard):
        guard()
        self.sock.sendall(json.dumps(command).encode() + b"\n")
        while b"\n" not in self.buffer:
            guard()
            if select.select([self.sock], [], [], 0.005)[0]:
                data = self.sock.recv(4096)
                if not data:
                    raise GuardianFailure("input_helper_eof")
                self.buffer += data
                if len(self.buffer) > 4096:
                    raise GuardianFailure("input_helper_protocol")
        line, self.buffer = self.buffer.split(b"\n", 1)
        if line != b'{"ok":true}':
            raise GuardianFailure("input_helper_failed")

    def ready(self, guard):
        # Native connection/module startup is a one-time cost, not a per-vertex
        # latency sample. This no-effect ACK uses the SAME nonrenewable lease.
        self.exchange({"op": "ready"}, guard)

    def fence(self):
        # Normal EOF first. Only this exact owned child may be terminated.
        self.sock.close()
        try:
            self.process.wait(timeout=0.15)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try:
                self.process.wait(timeout=0.15)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=0.2)
        return self.process.returncode is not None


class Guardian:
    def __init__(
        self,
        native,
        helper,
        validate,
        *,
        controller_fd=0,
        clock=time.monotonic,
        lease_seconds=LEASE_SECONDS,
    ):
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
        self.phase = "preflight"
        self.steps_completed = 0

    def guard(self, *, check_helper=True):
        from src.computer.runtime import x11_worker_lifecycle

        session_fd = vars(self.native).get("session_lease_fd")
        if session_fd is not None and os.pread(session_fd, 1, 0) != b"1":
            raise GuardianFailure("session_lease_revoked")
        if x11_worker_lifecycle.REVOKED:
            raise GuardianFailure("supervisor_parent_revoked")
        if self.clock() >= self.deadline:
            raise GuardianFailure("input_lease_expired")
        if self.controller_fd is not None and select.select([self.controller_fd], [], [], 0)[0]:
            message = os.read(self.controller_fd, 4096)
            raise GuardianFailure("controller_eof" if not message else "controller_cancel")
        if check_helper and self.helper.process.poll() is not None:
            raise GuardianFailure("input_helper_eof")
        if self.native.identity() != self.identity:
            raise GuardianFailure("input_device_identity_changed")
        synthetic = self.native.held()
        if synthetic["keys"] - self.ledger.keys or synthetic["buttons"] - self.ledger.buttons:
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

    def run(self, steps, *, semantic=None, paced=False):
        released = False
        sampled_step_seconds = DISPATCH_STEP_SECONDS
        first_down = True
        wait_target = None
        try:
            ready = getattr(self.helper, "ready", None)
            if ready is not None:
                ready(self.dispatch_guard)
                self.dispatch_guard()
            if dispatch_budget(steps) >= self.dispatch_deadline - self.clock():
                raise GuardianFailure("input_dispatch_expired")
            for index, step in enumerate(steps):
                started = self.clock()
                self.guard()
                kind = step[0]
                owned_release = (
                    kind in {"key", "button"}
                    and step[2] is False
                    and step[1] in (self.ledger.keys if kind == "key" else self.ledger.buttons)
                )
                # Shortcut key-down can open a modal. Own tracked release must
                # not depend on old focus. All new input still needs that scope;
                # revocation, overlap, identity and the hard lease apply to all.
                if not owned_release:
                    self.dispatch_guard()
                    self.validate(step)
                    self.dispatch_guard()
                if kind in {"key", "button"} and step[2] and first_down:
                    # Include measured native move/guard latency before pressing.
                    if dispatch_budget(steps[index:], step_seconds=sampled_step_seconds) >= (
                        self.dispatch_deadline - self.clock()
                    ):
                        raise GuardianFailure("input_dispatch_expired")
                    first_down = False
                if kind == "wait":
                    # Polyline duration is a timeline, not extra sleep after
                    # every native scope check/round trip. Adding that latency
                    # at every vertex exhausted otherwise admissible leases.
                    # Click spacing remains relative; only strokes are paced.
                    if paced:
                        wait_target = (started if wait_target is None else wait_target) + step[1]
                        end = wait_target
                    else:
                        end = self.clock() + step[1]
                    while self.clock() < end:
                        self.dispatch_guard()
                        remaining = end - self.clock()
                        if remaining > 0:
                            time.sleep(min(WAIT_QUANTUM_SECONDS, remaining))
                    self.dispatch_guard()
                    self.steps_completed += 1
                    continue
                if kind == "semantic":
                    if semantic is None:
                        raise GuardianFailure("unsupported_action")

                    def before_effect():
                        self.dispatch_guard()
                        self.validate(step)
                        self.dispatch_guard()
                        self.phase = "dispatch"
                        self.injected = True

                    semantic(before_effect)
                    self.steps_completed += 1
                    self.guard()
                    continue
                if kind in {"key", "button"}:
                    self.ledger.prepare(kind, step[1], step[2])
                self.phase = "dispatch"
                self.injected = True  # Dispatch may have effects even without ACK.
                self.helper.exchange(
                    {"op": kind, "args": list(step[1:])},
                    self.guard if owned_release else self.dispatch_guard,
                )
                if kind in {"key", "button"}:
                    self.ledger.acknowledged(kind, step[1], step[2])
                self.steps_completed += 1  # ACK, never merely dispatch intent.
                sampled_step_seconds = max(sampled_step_seconds, self.clock() - started)
                self.guard()
        except Exception as exc:
            self.reason = safe_reason(
                str(exc)
                if isinstance(exc, GuardianFailure)
                or type(exc).__name__ in {"X11DeviceError", "ScopeFailure"}
                else "input_scope_or_native_failed"
            )
        finally:
            triggered = self.clock()
            try:
                fenced = self.helper.fence()
                if fenced:
                    # Drain overlap evidence again before and after release.
                    try:
                        self.ledger.uncertain |= (
                            bool(self.native.physical_events()) and self.injected
                        )
                    except Exception:
                        self.ledger.uncertain = self.injected
                    released = self.ledger.release()
                    try:
                        self.ledger.uncertain |= (
                            bool(self.native.physical_events()) and self.injected
                        )
                    except Exception:
                        self.ledger.uncertain = self.injected
            except Exception:
                released = False
            latency = (self.clock() - triggered) * 1000
        if not released or self.ledger.uncertain:
            if self.reason == "complete":
                self.reason = "owned_release_failed"
                self.phase = "release"
        elif self.reason == "complete":
            self.phase = "complete"
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
        return {
            "status": status,
            "injected": self.injected,
            "released": released and not self.ledger.uncertain,
            "reason": self.reason,
            "diagnostics": diagnostics(
                self.phase,
                len(steps),
                self.steps_completed,
                released and not self.ledger.uncertain,
                self.reason,
            ),
            "overlap_uncertain": self.ledger.uncertain,
            "release_ms": round(latency, 3),
            "shared_pointer": not independent,
            "shared_keyboard": not independent,
            "pointer": "independent" if independent else "shared",
            "keyboard_focus": "independent_per_window" if independent else "shared",
            "widget_focus": "shared_within_window",
            "persistent_input_devices": independent,
            "device_identity": self.identity,
            "owned_devices": devices if independent else "not_created",
            "applications_preserved": True,
        }


def input_steps(action, native):
    """Fixed action vocabulary. No model-supplied native code or arbitrary chord."""
    kind = action["type"]
    if kind == "replace_field_pixels":
        from src.computer.runtime.pixel_fields import pixel_field_steps

        return pixel_field_steps(action, native, error=GuardianFailure)
    modifier_codes = []
    if kind in {"click", "double_click", "right_click", "middle_click", "scroll", "polyline"}:
        modifiers = action.get("modifiers", [])
        if (
            type(modifiers) is not list
            or len(modifiers) > 4
            or any(type(m) is not str or m not in MODIFIER_KEYSYMS for m in modifiers)
            or len(set(modifiers)) != len(modifiers)
        ):
            raise GuardianFailure("unsupported_key")
        if modifiers:
            modifier_codes = native.key_plan(modifiers)
    if kind in {"click", "double_click", "right_click", "middle_click", "scroll"}:
        button: int | None = {"right_click": 3, "middle_click": 2}.get(kind, 1)
        count, delay = (2, 0.08) if kind == "double_click" else (1, 0.03)
        if kind != "scroll":
            count = action.get("count", count)
            if type(count) is not int or not 1 <= count <= 3:
                raise GuardianFailure("unsupported_action")
            delay = 0.08
        if kind == "scroll":
            count = action.get("count", 1)
            if type(count) is not int or not 1 <= count <= 20:
                raise GuardianFailure("invalid_scroll_count")
            button = {"up": 4, "down": 5, "left": 6, "right": 7}.get(action.get("direction"))
            if button is None:
                raise GuardianFailure("invalid_scroll_direction")
        steps: list[InputStep] = [("move", action["x"], action["y"])]
        steps.extend(("key", code, True) for code in modifier_codes)
        for i in range(count):
            if i:
                steps.append(("wait", delay))
            steps.extend(
                [("button", cast(int, button), True), ("button", cast(int, button), False)]
            )
        steps.extend(("key", code, False) for code in reversed(modifier_codes))
        return steps
    if kind == "polyline":
        points, duration = action["points"], action["duration"]
        if (
            type(points) is not list
            or not 2 <= len(points) <= 256
            or any(
                type(p) is not list or len(p) != 2 or any(type(v) is not int for v in p)
                for p in points
            )
            or type(duration) not in (float, int)
            or not math.isfinite(duration)
            or not 0 <= duration <= 1
        ):
            raise GuardianFailure("invalid_polyline")
        steps = [("move", *points[0])]
        steps.extend(("key", code, True) for code in modifier_codes)
        steps.append(("button", 1, True))
        for point in points[1:]:
            steps += [("wait", duration / (len(points) - 1)), ("move", *point)]
        return (
            steps
            + [("button", 1, False)]
            + [("key", code, False) for code in reversed(modifier_codes)]
        )
    if kind == "type":
        text = action["text"]
        if type(text) is not str or not 1 <= len(text) <= 512:
            raise GuardianFailure("invalid_text")
        chords = native.text_keys(text)
    elif kind == "key":
        from src.computer.runtime.primitives import parse_key_chord

        modifiers, symbol = parse_key_chord(action["chord"])
        chords = [native.key_plan(modifiers, symbol)]
    else:
        raise GuardianFailure("unsupported_action")
    return [
        event
        for chord in chords
        for event in (
            [("key", code, True) for code in chord]
            + [("key", code, False) for code in reversed(chord)]
        )
    ]


def assert_admitted_identity(native, expected):
    """Compare wire lists and native tuples without coercing device values."""
    if expected is None or json.dumps(native.identity()) != json.dumps(expected):
        raise GuardianFailure("input_device_identity_changed")


def execute(request, *, controller_fd=0, authorize=None):
    from src.computer.runtime.x11_session_lifecycle import input_lease

    lease = (
        input_lease(request.get("session_lease_fd"))
        if request.get("session_prefix") is not None
        else contextlib.nullcontext()
    )
    with lease:
        receipt = _execute(request, controller_fd=controller_fd, authorize=authorize)
    if request.get("session_prefix") is not None:
        receipt["session_input_devices"] = True
        receipt["persistent_input_devices"] = False
    return receipt


def _execute(request, *, controller_fd=0, authorize=None):
    from src.computer.runtime.x11_app_scope import AppScope
    from src.computer.runtime.x11_attached import attachment_configuration, worker_environment
    from src.computer.runtime.x11_attached_worker import AttachedConnection
    from src.computer.runtime.x11_owned_device import (
        UnsupportedCharacters,
        X11DeviceError,
        open_input,
    )

    config = attachment_configuration(
        request["display_name"], request["xauthority"], request["monitor_names"]
    )
    connection = AttachedConnection(config["display_name"])
    native = helper = None
    steps: list[InputStep] = []
    dispatched = False
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
        mode = request.get("input_mode")
        if mode not in {"shared", "independent"}:
            raise GuardianFailure("input_mode_required")
        if request.get("session_prefix") is not None:
            from src.computer.runtime.x11_owned_device import SessionXTest

            native = SessionXTest(config["display_name"], request["session_prefix"])
            native.session_lease_fd = request["session_lease_fd"]
        else:
            native = open_input(config["display_name"], mode=mode)
        assert_admitted_identity(native, request.get("expected_device_identity"))
        if native.independent_pointer:
            native.focus(expected["focus_window"])
        try:
            steps = (
                [("semantic",)]
                if request["action"]["type"] == "replace_field"
                else input_steps(request["action"], native)
            )
            if dispatch_budget(steps) >= DISPATCH_SECONDS:
                raise GuardianFailure("input_dispatch_expired")
            if request["action"]["type"] == "replace_field_pixels":
                from src.computer.runtime.pixel_fields import pixel_field_bounds

                pixel_field_bounds(request["action"], expected, monitor, error=GuardianFailure)
            # Validate every vertex before pressing. Dispatch rechecks scope.
            if request["action"]["type"] == "polyline":
                rx, ry, rw, rh = expected["rect"]
                for x, y in request["action"]["points"]:
                    if not (
                        monitor.x <= x < monitor.x + monitor.width
                        and monitor.y <= y < monitor.y + monitor.height
                    ):
                        raise GuardianFailure("point_outside_source")
                    if not (rx <= x < rx + rw and ry <= y < ry + rh):
                        raise GuardianFailure("point_outside_application")
        except (GuardianFailure, X11DeviceError, ValueError) as exc:
            idle = not any(native.owned_release_state().values())
            return {
                "status": "unavailable",
                "injected": False,
                "released": idle,
                "reason": safe_reason(str(exc)),
                "diagnostics": diagnostics("preflight", len(steps), 0, idle, str(exc)),
                "unsupported_characters": exc.characters
                if isinstance(exc, UnsupportedCharacters)
                else [],
                "clipboard_fallback": False,
                "device_identity": native.identity(),
                "persistent_input_devices": native.independent_pointer,
                "owned_devices": ("persistent_idle" if idle else "persistent_release_unverified")
                if native.independent_pointer
                else "not_created",
            }
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
                if not (
                    monitor.x <= x < monitor.x + monitor.width
                    and monitor.y <= y < monitor.y + monitor.height
                ):
                    raise GuardianFailure("point_outside_source")
                # Move within exact source bounds, then resolve the actual owned
                # pointer hit before any press. Eligible popups can lie outside
                # the focused application's rectangle; this is not a hit bypass.
                # A held polyline move can itself affect a window before the
                # next press gate. Do not widen existing drag geometry here.
                if request["action"]["type"] == "polyline":
                    rx, ry, rw, rh = expected["rect"]
                    if not (rx <= x < rx + rw and ry <= y < ry + rh):
                        raise GuardianFailure("point_outside_application")
                scope.assert_snapshot(expected, monitor)
                pointer[0] = (x, y)
            else:
                if pointer[0] is not None:
                    if native.pointer() != pointer[0]:
                        raise GuardianFailure("shared_pointer_changed")
                    scope.assert_snapshot(
                        expected,
                        monitor,
                        point=pointer[0],
                        pointer_query=native.query_pointer,
                        **(
                            {"require_focused_window": True}
                            if request["action"]["type"] == "replace_field_pixels"
                            else {}
                        ),
                    )
                else:
                    scope.assert_snapshot(expected, monitor)

        helper = InjectionHelper(
            config["display_name"],
            worker_environment(config["xauthority"]),
            mode=mode,
            expected_device_identity=native.identity(),
            keyboard_mapping_identity=native.keyboard_mapping_identity,
            **(
                {
                    "session_prefix": request["session_prefix"],
                    "session_lease_fd": request["session_lease_fd"],
                }
                if request.get("session_prefix") is not None
                else {}
            ),
        )
        if authorize is not None:
            authorize(helper)
        guardian = Guardian(native, helper, validate, controller_fd=controller_fd)
        dispatched = True
        if request["action"]["type"] == "replace_field":
            from src.computer.runtime.accessibility import PrimitiveError, bounded_text
            from src.computer.runtime.x11_accessibility import AttachedAccessibility

            accessibility = AttachedAccessibility(connection._display, expected)
            saved = request.get("accessible_reference")
            action = request["action"]

            def semantic_guard():
                guardian.dispatch_guard()
                validate(("semantic",))
                guardian.dispatch_guard()

            def semantic(before_effect):
                try:
                    if (
                        type(saved) is not dict
                        or action.get("target") != saved.get("handle")
                        or action.get("observation_id") != saved.get("observation_id")
                    ):
                        raise GuardianFailure("accessible_target_changed")
                    bounded_text(action.get("text"))
                    accessibility.restore(saved, semantic_guard)
                    accessibility.execute(
                        action, saved["window"], semantic_guard, before_effect=before_effect
                    )
                except PrimitiveError as exc:
                    reason = (
                        "accessible_target_changed"
                        if exc.status == "rejected"
                        else "accessible_target_unavailable"
                        if exc.status == "unsupported"
                        else "native_field_failed"
                    )
                    raise GuardianFailure(reason) from None

            try:
                receipt = guardian.run(steps, semantic=semantic)
                if receipt.get("status") == "executed" and receipt.get("released") is True:
                    # Original GI node after helper fence and owned-ledger release.
                    def readback_guard():
                        guardian.guard(check_helper=False)
                        validate(("semantic",))
                        guardian.guard(check_helper=False)

                    try:
                        actual = accessibility.read_field(
                            action["target"], saved["window"], readback_guard
                        )
                        receipt["field_observation"] = {**actual, "target": action["target"]}
                    except Exception:
                        pass
            finally:
                with contextlib.suppress(Exception):
                    accessibility.close()
        else:
            receipt = guardian.run(steps, paced=request["action"]["type"] == "polyline")
        if (
            request.get("verify_pointer") is True
            and receipt.get("status") == "executed"
            and receipt.get("released") is True
            and receipt.get("injected") is True
        ):
            # Measured AFTER the helper is fenced and owned input released. This
            # proves pointer location only, never that a widget accepted a click.
            try:
                from src.computer.runtime.x11_attached import same_application_scope

                actual = native.pointer()
                current = scope.snapshot(monitor)
                matches = same_application_scope(expected, current)
                if matches:
                    try:
                        scope.assert_snapshot(
                            current, monitor, point=actual, pointer_query=native.query_pointer
                        )
                    except Exception:
                        matches = False
                receipt["pointer_observation"] = {
                    "x": actual[0],
                    "y": actual[1],
                    "target_window_matches": matches,
                }
            except Exception:
                pass  # A missing postcondition does not erase acknowledged input.
        return receipt
    except Exception as exc:
        if dispatched:
            raise  # Lost post-dispatch evidence must remain unknown, never replay.
        idle = native is None
        if native is not None:
            with contextlib.suppress(Exception):
                idle = not any(native.owned_release_state().values())
        reason = safe_reason(str(exc))
        return {
            "status": "unavailable",
            "injected": False,
            "released": idle,
            "reason": reason,
            "input_opened": native is not None,
            "diagnostics": diagnostics("preflight", len(steps), 0, idle, reason),
        }
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

    sock = socket.socket(fileno=fd)
    stream = sock.makefile("rwb", buffering=0)
    first = json.loads(stream.readline(MAX_MESSAGE))
    lease = contextlib.ExitStack()
    try:
        if first.get("session_prefix") is not None:
            from src.computer.runtime.x11_owned_device import SessionXTest
            from src.computer.runtime.x11_session_lifecycle import input_lease

            lease.enter_context(input_lease(first.get("session_lease_fd")))
            native = SessionXTest(first["display_name"], first["session_prefix"])
        else:
            native = open_input(first["display_name"], mode=first.get("mode", "shared"))
    except BaseException:
        lease.close()
        raise
    ledger = None
    deadline = time.monotonic() + LEASE_SECONDS
    if native.independent_pointer:
        # Dedicated endpoints survive their clients. Keep a second potential-down
        # ledger in the injector so a killed guardian cannot strand held input.
        # Shared fallback preserves its original external-ledger behavior.
        parent_watch(injector=False)
        ledger = OwnedLedger(native)
    pending = bytearray()
    try:
        if first.get("expected_device_identity") is not None:
            assert_admitted_identity(native, first["expected_device_identity"])
        native.keyboard_mapping_identity = first.get("keyboard_mapping_identity")

        def dispatch_check():
            # No X calls. Preparation, mapping validation and identity queries
            # can each return only after the fixed lease has already expired.
            from src.computer.runtime import x11_worker_lifecycle

            if x11_worker_lifecycle.REVOKED:
                raise GuardianFailure("supervisor_parent_revoked")
            session_fd = first.get("session_lease_fd")
            if session_fd is not None and os.pread(session_fd, 1, 0) != b"1":
                raise GuardianFailure("session_lease_revoked")
            if time.monotonic() >= deadline:
                raise GuardianFailure("input_lease_expired")
            if select.select([stream], [], [], 0)[0]:
                if not sock.recv(1, socket.MSG_PEEK):
                    raise GuardianFailure("controller_eof")

        native.dispatch_check = dispatch_check
        while True:
            if ledger is not None:
                from src.computer.runtime import x11_worker_lifecycle

                if x11_worker_lifecycle.REVOKED or time.monotonic() >= deadline:
                    break
                if not select.select([stream], [], [], 0.02)[0]:
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
            if op == "ready":
                dispatch_check()
                stream.write(b'{"ok":true}\n')
                continue
            if op == "quit":
                if ledger is not None:
                    break
                os._exit(0)  # Deliberate abrupt normal EOF; supervisor still owns ledger.
            if op not in {"key", "button", "move"}:
                raise GuardianFailure("unsupported_helper_operation")
            if ledger is not None and op in {"key", "button"}:
                ledger.prepare(op, *args)
            dispatch_check()
            getattr(native, op)(*args)
            native.sync()
            if ledger is not None and op in {"key", "button"}:
                ledger.acknowledged(op, *args)
            stream.write(b'{"ok":true}\n')
    finally:
        try:
            if ledger is not None:
                ledger.release()
        finally:
            try:
                native.close()
            finally:
                lease.close()
                stream.close()
                sock.close()


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
            receipt = {
                "status": "unknown",
                "injected": True,
                "released": False,
                "reason": "input_guardian_unavailable",
                "diagnostics": diagnostics("dispatch", 0, 0, False, "input_guardian_unavailable"),
            }
        print(json.dumps(receipt, separators=(",", ":")), flush=True)
