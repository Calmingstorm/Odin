"""Disposable toolkit-only held-input fault driver, never a production route."""

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, "/code")
from src.computer.runtime.x11_attached import worker_environment
from src.computer.runtime.x11_guardian import Guardian, InjectionHelper
from src.computer.runtime.x11_owned_device import ExistingXTest
from src.computer.runtime.x11_worker_lifecycle import acknowledge, announce, parent_watch, read_gate

assert os.geteuid() == 0 and not any(Path("/home").iterdir())
parent_watch()
announce("guardian")
request = read_gate()
native = ExistingXTest(":177")
helper = InjectionHelper(":177", worker_environment(""))
try:
    acknowledge(announce("injector", helper.process.pid))
    code = native.keycode("Control_L")

    def validate(step):
        if step[0] == "wait":
            print(json.dumps({"held": True, "t": time.monotonic()}), flush=True)

    result = Guardian(native, helper, validate).run(
        [
            ("key", code, True),
            ("button", 1, True),
            ("wait", 0.08 if request["mode"] in ("complete", "wrapper-death") else 3),
        ]
    )
    print(json.dumps(result), flush=True)
    if request["mode"] == "wrapper-death":
        # Harmless post-release pause; wrapper loss must not strand this worker.
        read_gate(timeout=2)
finally:
    helper.fence()
    native.close()
