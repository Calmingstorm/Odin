"""Recovery of never-dispatched sequence suffixes, with fake input only."""

import asyncio
from dataclasses import replace

import pytest

from src.computer.store import canonical_hash
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
        assert result["verification"]["pre_dispatch_recoveries"] == 0
        assert result["verification"]["post_release_recoveries"] == 1
        stored = controller.store.receipt(
            action["session_id"], "plan", canonical_hash(plan(action)))
        assert stored["verification"]["steps"][0]["verification"][
            "post_release_recovery"]["status"] == "recovered"
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
        if problem == "user_active":
            assert result["verification"]["steps"][0]["status"] == "executed"
            assert result["verification"]["steps"][0]["verification"]["status"] == "unavailable"


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


async def test_foreign_focused_checkpoint_recovers_before_effect_classification(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        original_identity = backend.identity

        def binding():
            return {"scope": {"process": backend.identity, "window": backend.identity},
                    "resized": backend.resized}

        backend.recovery_binding = binding
        live = controller._live[action["session_id"]]
        original = live.observations[action["observation_id"]]
        live.observations[action["observation_id"]] = replace(
            original, recovery_binding=binding())
        recover = backend.recover_target

        async def recover_original(old):
            backend.identity = original_identity
            return await recover(old)

        async def dispatch(payload):
            backend.actions.append(payload)
            if len(backend.actions) == 1:
                backend.identity = "other-focused-application"
                backend.source = replace(backend.source, source_revision=2)
            return changed(payload)

        backend.recover_target = recover_original
        backend.act = dispatch
        request = plan(action)
        result = await controller.act(ctx, request)
        assert result["status"] == "verified"
        assert backend.recoveries == 1
        assert len(backend.actions) == 2
        assert result["verification"]["post_release_recoveries"] == 1
        assert result["verification"]["pre_dispatch_recoveries"] == 0
        await controller.act(ctx, request)
        assert len(backend.actions) == 2 and backend.recoveries == 1


async def test_post_release_refocus_does_not_repair_false_native_effect_proof(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        async def dispatch(payload):
            backend.actions.append(payload)
            backend.focused = False
            raw = changed(payload)
            raw["postcondition"]["target_application_matches"] = False
            return raw

        backend.act = dispatch
        result = await controller.act(ctx, plan(action))
        assert len(backend.actions) == backend.recoveries == 1
        assert result["reason"] == "sequence_step_not_verified"
        first = result["verification"]["steps"][0]
        assert first["verification"]["target_application_matches"] is False
        assert first["execution"]["injected"] is True
        assert first["execution"]["released"] is True
        assert result["verification"]["steps"][1]["reason"] == "sequence_not_dispatched"


async def test_pending_unrelated_receipt_blocks_post_release_recovery(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        async def dispatch(payload):
            backend.actions.append(payload)
            grant = controller.store.get_session(action["session_id"])
            controller.store.begin_action(grant, "unrelated-pending", "digest", 200)
            backend.focused = False
            return changed(payload)

        backend.act = dispatch
        result = await controller.act(ctx, plan(action))
        assert len(backend.actions) == 1 and backend.recoveries == 0
        assert result["reason"] == "input_outcome_unknown"
        assert result["verification"]["steps"][1]["reason"] == "sequence_not_dispatched"


async def test_real_new_modal_never_triggers_automatic_sequence_recovery(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        observe = backend.observe

        async def capture():
            raw = await observe()
            if backend.actions:
                raw = replace(raw, modal="actual-new-dialog", modal_kind="safe_application")
            return raw

        async def dispatch(payload):
            backend.actions.append(payload)
            return changed(payload)

        backend.observe, backend.act = capture, dispatch
        result = await controller.act(ctx, plan(action))
        assert len(backend.actions) == 1 and backend.recoveries == 0
        first = result["verification"]["steps"][0]
        assert first["verification"]["reason"] == "unexpected_dialog_transition"
        assert result["verification"]["steps"][1]["reason"] == "sequence_not_dispatched"
        # This minimal backend has no pause primitive, so pause falls back to
        # safe cancellation. Either way no old-generation input may continue.
        assert controller.store.get_session(action["session_id"]).state != "active"


@pytest.mark.parametrize("problem", [None, "partial", "missing_counts", "diagnostic_release",
                                     "unrelated_pixels", "unknown_release", "identity",
                                     "user_active", "resize", "next_anchor", "new_dialog"])
async def test_recovered_polyline_uses_independent_path_not_foreign_native_sample(
    tmp_path, monkeypatch, problem,
):
    from tests.test_computer_sequences_r19 import (
        disconnected_strokes,
        raster,
        rig,
        stroke_dispatch,
    )

    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        focused, identity, resized = True, "original", False
        recoveries = []
        observe = b.observe

        def recovery_binding():
            return {"identity": identity, "resized": resized} if focused else None

        async def capture():
            raw = replace(await observe(), focused=focused)
            if problem == "new_dialog" and b.calls:
                raw = replace(raw, modal="actual-new-dialog", modal_kind="safe_application")
            return raw

        async def recover(old):
            nonlocal focused
            recoveries.append(old)
            if problem == "user_active":
                return {"status": "user_active"}
            focused = True
            b.source = replace(b.source, source_revision=b.source.source_revision + 1)
            return {"status": "recovered", "focus_requested": True, "attempts": 1}

        b.recovery_binding = recovery_binding
        b.recovery_matches = lambda old: old == recovery_binding()
        b.recover_target, b.observe = recover, capture
        live = c._live[binding["session_id"]]
        original = live.observations[binding["observation_id"]]
        live.observations[binding["observation_id"]] = replace(
            original, recovery_binding=recovery_binding())

        async def draw(payload):
            nonlocal focused, identity, resized
            raw = stroke_dispatch(payload, state)
            if len(b.calls) == 1:
                focused = False
                b.source = replace(b.source, source_revision=2)
                raw["postcondition"]["target_application_matches"] = False
                raw["sampled_target_changed"] = True
                if problem == "partial":
                    raw["diagnostics"]["steps_completed"] = 1
                elif problem == "missing_counts":
                    raw.pop("diagnostics")
                elif problem == "diagnostic_release":
                    raw["diagnostics"]["release"] = "unknown"
                elif problem == "unknown_release":
                    raw.update(status="unknown", released=False)
                elif problem == "identity":
                    identity = "replacement"
                elif problem == "resize":
                    resized = True
                elif problem == "unrelated_pixels":
                    state["image"] = raster((190, 60, 220, 90))
                elif problem == "next_anchor":
                    from io import BytesIO

                    from PIL import Image, ImageDraw

                    with Image.open(BytesIO(state["image"])) as image:
                        ImageDraw.Draw(image).rectangle((10, 38, 30, 58), fill="black")
                        stream = BytesIO()
                        image.save(stream, "PNG")
                        state["image"] = stream.getvalue()
            return raw

        b.hook = draw
        request = disconnected_strokes(binding)
        result = await c.act(ctx, request)
        stored = c.store.receipt(binding["session_id"], "plan", canonical_hash(request))
        first = stored["verification"]["steps"][0]
        assert first["verification"].get("target_application_matches") is not True
        if problem is None:
            assert result["status"] == "executed"
            assert result["execution"]["completed_steps"] == 5
            assert len(b.calls) == 5 and len(recoveries) == 1
            assert first["verification"]["recovered_target_binding_matches"] is True
            assert first["verification"]["path_evidence"]["continuation_supported"] is True
            assert first["verification"]["semantic_mark_verified"] is False
            assert result["verification"]["post_release_recoveries"] == 1
            compact_first = result["verification"]["steps"][0]["verification"]
            assert compact_first["target_application_matches"] is False
            assert compact_first["recovered_target_binding_matches"] is True
            assert compact_first["post_release_recovery"]["status"] == "recovered"
        else:
            assert len(b.calls) == 1
            assert result["status"] not in {"verified", "executed"}
            assert result["verification"]["steps"][1]["reason"] == "sequence_not_dispatched"
            assert len(recoveries) == (0 if problem in {"unknown_release", "new_dialog"} else 1)
        await c.act(ctx, request)
        assert len(b.calls) == (5 if problem is None else 1)


async def test_sequence_reuses_each_released_raster_once_with_fresh_scope(tmp_path, monkeypatch):
    from tests.test_computer_keyboard_grounding_r6 import fixture, raster
    from tests.test_computer_post_release_frame_reuse import enable_reuse

    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        operations = enable_reuse(b, monkeypatch)

        async def inject(payload):
            calls.append(payload)
            state["image"] = raster(255 if len(calls) == 1 else 128)
            return {"status": "executed", "injected": True, "released": True}

        monkeypatch.setattr(b, "_input_worker", inject)
        request = {**action, "action_id": "plan", "operation": "sequence", "steps": [
            {"action_id": "first", "operation": "key", "key": "Right",
             "expect": {"type": "visual_change"}},
            {"action_id": "second", "operation": "key", "key": "Left",
             "expect": {"type": "visual_change"}},
        ]}
        request.pop("expect")
        result = await c.act(ctx, request)
        assert result["status"] == "verified"
        assert len(calls) == 2
        assert operations == ["capture", "capture", "scope", "capture", "scope"]
        assert b._post_release_frame is None
        assert result["next_observation"]["image_bytes"] == state["image"]
        assert action["session_id"] not in c._delivered_observations
        await c.act(ctx, request)
        assert len(calls) == 2
