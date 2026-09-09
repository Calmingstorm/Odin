"""Observation-only animation settling through real controllers, synthetic IO only."""

import asyncio
from copy import deepcopy

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime.hyprland_scope import HyprlandGeometryUnsettled
from tests.computer.test_hyprland_backend import action as backend_action
from tests.computer.test_hyprland_backend import native, scope
from tests.test_computer_hyprland_turnloop_r33 import (
    action,
    call,
    observe,
    start,
)
from tests.test_computer_hyprland_turnloop_r33 import (
    normal as normal_fixture,
)

normal = normal_fixture


def backend_for(normal, grant):
    return normal.service.controller._live[grant["session_id"]].backend


def unsettled(**overrides):
    current = scope()
    return HyprlandGeometryUnsettled(**{
        key: deepcopy(overrides.get(key, current[key]))
        for key in ("application", "compositor", "output")
    })


@pytest.mark.parametrize("failures", [1, 3])
async def test_action_settles_and_delivers_dialog_without_replay(normal, monkeypatch, failures):
    grant = await start(normal)
    await observe(normal, grant)
    first = action(normal, grant)
    backend = backend_for(normal, grant)
    attempts = []

    async def snapshot(metadata):
        if normal.transports[0].commands:
            attempts.append("post-action")
            if len(attempts) <= failures:
                raise unsettled()
            return scope(modal=True, modal_kind="safe_application",
                         modal_title_digest="d" * 64, surface_token="dialog",
                         focus_digest="e" * 64, native_scope_serial=2)
        return scope()

    monkeypatch.setattr(backend._scope_provider, "snapshot", snapshot)
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    assert "Image loaded" in result["content"], result
    assert len(normal.transports[0].commands) == 1
    assert len(normal.state.pending_image_blocks) == 2
    assert len(attempts) > failures
    second = action(normal, grant, "dialog-next")
    assert second["observation_id"] != first["observation_id"]
    assert backend._frame.modal == "d" * 64
    replay = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    assert "Image loaded" not in replay["content"]
    assert len(normal.transports[0].commands) == 1


async def test_generic_observation_failure_is_not_retried(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    backend = backend_for(normal, grant)
    calls = []

    async def failed(crop=None):
        calls.append(crop)
        raise ComputerError("hyprland_scope_unknown_locked_or_stale")

    monkeypatch.setattr(backend, "_capture", failed)
    result = await normal.runner._run_one_tool(normal.state, call("computer_observe", **grant))
    assert "Image loaded" not in result["content"]
    assert len(calls) == 1
    assert not normal.transports[0].commands


async def test_predispatch_unsettled_is_not_retried_or_injected(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    backend = backend_for(normal, grant)
    first = backend_action(backend._frame)
    calls = []

    async def failed(crop=None):
        calls.append(crop)
        raise unsettled()

    monkeypatch.setattr(backend, "_capture", failed)
    # The controller independently refreshes observations before dispatch;
    # isolate the backend's actual input predispatch check, not that read path.
    with pytest.raises(HyprlandGeometryUnsettled, match="window-geometry-unsettled"):
        await backend.act(first)
    assert len(calls) == 1
    assert not normal.transports[0].commands


async def test_settling_budget_does_not_leave_old_input_authority(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    old = action(normal, grant)
    backend = backend_for(normal, grant)
    calls = []

    async def failed(crop=None):
        calls.append(crop)
        raise unsettled()

    monkeypatch.setattr(backend, "_capture", failed)
    result = await normal.runner._run_one_tool(normal.state, call("computer_observe", **grant))
    assert "Image loaded" not in result["content"]
    assert 2 <= len(calls) <= 51
    assert len(normal.state.pending_image_blocks) == 1
    assert backend._frame is None
    await normal.runner._run_one_tool(normal.state, call("computer_act", **old))
    assert not normal.transports[0].commands


@pytest.mark.parametrize("changed", ["application", "compositor", "output"])
async def test_unsettled_foreign_identity_is_not_retried(normal, monkeypatch, changed):
    grant = await start(normal)
    await observe(normal, grant)
    backend = backend_for(normal, grant)
    calls = []
    value = deepcopy(scope()[changed])
    if changed == "application":
        value["pid"] += 1
    elif changed == "compositor":
        value["name"] = "foreign"
    else:
        value["name"] = "DP-OTHER"

    async def failed(crop=None):
        calls.append(crop)
        raise unsettled(**{changed: value})

    monkeypatch.setattr(backend, "_capture", failed)
    result = await normal.runner._run_one_tool(normal.state, call("computer_observe", **grant))
    assert "Image loaded" not in result["content"]
    assert len(calls) == 1
    assert backend._frame is None
    assert not normal.transports[0].commands


async def test_capture_scope_changed_retries_new_native_capture_and_proof(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    backend = backend_for(normal, grant)
    captures, proofs = [], []

    async def snapshot(metadata):
        proofs.append(len(captures))
        # Change after the first native capture proof, then stay stable.
        return scope(native_scope_serial=1 if len(proofs) == 1 else 2)

    async def capture(**kwargs):
        captures.append("capture")
        await kwargs["scope"]()
        return native(shade=80)

    monkeypatch.setattr(backend._scope_provider, "snapshot", snapshot)
    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    await observe(normal, grant)
    assert len(captures) == 2
    assert len(proofs) == 4
    assert backend._scope["native_scope_serial"] == 2
    assert not normal.transports[0].commands


async def test_slow_stable_capture_is_not_cancelled_by_retry_budget(normal, monkeypatch):
    grant = await start(normal)
    await observe(normal, grant)
    backend = backend_for(normal, grant)
    original = backend._capture

    async def slow(crop=None):
        await asyncio.sleep(1.05)
        return await original(crop)

    monkeypatch.setattr(backend, "_capture", slow)
    frame = await backend.observe()
    assert frame.image_bytes and backend._frame is frame
    assert not normal.transports[0].commands
