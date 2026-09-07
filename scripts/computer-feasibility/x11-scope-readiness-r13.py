"""Explicit read-only scope diagnostic: no pixels, input, device or focus writes.

Run with the intended worker UID and explicit DISPLAY/XAUTHORITY. Output contains
only bounded counts and static reasons, never window text, argv or credentials.
"""
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from Xlib.display import Display

from src.computer.runtime.x11_app_scope import AppScope, ScopeFailure


def main():
    connection = Display(os.environ["DISPLAY"])
    try:
        scope = AppScope(connection)
        rows = []
        for entry in connection.screen().root.xrandr_get_monitors(True).monitors:
            monitor = SimpleNamespace(x=entry.x, y=entry.y,
                                      width=entry.width_in_pixels,
                                      height=entry.height_in_pixels)
            try:
                binding = scope._snapshot(monitor)
                result = {"eligible": bool(binding), "reason": None}
            except ScopeFailure as exc:
                result = {"eligible": False, "reason": str(exc)}
            except Exception as exc:
                result = {"eligible": False, "reason": type(exc).__name__}
            rows.append(result)
        print(json.dumps({"worker_uid": os.geteuid(), "monitors": rows}))
    finally:
        connection.close()


if __name__ == "__main__":
    main()
