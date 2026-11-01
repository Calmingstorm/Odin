"""Hermetic coverage for the seamless campaign's guard and refusal branches.

No display, native connection or live input: fake backends and stand-ins only.
"""

import asyncio
import hashlib
import json
from dataclasses import dataclass, replace
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image

from src.computer.controller import ComputerController, _YieldSkipped
from src.computer.grounding import accept_own_ink
from src.computer.models import ComputerError, RequestContext
from tests.test_computer_seamless_fixes import REFUSED
from tests.test_computer_x11_recovery_controller import setup


def png(color, size=(8, 8)):
    stream = BytesIO()
    Image.new("RGB", size, color).save(stream, format="PNG")
    return stream.getvalue()


def test_accept_own_ink_refuses_mismatched_or_unreadable_checkpoints():
    white = png("white")
    with pytest.raises(ComputerError, match="visual_target_unavailable"):
        accept_own_ink(white, white, png("white", (9, 8)), [[1, 1], [5, 5]], 2)
    with pytest.raises(ComputerError, match="visual_target_unavailable"):
        accept_own_ink(white, white, b"not an image", [[1, 1], [5, 5]], 2)


async def test_operator_authority_check_only_from_the_bound_operator_task():
    from src.web.computer_binding import operator_authority_check, operator_scope

    def current():
        return True

    sid = "browser-session"
    channel = "web:" + hashlib.sha256(sid.encode("utf-8")).hexdigest()
    operator = RequestContext("alice", channel, "web-operator", "localhost", surface="webui")
    assert operator_authority_check(operator) is None
    with operator_scope(("alice", sid, current, None)):
        assert operator_authority_check(operator) is current
        assert operator_authority_check(replace(operator, owner_id="mallory")) is None


# --- human-input yield readiness: each gate, no dispatch -------------------------------


def yield_rig(monkeypatch, *, before=b"before", fresh_sha=None, focused=True):
    monkeypatch.setattr("src.computer.controller.HUMAN_YIELD_SECONDS", 0.0)
    controller = ComputerController.__new__(ComputerController)
    fresh = SimpleNamespace(
        geometry="geometry", focused=focused, modal=None,
        source=SimpleNamespace(source_revision=4),
        image_sha256=fresh_sha or hashlib.sha256(before).hexdigest(),
    )

    async def capture(grant, crop=None):
        return fresh, b"fresh-image"

    async def auth(context):
        return None

    controller._capture = capture
    controller._auth = auth
    controller._active = lambda grant: None
    controller.monotonic = lambda: 0.0
    controller.store = SimpleNamespace(read_evidence=lambda context, evidence_id: (before, {}))
    live = SimpleNamespace(deadline=1000.0,
                           backend=SimpleNamespace(recovery_matches=lambda binding: True))
    current = SimpleNamespace(frame_metadata=None, geometry="geometry", modal=None,
                              recovery_binding={"identity": 1})
    grant = SimpleNamespace(platform="x11", environment="existing_session")
    original = SimpleNamespace(evidence_id="evidence")
    return controller, live, current, grant, original


async def ready(controller, live, current, grant, original, operation="key", **kwargs):
    return await controller._human_yield_ready(
        None, grant, live, original, current, {"operation": operation},
        {"source_revision": 4}, kwargs.pop("raw", REFUSED), **kwargs,
    )


async def test_non_candidates_are_not_yield_decisions(monkeypatch):
    controller, live, current, grant, original = yield_rig(monkeypatch)
    wayland = SimpleNamespace(platform="wayland", environment="existing_session")
    assert await ready(controller, live, current, wayland, original,
                       attached_keyboard=True) is False
    sent = {**REFUSED, "injected": True}
    assert await ready(controller, live, current, grant, original, raw=sent,
                       attached_keyboard=True) is False


async def test_no_budget_for_a_yield_keeps_the_refusal(monkeypatch):
    controller, live, current, grant, original = yield_rig(monkeypatch)
    result = await ready(controller, live, current, grant, original,
                         attached_keyboard=True, budget=lambda: 0.0)
    assert isinstance(result, _YieldSkipped) and not result and result.reason == "budget"


async def test_trusted_keyboard_focus_skips_only_the_raster_gate(monkeypatch):
    controller, live, current, grant, original = yield_rig(monkeypatch, fresh_sha="0" * 64)
    assert await ready(controller, live, current, grant, original,
                       attached_keyboard=True) == b"fresh-image"


async def test_untrusted_keyboard_needs_the_unchanged_view(monkeypatch):
    controller, live, current, grant, original = yield_rig(monkeypatch, fresh_sha="0" * 64)
    skipped = await ready(controller, live, current, grant, original, attached_keyboard=False)
    assert not skipped and skipped.reason == "keyboard_target_unproven"
    controller, live, current, grant, original = yield_rig(monkeypatch)
    assert await ready(controller, live, current, grant, original,
                       attached_keyboard=False) == b"fresh-image"


async def test_lost_focus_during_the_yield_keeps_the_refusal(monkeypatch):
    controller, live, current, grant, original = yield_rig(monkeypatch, focused=False)
    skipped = await ready(controller, live, current, grant, original, attached_keyboard=True)
    assert not skipped and skipped.reason == "focus"


# --- exact X11 recovery: refusals and evidence -----------------------------------------


@dataclass(frozen=True)
class Crop:
    x: int
    y: int
    width: int
    height: int


def recovery_inputs(controller, action):
    grant = controller.store.get_session(action["session_id"])
    original = controller._live[action["session_id"]].observations[action["observation_id"]]
    return grant, original


async def test_recovery_needs_an_enduring_binding(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        grant, original = recovery_inputs(controller, action)
        with pytest.raises(ComputerError, match="x11_recovery_unavailable"):
            await controller._prepare_x11_recovery(
                ctx, grant, replace(original, recovery_binding=None))
        assert backend.recoveries == 0


async def test_input_pending_after_recovery_is_never_overridden(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        grant, original = recovery_inputs(controller, action)

        async def recover(old):
            controller.store.begin_action(grant, "concurrent-input", "digest", 200)
            return {"status": "recovered", "focus_requested": True, "attempts": 1}

        backend.recover_target = recover
        with pytest.raises(ComputerError, match="input_outcome_unknown"):
            await controller._prepare_x11_recovery(ctx, grant, original)
        assert not backend.actions


async def test_recovery_redelivers_the_whole_source_when_the_crop_no_longer_fits(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        grant, original = recovery_inputs(controller, action)
        cropped = replace(original, frame_metadata=SimpleNamespace(crop=Crop(0, 0, 1, 1)))
        capture, crops = controller._capture, []

        async def fallible(grant, crop=None, **kwargs):
            crops.append(crop)
            if crop is not None:
                raise ComputerError("invalid_source_crop")
            return await capture(grant, crop=crop, **kwargs)

        controller._capture = fallible
        current, image, rebound, info = await controller._prepare_x11_recovery(
            ctx, grant, cropped)
        assert crops == [{"x": 0, "y": 0, "width": 1, "height": 1}, None]
        assert image and info["status"] == "recovered" and rebound is not None


async def test_other_capture_failures_after_recovery_propagate(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        grant, original = recovery_inputs(controller, action)
        cropped = replace(original, frame_metadata=SimpleNamespace(crop=Crop(0, 0, 1, 1)))

        async def revoked(grant, crop=None, **kwargs):
            raise ComputerError("grant_revoked")

        controller._capture = revoked
        with pytest.raises(ComputerError, match="grant_revoked"):
            await controller._prepare_x11_recovery(ctx, grant, cropped)


async def test_recovery_receipt_keeps_only_bounded_native_timings(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        recover = backend.recover_target

        async def timed(old):
            info = await recover(old)
            return {**info, "phase_timings_ms": {
                "quiet_ms": 1000.0004, "activation_ms": 9, "proof_ms": 23.5,
                "total_ms": 99_999, "private": 1}}

        backend.recover_target = timed
        backend.focused = False
        result = await controller.act(ctx, action)
        assert result["verification"]["recovery"]["phase_timings_ms"] == {
            "quiet_ms": 1000.0, "activation_ms": 9, "proof_ms": 23.5}


async def test_post_release_dialog_close_by_its_own_app_is_the_effect(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        grant, original = recovery_inputs(controller, action)
        dialog = replace(original, modal="dialog-token", recovery_binding={
            "scope": {"process": "krita", "window": "dialog"}})
        after = replace(original, modal=None, focused=True, recovery_binding={
            "scope": {"process": "krita", "window": "main"}})
        assert await controller._post_release_x11_recovery(
            ctx, grant, dialog, after, execution={"released": True, "injected": True}) is None
        assert backend.recoveries == 0


# --- turn-end resume, watchdog and operator boundaries ----------------------------------


async def test_resume_refuses_unknown_input_and_expired_tasks(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        sid = action["session_id"]
        grant = controller.store.set_state(sid, "paused")
        resume = {"operation": "resume", "session_id": sid, "generation": grant.generation}
        with controller.store.lock:
            controller.store.db.execute(
                "INSERT INTO receipts VALUES (?,?,?,?,?)",
                (sid, "unknown-input", "p" * 64, "pending", json.dumps({})),
            )
            controller.store.db.commit()
        with pytest.raises(ComputerError, match="input_outcome_unknown"):
            await controller.session(ctx, resume)
        controller.store.db.execute("DELETE FROM receipts WHERE action_id='unknown-input'")
        controller.store.db.commit()
        controller._live[sid].deadline = controller.monotonic() - 1
        with pytest.raises(ComputerError, match="task_expired"):
            await controller.session(ctx, resume)


async def test_watchdog_without_a_live_session_returns_at_once(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        await asyncio.wait_for(controller._deadline("no-such-session", 3600), 1)


async def test_operator_boundaries_refuse_before_any_cleanup(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        grant = controller.store.get_session(action["session_id"])
        web = replace(ctx, surface="webui")
        with pytest.raises(ComputerError, match="not_found"):
            controller._operator_grant(web, session_id="another-session")
        with pytest.raises(ComputerError, match="operator_surface_required"):
            await controller._operator_reconcile_live(web, grant)
        operator = replace(web, turn_id="web-operator")
        with pytest.raises(ComputerError, match="stale_generation"):
            await controller._operator_reconcile_live(
                operator, replace(grant, generation=grant.generation + 1))
        assert controller.store.get_session(action["session_id"]).state == "active"


# --- sequences: pre-dispatch recovery and retry-setup failure ---------------------------


def sequence(action, *steps):
    return {key: action[key] for key in (
        "session_id", "generation", "source_id", "source_revision", "consent_generation",
        "observation_id")} | {"action_id": "batch", "operation": "sequence", "steps": list(steps)}


def step(action_id, x):
    return {"action_id": action_id, "operation": "click", "x": x, "y": 1,
            "expect": {"type": "visual_change"}}


async def test_sequence_recovers_its_first_step_target_before_any_dispatch(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        controller._delivered_observations[action["session_id"]] = action["observation_id"]
        backend.identity = "recovered-later"

        def matches(old):
            return backend.focused and backend.recoveries > 0

        backend.recovery_matches = matches
        result = await controller.act(ctx, sequence(action, step("one", 1)))
        assert result["verification"]["pre_dispatch_recoveries"] == 1
        assert backend.recoveries == 1 and len(backend.actions) == 1


async def test_sequence_first_step_human_activity_keeps_the_refusal(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        backend.recovery_matches = lambda old: False
        backend.recovery_status = "user_active"
        result = await controller.act(ctx, sequence(action, step("one", 1)))
        assert result["verification"]["pre_dispatch_recoveries"] == 1
        assert result["verification"]["steps"][0]["reason"] == "sequence_not_dispatched"
        assert not backend.actions


async def test_sequence_retry_auth_failure_keeps_the_first_release(tmp_path, monkeypatch):
    from tests.test_computer_seamless_fixes import enduring, preflight_refusal
    from tests.test_computer_sequences_r19 import click, plan
    from tests.test_computer_sequences_r19 import rig as act_rig

    monkeypatch.setattr("src.computer.controller.HUMAN_YIELD_SECONDS", 0.0)
    async with act_rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        enduring(b, [1])

        async def perform(payload):
            return preflight_refusal(payload)

        b.hook = perform
        auth = c._auth

        async def revoked_after_dispatch(context, **kwargs):
            if b.calls:
                raise ComputerError("not_found")
            return await auth(context, **kwargs)

        monkeypatch.setattr(c, "_auth", revoked_after_dispatch)
        result = await c.act(ctx, plan(binding, click("click")))
        # The revoked yield settles the first attempt; no second dispatch.
        assert result["verification"]["settled_steps"] == 1
        assert len(b.calls) == 1
        receipt = c.store.db.execute(
            "SELECT result FROM receipts WHERE action_id='click'").fetchone()
        assert json.loads(receipt[0])["execution"]["released"] is True


def test_backend_plan_limits_reject_the_whole_sequence():
    from src.computer.sequences import _preflight_backend

    visual = {"type": "visual_change"}
    with pytest.raises(ComputerError, match="sequence_backend_limit"):
        _preflight_backend(SimpleNamespace(platform="wayland"), [{"expect": {"type": "other"}}])
    with pytest.raises(ComputerError, match="invalid_text"):
        _preflight_backend(SimpleNamespace(platform="x11"),
                           [{"expect": visual, "text": "a\x85b"}])


async def test_sequence_replay_returns_its_compact_receipt_without_input(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        plan = sequence(action, step("one", 1))
        first = await controller.act(ctx, plan)
        replay = await controller.act(ctx, plan)
        assert len(backend.actions) == 1
        assert replay["status"] == first["status"] and "next_observation" not in replay


async def test_pixel_field_needs_its_own_single_action(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        field = {"action_id": "field", "operation": "replace_field_pixels", "text": "1401",
                 "region": {"x": 0, "y": 0, "width": 1, "height": 1},
                 "expect": {"type": "visual_change"}}
        with pytest.raises(ComputerError, match="pixel_field_requires_single_action"):
            await controller.act(ctx, sequence(action, field))
        assert not backend.actions


async def test_reconcile_after_local_close_without_a_fence_refuses(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        sid = action["session_id"]
        await controller._stop(sid, "closed")
        assert sid not in controller._live
        grant = controller.store.get_session(sid)
        # A closed task resolves only a pending local-release fence; none exists.
        with pytest.raises(ComputerError, match="recovery_unavailable"):
            await controller.reconcile_recovery(
                replace(ctx, surface="webui"), sid, grant.generation)
        assert controller.store.get_session(sid).state == "closed"


async def test_reconcile_refuses_a_cancelled_session(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        sid = action["session_id"]
        await controller._stop(sid, "cancelled")
        grant = controller.store.get_session(sid)
        web = replace(ctx, surface="webui")
        with pytest.raises(ComputerError, match="not_found"):
            await controller.reconcile_recovery(
                replace(web, host_id="another-host"), sid, grant.generation)
        with pytest.raises(ComputerError, match="stale_generation"):
            await controller.reconcile_recovery(web, sid, grant.generation + 1)
        with pytest.raises(ComputerError, match="recovery_unavailable"):
            await controller.reconcile_recovery(web, sid, grant.generation)


async def test_recovery_refusal_receipt_is_idempotent(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, action):
        grant, original = recovery_inputs(controller, action)
        live = controller._live[action["session_id"]]
        image, _ = controller.store.read_evidence(ctx, original.evidence_id)
        info = {"status": "unavailable", "focus_requested": False, "attempts": 0}
        args = (ctx, grant, live, {"action_id": "refused-once"}, "h" * 64, original, image, info)
        first = controller._x11_recovery_refusal(*args)
        assert first["reason"] == "x11_recovery_view_required" and first["next_observation"]
        again = controller._x11_recovery_refusal(*args)
        assert again == {k: v for k, v in first.items() if k != "next_observation"}
