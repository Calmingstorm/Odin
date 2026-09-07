"""One-shot X11 capture/scope worker; never opens an input device or sends input."""
from __future__ import annotations

import base64
import contextlib
import hashlib
import json
import signal
import sys
from dataclasses import asdict
from pathlib import Path

# -I excludes ambient import paths. Only this fixed installed package is added.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from src.computer.runtime.x11_attached import attachment_configuration  # noqa: E402
from src.computer.runtime.x11_capture import X11MonitorCapture, _XlibConnection  # noqa: E402


class AttachedConnection(_XlibConnection):
    def named_sources(self, topology, names):
        result = []
        for index, monitor in enumerate(topology.monitors):
            label = self._display.get_atom_name(monitor.identity[0])
            if label not in names:
                continue
            seal = hashlib.sha256(repr(asdict(topology)).encode()).hexdigest()
            result.append({"name": label, "index": index, "seal": seal,
                           "width": monitor.width, "height": monitor.height})
        if len(result) != len(names) or len({m["name"] for m in result}) != len(result):
            raise ValueError("selected monitors missing or ambiguous")
        return result


def run(request):
    config = attachment_configuration(request["display_name"], request["xauthority"],
                                      request["monitor_names"], request["app_profile"])
    capture = X11MonitorCapture(config["display_name"], enabled=True,
                                connection_factory=AttachedConnection)
    try:
        topology = capture.topology()
        assert isinstance(capture._connection, AttachedConnection)
        sources = capture._connection.named_sources(topology, config["monitor_names"])
        if request["operation"] == "sources":
            return {"ok": True, "sources": sources}
        if request["operation"] != "capture":
            raise ValueError("unsupported operation")
        selected = request["selected"]
        if selected not in sources:
            raise ValueError("source changed; renewed consent required")
        app_scope = None
        if request.get("input_enabled") is True:
            from src.computer.runtime.x11_app_scope import AppScope
            app_scope = AppScope(capture._connection._display, config["app_profile"])
        monitor = topology.monitors[selected["index"]]
        binding = app_scope.snapshot(monitor) if app_scope else None
        observation = capture.capture(topology, selected["index"])
        if app_scope and binding != app_scope.snapshot(monitor):
            raise ValueError("application changed during capture")
        return {"ok": True, "source_width": observation.source.pixel_width,
                "source_height": observation.source.pixel_height,
                "width": observation.width, "height": observation.height,
                "delivered_to_source": observation.delivered_to_source.public(),
                "resize_scale": observation.resize_scale,
                "input_scope": binding,
                "image": base64.b64encode(observation.image_bytes).decode("ascii")}
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
        # python-xlib emits authority warnings to stdout. Protocol records must
        # remain pure JSON and never leak native connection diagnostics.
        with contextlib.redirect_stdout(sys.stderr):
            reply = run(request)
    except Exception:
        reply = {"ok": False, "error": "explicit_x11_capture_unavailable"}
    print(json.dumps(reply, separators=(",", ":")), flush=True)
