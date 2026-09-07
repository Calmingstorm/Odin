"""Standalone real X11 cleanup test, only on its own high-number Xvfb.

This is lifecycle evidence, not application qualification. A scratch Xlib event
receiver remains alive throughout cleanup. No desktop or compositor restoration.
"""
from __future__ import annotations

import asyncio
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

from src.computer.runtime.x11_attached import (  # noqa: E402
    AttachedFailure,
    X11AttachedBackend,
    worker_environment,
)
from src.computer.runtime.x11_attached_worker import AttachedConnection  # noqa: E402
from src.computer.runtime.x11_guardian import (  # noqa: E402
    Guardian,
    GuardianFailure,
    InjectionHelper,
)
from src.computer.runtime.x11_owned_device import ExistingXTest  # noqa: E402


def receiver(display_name):
    d = display.Display(display_name)
    root = d.screen().root
    window = root.create_window(20, 20, 320, 180, 0, d.screen().root_depth,
        X.InputOutput, X.CopyFromParent, background_pixel=0xffffff,
        event_mask=X.KeyPressMask | X.KeyReleaseMask | X.ButtonPressMask | X.ButtonReleaseMask)
    window.map()
    window.set_input_focus(X.RevertToParent, X.CurrentTime)
    d.sync()
    print(json.dumps({"window": window.id, "pid": os.getpid()}), flush=True)
    try:
        while True:
            if select.select([sys.stdin], [], [], .01)[0] and not os.read(0, 1):
                return
            while d.pending_events():
                e = d.next_event()
                if e.type in {X.KeyPress, X.KeyRelease, X.ButtonPress, X.ButtonRelease}:
                    print(json.dumps({"event": e.type, "detail": e.detail}), flush=True)
    finally:
        d.close()


def settle(child):
    if child.poll() is None:
        child.terminate()
    try:
        child.wait(timeout=2)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=2)
    assert not Path(f"/proc/{child.pid}").exists(), "exact owned child not reaped"


def main():
    number = 22000 + os.getpid() % 10000
    name = f":{number}"
    lock, socket = Path(f"/tmp/.X{number}-lock"), Path(f"/tmp/.X11-unix/X{number}")
    assert number > 20000 and not lock.exists() and not socket.exists()
    env = worker_environment("")
    os.environ.clear()
    os.environ.update(env)
    children, results = [], []
    with tempfile.TemporaryDirectory(prefix="odin-x11-r7-") as tmp:
        authority = str(Path(tmp) / "authority")
        subprocess.run(["/usr/bin/xauth", "-f", authority, "add", name, ".",
                        os.urandom(16).hex()], env=env, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2)
        env = worker_environment(authority)
        os.environ.update(env)
        server = subprocess.Popen(["/usr/bin/Xvfb", name, "-screen", "0", "800x600x24",
            "-auth", authority, "-nolisten", "tcp", "-noreset", "-extension", "GLX"],
            env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL)
        children.append(server)
        connection = native = None
        try:
            deadline = time.monotonic() + 3
            while True:
                assert server.poll() is None
                if lock.exists() and socket.exists():
                    assert int(lock.read_text()) == server.pid
                    break
                assert time.monotonic() < deadline, "owned Xvfb startup timeout"
                time.sleep(.02)
            connection = AttachedConnection(name)
            app = subprocess.Popen([sys.executable, "-I", __file__, "--receiver", name],
                env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            children.append(app)
            assert select.select([app.stdout], [], [], 3)[0]
            ready = json.loads(app.stdout.readline())
            assert ready["pid"] == app.pid
            native = ExistingXTest(name)
            native.move(100, 100)
            identity = native.identity()
            key = native.keycode("Control_L")

            for mode in ("topology", "blank", "cancel", "eof", "lease"):
                topology = connection.topology()
                helper = InjectionHelper(name, env)
                reader, writer = os.pipe()
                triggered = False
                try:
                    def validate(step):
                        nonlocal triggered, writer
                        if step[0] == "wait" and not triggered:
                            assert key in native.held()["keys"]
                            assert 1 in native.held()["buttons"]
                            triggered = True
                            if mode == "topology":
                                for monitor, geometry, output in (
                                    ("R7LEFT", "400/100x600/150+0+0", "screen"),
                                    ("R7RIGHT", "400/100x600/150+400+0", "none")):
                                    subprocess.run(["/usr/bin/xrandr", "--display", name,
                                        "--setmonitor", monitor, geometry, output], env=env,
                                        check=True, timeout=2, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.DEVNULL)
                                assert connection.topology() != topology
                                raise GuardianFailure("stale_source")
                            if mode == "blank":
                                # No hardware DPMS in Xvfb. Real server blanking,
                                # with unavailable capture simulated separately.
                                connection._display.force_screen_saver(X.ScreenSaverActive)
                                connection._display.sync()
                                raise GuardianFailure("capture_unavailable")
                            if mode == "cancel":
                                os.write(writer, b"cancel\n")
                            elif mode == "eof":
                                os.close(writer)
                                writer = None
                        if connection.topology() != topology:
                            raise GuardianFailure("stale_source")

                    guard = Guardian(native, helper, validate, controller_fd=reader,
                                     lease_seconds=.7 if mode == "lease" else 2)
                    started = time.monotonic()
                    receipt = guard.run([("key", key, True), ("button", 1, True),
                                         ("wait", 3), ("key", native.keycode("a"), True)])
                    assert triggered and receipt["released"], receipt
                    assert receipt["status"] == "unknown", receipt
                    assert native.held() == {"keys": set(), "buttons": set()}
                    assert native.identity() == identity and app.poll() is None
                    assert helper.process.returncode is not None
                    assert not Path(f"/proc/{helper.process.pid}").exists()
                    results.append({"mode": mode, "receipt": receipt,
                                    "seconds": round(time.monotonic() - started, 3),
                                    "injector_reaped": True, "application_alive": True})
                finally:
                    os.close(reader)
                    if writer is not None:
                        os.close(writer)
                    helper.fence()

            async def backend_lifecycle():
                # Actual product capture processes, intentionally no app input
                # qualification bypass for the private receiver.
                b = X11AttachedBackend(enabled=True, display_name=name, xauthority=authority,
                                       monitor_names=["R7LEFT"], app_profile="xed")
                descriptors = [b.startup_descriptor("r7-owned-xvfb")]
                b.runtime_identity_callback = descriptors.append
                await b.start("r7-owned-xvfb")
                await b.observe()
                subprocess.run(["/usr/bin/xrandr", "--display", name, "--delmonitor", "R7LEFT"],
                    env=env, check=True, timeout=2, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL)
                try:
                    await b.observe()
                except AttachedFailure:
                    pass
                else:
                    raise AssertionError("stale monitor accepted")
                stopped = await b.detach()
                assert stopped["stopped"] and stopped["released"]
                assert not b._children and not b._jobs and not b._guardians
                for item in descriptors[-1]["processes"]:
                    assert not Path(f"/proc/{item['pid']}").exists()
                assert server.poll() is None and app.poll() is None
                return {"capture_workers_reaped": len(descriptors[-1]["processes"]),
                        "stop": stopped}

            result = asyncio.run(backend_lifecycle())
            time.sleep(.05)
            app.stdin.close()
            app.wait(timeout=2)
            events = [json.loads(line) for line in app.stdout.read().splitlines()]
            for kind, code in ((X.KeyPress, key), (X.KeyRelease, key),
                               (X.ButtonPress, 1), (X.ButtonRelease, 1)):
                assert sum(e == {"event": kind, "detail": code} for e in events) == 5, events
            assert not any(e.get("detail") == native.keycode("a") for e in events)
            print(json.dumps({"trials": results, "backend": result,
                "receiver_edges": len(events), "hardware_dpms_tested": False}), flush=True)
        finally:
            if native is not None:
                native.close()
            if connection is not None:
                connection.close()
            for child in reversed(children):
                settle(child)
            assert not socket.exists() and not lock.exists()


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--receiver":
        receiver(sys.argv[2])
    else:
        main()
