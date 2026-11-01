"""Known-release recovery never repeats attempted input or invents its effect."""

from copy import deepcopy
from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_post_release_frame_reuse import enable_reuse
from tests.test_computer_x11_attached_worker_r10_extra import request

pytest_plugins = ["tests.test_computer_x11_attached_worker_r10_extra"]


@pytest.mark.parametrize("foreign", [False, True])
@pytest.mark.parametrize("outcome", ["recovered", "user_active", "target_changed"])
async def test_known_release_recovers_only_exact_target_without_input_replay(
    tmp_path, monkeypatch, foreign, outcome
):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        enable_reuse(b, monkeypatch)
        state["binding"]["window_rect"] = list(state["binding"]["rect"])
        original_scope = deepcopy(state["binding"])
        # Refresh the delivered original after enabling native incarnation proof.
        observed = await c.observe(ctx, {"session_id": action["session_id"], "generation": 1})
        original = c._live[action["session_id"]].observations[observed["observation_id"]]
        await c.validate_observation_delivery(ctx, original.frame_metadata, original.image_sha256)
        action.update(observation_id=original.observation_id,
                      source_revision=original.source.source_revision)

        async def inject(request):
            calls.append(request)
            if foreign:
                state["binding"]["window"] = 91
                state["binding"]["focus_window"] = 91
            else:
                state["binding"] = None
            return {"status": "executed", "injected": True, "released": True}

        async def recover(binding):
            assert binding["scope"] == original_scope
            if outcome == "recovered":
                state["binding"] = original_scope
            return {"status": outcome, "focus_requested": outcome == "recovered", "attempts": 1}

        monkeypatch.setattr(b, "_input_worker", inject)
        recovering = AsyncMock(side_effect=recover)
        monkeypatch.setattr(b, "recover_target", recovering)
        action.update(operation="key", key="Right")
        result = await c.act(ctx, action)
        assert len(calls) == 1
        assert recovering.await_count == 1
        assert result["execution"]["injected"] is True
        assert result["execution"]["released"] is True
        assert result["status"] == "executed"
        verify = result["verification"]
        assert verify["status"] == "unavailable"
        assert verify.get("target_application_matches") is not True
        assert verify["recovered_target_matches"] is (outcome == "recovered")
        assert verify["post_release_recovery"]["status"] == outcome
        assert verify["reason"] != "unexpected_dialog_transition"
        view = result["next_observation"]
        assert view["observation_id"] != action["observation_id"]
        assert action["session_id"] not in c._delivered_observations
        replay = await c.act(ctx, action)
        assert "next_observation" not in replay
        assert len(calls) == 1 and recovering.await_count == 1


async def test_interrupted_known_release_keeps_interrupted_after_recovery(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        enable_reuse(b, monkeypatch)
        state["binding"]["window_rect"] = list(state["binding"]["rect"])
        scope = deepcopy(state["binding"])
        observed = await c.observe(ctx, {"session_id": action["session_id"], "generation": 1})
        original = c._live[action["session_id"]].observations[observed["observation_id"]]
        await c.validate_observation_delivery(ctx, original.frame_metadata, original.image_sha256)
        action.update(observation_id=original.observation_id,
                      source_revision=original.source.source_revision)
        # exercise the normalized receipt's interruption status independently
        # of which backend-specific interruption reason produced it.
        from src.computer import controller as module
        effect = module.effect_receipt

        def interrupted(*args, **kwargs):
            result = effect(*args, **kwargs)
            result["status"] = "interrupted"
            result["verification"]["target_application_matches"] = False
            return result

        monkeypatch.setattr(module, "effect_receipt", interrupted)

        async def inject(request):
            calls.append(request)
            state["binding"] = None
            return {"status": "executed", "injected": True, "released": True}

        async def recover(binding):
            state["binding"] = scope
            return {"status": "recovered", "focus_requested": True, "attempts": 1}

        monkeypatch.setattr(b, "_input_worker", inject)
        monkeypatch.setattr(b, "recover_target", AsyncMock(side_effect=recover))
        action.update(operation="key", key="Right")
        result = await c.act(ctx, action)
        assert result["status"] == "interrupted"
        assert result["execution"]["injected"] is True
        assert result["execution"]["released"] is True
        assert result["verification"]["target_application_matches"] is False
        assert result["verification"]["recovered_target_matches"] is True
        assert len(calls) == 1


@pytest.mark.parametrize("fault", ["unknown_release", "unknown_injection", "modal", "resize",
                                  "geometry_only", "same_target", "other_pending"])
async def test_post_release_recovery_refuses_unsafe_or_unneeded_cases(tmp_path, monkeypatch, fault):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        live = c._live[action["session_id"]]
        b = live.backend
        enable_reuse(b, monkeypatch)
        before, _ = await c._capture(c.store.get_session(action["session_id"]))
        after = replace(before, focused=False)
        execution = {"released": True, "injected": True}
        if fault == "unknown_release":
            execution["released"] = False
        elif fault == "unknown_injection":
            execution["injected"] = None
        elif fault == "modal":
            after = replace(after, modal="safe-dialog", modal_kind="safe_application")
        elif fault == "resize":
            after = replace(after, source=replace(
                after.source, pixel_width=after.source.pixel_width + 1))
        elif fault == "same_target":
            after = before
        elif fault == "geometry_only":
            after = replace(before, source=replace(before.source, source_revision=123))
        else:
            c.store.begin_action(c.store.get_session(action["session_id"]), "other", "digest", 2000)
        if fault == "other_pending":
            with pytest.raises(ComputerError, match="input_outcome_unknown"):
                await c._post_release_x11_recovery(ctx, c.store.get_session(action["session_id"]),
                    before, after, execution=execution)
        else:
            assert await c._post_release_x11_recovery(
                ctx, c.store.get_session(action["session_id"]),
                before, after, execution=execution) is None
        b.recover_target.assert_not_awaited()


def test_scope_worker_proves_focused_binding_without_reading_pixels(native):
    from src.computer.runtime import x11_attached_worker as worker

    selected = worker.run(request())["sources"][0]
    reply = worker.run(request("scope", selected=selected, input_enabled=True))
    assert reply["ok"] and reply["input_scope"]["focused"]
    assert "image" not in reply and native.images == 0
    assert native.closed == 2


def test_scope_worker_never_accepts_ungranted_source(native):
    from src.computer.runtime import x11_attached_worker as worker

    with pytest.raises(ValueError, match="renewed consent"):
        worker.run(request("scope", selected={}, input_enabled=True))
    assert native.images == 0
