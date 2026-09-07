"""Read-only X11 capture/scope worker, optionally retained for RandR epochs."""
from __future__ import annotations

import base64
import contextlib
import hashlib
import json
import select
import signal
import sys
import time
from dataclasses import asdict
from pathlib import Path

# -I excludes ambient import paths. Only this fixed installed package is added.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from src.computer.runtime.x11_attached import attachment_configuration  # noqa: E402
from src.computer.runtime.x11_capture import X11MonitorCapture, _XlibConnection  # noqa: E402
from src.computer.vision import FrameCrop  # noqa: E402


class AttachedConnection(_XlibConnection):
    def named_sources(self, topology, names):
        result = []
        for index, monitor in enumerate(topology.monitors):
            label = self._display.get_atom_name(monitor.identity[0])
            if label not in names:
                continue
            snapshot = asdict(topology)
            # Physical seals cross connections; event epochs belong to their
            # retained connection and are a separate lifecycle binding.
            snapshot.pop("event_revision")
            seal = hashlib.sha256(repr(snapshot).encode()).hexdigest()
            result.append({"name": label, "index": index, "seal": seal,
                           "width": monitor.width, "height": monitor.height})
        if len(result) != len(names) or len({m["name"] for m in result}) != len(result):
            raise ValueError("selected monitors missing or ambiguous")
        return result


def run(request, capture=None):
    config = attachment_configuration(request["display_name"], request["xauthority"],
                                      request["monitor_names"])
    owned = capture is None
    if request["operation"] in {"input_capabilities", "verify_shared_identity"}:
        from src.computer.runtime.x11_owned_device import ExistingXTest
        # Removing even an idle master can crash existing GTK clients.
        native = ExistingXTest(config["display_name"])
        try:
            # A legacy session may have stranded physical devices on an Odin
            # seat. Shared input must not bless that state or delete by name.
            if any(row[2] in (1, 2) and row[1].startswith(
                    ("Odin session ", "Odin persistent ")) for row in native._topology()):
                raise ValueError("other_odin_masters_present")
            return {"ok": True, "released": not any(native.owned_release_state().values()),
                    "device_identity": native.identity(), "owned_devices": "not_created",
                    "session_input_devices": False, "persistent_input_devices": False,
                    "pointer": "shared", "keyboard_focus": "shared",
                    "widget_focus": "shared_within_window", "shared_pointer": True,
                    "shared_keyboard": True}
        finally:
            native.close()
    if owned:
        capture = X11MonitorCapture(config["display_name"], enabled=True,
                                    connection_factory=AttachedConnection)
    try:
        topology = capture.topology()
        assert isinstance(capture._connection, AttachedConnection)
        sources = capture._connection.named_sources(topology, config["monitor_names"])
        status = {"topology_revision": topology.event_revision,
                  "power_status": capture.power_status()}
        if request["operation"] == "topology":
            return {"ok": True, "sources": sources, **status}
        if request["operation"] == "sources":
            return {"ok": True, "sources": sources, **status}
        if request["operation"] == "scope_readiness":
            from src.computer.runtime.x11_app_scope import AppScope
            scope = AppScope(capture._connection._display)
            readiness = []
            for source in sources:
                binding, reason = scope.inspect(topology.monitors[source["index"]])
                readiness.append({"name": source["name"], "eligible": binding is not None,
                                  "reason": reason})
            return {"ok": True, "scope_readiness": readiness, **status}
        if request["operation"] != "capture":
            raise ValueError("unsupported operation")
        if ("topology_revision" in request
                and (type(request["topology_revision"]) is not int
                     or request["topology_revision"] != topology.event_revision)):
            raise ValueError("stale_capture_topology")
        selected = request["selected"]
        if selected not in sources:
            raise ValueError("source changed; renewed consent required")
        if status["power_status"] == "display_asleep":
            return {"ok": False, "error": "display_asleep", "status": "display_asleep", **status}
        crop = request.get("crop")
        if crop is not None:
            if type(crop) is not dict or set(crop) != {"x", "y", "width", "height"}:
                raise ValueError("invalid_source_crop")
            crop = FrameCrop(**crop)
        app_scope = None
        if request.get("input_enabled") is True:
            from src.computer.runtime.x11_app_scope import AppScope
            app_scope = AppScope(capture._connection._display)
        monitor = topology.monitors[selected["index"]]
        # GUI save/close can settle focus and title in separate events. Discard
        # every raced raster and take a wholly new bounded observation, never
        # relax equality or replay the preceding input to obtain a stable frame.
        for attempt in range(3):
            binding = app_scope.snapshot(monitor) if app_scope else None
            observation = capture.capture(topology, selected["index"], crop=crop)
            if not app_scope or binding == app_scope.snapshot(monitor):
                break
            if attempt < 2:
                time.sleep(.03)
        else:
            raise ValueError("application changed during capture")
        # Diagnostic only: never grants a mapping or replaces the private binding.
        reason = None
        if app_scope and binding is None:
            _, reason = app_scope.inspect(monitor)
        target_state = None
        if app_scope and request.get("verify_scope") is not None:
            try:
                target_state = app_scope.target_state(request["verify_scope"], monitor)
            except Exception:
                target_state = "unavailable"
        return {"ok": True, "source_width": observation.source.pixel_width,
                "source_height": observation.source.pixel_height,
                "width": observation.width, "height": observation.height,
                "delivered_to_source": observation.delivered_to_source.public(),
                "resize_scale": observation.resize_scale,
                "crop": observation.crop,
                **status,
                "input_scope": binding,
                "input_scope_reason": reason,
                "prior_target_state": target_state,
                "image": base64.b64encode(observation.image_bytes).decode("ascii")}
    finally:
        if owned:
            capture.close()


def safe_run(request, capture=None):
    try:
        return run(request, capture)
    except Exception as exc:
        # Only a fixed allowlist of pixel-free capability reasons crosses IPC.
        reason = str(exc)
        if reason not in {"display_asleep", "display_power_unavailable",
                          "stale_capture_topology", "topology_changed_during_capture",
                          "topology_changed_during_render"}:
            reason = "explicit_x11_capture_unavailable"
        return {"ok": False, "error": reason, "status": reason}


def serve(request):
    """Persistent mode keeps the event subscription alive between bounded calls.

    The parent owns process lifetime and must compare topology before input. The
    initial attachment is immutable; subsequent requests cannot redirect it.
    """
    config = attachment_configuration(request["display_name"], request["xauthority"],
                                      request["monitor_names"])
    with contextlib.redirect_stdout(sys.stderr):
        capture = X11MonitorCapture(config["display_name"], enabled=True,
                                    connection_factory=AttachedConnection)
    attachment = {k: request[k] for k in ("display_name", "xauthority", "monitor_names")}
    try:
        while True:
            signal.alarm(5)
            if any(request.get(k) != v for k, v in attachment.items()):
                reply = {"ok": False, "error": "attachment_changed"}
            else:
                with contextlib.redirect_stdout(sys.stderr):
                    reply = safe_run(request, capture)
            print(json.dumps(reply, separators=(",", ":")), flush=True)
            signal.alarm(0)
            line = sys.stdin.buffer.readline(32769)
            if not line:
                break
            if len(line) > 32768 or not line.endswith(b"\n"):
                break
            request = json.loads(line)
    finally:
        capture.close()


def watch_topology(request):
    """Emit initial state and each event/power change until the parent closes us.

    Every record contains sources (including snapshot seals), topology_revision,
    and power_status. A watcher exit/error must invalidate observations. This is
    a change notification channel, not an input authorization channel.
    """
    config = attachment_configuration(request["display_name"], request["xauthority"],
                                      request["monitor_names"])
    with contextlib.redirect_stdout(sys.stderr):
        capture = X11MonitorCapture(config["display_name"], enabled=True,
                                    connection_factory=AttachedConnection)
    request = {**request, "operation": "topology"}
    previous = None
    try:
        while True:
            signal.alarm(5)
            with contextlib.redirect_stdout(sys.stderr):
                reply = safe_run(request, capture)
            if reply != previous:
                reply = {**reply, "event": "topology_changed" if previous else "topology_ready"}
                print(json.dumps(reply, separators=(",", ":")), flush=True)
                previous = {k: v for k, v in reply.items() if k != "event"}
            if not reply.get("ok"):
                break
            signal.alarm(0)
            # Parent-owned stdin is a liveness lease. EOF stops the read-only
            # watcher cleanly; this stream accepts no commands after its gate.
            ready, _, _ = select.select([sys.stdin.buffer], [], [], .1)
            if ready:
                # Read-only final census on the already owned watcher. No new
                # privileged child is spawned after the controller revokes it.
                with contextlib.redirect_stdout(sys.stderr):
                    final = safe_run({**request, "operation": "verify_shared_identity"})
                print(json.dumps({**final, "event": "shared_identity_at_close"}), flush=True)
                break
    finally:
        capture.close()


if __name__ == "__main__":
    signal.alarm(5)
    try:
        if "--identity-gate" in sys.argv:
            from src.computer.runtime.x11_worker_lifecycle import announce, read_gate
            announce("capture")
            request = read_gate()
        else:
            line = sys.stdin.buffer.readline(32769)
            if len(line) > 32768 or not line.endswith(b"\n"):
                raise ValueError("invalid request")
            request = json.loads(line)
        if "--watch-topology" in sys.argv:
            watch_topology(request)
            sys.exit(0)
        if "--persistent" in sys.argv:
            serve(request)
            sys.exit(0)
        # python-xlib emits authority warnings to stdout. Protocol records must
        # remain pure JSON and never leak native connection diagnostics.
        with contextlib.redirect_stdout(sys.stderr):
            reply = safe_run(request)
    except Exception:
        reply = {"ok": False, "error": "explicit_x11_capture_unavailable"}
    print(json.dumps(reply, separators=(",", ":")), flush=True)
