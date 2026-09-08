#!/usr/bin/python3
"""Exercise the actual read-only adapter in the existing disposable fixture."""

import asyncio
import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image
from Xlib import display

sys.path.insert(0, "/code")
from src.computer.runtime.x11_attached import X11AttachedBackend, worker_environment  # noqa: E402

assert os.environ.get("XI2_PRIVATE_SANDBOX") == "1" and os.getuid() != 0
assert not Path("/proc/self").exists() and not Path("/tmp/.X11-unix/X0").exists()
Path("/tmp/.X11-unix").mkdir(mode=0o1777)
server = subprocess.Popen(
    [
        "Xvfb",
        ":177",
        "-screen",
        "0",
        "900x500x24",
        "-nolisten",
        "tcp",
        "-noreset",
        "-extension",
        "GLX",
    ],
    stdout=subprocess.DEVNULL,
)
app = None
try:
    for _ in range(50):
        if (
            subprocess.run(
                ["xdpyinfo", "-display", ":177"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            ).returncode
            == 0
        ):
            break
        time.sleep(0.05)
    app = subprocess.Popen(
        ["/usr/bin/python3", "/harness/x11-same-target.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
    )
    for _ in range(50):
        if Path("/workspace/robot.xid").exists():
            break
        time.sleep(0.05)
    d = display.Display(":177")
    root = d.screen().root

    def state():
        p = root.query_pointer()
        f = d.get_input_focus().focus
        return p.root_x, p.root_y, p.mask, getattr(f, "id", f), tuple(d.query_keymap())

    before = state()

    async def check():
        b = X11AttachedBackend(enabled=True, display_name=":177", monitor_names=["screen"])
        try:
            started = await b.start("actual-private-capture")
        except Exception:
            diagnostic = subprocess.run(
                [sys.executable, "-I", "/code/src/computer/runtime/x11_attached_worker.py"],
                input=json.dumps({**b._config, "operation": "sources"}) + "\n",
                text=True,
                capture_output=True,
                timeout=6,
                env=worker_environment(""),
            )
            print(
                "SOURCES_ONLY_DIAGNOSTIC",
                diagnostic.returncode,
                diagnostic.stdout[:1000],
                diagnostic.stderr[:1000],
                flush=True,
            )
            raise
        assert len(started["sources"]) == 1
        frame = await b.observe()
        image = Image.open(io.BytesIO(frame.image_bytes))
        assert image.size == (900, 500) and any(lo != hi for lo, hi in image.getextrema())
        assert not frame.scope.input_sources and not frame.focused
        receipt = await b.detach()
        assert receipt["stopped"] and not b._children
        print(
            json.dumps(
                {
                    "kind": "actual-capture-adapter",
                    "passed": True,
                    "dimensions": image.size,
                    "bytes": len(frame.image_bytes),
                    "capture_only": True,
                    "receipt": receipt,
                }
            ),
            flush=True,
        )

    asyncio.run(check())
    assert state() == before and app.poll() is None
    d.close()
    app.stdin.close()
    assert app.wait(timeout=2) == 0
finally:
    if app and app.poll() is None:
        app.terminate()
        app.wait(timeout=2)
    server.terminate()
    server.wait(timeout=2)
    print(
        json.dumps(
            {
                "kind": "reaped",
                "xvfb": server.pid,
                "app": app.pid if app else None,
                "server_exit": server.returncode,
                "app_exit": app.returncode if app else None,
            }
        ),
        flush=True,
    )
