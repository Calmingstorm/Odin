"""Hermetic recovery class checks. No native connection or desktop operations."""

import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import replace

import pytest

from src.computer.controller import ComputerController
from src.computer.error_guidance import failure_guidance, input_outcome
from src.computer.models import BackendCapabilities, CaptureScope, ComputerError, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub


class RecoveryBackend(Stub):
    capabilities = BackendCapabilities(
        "x11", "existing_session", "shared", "shared", "verified", "verified"
    )
    input_supported = True
    creates_devices = False

    def __init__(self):
        super().__init__()
        self.focused = True
        self.identity = "exact-private-window-process-incarnation"
        self.recoveries = self.captures = 0
        self.actions = []
        self.recovery_status = "recovered"
        self.pause_recovery = None
        self.recovery_entered = asyncio.Event()
        self.changed_pixels = False
        self.resized = False

    async def observe(self):
        self.captures += 1
        raw = await super().observe()
        raw = replace(raw, focused=self.focused)
        if not self.focused:
            raw = replace(raw, scope=CaptureScope(1, frozenset({"opaque"})))
        if self.changed_pixels:
            from io import BytesIO

            from PIL import Image
            stream = BytesIO()
            Image.new("RGB", (2, 2), "white").save(stream, format="PNG")
            raw = replace(raw, image_bytes=stream.getvalue())
        return raw

    def recovery_binding(self):
        if not self.focused:
            return None
        return {"identity": self.identity, "resized": self.resized}

    def recovery_matches(self, old):
        return self.focused and old == self.recovery_binding()

    async def recover_target(self, old):
        self.recoveries += 1
        self.recovery_entered.set()
        if self.pause_recovery is not None:
            await self.pause_recovery.wait()
        if self.recovery_status == "recovered":
            self.focused = True
            self.source = replace(self.source, source_revision=self.source.source_revision + 1)
        return {"status": self.recovery_status, "focus_requested": True,
                "released": True, "attempts": 1}

    async def act(self, payload):
        self.actions.append(deepcopy(payload))
        return {"status": "executed", "injected": True, "released": True}

    async def detach(self):
        return {"stopped": True, "released": True, "applications_preserved": True,
                "input_revoked": True, "capture_revoked": True, "owned_devices": "not_created"}


@asynccontextmanager
async def setup(tmp_path):
    backend = RecoveryBackend()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    try:
        session = await controller.session(context, {"operation": "start"})
        view = await controller.observe(context, {
            "session_id": session["session_id"], "generation": 1,
        })
        obs = controller._live[session["session_id"]].observations[view["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        action = {"session_id": session["session_id"], "generation": 1,
                  "source_id": "opaque", "source_revision": 1, "consent_generation": 1,
                  "observation_id": obs.observation_id, "action_id": "recover-action",
                  "operation": "click", "x": 1, "y": 1,
                  "expect": {"type": "visual_change"}}
        yield controller, backend, context, action
    finally:
        await controller.close()
        store.close()


async def test_exact_return_with_new_snapshot_epoch_dispatches_once(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        backend.source = replace(backend.source, source_revision=2)
        result = await controller.act(ctx, action)
        assert len(backend.actions) == 1
        assert backend.actions[0]["source_revision"] == 3
        assert backend.recoveries == 1
        assert result["verification"]["recovery"]["status"] == "recovered"
        assert {"capture", "recovery", "backend_dispatch_release_verify", "total"} <= (
            result["verification"]["phase_timings_ms"].keys()
        )
        assert "recovery_binding" not in result["next_observation"]
        replay = await controller.act(ctx, action)
        assert "next_observation" not in replay
        assert len(backend.actions) == backend.recoveries == 1


async def test_focus_excursion_recovers_then_dispatches_undispatched_preparation(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        backend.focused = False
        result = await controller.act(ctx, action)
        assert len(backend.actions) == backend.recoveries == 1
        assert result["execution"]["released"] is True


@pytest.mark.parametrize("change", ["identity", "mapping", "resize", "pixels", "user_active"])
async def test_changed_target_or_active_human_returns_view_without_dispatch(tmp_path, change):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        backend.source = replace(backend.source, source_revision=2)
        if change == "identity":
            backend.identity = "other-process-or-window"
        elif change == "mapping":
            backend.source = replace(backend.source, input_region_id="replacement")
        elif change == "resize":
            # Window size changes inside an unchanged monitor-sized raster.
            backend.resized = True
        elif change == "pixels":
            backend.changed_pixels = True
        else:
            backend.recovery_status = "user_active"
            backend.focused = False
        result = await controller.act(ctx, action)
        assert not backend.actions
        assert result["next_observation"]["observation_id"] != action["observation_id"]
        assert input_outcome(result) == "not_dispatched"
        assert result["verification"]["next_action"] == "inspect_returned_view_and_replan"
        assert controller.store.get_session(action["session_id"]).state == "active"


async def test_stop_cancels_quiet_recovery_and_no_later_dispatch(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        backend.focused = False
        backend.pause_recovery = asyncio.Event()
        task = asyncio.create_task(controller.act(ctx, action))
        await asyncio.wait_for(backend.recovery_entered.wait(), 1)
        await asyncio.wait_for(controller._stop(action["session_id"], "cancelled"), 1)
        with pytest.raises((asyncio.CancelledError, ComputerError)):
            await task
        assert not backend.actions
        assert controller.store.get_session(action["session_id"]).state == "cancelled"


async def test_pending_input_prevents_recovery(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        grant = controller.store.get_session(action["session_id"])
        controller.store.begin_action(grant, "unknown-input", "digest", 200)
        backend.focused = False
        with pytest.raises(ComputerError, match="input_outcome_unknown"):
            await controller.act(ctx, action)
        assert not backend.actions and backend.recoveries == 0


async def test_unavailable_native_recovery_still_delivers_refusal_view(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        backend.recover_target = None
        backend.focused = False
        result = await controller.act(ctx, action)
        assert not backend.actions
        assert result["reason"] == "x11_recovery_view_required"
        assert result["next_observation"]["focused"] is False
        assert result["verification"]["recovery"]["status"] == "unavailable"


async def test_identical_epoch_cannot_hide_changed_native_incarnation(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        backend.identity = "replacement-with-same-raster-revision"
        result = await controller.act(ctx, action)
        assert not backend.actions
        assert result["reason"] == "x11_recovery_view_required"


async def test_failed_recovery_does_not_invent_activation_non_dispatch(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        async def failed(_):
            raise RuntimeError("worker failed after possible WM request")
        backend.recover_target = failed
        backend.focused = False
        result = await controller.act(ctx, action)
        assert not backend.actions
        assert result["verification"]["recovery"]["focus_requested"] is None
        assert result["execution"]["injected"] is False


def test_recovery_error_guidance_does_not_assert_unknown_release():
    result = failure_guidance({
        "reason": "user_active", "status": "unavailable",
        "execution": {"injected": False, "sent": False}, "state": "active",
    })
    assert result["terminal"] is False
    assert result["next_action"] == "inspect_returned_view_and_replan"
