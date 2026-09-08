"""Exercise the installed native stack, only inside a disposable package container.

The container must allow nested user namespaces (Docker's default seccomp/AppArmor
profiles may refuse them). No host desktop sockets or devices may be mounted.
This bypasses only systemd activation, not the runtime's fixed bubblewrap profile.
"""

from __future__ import annotations

import base64
import json
import os
import selectors
import subprocess
from pathlib import Path


def main() -> None:
    if (
        not Path("/.dockerenv").is_file()
        or os.environ.get("ODIN_PACKAGE_SMOKE_DISPOSABLE") != "yes"
    ):
        raise RuntimeError("requires a disposable package smoke container")

    from src.computer.runtime import profile

    profile.preflight("drawing")
    runtime = Path(profile.__file__).resolve().parent
    # systemd normally provides this read-only bind. The enclosing disposable
    # container provides the equivalent source; sandbox_argv retains all guards.
    runtime_bind = Path("/opt/odin-computer-runtime")
    runtime_bind.symlink_to(runtime, target_is_directory=True)
    child = subprocess.Popen(
        profile.sandbox_argv("drawing"),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=None,
        env=profile.clean_environment(),
    )
    assert child.stdin is not None and child.stdout is not None
    selector = selectors.DefaultSelector()
    selector.register(child.stdout, selectors.EVENT_READ)

    def receive() -> dict:
        if not selector.select(timeout=30):
            raise RuntimeError("installed worker response timed out")
        line = child.stdout.readline(24 * 1024 * 1024 + 1)
        if not line or not line.endswith(b"\n"):
            raise RuntimeError("installed worker exited or returned an incomplete frame")
        message = json.loads(line)
        if message.get("ok") is not True:
            raise RuntimeError(f"installed worker refused: {message}")
        return message

    def request(message: dict) -> dict:
        child.stdin.write(json.dumps(message).encode() + b"\n")
        child.stdin.flush()
        return receive()

    try:
        ready = receive()
        assert ready["event"] == "ready"
        containment = ready["containment"]
        assert containment["uid"] == containment["gid"] == 65534
        assert containment["effective_capabilities"] == "0000000000000000"
        assert containment["display"] == ":77"
        assert containment["network_namespace"] != os.readlink("/proc/self/ns/net")
        for key in (
            "host_home_visible",
            "host_root_home_visible",
            "host_machine_id_visible",
            "physical_input_visible",
            "graphics_device_visible",
        ):
            assert containment[key] is False, key
        observed = request({"id": "package-observe", "op": "observe"})["observation"]
        assert observed["width"] == 1280 and observed["height"] == 960
        pixels = base64.b64decode(observed["image"], validate=True)
        assert len(pixels) >= 1280 * 960 * 3
        assert len(set(pixels)) > 16, "blank capture is not a rendered application"
        assert observed["window"]["pid"] > 0 and observed["focused"] is True
        assert observed["accessibility_status"] == "available", observed["accessibility_detail"]
        assert observed["accessibility"], "AT-SPI application tree is empty"
        paused = request({"id": "package-pause", "op": "pause"})
        assert paused["released"] is True and paused["state"] == "paused"
        print(
            json.dumps(
                {
                    "event": "PACKAGE_NATIVE_RUNTIME_PASS",
                    "profile": "drawing",
                    "raster_bytes": len(pixels),
                    "accessible_nodes": len(observed["accessibility"]),
                    "input_released": True,
                    "stack": ["bwrap", "Xvfb", "dbus", "openbox", "Xlib", "xdotool", "AT-SPI"],
                },
                sort_keys=True,
            )
        )
    finally:
        selector.close()
        child.stdin.close()
        try:
            status = child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=5)
            raise RuntimeError("installed worker failed to stop") from None
        finally:
            child.stdout.close()
            runtime_bind.unlink()
        if status != 0:
            raise RuntimeError(f"installed worker exited {status}")


if __name__ == "__main__":
    main()
