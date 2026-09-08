"""No display: expanded controller contracts and lifecycle races."""

import asyncio
from dataclasses import replace

import pytest

from src.computer.gui_actions import visual_receipt
from src.computer.models import ComputerError, RequestContext
from tests.test_computer_actions_r4 import persisted_receipt, setup


def changed(payload, *, binding=True, change=True):
    return {
        "status": "verified",
        "injected": True,
        "released": True,
        "postcondition": {
            "type": "visual_change",
            "method": "raster_digest_after_release",
            "target_application_matches": binding,
            "actual": {"before_sha256": "a" * 64, "after_sha256": ("b" if change else "a") * 64},
            **{k: payload[k] for k in ("source_id", "source_revision", "consent_generation")},
        },
    }


@pytest.mark.parametrize(
    "operation,fields",
    [
        ("type", {"text": "harmless GUI note é 日本語"}),
        ("key", {"key": "super+F12"}),
        ("double_click", {"x": 1, "y": 1}),
        ("right_click", {"x": 1, "y": 1}),
        ("middle_click", {"x": 1, "y": 1}),
        ("scroll", {"x": 1, "y": 1, "direction": "left", "count": 20}),
        ("polyline", {"points": [[0, 0], [1, 1]], "duration": 0.1}),
        ("drag", {"points": [[0, 0], [1, 1]], "duration": 0.1}),
        ("click", {"x": 1, "y": 1}),
    ],
)
async def test_new_actions_pending_before_input_no_replay(tmp_path, operation, fields):
    async with setup(tmp_path) as (controller, backend, ctx, original):
        inp = {k: v for k, v in original.items() if k not in {"x", "y", "operation", "expect"}}
        inp.update(operation=operation, expect={"type": "visual_change"}, **fields)

        async def hook(payload):
            row = controller.store.db.execute("SELECT status FROM receipts").fetchone()
            assert row[0] == "pending"
            return changed(payload)

        backend.hook = hook
        result = await controller.act(ctx, inp)
        assert result["status"] == "verified"
        assert result["verification"]["scope"] == "raster_change_only"
        assert result["next_observation"]["image_bytes"]
        assert await controller.act(ctx, inp) == persisted_receipt(result)
        assert len(backend.calls) == 1


@pytest.mark.parametrize(
    "operation,fields",
    [
        ("type", {"text": "x" * 513}),
        ("type", {"text": "\x00"}),
        ("type", {"text": "\ud800"}),
        ("key", {"key": "ctrl+ctrl+t"}),
        ("key", {"key": "--window"}),
        ("drag", {"points": [[0, 0], [1, 1]], "duration": 1.1}),
        ("drag", {"points": [[0, 0], [True, 1]], "duration": 0}),
        ("drag", {"points": [[0, 0]], "duration": 0}),
    ],
)
async def test_unsafe_schema_no_backend(tmp_path, operation, fields):
    async with setup(tmp_path) as (controller, backend, ctx, original):
        inp = {k: v for k, v in original.items() if k not in {"x", "y", "operation", "expect"}}
        inp.update(operation=operation, expect={"type": "visual_change"}, **fields)
        with pytest.raises(ComputerError):
            await controller.act(ctx, inp)
        assert backend.calls == []


async def test_ninety_second_model_turnaround_with_fresh_revalidation(tmp_path):
    now = [100.0]
    async with setup(tmp_path, monotonic=lambda: now[0]) as (controller, backend, ctx, inp):
        now[0] += 90
        assert (await controller.act(ctx, inp))["status"] == "verified"


async def test_rpc_capture_overhead_may_exceed_native_lease(tmp_path):
    from src.computer.policy import MAX_ACTION_RPC_SECONDS, MAX_INPUT_SECONDS

    assert MAX_INPUT_SECONDS == 2.0 and MAX_ACTION_RPC_SECONDS == 5.0
    async with setup(tmp_path) as (controller, backend, ctx, original):
        inp = {k: v for k, v in original.items() if k not in {"x", "y", "operation", "expect"}}
        inp.update(operation="key", key="ctrl+s", expect={"type": "visual_change"})

        async def hook(payload):
            # No input occurs in this stub. Simulate startup/capture overhead.
            await asyncio.sleep(2.05)
            return changed(payload)

        backend.hook = hook
        assert (await controller.act(ctx, inp))["status"] == "verified"


@pytest.mark.parametrize(
    "classification,acknowledge,allowed",
    [
        ("safe_application", True, True),
        ("safe_application", False, False),
        ("unrecognized", True, False),
        (None, True, False),
    ],
)
async def test_modal_ack_is_not_authority(tmp_path, classification, acknowledge, allowed):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        observe = backend.observe

        async def modal_observe():
            return replace(await observe(), modal="dialog", modal_kind=classification)

        backend.observe = modal_observe
        observed = await controller.observe(ctx, {"session_id": inp["session_id"], "generation": 1})
        obs = controller._live[inp["session_id"]].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        inp["observation_id"] = obs.observation_id
        if acknowledge:
            inp["expected_modal"] = "dialog"
        if allowed:
            assert (await controller.act(ctx, inp))["status"] == "verified"
        else:
            with pytest.raises(ComputerError, match="unexpected_modal"):
                await controller.act(ctx, inp)
            assert not backend.calls


async def test_finish_turn_after_input_permission_revocation(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        controller.authorize = lambda _: False
        assert (await controller.finish_turn(ctx))["state"] == "cancelled"
        assert inp["session_id"] not in controller._live


async def test_stop_serializes_failure_then_success(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        entered, finish = asyncio.Event(), asyncio.Event()
        calls = []

        async def stop():
            calls.append(1)
            if len(calls) == 1:
                entered.set()
                await finish.wait()
                return {"stopped": False}
            return {"stopped": True}

        backend.stop = stop
        first = asyncio.create_task(controller._stop(inp["session_id"], "cancelled"))
        await entered.wait()
        second = asyncio.create_task(controller._stop(inp["session_id"], "closed"))
        await asyncio.sleep(0)
        assert len(calls) == 1
        finish.set()
        await first
        result = await second
        assert result["state"] == "closed" and result["cleanup"]["complete"]
        assert controller.store.cleanup(inp["session_id"])["complete"]
        assert (await controller._stop(inp["session_id"], "cancelled"))["state"] == "closed"


async def test_web_operator_owner_read_cross_channel_not_model_authority(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        operator = RequestContext(
            ctx.owner_id, "web-session", "web-operator", ctx.host_id, surface="webui"
        )
        result = await controller.operator_observe(operator)
        assert result["session_id"] == inp["session_id"]
        content, metadata = await controller.read_evidence(operator, result["evidence_id"])
        assert content and metadata["kind"] == "frame"
        other = replace(operator, owner_id="other")
        with pytest.raises(ComputerError):
            await controller.read_evidence(other, result["evidence_id"])
        with pytest.raises(ComputerError):
            await controller.operator_session(other, "stop")
        assert (await controller.operator_session(operator, "stop"))["state"] == "cancelled"


async def test_adapter_verdict_never_overrides_measurements(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        obs = controller._live[inp["session_id"]].observations[inp["observation_id"]]
        for binding, change in [(False, True), (True, False)]:
            raw = changed(inp, binding=binding, change=change)
            assert visual_receipt(raw, obs)["status"] == "not_satisfied"
        raw = changed(inp)
        raw["postcondition"]["actual"]["before_sha256"] = "invalid"
        assert visual_receipt(raw, obs)["status"] == "unknown"
