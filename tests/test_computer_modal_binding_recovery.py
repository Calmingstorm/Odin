"""Delivered dialog pixels never authorize stale coordinates or require revocation.

Real integration delivery, controller, store, and attached adapter; fake native I/O.
"""

from copy import deepcopy
from dataclasses import replace
from types import SimpleNamespace

import pytest

from src.computer.integration import ComputerIntegration
from src.computer.models import ComputerError
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_native_vision_r5 import client, serving


@pytest.mark.asyncio
@pytest.mark.parametrize("drift", [False, True])
async def test_delivered_ctrl_n_dialog_create_binding(tmp_path, monkeypatch, drift):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        backend = controller._live[action["session_id"]].backend
        # Hyprland binds modal identity to its native dialog, not its animated
        # geometry. Keep the real capture adapter but model that backend-specific
        # identity contract; X11's historical token rotation is not changed.
        observe = backend.observe

        async def native_dialog_observe(**kwargs):
            frame = await observe(**kwargs)
            if frame.modal is not None:
                backend._modal_id = "native-dialog"
                frame = replace(frame, modal="native-dialog")
                backend._frame = frame
            return frame

        monkeypatch.setattr(backend, "observe", native_dialog_observe)
        backend.capabilities = replace(
            backend.capabilities, backend="hyprland", platform="wayland",
            owned_input_release="hyprland_best_effort",
        )
        controller._live[action["session_id"]].capabilities = backend.capabilities

        async def inject(payload):
            calls.append(deepcopy(payload))
            if len(calls) == 1:
                state["binding"].update(modal=True, modal_kind="safe_application")
            return {"status": "executed", "injected": True, "released": True}

        monkeypatch.setattr(backend, "_input_worker", inject)
        bot = SimpleNamespace(
            config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
            host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
            tool_executor=SimpleNamespace(check_permission=lambda *_: None),
        )
        integration = ComputerIntegration(bot, controller=controller)
        monkeypatch.setattr(integration, "_context", lambda _: context)
        turn = SimpleNamespace(
            user_id=context.owner_id,
            message=SimpleNamespace(channel=SimpleNamespace(id=context.channel_id)),
            _computer_serving=serving(client()),
        )

        async def deliver(name, request, call_id):
            block = SimpleNamespace(id=call_id, name=name, input=request)
            with integration.foreground(turn, block):
                image = await integration._tool(name, request)
                await integration.validate_delivery(turn, block, image)
                return image

        action.update(operation="key", key="ctrl+n")
        image = await deliver("computer_act", action, "open-dialog")
        receipt = image["__computer_action_receipt__"]
        assert receipt["execution"]["injected"] is True
        assert receipt["execution"]["released"] is True
        assert receipt["verification"]["reason"] == "unexpected_dialog_transition"
        sid = action["session_id"]
        live = controller._live[sid]
        obs = live.observations[controller._delivered_observations[sid]]
        create = {
            **action, "action_id": "create", "operation": "click", "x": 2, "y": 2,
            "observation_id": obs.observation_id,
            "source_revision": obs.source.source_revision,
            "expected_modal": obs.modal,
        }
        create.pop("key")
        if drift:
            # The same dialog settles at a new rectangle after its pixels arrive.
            state["binding"]["rect"] = [101, 200, 40, 20]
            refused = await controller.act(context, create)
            assert refused["reason"] == "stale_source_binding"
            assert refused["execution"]["injected"] is False
            assert refused["execution"]["released"] is True
            assert refused["verification"]["recoverable"] is True
            assert len(calls) == 1
            grant = controller.store.get_session(sid)
            assert grant.state == "active"
            assert grant.generation == action["generation"]
            assert not state.get("paused")
            # A receipt is idempotent, never implicit retry or binding replacement.
            assert await controller.act(context, create) == refused
            await deliver("computer_observe", {
                "session_id": sid, "generation": action["generation"],
            }, "settled-dialog")
            obs = live.observations[controller._delivered_observations[sid]]
            create.update(action_id="create-fresh", observation_id=obs.observation_id,
                          source_revision=obs.source.source_revision, expected_modal=obs.modal)
        result = await controller.act(context, create)
        assert result["execution"]["injected"] is True
        assert result["execution"]["released"] is True
        assert len(calls) == 2


@pytest.mark.asyncio
async def test_unacknowledged_new_dialog_still_revokes_before_input(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        action.update(operation="click", x=2, y=2)
        state["binding"].update(modal=True, modal_kind="safe_application")
        with pytest.raises(ComputerError, match="stale_source_binding"):
            await controller.act(context, action)
        assert not calls
        assert controller.store.get_session(action["session_id"]).state == "paused"
