"""Bounded exact-target X11 recovery. Never synthesizes keys or buttons.

The WM activation request is an effect, not proof of focus. Native focus and
scope must be measured again, then the controller must capture fresh pixels.
This does not make X11 checks atomic against other clients.
"""

from __future__ import annotations

import contextlib
import json
import select
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

QUIET_SECONDS = 1.0
WAIT_SECONDS = 30.0
TAKEOVER_SECONDS = 5.0


class IncarnationWatch:
    """Dedicated read-only structure stream, separate from RandR's event drain.

    XIDs lack a native incarnation counter. Conservatively invalidate recovery
    on any destroy/create/reparent, including within WM frames. Subscription
    traversal must be complete, bounded, and successful.
    """

    def __init__(self, display_name):
        from Xlib import display  # type: ignore[import-untyped]

        self.display = display.Display(display_name)
        self.epoch = 1
        try:
            self._subscribe()
            self.drain()
        except BaseException:
            self.close()
            raise

    def _subscribe(self):
        from Xlib import X  # type: ignore[import-untyped]

        pending = [(self.display.screen().root, 0)]
        seen: set[int] = set()
        deadline = time.monotonic() + 0.5
        while pending:
            window, depth = pending.pop()
            if (window.id in seen or len(seen) >= 2048 or depth > 32
                    or time.monotonic() >= deadline):
                raise RuntimeError("incarnation_subscription_unavailable")
            seen.add(window.id)
            errors: list[bool] = []
            window.change_attributes(
                event_mask=X.StructureNotifyMask | X.SubstructureNotifyMask,
                onerror=lambda *args, errors=errors: errors.append(True))
            children = window.query_tree().children
            if errors:
                raise RuntimeError("incarnation_subscription_unavailable")
            if len(children) + len(pending) + len(seen) > 2048:
                raise RuntimeError("incarnation_subscription_unavailable")
            pending.extend((child, depth + 1) for child in children)
        self.display.sync()

    def drain(self):
        from Xlib import X  # type: ignore[import-untyped]

        self.display.sync()
        changed = False
        for _ in range(4096):
            if not self.display.pending_events():
                break
            event = self.display.next_event()
            if (event.type & 0x7F) in {X.CreateNotify, X.DestroyNotify, X.ReparentNotify}:
                self.epoch += 1
                changed = True
        else:
            raise RuntimeError("incarnation_event_overflow")
        if changed:
            self._subscribe()
        return self.epoch

    def close(self):
        self.display.close()


class EnduringIncarnationWatch:
    """Retry failed read-only subscriptions without ever reviving old proofs.

    Ordinary window destruction can race a complete tree traversal. A failed
    traversal must still fail closed, but need not disable the whole attachment
    permanently. Every replacement gets a new outward serial, independent of
    the native watch's epoch. The caller must publish each unavailable result.

    Deliberately retain global invalidation: an unrelated window can revoke a
    proof. This is conservative liveness, not per-target incarnation tracking.
    Four total subscription attempts, at least one second apart, bound retries
    on a busy or unsupported desktop. Exhaustion requires a fresh attachment.
    """

    def __init__(self, display_name, *, factory=None, clock=time.monotonic):
        self._display_name = display_name
        self._factory = factory if factory is not None else IncarnationWatch
        self._clock = clock
        self._watch = None
        self._native_epoch = None
        self._serial = 0
        self._attempts = 0
        self._retry_at = 0.0
        self._closed = False

    def drain(self):
        if self._closed:
            return None
        if self._watch is None:
            if self._attempts >= 4 or self._clock() < self._retry_at:
                return None
            self._attempts += 1
            self._retry_at = self._clock() + 1.0
            try:
                self._watch = self._factory(self._display_name)
                epoch = self._watch.drain()
            except Exception:
                self._retire()
                return None
            self._native_epoch = epoch
            self._serial += 1
            return self._serial
        try:
            epoch = self._watch.drain()
        except Exception:
            self._retire()
            self._retry_at = self._clock() + 1.0
            return None
        if epoch != self._native_epoch:
            self._native_epoch = epoch
            self._serial += 1
        return self._serial

    def _retire(self):
        watch, self._watch = self._watch, None
        self._native_epoch = None
        if watch is not None:
            with contextlib.suppress(Exception):
                watch.close()

    def close(self):
        self._closed = True
        self._retire()


def scope_material(scope, focus_state_atom=None):
    """Private snapshot comparison, excluding only measured focus bookkeeping.

    Keep exact window/process identity, widget ancestry, transient lineage,
    geometry, source/topology, class and modal metadata. Never accept a sibling
    merely because its process or transient root matches.
    """
    if type(scope) is not dict:
        return None
    result = {key: value for key, value in scope.items()
              if key not in {"fingerprint", "focused", "keyboard_focus"}}
    if focus_state_atom is not None and "states" in result:
        result["states"] = [v for v in result["states"] if v != focus_state_atom]
    return result


def same_scope(before, after, focus_state_atom=None):
    required = {"window", "process", "window_rect", "rect", "source_rect",
                "source_origin", "topology", "transient_chain", "modal"}
    return bool(type(before) is dict and type(after) is dict
                and required <= before.keys() and required <= after.keys()
                and before["process"] and before["window"]
                and scope_material(before, focus_state_atom)
                == scope_material(after, focus_state_atom))


def recoverable_scope(scope):
    """A normal window, or a dialog whose every transient parent is its own process.

    Never a menu, a parentless modal, or another process's prompt over the app.
    Recovery still requires the exact recorded window via same_scope.
    """
    if type(scope) is not dict or not scope.get("process") or not scope.get("window"):
        return False
    if not scope.get("modal"):
        return scope.get("window_kind") == "normal"
    chain, processes = scope.get("transient_chain"), scope.get("transient_processes")
    return bool(
        scope.get("window_kind") == "dialog"
        and scope.get("modal_kind") == "safe_application"
        and type(chain) is list and chain
        and type(processes) is list and len(processes) == len(chain)
        and all(identity == scope["process"] for identity in processes)
    )


def wait_and_recover(*, native, candidate, focused, activate, guard,
                     recent_refocus=False, clock=time.monotonic, sleep=time.sleep):
    """Testable coordinator. One native raw subscription spans the whole call."""
    started = clock()
    quiet_since = started
    requested = False
    attempts = 0
    phases = {"quiet_ms": 0.0, "activation_ms": 0.0, "proof_ms": 0.0}

    def result(status):
        return {"ok": True, "status": status, "focus_requested": requested,
                "released": True, "attempts": attempts,
                "phase_timings_ms": {**phases, "total_ms": round((clock() - started) * 1000, 3)}}

    while clock() - started < WAIT_SECONDS:
        guard()
        held = native.physical_held()
        edges = native.physical_events(include_motion=True)
        if edges or held["keys"] or held["buttons"]:
            quiet_since = clock()
        if not candidate():
            return result("target_changed")
        if focused():
            if clock() - quiet_since >= QUIET_SECONDS:
                # Drain again after scope queries, immediately before returning
                # proof. A held key is activity even without a new raw edge.
                held = native.physical_held()
                if native.physical_events(include_motion=True) or held["keys"] or held["buttons"]:
                    quiet_since = clock()
                else:
                    guard()
                    phases["quiet_ms"] = round((clock() - started) * 1000, 3)
                    return result("recovered")
        elif clock() - quiet_since >= QUIET_SECONDS:
            phases["quiet_ms"] = round((clock() - started) * 1000, 3)
            if recent_refocus or attempts >= 2:
                return result("user_active")
            held = native.physical_held()
            if native.physical_events(include_motion=True) or held["keys"] or held["buttons"]:
                quiet_since = clock()
                continue
            guard()
            if not candidate():
                return result("target_changed")
            guard()
            # Mark attempted before sending. Never replay a request whose
            # dispatch outcome became unknown, even though no keys are held.
            requested = True
            attempts += 1
            activated_at = clock()
            activate()
            phases["activation_ms"] += round((clock() - activated_at) * 1000, 3)
            proof_started = clock()
            while clock() - proof_started < 0.5:
                guard()
                held = native.physical_held()
                if native.physical_events(include_motion=True) or held["keys"] or held["buttons"]:
                    recent_refocus = True
                    quiet_since = clock()
                    break
                if not candidate():
                    return result("target_changed")
                if focused():
                    # Focus proof performs native queries. Activity can arrive
                    # during those queries, so drain AFTER proof as well.
                    held = native.physical_held()
                    if (native.physical_events(include_motion=True)
                            or held["keys"] or held["buttons"]):
                        recent_refocus = True
                        quiet_since = clock()
                        break
                    guard()
                    phases["proof_ms"] += round((clock() - proof_started) * 1000, 3)
                    return result("recovered")
                sleep(0.025)
            phases["proof_ms"] += round((clock() - proof_started) * 1000, 3)
            quiet_since = clock()
        sleep(0.025)
    return result("user_active")


def execute(request, *, controller_fd=0, authorize=None):
    """Native boundary. A retained endpoint measures raw events, never injects."""
    from Xlib import X, protocol  # type: ignore[import-untyped]

    from src.computer.runtime import x11_worker_lifecycle as lifecycle
    from src.computer.runtime.x11_app_scope import AppScope
    from src.computer.runtime.x11_attached import attachment_configuration
    from src.computer.runtime.x11_attached_worker import AttachedConnection
    from src.computer.runtime.x11_owned_device import ExistingXTest

    config = attachment_configuration(request["display_name"], request["xauthority"],
                                      request["monitor_names"])
    connection = native = incarnation = None
    requested = False
    attempts = 0
    try:
        connection = AttachedConnection(config["display_name"])
        topology = connection.topology()
        selected = request["selected"]
        if selected not in connection.named_sources(topology, config["monitor_names"]):
            raise RuntimeError("source_changed")
        monitor = topology.monitors[selected["index"]]
        expected = request["scope"]
        if not recoverable_scope(expected):
            raise RuntimeError("modal_not_recoverable")
        scope = AppScope(connection._display)
        focus_atom = scope._atom("_NET_WM_STATE_FOCUSED")
        incarnation = IncarnationWatch(config["display_name"])
        incarnation_epoch = incarnation.drain()
        native = ExistingXTest(config["display_name"])
        if json.loads(json.dumps(native.identity())) != request["expected_device_identity"]:
            raise RuntimeError("device_identity_changed")
        if any(native.owned_release_state().values()):
            raise RuntimeError("synthetic_input_held")
        # Overlap the parent's enduring structure stream with this worker's
        # subscription before authorization. No blind gap at process startup.
        if authorize is not None:
            authorize()
        # Coordinator owns the 30s user-active result. Native guard has a small
        # outer allowance, not an earlier racing timeout that changes its code.
        deadline = time.monotonic() + WAIT_SECONDS + 1.0

        def guard():
            if lifecycle.REVOKED or time.monotonic() >= deadline:
                raise RuntimeError("recovery_revoked")
            if select.select([controller_fd], [], [], 0)[0]:
                raise RuntimeError("controller_revoked")
            if incarnation.drain() != incarnation_epoch:
                raise RuntimeError("target_changed")
            if connection.power_status() == "display_asleep" or connection.topology() != topology:
                raise RuntimeError("source_changed")

        def candidate():
            current = scope._snapshot(monitor, candidate=scope._window(expected["focus_window"]),
                                      allow_unfocused=True)
            return same_scope(expected, current, focus_atom)

        def focused():
            current = scope.snapshot(monitor)
            return bool(current and current.get("focused") is True
                        and same_scope(expected, current, focus_atom))

        def activate():
            nonlocal requested, attempts
            guard()
            if not candidate():
                raise RuntimeError("target_changed")
            guard()
            held = native.physical_held()
            if native.physical_events(include_motion=True) or held["keys"] or held["buttons"]:
                raise RuntimeError("user_active")
            atom = scope._atom("_NET_ACTIVE_WINDOW")
            supported = scope._values(connection._display.screen().root, "_NET_SUPPORTED")
            if not atom or atom not in supported:
                raise RuntimeError("activation_unavailable")
            # EWMH source=1 (normal application), no forged human timestamp.
            # The WM may refuse CurrentTime. Refusal is not a reason to fall
            # back to SetInputFocus or a click on the document.
            event = protocol.event.ClientMessage(window=expected["window"],
                client_type=atom, data=(32, [1, X.CurrentTime, 0, 0, 0]))
            guard()
            requested = True
            attempts += 1
            connection._display.screen().root.send_event(
                event, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask)
            connection._display.sync()

        return wait_and_recover(native=native, candidate=candidate, focused=focused,
                                activate=activate, guard=guard,
                                recent_refocus=request.get("recent_refocus") is True)
    except Exception as exc:
        # No held-input resource is created by this worker. This is not proof
        # that a previously attempted WM request had no effect.
        status = str(exc) if str(exc) in {"target_changed", "user_active"} else "unavailable"
        return {"ok": True, "status": status, "focus_requested": requested,
                "released": True, "attempts": attempts}
    finally:
        if native is not None:
            with contextlib.suppress(Exception):
                native.close()
        if connection is not None:
            with contextlib.suppress(Exception):
                connection.close()
        if incarnation is not None:
            with contextlib.suppress(Exception):
                incarnation.close()


def authorize_recovery(read_gate):
    """Overlap the structure streams before starting the native quiet budget."""
    print(json.dumps({"prepared": "recovery"}), file=sys.__stdout__, flush=True)
    if read_gate() != {"proceed": True}:
        raise RuntimeError("recovery_revoked")
    # Setup and the overlapping-stream authorization have their own bounded
    # parent reads. Preserve the coordinator's whole 30-second quiet budget.
    signal.alarm(32)


if __name__ == "__main__":
    from src.computer.runtime.x11_worker_lifecycle import announce, parent_watch, read_gate

    signal.alarm(35)
    parent_watch()
    try:
        if "--identity-gate" in sys.argv:
            announce("recovery")
        request = read_gate()

        def authorize():
            authorize_recovery(read_gate)

        with contextlib.redirect_stdout(sys.stderr):
            reply = execute(request, authorize=authorize)
    except Exception:
        reply = {"ok": True, "status": "unavailable", "focus_requested": False,
                 "released": True, "attempts": 0}
    print(json.dumps(reply, separators=(",", ":")), flush=True)
