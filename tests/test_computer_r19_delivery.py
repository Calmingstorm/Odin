"""Post-action images are evidence until the live delivery gate accepts them."""

from copy import deepcopy
from types import SimpleNamespace

import pytest

from src.computer.integration import ComputerIntegration
from src.computer.models import ComputerError
from src.computer.policy import DELIVERED_GROUNDING_SECONDS, FRAME_FRESH_SECONDS
from src.computer.vision import VisionError
from tests.test_computer_keyboard_grounding_r6 import fixture


def followup(action, view):
    return {
        **action,
        "action_id": "next",
        "observation_id": view["observation_id"],
        "source_id": view["source"]["source_id"],
        "source_revision": view["source"]["source_revision"],
    }


async def test_post_action_frame_requires_delivery_and_replay_cannot_reissue_it(
    tmp_path, monkeypatch
):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        action.update(operation="key", key="Right")
        backend = controller._live[action["session_id"]].backend

        async def inject(payload):
            assert (
                controller.store.db.execute(
                    "SELECT count(*) FROM receipts WHERE status='pending'"
                ).fetchone()[0]
                == 1
            )
            calls.append(deepcopy(payload))
            return {"status": "executed", "injected": True, "released": True}

        monkeypatch.setattr(backend, "_input_worker", inject)
        result = await controller.act(context, action)
        assert result["execution"]["released"] is True
        view = result["next_observation"]
        next_action = followup(action, view)
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await controller.act(context, next_action)
        assert len(calls) == 1
        replay = await controller.act(context, action)
        assert "next_observation" not in replay
        assert replay == {k: v for k, v in result.items() if k != "next_observation"}
        assert len(calls) == 1
        obs = controller._live[action["session_id"]].observations[view["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        second = await controller.act(context, next_action)
        assert second["execution"]["injected"] is True
        assert second["execution"]["released"] is True
        assert len(calls) == 2


@pytest.mark.parametrize("fault", ["age", "digest", "generation", "geometry"])
async def test_post_action_frame_cannot_authorize_stale_or_mismatched_input(
    tmp_path, monkeypatch, fault
):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        action.update(operation="key", key="Right")
        result = await controller.act(context, action)
        view = result["next_observation"]
        obs = controller._live[action["session_id"]].observations[view["observation_id"]]
        if fault == "age":
            monkeypatch.setattr(
                controller, "monotonic", lambda: obs.captured_at + FRAME_FRESH_SECONDS + 1
            )
        elif fault == "generation":
            controller.store.set_state(action["session_id"], "paused", revoke=True)
        if fault in {"age", "digest", "generation"}:
            with pytest.raises(ComputerError):
                await controller.validate_observation_delivery(
                    context, obs.frame_metadata, "wrong" if fault == "digest" else obs.image_sha256
                )
        else:
            await controller.validate_observation_delivery(
                context, obs.frame_metadata, obs.image_sha256
            )
            state["binding"]["window"] = 999
            refused = await controller.act(context, followup(action, view))
            assert refused["execution"]["injected"] is False
            assert refused["reason"] == "stale_source_binding"
        assert len(calls) == 1


async def test_delivered_post_action_frame_expires_before_dispatch(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        action.update(operation="key", key="Right")
        result = await controller.act(context, action)
        view = result["next_observation"]
        obs = controller._live[action["session_id"]].observations[view["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        monkeypatch.setattr(
            controller, "monotonic", lambda: obs.captured_at + DELIVERED_GROUNDING_SECONDS + 1
        )
        with pytest.raises(ComputerError, match="stale_observation"):
            await controller.act(context, followup(action, view))
        assert len(calls) == 1


async def test_partial_native_action_keeps_progress_and_never_replays(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        action.update(operation="polyline", points=[[2, 2], [10, 7]], duration=0.2)
        backend = controller._live[action["session_id"]].backend

        async def partial(payload):
            calls.append(deepcopy(payload))
            return {
                "status": "unknown",
                "injected": True,
                "released": True,
                "reason": "input_dispatch_expired",
                "diagnostics": {"phase": "dispatch", "steps_planned": 5, "steps_completed": 1},
            }

        monkeypatch.setattr(backend, "act", partial)
        result = await controller.act(context, action)
        assert result["status"] == "interrupted"
        assert result["execution"]["released"] is True
        assert result["diagnostics"]["steps_completed"] == 1
        assert result["diagnostics"]["replay_allowed"] is False
        assert action["session_id"] not in controller._delivered_observations
        replay = await controller.act(context, action)
        assert "next_observation" not in replay
        assert replay == {k: v for k, v in result.items() if k != "next_observation"}
        assert len(calls) == 1


async def test_native_facade_only_delivers_exact_post_action_image_from_its_call(
    tmp_path, monkeypatch
):
    from tests.test_computer_native_vision_r5 import client, serving

    async with fixture(tmp_path, monkeypatch) as (controller, context, action, state, calls):
        action.update(operation="key", key="Right")
        bot = SimpleNamespace(
            config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
            host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
            tool_executor=SimpleNamespace(check_permission=lambda *_: None),
        )
        service = ComputerIntegration(bot, controller=controller)
        monkeypatch.setattr(service, "_context", lambda _: context)
        turn = SimpleNamespace(
            user_id=context.owner_id,
            message=SimpleNamespace(channel=SimpleNamespace(id=context.channel_id)),
            _computer_serving=serving(client()),
        )
        block = SimpleNamespace(id="native-call", name="computer_act", input=action)
        with service.foreground(turn, block):
            image = await service._tool(block.name, action)
            receipt = image["__computer_action_receipt__"]
            assert receipt["execution"]["released"] is True
            assert action["session_id"] not in controller._delivered_observations
            with pytest.raises(VisionError, match="not authorized"):
                await service.validate_delivery(turn, block, deepcopy(image))
            await service.validate_delivery(turn, block, image)
            assert (
                controller._delivered_observations[action["session_id"]]
                == image["__computer_frame__"]["observation_id"]
            )
            with pytest.raises(VisionError, match="not authorized"):
                await service.validate_delivery(turn, block, image)
        replay = await controller.act(context, action)
        assert replay == receipt
        assert len(calls) == 1
