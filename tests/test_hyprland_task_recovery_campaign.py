"""P5 known-no-input recovery: bounded, scoped, and never an input replay."""

import asyncio
from dataclasses import replace

import pytest

from src.computer.models import ComputerError
from tests.test_computer_keyboard_grounding_r6 import fixture


def _hyprland(controller, action):
    backend = controller._live[action["session_id"]].backend
    backend.capabilities = replace(
        backend.capabilities,
        platform="wayland",
        backend="hyprland",
        owned_input_release="hyprland_best_effort",
    )
    controller._live[action["session_id"]].capabilities = backend.capabilities
    backend.recovery_supported = True
    return backend


@pytest.mark.asyncio
async def test_known_no_input_observe_retries_bounded_recovery_and_returns_fresh_pixels(
    tmp_path, monkeypatch,
):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        backend = _hyprland(controller, action)
        attempts = []

        async def recover_focus(expected_application, *, context):
            attempts.append(expected_application)
            if len(attempts) < 3:
                return False
            state["binding"]["window"] = 90
            state["binding"]["focus_window"] = 90
            return True

        backend.recover_focus = recover_focus
        state["binding"]["window"] = 91
        state["binding"]["focus_window"] = 91
        original_capture = controller._capture
        capture_attempts = 0

        async def stale_once(*args, **kwargs):
            nonlocal capture_attempts
            capture_attempts += 1
            if capture_attempts == 1:
                raise ComputerError("stale_source_binding")
            return await original_capture(*args, **kwargs)

        controller._capture = stale_once

        observed = await controller.observe(
            context, {"session_id": action["session_id"], "generation": 1}
        )

        assert len(attempts) == 3
        assert observed["observation_id"] != action["observation_id"]
        assert calls == []
        assert controller.store.db.execute(
            "SELECT count(*) FROM receipts WHERE status='pending'"
        ).fetchone()[0] == 0


@pytest.mark.asyncio
async def test_pause_during_known_no_input_recovery_cannot_self_resume(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        backend = _hyprland(controller, action)
        started = asyncio.Event()

        async def recover_focus(expected_application, *, context):
            started.set()
            await asyncio.Event().wait()

        backend.recover_focus = recover_focus
        state["binding"]["window"] = 91
        state["binding"]["focus_window"] = 91
        async def stale_once(*args, **kwargs):
            raise ComputerError("stale_source_binding")

        controller._capture = stale_once
        observing = asyncio.create_task(
            controller.observe(context, {"session_id": action["session_id"], "generation": 1})
        )
        await started.wait()
        paused = await controller.session(
            context, {"operation": "pause", "session_id": action["session_id"], "generation": 1}
        )
        with pytest.raises(asyncio.CancelledError):
            await observing

        assert paused["state"] == "paused"
        assert calls == []
