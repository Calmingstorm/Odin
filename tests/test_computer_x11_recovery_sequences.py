"""Recovery of never-dispatched sequence suffixes, with fake input only."""

import asyncio
from dataclasses import replace

import pytest

from tests.test_computer_gui_actions_r5 import changed
from tests.test_computer_x11_recovery_controller import setup


def plan(action):
    binding = {key: value for key, value in action.items()
               if key not in {"x", "y", "expect", "operation", "action_id"}}
    return {**binding, "action_id": "plan", "operation": "sequence", "steps": [
        {"action_id": "first", "operation": "click", "x": 1, "y": 1,
         "expect": {"type": "visual_change"}},
        {"action_id": "second", "operation": "click", "x": 1, "y": 1,
         "expect": {"type": "visual_change"}},
    ]}


async def test_released_prefix_not_replayed_suffix_recovers(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        async def dispatch(payload):
            backend.actions.append(payload)
            if len(backend.actions) == 1:
                backend.focused = False
                backend.source = replace(backend.source, source_revision=2)
            return changed(payload)

        backend.act = dispatch
        result = await controller.act(ctx, plan(action))
        assert result["status"] == "verified"
        assert len(backend.actions) == 2 and backend.recoveries == 1
        assert [p["source_revision"] for p in backend.actions] == [1, 3]
        assert result["execution"]["completed_steps"] == 2
        assert result["verification"]["pre_dispatch_recoveries"] == 1
        await controller.act(ctx, plan(action))
        assert len(backend.actions) == 2 and backend.recoveries == 1


@pytest.mark.parametrize("problem", ["user_active", "identity", "anchor", "unknown_release"])
async def test_recovery_never_overrides_remaining_prerequisites(tmp_path, problem):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        async def dispatch(payload):
            backend.actions.append(payload)
            backend.focused = False
            backend.source = replace(backend.source, source_revision=2)
            if problem == "user_active":
                backend.recovery_status = "user_active"
            elif problem == "identity":
                backend.identity = "new-window"
            elif problem == "anchor":
                backend.changed_pixels = True
            if problem == "unknown_release":
                return {"status": "unknown", "injected": True, "released": False}
            return changed(payload)

        backend.act = dispatch
        result = await controller.act(ctx, plan(action))
        assert len(backend.actions) == 1
        assert result["status"] != "verified"
        assert backend.recoveries == (0 if problem == "unknown_release" else 1)
        child = result["verification"]["steps"][1]
        assert child["reason"] == "sequence_not_dispatched"
        assert child["execution"]["injected"] is False


async def test_cancel_between_steps_cannot_dispatch_suffix(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        backend.pause_recovery = asyncio.Event()

        async def dispatch(payload):
            backend.actions.append(payload)
            backend.focused = False
            backend.source = replace(backend.source, source_revision=2)
            return changed(payload)

        backend.act = dispatch
        task = asyncio.create_task(controller.act(ctx, plan(action)))
        await asyncio.wait_for(backend.recovery_entered.wait(), 1)
        await asyncio.wait_for(controller._stop(action["session_id"], "cancelled"), 1)
        with pytest.raises(asyncio.CancelledError):
            await task
        assert len(backend.actions) == 1
        assert not controller._recoveries
