"""Real event delivery on a disposable authenticated X server, never a desktop."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from Xlib import X, display  # noqa: E402

from src.computer.runtime.x11_app_scope import AppScope  # noqa: E402
from src.computer.runtime.x11_attached import (  # noqa: E402
    X11AttachedBackend,
    worker_environment,
)
from src.computer.runtime.x11_attached_worker import AttachedConnection  # noqa: E402
from src.computer.runtime.x11_guardian import Guardian, _execute  # noqa: E402
from src.computer.runtime.x11_owned_device import (  # noqa: E402
    SessionXTest,
    X11DeviceError,
    open_input,
)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "latency"
    input_mode = sys.argv[2] if len(sys.argv) > 2 else "shared"
    assert mode in {"normal", "latency", "stall", "dense"}
    # Deterministic scheduling pressure around real native checks and delivery.
    original_run = Guardian.run

    def delayed_run(self, steps, **kwargs):
        validate = self.validate

        def delayed_validate(step):
            if step[0] == "wait":
                time.sleep({"latency": 0.035, "stall": 0.12}.get(mode, 0))
            validate(step)

        self.validate = delayed_validate
        return original_run(self, steps, **kwargs)

    Guardian.run = delayed_run
    number = 32000 + os.getpid() % 20000
    name = f":{number}"
    lock = Path(f"/tmp/.X{number}-lock")
    socket = Path(f"/tmp/.X11-unix/X{number}")
    assert not lock.exists() and not socket.exists()
    server = receiver = connection = native = None
    with tempfile.TemporaryDirectory(prefix="x11-dispatch-") as tmp:
        authority = str(Path(tmp) / "authority")
        env = worker_environment(authority)
        os.environ.clear()
        os.environ.update(env)
        subprocess.run(
            ["/usr/bin/xauth", "-f", authority, "add", name, ".", os.urandom(16).hex()],
            env=env,
            check=True,
            timeout=2,
            capture_output=True,
        )
        try:
            server = subprocess.Popen(
                [
                    "/usr/bin/Xvfb",
                    name,
                    "-screen",
                    "0",
                    "800x600x24",
                    "-auth",
                    authority,
                    "-nolisten",
                    "tcp",
                    "-noreset",
                    "-extension",
                    "GLX",
                ],
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            deadline = time.monotonic() + 3
            while not (lock.exists() and socket.exists()):
                assert server.poll() is None and time.monotonic() < deadline
                time.sleep(0.02)
            assert int(lock.read_text()) == server.pid
            receiver = display.Display(name)
            root = receiver.screen().root
            window = root.create_window(
                20,
                20,
                600,
                400,
                0,
                receiver.screen().root_depth,
                X.InputOutput,
                X.CopyFromParent,
                background_pixel=0xFFFFFF,
                event_mask=X.PointerMotionMask | X.ButtonPressMask | X.ButtonReleaseMask,
            )
            window.set_wm_name("Stroke receiver")
            window.set_wm_class("stroke-receiver", "StrokeReceiver")
            window.change_property(
                receiver.intern_atom("_NET_WM_PID"),
                receiver.intern_atom("CARDINAL"),
                32,
                [os.getpid()],
            )
            window.map()
            window.set_input_focus(X.RevertToParent, X.CurrentTime)
            receiver.sync()
            connection = AttachedConnection(name)
            topology = connection.topology()
            monitor = topology.monitors[0]
            selected = connection.named_sources(topology, ["screen"])[0]
            scope = AppScope(connection._display).snapshot(monitor)
            assert scope is not None
            native = open_input(name, mode=input_mode)
            if input_mode == "shared":
                baseline = native._topology()
                instances = []

                class FinalCensusFailure(SessionXTest):
                    def _owned_pair(self, rows):
                        if hasattr(self, "_keymap") and not instances:
                            instances.append(self)
                            raise X11DeviceError("fixture_final_census_failed")
                        return super()._owned_pair(rows)

                try:
                    FinalCensusFailure(name, "Odin session " + "a" * 32, create=True)
                except X11DeviceError as exc:
                    assert str(exc) == "fixture_final_census_failed"
                else:
                    raise AssertionError("final census fault was not reached")
                assert len(instances) == 1
                assert not instances[0]._display and not instances[0]._devices
                assert native._topology() == baseline
                print(json.dumps({"failed_constructor_cleanup": "native_baseline_restored"}))
                # This observer predates the deliberate XI hierarchy mutation.
                # Reopen it rather than bypassing the sticky identity fence.
                native.close()
                native = open_input(name, mode=input_mode)
            points = [[60 + i * 20, 80 + (i % 2) * 30] for i in range(18)]
            if mode == "dense":
                points = [[60 + i, 80 + (i % 2) * 30] for i in range(256)]
            receipts = []
            for _ in range(3 if mode in {"normal", "latency"} else 1):
                while receiver.pending_events():
                    receiver.next_event()
                started = time.monotonic()
                receipt = _execute(
                    {
                        "display_name": name,
                        "xauthority": authority,
                        "monitor_names": ["screen"],
                        "selected": selected,
                        "scope": scope,
                        "input_mode": input_mode,
                        "expected_device_identity": native.identity(),
                        "action": {"type": "polyline", "points": points, "duration": 0.8},
                    },
                    controller_fd=None,
                )
                receiver.sync()
                events = []
                while receiver.pending_events():
                    e = receiver.next_event()
                    if e.type in {X.MotionNotify, X.ButtonPress, X.ButtonRelease}:
                        events.append([e.type, e.root_x, e.root_y, e.state])
                row = {
                    "receipt": receipt,
                    "events": events,
                    "seconds": round(time.monotonic() - started, 3),
                }
                receipts.append(row)
                print(json.dumps(row), flush=True)
                assert receipt["released"] and not any(native.owned_release_state().values())
                if mode == "dense":
                    assert receipt["status"] == "unavailable", row
                    assert receipt["diagnostics"]["steps_completed"] == 0
                    assert receipt["injected"] is False and events == []
                    continue
                assert sum(e[0] == X.ButtonPress for e in events) == 1
                assert sum(e[0] == X.ButtonRelease for e in events) == 1
                held = [
                    [e[1], e[2]] for e in events if e[0] == X.MotionNotify and e[3] & X.Button1Mask
                ]
                if mode == "stall":
                    assert receipt["status"] == "unknown", row
                    assert receipt["reason"] == "input_dispatch_expired", row
                    assert 0 < receipt["diagnostics"]["steps_completed"] < 37
                    assert held and len(held) < len(points) - 1
                    assert held == points[1 : len(held) + 1], row
                else:
                    assert receipt["status"] == "executed", row
                    assert receipt["diagnostics"]["steps_completed"] == 37
                    assert held == points[1:], row

            async def cleanup():
                backend = X11AttachedBackend(
                    enabled=True,
                    display_name=name,
                    xauthority=authority,
                    monitor_names=["screen"],
                    input_enabled=True,
                )
                await backend.start("dispatch-cleanup-r19")
                assert backend._device_identity is not None
                result = await backend.detach()
                assert result["stopped"] and result["released"], result
                assert result["no_inflight_input"] is True
                assert result["no_active_grabs"] is None
                assert result["physical_slaves_restored"] is None
                assert result["owned_masters_removed"] is None
                assert not backend._children and not backend._guardians
                assert not backend._jobs
                return result

            if input_mode == "shared":
                cleanup_receipt = asyncio.run(cleanup())
                print(json.dumps({"cleanup": cleanup_receipt}), flush=True)
            else:
                # This fixture owns persistent test masters until its entire
                # disposable server exits; an attached shared-mode capability
                # probe correctly refuses a server with those masters present.
                assert not any(native.owned_release_state().values())
            print(json.dumps({"runs": len(receipts), "mode": mode, "validated": True}), flush=True)
        finally:
            if native is not None:
                native.close()
            if connection is not None:
                connection.close()
            if receiver is not None:
                receiver.close()
            if server is not None:
                server.terminate()
                try:
                    server.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=2)
            assert not lock.exists() and not socket.exists()


if __name__ == "__main__":
    main()
