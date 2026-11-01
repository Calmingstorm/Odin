"""Offline X11 raster reuse: fake native endpoints, never the user's display."""

from copy import deepcopy
from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from src.computer.models import ComputerError
from src.computer.policy import FRAME_FRESH_SECONDS
from tests.test_computer_keyboard_grounding_r6 import fixture
from tests.test_computer_r19_delivery import followup


def enable_reuse(backend, monkeypatch):
    backend._incarnation_epoch = 1
    monkeypatch.setattr(backend, "_incarnation_barrier", AsyncMock(return_value=1))
    monkeypatch.setattr(backend, "recover_target", AsyncMock(return_value={
        "status": "user_active", "focus_requested": False, "attempts": 0}))
    read = backend._read_worker
    operations = []

    async def counted(operation, **kwargs):
        operations.append(operation)
        return await read(operation, **kwargs)

    monkeypatch.setattr(backend, "_read_worker", counted)
    return operations


async def test_released_raster_reused_with_original_time_and_fresh_delivery_binding(
    tmp_path, monkeypatch
):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        operations = enable_reuse(b, monkeypatch)
        take = b.take_post_release_frame
        retained = {}

        async def take_recorded(action, crop=None):
            retained.update(deepcopy(b._post_release_frame))
            return await take(action, crop=crop)

        monkeypatch.setattr(b, "take_post_release_frame", take_recorded)
        action.update(operation="key", key="Right")
        result = await c.act(ctx, action)
        view = result["next_observation"]
        obs = c._live[action["session_id"]].observations[view["observation_id"]]
        assert result["status"] == "verified"
        assert operations == ["capture", "capture", "scope"]
        assert obs.captured_at == retained["captured_at"]
        assert obs.frame_metadata.captured_monotonic_ns == int(retained["captured_at"] * 1e9)
        assert view["image_bytes"] == state["image"]
        assert obs.source == b._frame.source
        assert obs.recovery_binding["incarnation_epoch"] == 1
        assert view["observation_id"] != action["observation_id"]
        assert b._post_release_frame is None
        assert action["session_id"] not in c._delivered_observations
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await c.act(ctx, followup(action, view))
        replay = await c.act(ctx, action)
        assert "next_observation" not in replay
        assert len(calls) == 1
        await c.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        assert action["session_id"] in c._delivered_observations
        # One-shot: ordinary observation must never reuse the retained raster.
        await b.observe()
        assert operations[-1] == "capture"


@pytest.mark.parametrize("fault", [
    "stale", "future", "action", "crop", "consent", "topology", "incarnation",
    "source_geometry", "revision", "no_watcher", "focus", "window_geometry",
    "scope_failure", "scope_missing",
    "expires_during_proof", "incarnation_during_proof", "topology_during_proof",
])
async def test_invalid_retained_evidence_falls_back_to_fresh_capture(
    tmp_path, monkeypatch, fault
):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        operations = enable_reuse(b, monkeypatch)
        take = b.take_post_release_frame

        async def disturbed(action, crop=None):
            saved = b._post_release_frame
            assert saved is not None
            if fault == "stale":
                saved["captured_at"] -= 10
            elif fault == "future":
                saved["captured_at"] += 10
            elif fault == "action":
                saved["action"]["chord"] = "Left"
            elif fault == "crop":
                saved["crop"] = {"x": 0, "y": 0, "width": 1, "height": 1}
            elif fault == "consent":
                # A retained frame from a different consent generation.
                fields = list(saved["state"])
                fields[1] -= 1
                saved["state"] = tuple(fields)
            elif fault == "topology":
                b._topology_epoch += 1
            elif fault == "incarnation":
                b._incarnation_epoch += 1
            elif fault == "source_geometry":
                b._sources[b._selected]["width"] += 1
            elif fault == "revision":
                b._revision += 1
            elif fault == "no_watcher":
                b._incarnation_epoch = None
                monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=None))
            elif fault == "focus":
                state["binding"]["focused"] = False
            elif fault == "window_geometry":
                state["binding"]["rect"][0] += 1
            elif fault in {"scope_failure", "scope_missing"}:
                read = b._read_worker

                async def bad_scope(operation, **kwargs):
                    if operation == "scope":
                        if fault == "scope_failure":
                            raise ComputerError("scope_unavailable")
                        return {}
                    return await read(operation, **kwargs)

                monkeypatch.setattr(b, "_read_worker", bad_scope)
            elif fault in {
                "expires_during_proof", "incarnation_during_proof", "topology_during_proof"
            }:
                read = b._read_worker

                async def changed_during_proof(operation, **kwargs):
                    proof = await read(operation, **kwargs)
                    if operation == "scope":
                        if fault == "expires_during_proof":
                            saved["captured_at"] -= 10
                        elif fault == "incarnation_during_proof":
                            b._incarnation_epoch += 1
                        else:
                            b._topology_epoch += 1
                    return proof

                monkeypatch.setattr(b, "_read_worker", changed_during_proof)
            return await take(action, crop=crop)

        monkeypatch.setattr(b, "take_post_release_frame", disturbed)
        action.update(operation="key", key="Right")
        result = await c.act(ctx, action)
        assert result["execution"]["released"] is True
        if fault == "topology_during_proof":
            # The in-flight request cannot claim the new topology as its own.
            assert "next_observation" not in result
            assert b._post_release_frame is None
            assert len(calls) == 1
            return
        assert result["next_observation"]["image_bytes"]
        assert operations.count("capture") == (4 if fault == "focus" else 3)
        assert b._post_release_frame is None
        assert len(calls) == 1
        if fault == "focus":
            assert result["next_observation"]["focused"] is False
            assert result["status"] == "executed"
            assert result["verification"]["reason"] == "user_active"


@pytest.mark.parametrize("fault", ["stale", "future"])
async def test_controller_never_refreshes_backend_timestamp(tmp_path, monkeypatch, fault):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        read = b.observe
        timestamp = c.monotonic() + (10 if fault == "future" else -FRAME_FRESH_SECONDS - 1)

        async def bad_time(**kwargs):
            return replace(await read(**kwargs), captured_at=timestamp)

        monkeypatch.setattr(b, "observe", bad_time)
        with pytest.raises(ComputerError, match="stale_observation"):
            await c.observe(ctx, {"session_id": action["session_id"], "generation": 1})


async def test_no_release_means_no_post_release_capture_or_delivery(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        operations = enable_reuse(b, monkeypatch)

        async def unknown_release(request):
            calls.append(request)
            return {"status": "unknown", "injected": True, "released": False}

        monkeypatch.setattr(b, "_input_worker", unknown_release)
        action.update(operation="key", key="Right")
        result = await c.act(ctx, action)
        assert result["execution"]["released"] is False
        assert "next_observation" not in result
        assert operations == ["capture"]
        assert b._post_release_frame is None


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1, True, "0"])
async def test_backend_timestamp_type_is_bounded(tmp_path, monkeypatch, value):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        with pytest.raises(ComputerError, match="invalid_capture_timestamp"):
            replace(b._frame, captured_at=value)


@pytest.mark.parametrize("fault", ["pause", "close", "generation", "topology_error"])
async def test_lifecycle_revocation_during_scope_proof_never_delivers_cache(
    tmp_path, monkeypatch, fault
):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        enable_reuse(b, monkeypatch)
        take = b.take_post_release_frame
        take_failure = []

        async def revoked(action, crop=None):
            read = b._read_worker

            async def revoke_scope(operation, **kwargs):
                proof = await read(operation, **kwargs)
                if operation == "scope":
                    if fault == "pause":
                        b._paused = True
                    elif fault == "close":
                        b._closed = True
                    elif fault == "generation":
                        b._generation += 1
                    else:
                        b._topology_error = "topology_changed"
                return proof

            monkeypatch.setattr(b, "_read_worker", revoke_scope)
            try:
                return await take(action, crop=crop)
            except Exception as exc:
                take_failure.append(str(exc))
                raise

        monkeypatch.setattr(b, "take_post_release_frame", revoked)
        action.update(operation="key", key="Right")
        result = await c.act(ctx, action)
        assert take_failure
        assert "next_observation" not in result
        assert result["execution"]["released"] is True
        assert b._post_release_frame is None
        assert len(calls) == 1


async def test_changed_dialog_publishes_fresh_modal_binding_without_hidden_refocus(
    tmp_path, monkeypatch
):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        b = c._live[action["session_id"]].backend
        operations = enable_reuse(b, monkeypatch)
        inject = b._input_worker

        async def opens_dialog(request):
            receipt = await inject(request)
            state["binding"]["modal"] = True
            state["binding"]["modal_kind"] = "safe_application"
            return receipt

        monkeypatch.setattr(b, "_input_worker", opens_dialog)
        action.update(operation="key", key="Right")
        result = await c.act(ctx, action)
        assert operations == ["capture", "capture", "scope"]
        assert result["next_observation"]["modal"]
        assert result["verification"]["reason"] == "unexpected_dialog_transition"
        b.recover_target.assert_not_awaited()
