"""Exercise real backend act/encoder, with only native OS boundaries synthetic."""
# ruff: noqa: F811
import time
from dataclasses import replace

import pytest

from src.computer.runtime import hyprland_backend as hb
from tests.computer.test_hyprland_backend import (
    action,
    backend,  # noqa: F401
    native,
    scope,
)


def keyboard(frame, operation):
    inp = action(frame, type=operation)
    inp.pop("x")
    inp.pop("y")
    inp.update({"chord": "Tab"} if operation == "key" else {"text": "paint"})
    return inp


@pytest.mark.parametrize("operation", ["key", "type"])
async def test_native_keyboard_noisy_raster_real_act(backend, monkeypatch, operation):
    frame = await backend.observe()

    async def capture(crop=None):
        return (hb._render_native(native(backend._output, shade=170), crop),
                scope(backend._output), time.monotonic())

    monkeypatch.setattr(backend, "_capture", capture)
    result = await backend.act(keyboard(frame, operation))
    assert result["status"] == "executed"
    assert result["targeting_path"] == "native_window_focus"
    assert backend._guardian.commands == (["J Tab"] if operation == "key"
                                          else ["T 7061696e74"])


@pytest.mark.parametrize("operation", ["key", "type"])
@pytest.mark.parametrize("change", [
    "focus_digest", "source_digest", "bounds_digest", "native_scope_serial",
    "application", "modal", "output", "render_width", "render_height",
])
async def test_native_keyboard_noisy_raster_still_refuses_binding_or_geometry(
        backend, monkeypatch, operation, change):
    frame = await backend.observe()

    async def capture(crop=None):
        binding = scope(backend._output)
        out = backend._output
        if change == "application":
            binding[change]["pid"] += 1
        elif change == "modal":
            binding[change] = True
        elif change == "native_scope_serial":
            binding[change] += 1
        elif change == "output":
            binding[change]["logical_x"] += 1
        elif change.startswith("render_"):
            axis = change.removeprefix("render_")
            out = replace(out, **{axis: getattr(out, axis) + 1})
        else:
            binding[change] = "d" * 64
        return hb._render_native(native(out, shade=170), crop), binding, time.monotonic()

    monkeypatch.setattr(backend, "_capture", capture)
    result = await backend.act(keyboard(frame, operation))
    assert result["status"] == "unavailable"
    assert result["reason"] == "hyprland_observation_changed"
    assert result["injected"] is False
    assert backend._guardian.commands == []
