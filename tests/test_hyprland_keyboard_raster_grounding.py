"""Real composed Hyprland keyboard grounding; OS I/O remains synthetic."""
# ruff: noqa: F811

from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from tests.computer.test_hyprland_backend import native, scope
from tests.test_computer_hyprland_turnloop_r33 import (
    action,
    normal,  # noqa: F401 - composed fixture
    observe,
    start,
)
from tests.test_computer_keyboard_grounding_r6 import fixture


def keyboard(normal, grant, operation="key", **fields):
    inp = action(normal, grant)
    inp.pop("x")
    inp.pop("y")
    inp.update(operation=operation, **fields)
    return inp


def change_raster(normal, monkeypatch, grant, *, clock_only=False):
    backend = normal.service.controller._live[grant["session_id"]].backend
    original_capture = backend._capture

    async def changed(crop=None):
        _, binding, timestamp = await original_capture(crop)
        frame = native(shade=100 + len(normal.transports[0].commands) * 40)
        if clock_only:
            # A changing clock at the output's far edge, outside the work area.
            frame = replace(frame, pixels=bytes(len(frame.pixels) - 4) + frame.pixels[-4:])
        rendered = hb._render_native(frame, crop)
        return rendered, binding, timestamp

    monkeypatch.setattr(backend, "_capture", changed)


@pytest.mark.parametrize("operation,fields", [("key", {"key": "Delete"}),
                                               ("type", {"text": "note"})])
async def test_composed_keyboard_accepts_changed_raster(normal, monkeypatch, operation, fields):
    grant = await start(normal)
    await observe(normal, grant)
    inp = keyboard(normal, grant, operation, **fields)
    change_raster(normal, monkeypatch, grant, clock_only=True)
    result = await normal.service.controller.act(normal.service._context(normal.state), inp)
    assert result["status"] == "verified"
    assert len(normal.transports[0].commands) == 1
    live = normal.service.controller._live[grant["session_id"]]
    after = live.observations[result["next_observation"]["observation_id"]]
    assert after.source.source_revision == inp["source_revision"]


@pytest.mark.parametrize("change", [
    "focus_digest", "bounds_digest", "source_digest", "application", "modal",
])
async def test_composed_keyboard_native_changes_refuse(normal, monkeypatch, change):
    grant = await start(normal)
    await observe(normal, grant)
    inp = keyboard(normal, grant, key="Delete")
    backend = normal.service.controller._live[grant["session_id"]].backend
    changed = scope()
    if change == "application":
        changed[change]["pid"] += 1
    elif change == "modal":
        changed[change] = True
    else:
        changed[change] = "d" * 64
    monkeypatch.setattr(backend._scope_provider, "snapshot", AsyncMock(return_value=changed))
    try:
        result = await normal.service.controller.act(normal.service._context(normal.state), inp)
    except ComputerError:
        pass
    else:
        assert result["status"] not in {"executed", "verified"}
        assert result["execution"]["injected"] is False
    assert normal.transports[0].commands == []


async def test_composed_pointer_changed_target_still_refuses(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    inp = action(normal, grant)
    change_raster(normal, monkeypatch, grant)
    with pytest.raises(ComputerError, match="visual_target_changed"):
        await normal.service.controller.act(normal.service._context(normal.state), inp)
    assert normal.transports[0].commands == []


async def test_other_wayland_backend_does_not_gain_keyboard_raster_exemption(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch, platform="wayland") as values:
        controller, context, inp, _, calls = values
        inp.update(operation="key", key="Delete")
        with pytest.raises(ComputerError, match="visual_target_changed"):
            await controller.act(context, inp)
        assert calls == []
