"""Normal service/controller/store chain with synthetic native transport only."""
# ruff: noqa: F811
import asyncio

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from tests.computer.test_hyprland_backend import action as backend_action
from tests.test_computer_hyprland_receipts_r33 import durable
from tests.test_computer_hyprland_turnloop_r33 import NativeTransport, action, observe
from tests.test_computer_hyprland_turnloop_r33 import normal as normal
from tests.test_hyprland_multiturn_drawing import (
    clean,
    commands,
    drawing,  # noqa: F401
    invoke,
    stroke,
)


@pytest.mark.parametrize("native_ack", [True, False])
async def test_clean_partial_field_reobserves_same_session_then_new_stroke(
        drawing, monkeypatch, native_ack):
    rig = drawing
    controller = rig.service.controller
    sid = rig.grant["session_id"]
    await observe(rig, rig.grant)
    backend = controller._live[sid].backend
    old_owner = controller.store.hyprland_owner(sid)
    original = NativeTransport.act

    async def partial(self, command, **kwargs):
        if command.startswith("E "):
            self.commands.append(command)
            exc = ComputerError("synthetic_permit_refusal")
            exc.details = {"input_was_sent": True, "diagnostics": {
                "phase": "release", "steps_planned": 36, "steps_completed": 2,
                "release": "confirmed", "reason": "cancelled"}}
            raise exc
        return await original(self, command, **kwargs)

    close = backend._guardian.close

    async def local_close():
        receipt = await close()
        return {**receipt, "release_ack": native_ack, "release_confirmed": True}

    monkeypatch.setattr(backend._guardian, "close", local_close)
    monkeypatch.setattr(NativeTransport, "act", partial)
    inp = action(rig, rig.grant, "partial-field")
    inp.pop("x")
    inp.pop("y")
    inp.update(operation="replace_field_pixels",
               region={"x": 1, "y": 1, "width": 3, "height": 3}, text="Airbrush")
    result = await invoke(rig, "computer_act", **inp)
    receipt = durable(rig, rig.grant, "partial-field")
    assert receipt["status"] == "interrupted", result
    assert receipt["reason"] == "hyprland_dispatch_interrupted_after_release", result
    assert receipt["execution"]["released"] is True
    assert "Image loaded" in result["content"], result
    assert '"next_action":"observe_fresh"' in result["content"], result
    assert controller.store.get_session(sid).state == "active"
    assert controller.store.get_session(sid).generation == rig.grant["generation"]
    assert backend.input_readiness == "ready"
    assert controller.store.hyprland_owner(sid) != old_owner
    assert commands(rig) == 1
    clean(rig)
    # Duplicate ID returns the receipt only: never recreates input or replays.
    before = commands(rig)
    await invoke(rig, "computer_act", **inp)
    assert commands(rig) == before
    await observe(rig, rig.grant)
    await stroke(rig, "different-stroke-after-inspection")
    assert commands(rig) == 2
    clean(rig)


async def test_clean_interruption_cannot_rearm_changed_group(drawing, monkeypatch):
    rig = drawing
    await observe(rig, rig.grant)
    controller = rig.service.controller
    backend = controller._live[rig.grant["session_id"]].backend

    async def partial(*args, **kwargs):
        monkeypatch.setattr(type(backend._scope_provider), "refresh_application_group", changed)
        raise ComputerError("partial_dispatch")

    async def changed(*args, **kwargs):
        raise ComputerError("hyprland_application_group_changed")

    monkeypatch.setattr(backend._guardian, "act", partial)
    inp = action(rig, rig.grant, "continuity-loss")
    # Dispatch uses the captured scope. Post-action rearm must fail at the new
    # group's native check; local release never grants replacement authority.
    await invoke(rig, "computer_act", **inp)
    assert backend.input_readiness == "inactive"
    assert len(rig.transports) == 1
    assert not backend._release_failed


async def test_external_pause_fences_observation_rearm_before_first_await(drawing, monkeypatch):
    rig = drawing
    backend = rig.service.controller._live[rig.grant["session_id"]].backend
    frame = await backend.observe()

    async def partial(*args, **kwargs):
        raise ComputerError("partial_dispatch")

    monkeypatch.setattr(backend._guardian, "act", partial)
    receipt = await backend.act(backend_action(frame))
    assert receipt["released"] and not receipt["fresh_session_required"]
    entered, proceed = asyncio.Event(), asyncio.Event()

    async def hold_revalidation(*args):
        entered.set()
        await proceed.wait()

    monkeypatch.setattr(hb, "revalidate", hold_revalidation)
    observation = asyncio.create_task(backend.observe())
    await asyncio.wait_for(entered.wait(), 2)
    epoch = backend._recovery_epoch
    pause = asyncio.create_task(backend.pause())
    await asyncio.sleep(0)
    fenced = backend._recovery_epoch != epoch
    proceed.set()
    outcomes = await asyncio.wait_for(
        asyncio.gather(observation, pause, return_exceptions=True), 2)
    assert fenced
    assert isinstance(outcomes[0], ComputerError)
    assert outcomes[1]["released"] is True
    assert backend._paused and not backend.input_supported
    assert len(rig.transports) == 1
