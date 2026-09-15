"""Python side of the native member-continuity contract; no desktop input.

Native tests own ancestry/hit-test proof. These tests deliberately do NOT teach
Python to ignore focus digests or serials: only an unchanged, freshly measured
native binding may renew an action. True boundary crossings still interrupt.
"""
# ruff: noqa: F811
import asyncio
import copy
import time
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime.hyprland_backend import _binding
from src.computer.runtime.hyprland_guardian import HyprlandGuardian, HyprlandGuardianError
from tests.computer.test_hyprland_backend import (
    action,
    backend,  # noqa: F401
    scope,
)
from tests.test_computer_hyprland_app_group_runtime import DIALOG, MAIN, group, row_for
from tests.test_computer_hyprland_scope_r32 import server


async def test_wire_member_serial_is_the_authority_not_a_python_focus_exception(tmp_path):
    """Both binding gates use the same authenticated member/ABA proof."""
    row = row_for()

    def reply(_):
        row["measured_monotonic_ns"] = time.monotonic_ns()
        return copy.deepcopy(row)

    listener, provider = await server(tmp_path, reply)
    guardian = HyprlandGuardian("/not-executed", 1000)
    guardian._send = AsyncMock()
    async with listener:
        try:
            original = await provider.refresh_application_group({"mapping_id": "TEST-1"})
            await guardian.bind_scope(original)
            guardian._active = True
            # Native keeps the member serial for captured intra-set widget focus.
            # A fresh token/timestamp is not a target or authority change.
            row["token"] = "c" * 64
            same_member = await provider.snapshot({"mapping_id": "TEST-1"})
            assert _binding(same_member) == _binding(original)
            await guardian.bind_scope(same_member)
            assert guardian._send.await_count == 2

            # A foreign-focus ABA can return to the same window, but cannot erase
            # the native serial increment. BOTH Python gates must still refuse.
            row["focus"]["serial"] += 1
            aba = await provider.snapshot({"mapping_id": "TEST-1"})
            assert _binding(aba) != _binding(original)
            with pytest.raises(HyprlandGuardianError, match="scope_invalid"):
                await guardian.bind_scope(aba)
            assert guardian._send.await_count == 2
        finally:
            await provider.close()


@pytest.mark.parametrize("operation", ["replace_field_pixels", "polyline", "type"])
async def test_action_keeps_running_through_fresh_unchanged_native_member_proofs(
        backend, monkeypatch, operation):
    """Real backend watcher/field permit/command encoder; synthetic transport."""
    frame = await backend.observe()
    refreshed = asyncio.Event()
    renewals = []
    before_bindings = len(backend._guardian.bound)

    async def renew(deadline):
        renewals.append(deadline)
        refreshed.set()

    async def dispatch(command, **kwargs):
        backend._guardian.commands.append(command)
        if operation == "replace_field_pixels":
            await kwargs["pixel_guard"]()
        # Deliberately outlive a watcher iteration, synchronized rather than
        # relying on a guessed field/stroke timing or no-op sleep patch.
        await asyncio.wait_for(refreshed.wait(), 2)
        if operation == "replace_field_pixels":
            await kwargs["pixel_guard"]()
        assert not backend._paused
        assert len(backend._guardian.bound) >= before_bindings + 2
        return {"event": "action_done", "input_was_sent": True, "release_ack": True}

    monkeypatch.setattr(backend._guardian, "refresh_scope", renew)
    monkeypatch.setattr(backend._guardian, "act", dispatch)
    inp = action(frame, type=operation)
    if operation == "replace_field_pixels":
        inp.pop("x")
        inp.pop("y")
        inp.update(region={"x": 1, "y": 1, "width": 3, "height": 3}, text="22")
    elif operation == "polyline":
        inp.pop("x")
        inp.pop("y")
        inp.update(points=[[1, 1], [2, 2], [3, 1]], duration=0.6)
    else:
        inp.pop("x")
        inp.pop("y")
        inp.update(text="22")
    result = await backend.act(inp)
    assert result["status"] == "executed"
    assert result["released"] is True
    assert renewals and backend._guardian.close_count == 0
    assert len(backend._guardian.commands) == 1
    assert not backend._release_failed


@pytest.mark.parametrize("change", [
    "foreign_focus_aba", "sibling", "group", "output", "geometry", "application",
    "lock", "generation", "focus_digest", "bounds_digest", "compositor",
])
async def test_watchdog_never_masks_real_scope_boundary_changes(backend, change):
    original = scope(surface_token=MAIN, application_group=group())
    await backend.observe()
    backend._application_group_proof = (group(), {})
    backend._guardian.application_group_refresh_ready = False
    fresh = copy.deepcopy(original)
    if change == "foreign_focus_aba":
        fresh["native_scope_serial"] += 1
    elif change == "sibling":
        fresh.update(surface_token=DIALOG, focus_digest="e" * 64)
    elif change == "group":
        fresh["application_group"] = group(2)
    elif change == "output":
        fresh["output"]["logical_x"] += 1
    elif change == "geometry":
        fresh["bounds"]["x"] += 1
        fresh["bounds_digest"] = "e" * 64
    elif change == "application":
        fresh["application"]["start_ticks"] += 1
    elif change == "lock":
        fresh["locked"] = True
    elif change == "generation":
        backend._generation += 1
    elif change == "compositor":
        fresh["compositor"] = {"name": "Hyprland", "epoch": "replacement"}
    else:
        fresh[change] = "e" * 64

    async def snapshot(*args, **kwargs):
        fresh["observed_monotonic_ns"] = time.monotonic_ns()
        return fresh, time.monotonic_ns() + 250_000_000

    backend._action_scope = snapshot
    await backend._watch_action(original, 1, [time.monotonic_ns() + 250_000_000])
    assert backend._paused and not backend.input_supported
    assert backend._guardian.close_count == 1
    assert not backend._release_failed
    assert not backend._guardian.commands  # Interruption never replays the action.
