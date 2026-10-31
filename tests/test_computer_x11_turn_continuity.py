"""Turn continuity uses fake adapters only, never the active workstation."""

import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
from types import SimpleNamespace

import pytest

from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration
from src.computer.models import CaptureScope, ComputerError, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_native_vision_r5 import client, serving
from tests.test_computer_x11_recovery_controller import RecoveryBackend


class TurnBackend(RecoveryBackend):
    def __init__(self):
        super().__init__()
        self.generation = 1
        self.pauses = self.resumes = 0
        self.release_ok = True

    async def pause(self):
        self.pauses += 1
        return {"paused": True, "released": self.release_ok}

    async def resume(self, *, consent_generation):
        assert consent_generation > self.generation
        self.generation = consent_generation
        self.resumes += 1
        return {"resumed": True}

    async def observe(self):
        raw = await super().observe()
        return replace(raw, source=replace(raw.source, consent_generation=self.generation),
                       scope=CaptureScope(self.generation, raw.scope.capture_sources,
                                          raw.scope.input_sources))


@asynccontextmanager
async def setup(tmp_path):
    backend = TurnBackend()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    ctx = RequestContext("owner", "channel", "turn", "host")
    try:
        session = await controller.session(ctx, {"operation": "start"})
        obs = controller._live[session["session_id"]].observations[session["observation_id"]]
        await controller.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        yield controller, backend, ctx, session
    finally:
        await controller.close()
        store.close()


async def test_turn_end_pauses_and_resume_returns_new_undelivered_binding(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        sid = session["session_id"]
        paused = await controller.finish_turn(ctx)
        assert paused["state"] == "paused"
        assert paused["generation"] == paused["consent_generation"] == 2
        assert paused["continuity"]["reason"] == "turn_end_pause"
        assert backend.pauses == 1 and not backend.actions
        assert not controller._live[sid].observations
        assert sid not in controller._delivered_observations
        assert (await controller.finish_turn(ctx))["generation"] == 2
        assert backend.pauses == 1
        later = replace(ctx, turn_id="later")
        resumed = await controller.resume_turn(later, session_id=sid)
        assert resumed["turn_resumed"] is True
        assert resumed["state"] == "active"
        assert resumed["generation"] == resumed["consent_generation"] == 3
        assert resumed["requested_action_dispatched"] is False
        assert resumed["observation_id"] != session["observation_id"]
        assert sid not in controller._delivered_observations
        assert controller.store.get_session(sid).turn_id == "later"
        assert backend.resumes == 1 and not backend.actions
        assert await controller.finish_turn(ctx) is None
        assert controller.store.get_session(sid).state == "active"
        assert await controller.resume_turn(later, session_id=sid) is None


@pytest.mark.parametrize("change", [
    {"owner_id": "other"}, {"channel_id": "other"}, {"host_id": "other"},
    {"surface": "webui"}, {},
])
async def test_auto_resume_requires_exact_owner_channel_host_surface_and_new_turn(tmp_path, change):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        await controller.finish_turn(ctx)
        other = replace(ctx, **change)
        assert await controller.resume_turn(other, session_id=session["session_id"]) is None
        assert not backend.resumes
        assert controller.store.get_session(session["session_id"]).state == "paused"


@pytest.mark.parametrize("operation", ["pause", "stop", "cancel", "close"])
async def test_explicit_controls_do_not_become_automatic_continuation(tmp_path, operation):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        await controller.finish_turn(ctx)
        await controller.session(ctx, {"operation": operation, "session_id": session["session_id"]})
        assert await controller.resume_turn(replace(ctx, turn_id="later")) is None
        assert not backend.resumes


async def test_explicit_pause_before_turn_end_stays_explicit(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        paused = await controller.session(ctx, {"operation": "pause"})
        after = await controller.finish_turn(ctx)
        assert after["generation"] == paused["generation"]
        assert "continuity" not in after
        assert await controller.resume_turn(replace(ctx, turn_id="later")) is None
        assert not backend.resumes


async def test_abnormal_turn_stop_cannot_auto_resume_or_stop_later_turn(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        stopped = await controller.finish_turn(ctx, completed=False)
        assert stopped["state"] == "cancelled"
        assert session["session_id"] not in controller._turn_pauses
        assert await controller.resume_turn(replace(ctx, turn_id="later")) is None
        assert backend.resumes == 0
    async with setup(tmp_path / "later") as (controller, backend, ctx, session):
        await controller.finish_turn(ctx)
        later = replace(ctx, turn_id="later")
        await controller.resume_turn(later)
        assert await controller.finish_turn(ctx, completed=False) is None
        assert controller.store.get_session(session["session_id"]).state == "active"


async def test_abnormal_stop_wins_race_with_inflight_finish_pause(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        entered, release = asyncio.Event(), asyncio.Event()
        original_pause = backend.pause

        async def slow_pause():
            entered.set()
            await release.wait()
            return await original_pause()

        backend.pause = slow_pause
        finishing = asyncio.create_task(controller.finish_turn(ctx))
        await entered.wait()
        stopped = await controller.finish_turn(ctx, completed=False)
        release.set()
        await finishing
        assert stopped["state"] == "cancelled"
        assert session["session_id"] not in controller._turn_pauses
        assert await controller.resume_turn(replace(ctx, turn_id="later")) is None


async def test_permission_loss_and_expiry_cannot_renew(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        await controller.finish_turn(ctx)
        later = replace(ctx, turn_id="later")
        controller.authorize = lambda _: False
        with pytest.raises(ComputerError, match="not_found"):
            await controller.resume_turn(later)
        controller.authorize = lambda _: True
        controller._live[session["session_id"]].deadline = 0
        with pytest.raises(ComputerError, match="task_expired"):
            await controller.resume_turn(later)
        assert not backend.resumes


async def test_unreleased_pause_or_pending_input_never_gets_continuation(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        backend.release_ok = False
        await controller.finish_turn(ctx)
        assert await controller.resume_turn(replace(ctx, turn_id="later")) is None
        assert session["session_id"] not in controller._turn_pauses
    async with setup(tmp_path / "pending") as (controller, backend, ctx, session):
        grant = controller.store.get_session(session["session_id"])
        controller.store.begin_action(grant, "uncertain", "hash", 2000)
        await controller.finish_turn(ctx)
        assert not backend.pauses
        assert await controller.resume_turn(replace(ctx, turn_id="later")) is None


@pytest.mark.parametrize("bad_image", [False, True])
@pytest.mark.parametrize("name,values", [
    ("computer_observe", {}),
    ("computer_session", {"operation": "start"}),
    ("computer_act", {"operation": "click", "action_id": "old-plan", "x": 1, "y": 1}),
])
async def test_visual_tool_resumes_with_pixels_without_forwarding_old_plan(
        tmp_path, monkeypatch, name, values, bad_image):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        await controller.finish_turn(ctx)
        later = replace(ctx, turn_id="later")
        bot = SimpleNamespace(
            config=SimpleNamespace(computer=SimpleNamespace(enabled=True)),
            host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
            tool_executor=SimpleNamespace(check_permission=lambda *_: None),
        )
        integration = ComputerIntegration(bot, controller=controller)
        if bad_image:
            def broken(_):
                raise ValueError("invalid image")
            monkeypatch.setattr(integration, "output_image", broken)
        monkeypatch.setattr(integration, "_context", lambda _: later)
        turn = SimpleNamespace(user_id="owner", _computer_serving=serving(client()),
                               message=SimpleNamespace(channel=SimpleNamespace(id="channel")))
        block = SimpleNamespace(id="resume", name=name, input=values)
        with integration.foreground(turn, block):
            result = await integration._tool(name, values)
            if bad_image:
                import json

                assert result.ok
                public = json.loads(result.output)
                assert public["turn_resumed"] is True
                assert public["requested_action_dispatched"] is False
                assert public["replay_permitted"] is False
                assert public["next_action"] == "observe_fresh"
                assert not backend.actions and backend.resumes == 1
                assert session["session_id"] not in controller._delivered_observations
                return
            assert "__image_block__" in result
            assert '"turn_resumed":true' in result["__prompt__"]
            assert not backend.actions and backend.resumes == 1
            assert backend.captures == 2
            assert session["session_id"] not in controller._delivered_observations
            await integration.validate_delivery(turn, block, result)
            assert session["session_id"] in controller._delivered_observations


async def test_status_does_not_resume_or_capture(tmp_path, monkeypatch):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        await controller.finish_turn(ctx)
        later = replace(ctx, turn_id="later")
        status = await controller.session(later, {"operation": "status"})
        assert status["state"] == "paused" and backend.captures == 1
        assert not backend.resumes


async def test_stop_wins_queued_resume_without_native_rearm(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        await controller.finish_turn(ctx)
        await controller._actions.acquire()
        task = asyncio.create_task(controller.resume_turn(replace(ctx, turn_id="later")))
        try:
            await asyncio.sleep(0)
            stopped = await controller.session(ctx, {"operation": "stop"})
            assert stopped["state"] == "cancelled"
        finally:
            controller._actions.release()
        with pytest.raises(ComputerError, match="grant_revoked"):
            await task
        assert backend.resumes == 0


async def test_permission_revocation_while_resume_queued_cannot_rearm(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, session):
        await controller.finish_turn(ctx)
        await controller._actions.acquire()
        task = asyncio.create_task(controller.resume_turn(replace(ctx, turn_id="later")))
        try:
            await asyncio.sleep(0)
            controller.authorize = lambda _: False
        finally:
            controller._actions.release()
        with pytest.raises(ComputerError, match="not_found"):
            await task
        assert backend.resumes == 0
        assert controller.store.get_session(session["session_id"]).state == "paused"
