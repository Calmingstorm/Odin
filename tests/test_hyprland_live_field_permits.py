"""Synthetic IPC only; field-gate contracts, not live-desktop acceptance."""
# ruff: noqa: F811
import time
from dataclasses import replace

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from tests.computer.test_hyprland_backend import (
    action,
    backend,  # noqa: F401
    native,
    scope,
)


def field(frame):
    inp = action(frame, type="replace_field_pixels",
                 region={"x": 1, "y": 1, "width": 3, "height": 3}, text="Airbrush")
    inp.pop("x")
    inp.pop("y")
    return inp


async def test_live_filter_gates_do_not_acquire_extra_scope_or_rasters(backend, monkeypatch):
    backend._output = replace(backend._output, width=80, height=60)
    backend._scope_provider.snapshot.side_effect = lambda _: scope(backend._output)
    frame = await backend.observe()
    gate_count = 0

    async def forbidden(*args, **kwargs):
        raise AssertionError("per-gate snapshot/capture must not compete with watchdog")

    async def dispatch(command, **kwargs):
        nonlocal gate_count
        assert command.startswith("E ")
        # Live preset filtering repaints outside the field. Native per-event
        # checks own focus/geometry; extra per-character capture/RPC is redundant.
        with monkeypatch.context() as patch:
            patch.setattr(backend, "_action_scope", forbidden)
            patch.setattr(backend, "_capture", forbidden)
            for _ in range(11):
                await kwargs["pixel_guard"]()
                gate_count += 1
        return {"event": "action_done", "release_ack": True, "input_was_sent": True}

    monkeypatch.setattr(backend._guardian, "act", dispatch)
    original = backend._capture

    async def capture(crop=None):
        if gate_count:
            return (hb._render_native(native(backend._output, shade=170), crop),
                    scope(backend._output), time.monotonic())
        return await original(crop)

    monkeypatch.setattr(backend, "_capture", capture)
    result = await backend.act(field(frame))
    assert gate_count == 11
    assert result["status"] == "executed"
    assert result["released"] is True
    actual = result["postcondition"]["actual"]
    assert actual["before_sha256"] != actual["after_sha256"]


@pytest.mark.parametrize("change,reason", [
    ("generation", "hyprland_generation_revoked"),
    ("pause", "hyprland_session_revoked"),
    ("close", "hyprland_session_revoked"),
    ("release", "hyprland_owned_cleanup_unverified"),
    ("lease", "hyprland_scope_evidence_expired"),
])
async def test_field_permit_never_renews_or_overrides_revocation(
        backend, monkeypatch, change, reason):
    frame = await backend.observe()
    seen = []

    async def dispatch(command, **kwargs):
        await kwargs["pixel_guard"]()
        if change == "generation":
            backend._generation += 1
        elif change == "pause":
            backend._paused = True
        elif change == "close":
            backend._closed = True
        elif change == "release":
            backend._release_failed = True
        else:
            monkeypatch.setattr(hb.time, "monotonic_ns", lambda: kwargs["scope_deadline_ns"])
        with pytest.raises(ComputerError, match=reason):
            await kwargs["pixel_guard"]()
        seen.append(reason)
        raise ComputerError(reason)

    monkeypatch.setattr(backend._guardian, "act", dispatch)
    try:
        await backend.act(field(frame))
    except ComputerError:
        pass
    assert seen == [reason]


async def test_watchdog_still_refuses_changed_native_binding(backend):
    await backend.observe()
    backend._scope_provider.snapshot.side_effect = lambda _: scope(native_scope_serial=2)
    await backend._watch_action(scope(), backend._generation,
                                [time.monotonic_ns() + 250_000_000])
    assert backend._paused and not backend.input_supported
    assert backend._guardian.close_count == 1


@pytest.mark.parametrize("reason,expected", [
    ("hyprland_scope_evidence_expired", "hyprland_scope_evidence_expired"),
    ("private application text", "hyprland_pixel_permit_failed"),
])
async def test_original_permit_refusal_survives_native_cancelled(
        monkeypatch, caplog, reason, expected):
    from src.computer.runtime.hyprland_guardian import HyprlandGuardian
    from src.computer.runtime.wayland_guardian import WaylandGuardian, WaylandGuardianError

    guardian = HyprlandGuardian("/not-executed", 1000)
    guardian._scope_deadline = time.monotonic_ns() + 250_000_000

    async def refused():
        raise ComputerError(reason)

    async def native_cancelled(self, command, *, pixel_guard, **kwargs):
        with pytest.raises(ComputerError):
            await pixel_guard()
        error = WaylandGuardianError("wayland_guardian_input_path_lost")
        error.details = {"diagnostics": {"reason": "cancelled"}}
        raise error

    monkeypatch.setattr(WaylandGuardian, "act", native_cancelled)
    with pytest.raises(WaylandGuardianError) as error:
        await guardian.act("E synthetic", pixel_guard=refused,
                           scope_deadline_ns=guardian._scope_deadline)
    assert error.value.details["permit_reason"] == expected
    assert error.value.details["diagnostics"]["reason"] == "cancelled"
    assert expected in caplog.text
    assert "private application text" not in caplog.text
