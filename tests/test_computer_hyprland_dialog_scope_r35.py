"""Synthetic R35 scope boundaries, no live desktop or native qualification."""
import copy
import time

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime import hyprland_scope as hs
from tests.computer.test_hyprland_backend import action, backend, config, native, output, scope
from tests.test_computer_hyprland_scope_r32 import sample
from tests.test_computer_hyprland_turnloop_r33 import action as turn_action
from tests.test_computer_hyprland_turnloop_r33 import call, normal, observe, start

__all__ = ["backend", "normal"]


@pytest.mark.parametrize("change", [
    {"pid": 9999}, {"uid": 999}, {"start_ticks": 101},
    {"exe": "/usr/bin/foreign"}, {"exe_identity": [1, 3]},
])
def test_original_process_identity_not_current_focus_or_class(change):
    runtime = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    runtime._output = output()
    original = scope(wm_class="Pinta")
    runtime._check_scope(original)
    changed = scope(application=original["application"] | change, wm_class="Pinta")
    with pytest.raises(ComputerError, match="application"):
        runtime._check_scope(changed)
    assert runtime._application_pin == original["application"]


def test_identity_pin_is_deep_copy_and_survives_invalidation():
    runtime = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    runtime._output = output()
    original = scope()
    runtime._check_scope(original)
    original["application"]["exe_identity"][1] = 999
    runtime._invalidate()
    runtime._check_scope(scope())
    assert runtime._application_pin["exe_identity"] == [1, 2]


@pytest.mark.parametrize("parents", [[], ["100"]])
async def test_own_dialog_new_class_fresh_frame_then_return_canvas(backend, parents):
    first = await backend.observe()
    current = scope(surface_token="200", native_scope_serial=2, focus_digest="d" * 64,
                    parent_tokens=parents, wm_class="dotnet", modal=True,
                    modal_kind="safe_application", modal_title_digest="e" * 64)

    async def capture(crop=None):
        current["observed_monotonic_ns"] = time.monotonic_ns()
        return hb._render_native(native(), crop), copy.deepcopy(current), time.monotonic()

    backend._capture = capture
    with pytest.raises(ComputerError, match="observation_changed"):
        await backend.act(action(first))
    assert not backend._guardian.commands and not backend._guardian.bound
    dialog = await backend.observe()
    assert dialog.modal_kind == "safe_application"
    assert dialog.source.source_revision > first.source.source_revision
    current = scope(modal=True, modal_kind="safe_application", native_scope_serial=3)
    canvas = await backend.observe()
    assert canvas.modal is None and canvas.modal_kind is None
    assert canvas.source.source_revision > dialog.source.source_revision


async def test_unseen_dialog_cannot_rebind_without_frame(backend):
    await backend.observe()
    backend._frame = None
    with pytest.raises(ComputerError, match="fresh_application"):
        await backend.act({"type": "key", "key": "Return"})
    assert backend._guardian.bound == [] and backend._guardian.commands == []


async def test_transition_while_held_revokes_without_rebinding(backend):
    await backend.observe()
    original = scope()
    backend._scope_provider.snapshot.side_effect = lambda _: scope(
        surface_token="200", native_scope_serial=2, modal=True, modal_kind="safe_application")
    await backend._watch_action(original, backend._generation, [time.monotonic_ns() + 200_000_000])
    assert backend._paused and backend._frame is None
    assert backend._guardian.close_count == 1 and backend._guardian.bound == []


@pytest.mark.parametrize("mutation", [
    {"parent_chain_verified": False}, {"parent_chain_verified": None},
    {"parent_tokens": ["a", "a"]}, {"parent_tokens": ["a"] * 33},
    {"parent_tokens": [None]}, {"parent_tokens": "100"}, {"uid": True},
])
def test_foreign_or_unknown_parent_chain_refused(mutation):
    started = time.monotonic_ns()
    row = sample()
    row["focus"].update(mutation)
    with pytest.raises(hs.HyprlandScopeFailure):
        hs._observation(row, "TEST-1", started)


def test_changed_granted_output_rejected():
    from dataclasses import replace

    runtime = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    runtime._output = output()
    runtime._check_scope(scope())
    runtime._output = replace(output(), logical_x=0)
    with pytest.raises(ComputerError, match="output_changed"):
        runtime._check_scope(scope(runtime._output))


@pytest.mark.parametrize("batch", [False, True])
async def test_controller_dialog_delivery_is_new_authority_not_batch_rebind(normal, batch):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    runtime = controller._live[grant["session_id"]].backend
    transport = normal.transports[0]

    async def snapshot(_):
        if transport.commands:
            return scope(surface_token="200", native_scope_serial=2, focus_digest="d" * 64,
                         wm_class="dotnet", modal=True, modal_kind="safe_application",
                         modal_title_digest="e" * 64)
        return scope()

    runtime._scope_provider.snapshot = snapshot
    first = turn_action(normal, grant, "open-dialog")
    first.update(operation="key", key="ctrl+n", expect={"type": "visual_change"})
    first.pop("x")
    first.pop("y")
    if batch:
        first.pop("key")
        first.pop("expect")
        first.update(operation="sequence", steps=[
            {"action_id": "open", "operation": "key", "key": "ctrl+n",
             "expect": {"type": "visual_change"}},
            {"action_id": "unseen", "operation": "key", "key": "Return",
             "expect": {"type": "visual_change"}},
        ])
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **first))
    if batch:
        assert '"status":"interrupted"' in result["content"]
        assert len(transport.commands) == 1
        assert runtime._paused  # Existing batch abort lifecycle revokes input.
        return
    assert "Image loaded" in result["content"], result
    assert "outcome_unknown" not in result["content"]
    assert len(transport.commands) == 1
    assert runtime._frame.modal_kind == "safe_application"
    assert not runtime._paused
    fresh = turn_action(normal, grant, "dialog-after-delivery")
    assert fresh["observation_id"] != first["observation_id"]
    fresh.update(operation="key", key="Escape")
    fresh.pop("x")
    fresh.pop("y")
    fresh["expected_modal"] = runtime._frame.modal
    result = await normal.runner._run_one_tool(normal.state, call("computer_act", **fresh))
    assert "Image loaded" in result["content"], result
    assert len(transport.commands) == 2
