"""Finite plans through real controller/store boundaries, without desktop input."""

import asyncio
import copy
import json
from contextlib import asynccontextmanager
from dataclasses import replace
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from PIL import Image, ImageDraw

from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration
from src.computer.models import BackendCapabilities, ComputerError, RequestContext
from src.computer.render import compact_sequence_receipt
from src.computer.store import ComputerStore, canonical_hash
from tests.test_computer_actions_r4 import Backend
from tests.test_computer_gui_actions_r5 import changed


def raster(rect=None):
    image = Image.new("RGB", (240, 160), "white")
    if rect:
        ImageDraw.Draw(image).rectangle(rect, fill="black")
    stream = BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()


@asynccontextmanager
async def rig(tmp_path, monkeypatch, *, platform="x11", environment="existing_session"):
    monkeypatch.setattr(
        "tests.test_computer_contract_r1.Stub.capabilities",
        BackendCapabilities(platform, environment, "shared", "shared", "verified", "verified"),
    )
    backend = Backend()
    backend.input_supported = True
    backend.pause = AsyncMock(return_value={"released": True})
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    try:
        start = {"operation": "start"}
        if environment == "isolated":
            start["app"] = "fixture"
        grant = await controller.session(context, start)
        action = {
            "session_id": grant["session_id"],
            "generation": 1,
            "consent_generation": 1,
            "source_id": "opaque",
            "source_revision": 1,
        }
        observe = backend.observe
        state = {"image": raster(), "modal": None, "modal_kind": None}
        backend.source = replace(
            backend.source, pixel_width=240, pixel_height=160, input_width=240, input_height=160
        )

        async def capture(**kwargs):
            return replace(
                await observe(),
                width=240,
                height=160,
                image_bytes=state["image"],
                modal=state["modal"],
                modal_kind=state["modal_kind"],
            )

        backend.observe = capture
        observed = await controller.observe(
            context, {"session_id": action["session_id"], "generation": 1}
        )
        obs = controller._live[action["session_id"]].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        binding = {
            key: action[key]
            for key in (
                "session_id",
                "generation",
                "consent_generation",
                "source_id",
                "source_revision",
            )
        }
        binding["observation_id"] = obs.observation_id
        yield controller, backend, context, binding, state
    finally:
        await controller.close()
        store.close()


def click(action_id, x=30, y=30, expectation="visual_change"):
    return {
        "action_id": action_id,
        "operation": "click",
        "x": x,
        "y": y,
        "expect": {"type": expectation},
    }


def plan(binding, *steps):
    return {**binding, "action_id": "plan", "operation": "sequence", "steps": list(steps)}


@pytest.mark.parametrize("extra_step", [False, True])
async def test_final_dialog_or_blind_continuation(tmp_path, monkeypatch, extra_step):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def open_dialog(payload):
            state.update(modal="new-dialog", modal_kind="safe_application")
            b.source = replace(b.source, source_revision=2)
            result = changed(payload)
            result["sampled_target_changed"] = True
            result["postcondition"]["transition"] = {
                "method": "native_complete_map_inventory_transition",
                "appeared": True,
                "kind": "dialog",
            }
            return result

        b.hook = open_dialog
        steps = [click("open", expectation="dialog_appeared")]
        if extra_step:
            steps.append(click("inside"))
        request = plan(binding, *steps)
        result = await c.act(ctx, request)
        assert result["execution"]["completed_steps"] == 1 and len(b.calls) == 1
        assert binding["session_id"] not in c._delivered_observations
        if extra_step:
            assert result["reason"] == "sequence_sampled_target_changed"
            assert "next_observation" not in result
            assert c.store.get_session(binding["session_id"]).state == "paused"
            assert result["verification"]["steps"][1]["status"] == "unavailable"
        else:
            assert result["status"] == "verified"
            frame = result["next_observation"]
            assert frame["modal"] == "new-dialog" and frame["image_bytes"]
            assert c.store.get_session(binding["session_id"]).state == "active"
            followup = {
                **binding,
                **click("inside"),
                "observation_id": frame["observation_id"],
                "source_revision": 2,
                "expected_modal": "new-dialog",
            }
            with pytest.raises(ComputerError, match="observation_not_delivered"):
                await c.act(ctx, followup)
            obs = c._live[binding["session_id"]].observations[frame["observation_id"]]
            await c.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
            assert c._delivered_observations[binding["session_id"]] == obs.observation_id
        replay = await c.act(ctx, request)
        assert "next_observation" not in replay and len(b.calls) == 1


@pytest.mark.parametrize("overlap", [False, True])
async def test_original_pointer_anchor_survives_only_distant_changes(
    tmp_path, monkeypatch, overlap
):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def draw(payload):
            state["image"] = raster((160, 80, 190, 110) if overlap else (5, 5, 50, 50))
            return changed(payload)

        b.hook = draw
        request = plan(binding, click("fill"), click("later", x=180, y=100))
        result = await c.act(ctx, request)
        assert result["status"] == ("not_satisfied" if overlap else "verified")
        assert len(b.calls) == (1 if overlap else 2)
        if overlap:
            assert result["reason"] == "sequence_visual_target_changed"
        assert "next_observation" in result
        assert binding["session_id"] not in c._delivered_observations
        await c.act(ctx, request)
        assert len(b.calls) == (1 if overlap else 2)


@pytest.mark.parametrize(
    "platform,environment,allowed",
    [
        ("x11", "existing_session", True),
        ("x11", "isolated", False),
        ("wayland", "existing_session", False),
    ],
)
async def test_keyboard_scope_parity(tmp_path, monkeypatch, platform, environment, allowed):
    async with rig(tmp_path, monkeypatch, platform=platform, environment=environment) as values:
        c, b, ctx, binding, state = values

        async def fill(payload):
            state["image"] = raster((0, 0, 239, 159))
            return changed(payload)

        b.hook = fill
        request = plan(
            binding,
            click("fill"),
            {
                "action_id": "shortcut",
                "operation": "key",
                "key": "ctrl+s",
                "expect": {"type": "visual_change"},
            },
        )
        result = await c.act(ctx, request)
        assert len(b.calls) == (2 if allowed else 1)
        assert result["status"] == ("verified" if allowed else "not_satisfied")


async def test_changed_native_binding_still_vetoes_keyboard(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def move_focus(payload):
            b.source = replace(b.source, source_revision=2)
            return changed(payload)

        b.hook = move_focus
        request = plan(
            binding,
            click("focus"),
            {
                "action_id": "type",
                "operation": "type",
                "text": "note",
                "expect": {"type": "visual_change"},
            },
        )
        result = await c.act(ctx, request)
        assert result["reason"] == "sequence_target_changed" and len(b.calls) == 1


@pytest.mark.parametrize("during", ["act", "capture", "auth"])
async def test_cancelled_sequence_settles_ids_no_replay(tmp_path, monkeypatch, during):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        entered, settled = asyncio.Event(), asyncio.Event()

        async def blocked():
            entered.set()
            try:
                await asyncio.Future()
            finally:
                settled.set()

        capture, auth = b.observe, c._auth

        async def act(payload):
            if during == "act":
                await blocked()
            return changed(payload)

        async def observe(**kwargs):
            if during == "capture" and b.calls:
                await blocked()
            return await capture(**kwargs)

        async def authorize(*args, **kwargs):
            if during == "auth" and b.calls:
                await blocked()
            return await auth(*args, **kwargs)

        b.hook, b.observe = act, observe
        monkeypatch.setattr(c, "_auth", authorize)
        request = plan(binding, click("first"), click("second"))
        task = asyncio.create_task(c.act(ctx, request))
        await asyncio.wait_for(entered.wait(), 2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        await asyncio.wait_for(settled.wait(), 2)
        monkeypatch.setattr(c, "_auth", auth)
        receipt = await c.act(ctx, request)
        assert receipt["reason"] == "sequence_cancelled"
        assert "next_observation" not in receipt and len(b.calls) == 1
        rows = dict(c.store.db.execute("SELECT action_id, status FROM receipts"))
        assert set(rows) == {"plan", "first", "second"}
        assert "pending" not in rows.values() and rows["second"] == "unavailable"
        assert binding["session_id"] not in c._delivered_observations
        with pytest.raises(ComputerError, match="action_id_conflict"):
            await c.act(ctx, {**binding, **click("second")})
        assert len(b.calls) == 1


async def test_compact_receipt_keeps_full_stored_evidence(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def action(payload):
            return changed(payload)

        b.hook = action
        request = plan(binding, *(click(f"step-{n}") for n in range(5)))
        result = await c.act(ctx, request)
        stored = c.store.receipt(binding["session_id"], "plan", canonical_hash(request))
        frozen = copy.deepcopy(stored)
        compact = {k: v for k, v in result.items() if k != "next_observation"}
        assert compact == compact_sequence_receipt(stored)
        assert stored == frozen
        assert "actual" in stored["verification"]["steps"][0]["verification"]
        assert "actual" not in compact["verification"]["steps"][0]["verification"]
        assert len(json.dumps(compact)) < 3500
        assert len(json.dumps(compact)) < len(json.dumps(stored))
        for step in compact["verification"]["steps"]:
            assert c.store.read_evidence(ctx, step["verification"]["evidence_id"])[0]
        assert compact == await c.act(ctx, request)
        assert len(b.calls) == 5
        image = ComputerIntegration.output_image(result["next_observation"])
        prompt = image["__prompt__"] + json.dumps(compact, separators=(",", ":"))
        assert len(prompt.encode("utf-8")) < 8000


def test_compaction_retains_all_failure_measurements():
    failed = {
        "action_id": "failed",
        "status": "interrupted",
        "reason": "input_scope_changed",
        "execution": {"injected": True, "released": True},
        "verification": {"status": "unavailable", "diagnostic": {"native_step": 4}},
    }
    receipt = {"verification": {"type": "sequence", "steps": [failed]}}
    compact = compact_sequence_receipt(receipt)
    assert compact["verification"]["steps"][0] == failed


def test_compaction_leaves_non_sequence_and_pending_receipts_unchanged():
    for receipt in ({"status": "verified"}, {"verification": {"type": "sequence"}}):
        assert compact_sequence_receipt(receipt) is receipt


@pytest.mark.parametrize(
    "steps,reason",
    [
        ([], "invalid_sequence_length"),
        ([click("plan")], "action_id_conflict"),
        ([click("same"), click("same")], "action_id_conflict"),
        ([click("a" * 97)], "invalid_arguments"),
    ],
)
async def test_invalid_plan_never_reserves_or_dispatches(tmp_path, monkeypatch, steps, reason):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        with pytest.raises(ComputerError, match=reason):
            await c.act(ctx, plan(binding, *steps))
        assert not b.calls
        assert c.store.db.execute("SELECT count(*) FROM receipts").fetchone()[0] == 0


async def test_stroke_plan_rejects_combined_budget_before_dispatch(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        request = {
            **binding,
            "action_id": "plan",
            "operation": "strokes",
            "strokes": [
                {"action_id": f"line-{n}", "points": [[20, 20], [50, 50]], "duration": 1.0}
                for n in range(5)
            ],
        }
        with pytest.raises(ComputerError, match="sequence_budget_exceeded"):
            await c.act(ctx, request)
        assert not b.calls


async def test_no_delivered_frame_no_reservation(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        c._delivered_observations.clear()
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await c.act(ctx, plan(binding, click("one")))
        assert not b.calls


async def test_unknown_step_stops_without_capture_or_replay(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def unknown(payload):
            return {"status": "unknown", "injected": True, "released": False}

        b.hook = unknown
        request = plan(binding, click("one"), click("two"))
        result = await c.act(ctx, request)
        assert result["status"] == "unknown" and result["reason"] == "input_outcome_unknown"
        assert "next_observation" not in result
        assert result["execution"]["released"] is False
        assert result["verification"]["steps"][1]["status"] == "unavailable"
        assert await c.act(ctx, request) == result and len(b.calls) == 1


async def test_region_verification_uses_saved_pixels(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def paint(payload):
            state["image"] = raster((20, 20, 35, 35))
            return changed(payload)

        b.hook = paint
        step = click("paint")
        step["expect"] = {"type": "region_changed", "x": 20, "y": 20, "width": 20, "height": 20}
        result = await c.act(ctx, plan(binding, step))
        assert result["status"] == "verified"
        assert (
            result["verification"]["steps"][0]["verification"]["scope"]
            == "region_raster_change_only"
        )


async def test_stroke_never_commits_false_verified_and_yields_inspection(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def draw(payload):
            state["image"] = raster((20, 20, 35, 35))
            return changed(payload)

        b.hook = draw
        finished = []
        finish = c.store.finish_action

        def record(session_id, action_id, result):
            finished.append((action_id, copy.deepcopy(result)))
            return finish(session_id, action_id, result)

        monkeypatch.setattr(c.store, "finish_action", record)
        request = {
            **binding,
            "action_id": "plan",
            "operation": "strokes",
            "strokes": [
                {"action_id": f"stroke-{n}", "points": [[20, 20], [35, 35]], "duration": 0.1}
                for n in range(2)
            ],
        }
        result = await c.act(ctx, request)
        assert result["reason"] == "sequence_step_not_verified"
        assert result["next_observation"]["image_bytes"]
        assert result["execution"]["completed_steps"] == 0
        assert len(b.calls) == 1
        assert all(
            r["status"] != "verified" for action_id, r in finished if action_id == "stroke-0"
        )
        step = result["verification"]["steps"][0]
        assert step["status"] == "executed"
        assert step["verification"]["semantic_mark_verified"] is False
        assert step["verification"]["path_evidence"]["path_changed_pixels"] > 0
        assert result["verification"]["steps"][1]["status"] == "unavailable"


async def test_unmeasured_final_modal_does_not_become_success(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def unexpected(payload):
            state.update(modal="unexpected", modal_kind="safe_application")
            return changed(payload)

        b.hook = unexpected
        result = await c.act(ctx, plan(binding, click("one")))
        assert result["status"] == "not_satisfied"
        assert "next_observation" not in result
        assert c.store.get_session(binding["session_id"]).state == "paused"
        assert (
            result["verification"]["steps"][0]["verification"]["reason"]
            == "unexpected_dialog_transition"
        )


def disconnected_strokes(binding, *, operation="strokes"):
    strokes = [
        {
            "action_id": f"line-{n}",
            "points": [[20, 20 + n * 28], [160, 20 + n * 28]],
            "duration": 0.1,
        }
        for n in range(5)
    ]
    if operation == "sequence":
        return plan(
            binding,
            *[{**s, "operation": "polyline", "expect": {"type": "visual_change"}} for s in strokes],
        )
    return {**binding, "action_id": "plan", "operation": "strokes", "strokes": strokes}


def stroke_dispatch(payload, state, *, raster_change=True):
    if raster_change:
        with Image.open(BytesIO(state["image"])) as image:
            ImageDraw.Draw(image).line([tuple(p) for p in payload["points"]], fill="black", width=3)
            stream = BytesIO()
            image.save(stream, "PNG")
            state["image"] = stream.getvalue()
    raw = changed(payload, change=raster_change)
    raw.update(
        status="executed",
        reason="complete",
        diagnostics={
            "phase": "complete",
            "release": "confirmed",
            "reason": "complete",
            "steps_planned": 5,
            "steps_completed": 5,
        },
    )
    return raw


@pytest.mark.parametrize("operation", ["strokes", "sequence"])
@pytest.mark.parametrize("platform", ["x11", "wayland"])
async def test_five_strokes_complete_honestly_with_fresh_delivery_gate(
    tmp_path, monkeypatch, operation, platform
):
    async with rig(tmp_path, monkeypatch, platform=platform) as (c, b, ctx, binding, state):

        async def draw(payload):
            return stroke_dispatch(payload, state)

        b.hook = draw
        writes = []
        finish = c.store.finish_action

        def record(session_id, action_id, result):
            writes.append(copy.deepcopy(result))
            return finish(session_id, action_id, result)

        monkeypatch.setattr(c.store, "finish_action", record)
        request = disconnected_strokes(binding, operation=operation)
        result = await c.act(ctx, request)
        assert len(b.calls) == 5
        with Image.open(BytesIO(result["next_observation"]["image_bytes"])) as final:
            assert all(final.getpixel((80, 20 + n * 28)) == (0, 0, 0) for n in range(5))
            assert final.getpixel((210, 145)) == (255, 255, 255)
        assert result["status"] == "executed"
        assert result["execution"]["completed_steps"] == 5
        assert result["execution"]["verified_steps"] == 0
        assert result["execution"]["released"] is True
        assert result["verification"]["status"] == "visual_review_required"
        assert result["verification"]["semantic_mark_verified"] is False
        assert result["verification"]["automatic_replay"] is False
        assert all(row["status"] != "verified" for row in writes)
        assert all(s["status"] == "executed" for s in result["verification"]["steps"])
        stored = c.store.receipt(binding["session_id"], "plan", canonical_hash(request))
        assert (
            stored["verification"]["steps"][0]["verification"]["path_evidence"][
                "path_changed_pixels"
            ]
            > 0
        )
        compact = {k: v for k, v in result.items() if k != "next_observation"}
        prompt = ComputerIntegration.output_image(result["next_observation"])["__prompt__"]
        assert len((prompt + json.dumps(compact)).encode()) < 8000
        assert await c.act(ctx, request) == compact and len(b.calls) == 5
        frame = result["next_observation"]
        followup = {**binding, **click("new", 210, 145), "observation_id": frame["observation_id"]}
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await c.act(ctx, followup)
        obs = c._live[binding["session_id"]].observations[frame["observation_id"]]
        await c.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        assert c._delivered_observations[binding["session_id"]] == obs.observation_id


@pytest.mark.parametrize(
    "failure",
    [
        "no_pixels",
        "no_local_pixels",
        "endpoint_only",
        "partial",
        "missing_counts",
        "bad_diagnostics",
        "incomplete_phase",
        "unconfirmed_diagnostic_release",
        "boolean_counts",
        "false_release",
        "unknown_dispatch",
        "failed_expected_raster",
        "different_app",
        "focus_change",
        "unexpected_modal",
        "changed_next_anchor",
        "missing_path_flag",
        "sampled_target_changed",
    ],
)
async def test_stroke_batch_failure_stops_first_and_never_replays(tmp_path, monkeypatch, failure):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def draw(payload):
            raw = stroke_dispatch(
                payload,
                state,
                raster_change=failure not in {"no_pixels", "no_local_pixels", "endpoint_only"},
            )
            if failure in {"no_local_pixels", "endpoint_only"}:
                raw["postcondition"]["actual"]["after_sha256"] = "b" * 64
            if failure == "endpoint_only":
                state["image"] = raster((157, 17, 163, 23))
            if failure == "partial":
                raw["diagnostics"]["steps_completed"] = 1
            elif failure == "missing_counts":
                raw.pop("diagnostics")
            elif failure == "bad_diagnostics":
                raw["diagnostics"] = None
            elif failure == "incomplete_phase":
                raw["diagnostics"]["phase"] = "dispatch"
            elif failure == "unconfirmed_diagnostic_release":
                raw["diagnostics"]["release"] = "unknown"
            elif failure == "boolean_counts":
                raw["diagnostics"].update(steps_planned=True, steps_completed=True)
            elif failure == "false_release":
                raw["released"] = False
            elif failure == "unknown_dispatch":
                raw.update(status="unknown", reason="input_dispatch_expired")
            elif failure == "failed_expected_raster":
                raw["postcondition"]["actual"]["after_sha256"] = "a" * 64
            elif failure == "different_app":
                raw["postcondition"]["target_application_matches"] = False
            elif failure == "focus_change":
                b.source = replace(b.source, source_revision=2)
            elif failure == "unexpected_modal":
                state.update(modal="unexpected", modal_kind="safe_application")
            elif failure == "changed_next_anchor":
                with Image.open(BytesIO(state["image"])) as image:
                    ImageDraw.Draw(image).rectangle((10, 38, 30, 58), fill="black")
                    stream = BytesIO()
                    image.save(stream, "PNG")
                    state["image"] = stream.getvalue()
            elif failure == "sampled_target_changed":
                raw["sampled_target_changed"] = True
            return raw

        if failure == "missing_path_flag":
            from src.computer.sequences import stroke_effect

            def no_flag(*args, **kwargs):
                stroke_effect(*args, **kwargs)
                args[0].get("verification", {}).get("path_evidence", {}).pop(
                    "continuation_supported", None
                )

            monkeypatch.setattr("src.computer.sequences.stroke_effect", no_flag)
        b.hook = draw
        request = disconnected_strokes(binding)
        result = await c.act(ctx, request)
        assert len(b.calls) == 1
        assert result["status"] not in {"executed", "verified"}
        assert result["verification"]["steps"][1]["status"] == "unavailable"
        assert result["verification"]["automatic_replay"] is False
        await c.act(ctx, request)
        assert len(b.calls) == 1
        assert binding["session_id"] not in c._delivered_observations


@pytest.mark.parametrize("operation", ["click", "drag"])
async def test_executed_unrelated_action_cannot_continue(tmp_path, monkeypatch, operation):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):

        async def execute(payload):
            if operation == "drag":
                return stroke_dispatch(payload, state)
            return {"status": "executed", "injected": True, "released": True}

        b.hook = execute
        first = (
            click("first")
            if operation == "click"
            else {
                "action_id": "first",
                "operation": "drag",
                "points": [[20, 20], [160, 20]],
                "duration": 0.1,
                "expect": {"type": "visual_change"},
            }
        )
        result = await c.act(ctx, plan(binding, first, click("later", 210, 145)))
        assert result["reason"] == "sequence_step_not_verified"
        assert len(b.calls) == 1
