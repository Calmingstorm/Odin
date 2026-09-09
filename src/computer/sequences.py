"""Finite plans grounded in ONE delivered view, not chained unseen observations.

Internal captures only veto previously planned targets. They cannot introduce
new coordinates, acknowledge dialogs, or authorize later calls. Native action
leases and release guardians are unchanged; each stroke is a separate action.
"""

import asyncio
from copy import deepcopy
from dataclasses import asdict

from .actions import _REQUIRED
from .effects import effect_receipt, measured_appearance, region_effect, stroke_effect
from .grounding import POINTER_OPERATIONS, pointer_anchor, pointer_target_stable
from .gui_actions import action_arguments, action_payload, reconcile_accessible_action
from .models import ComputerError
from .policy import (
    DELIVERED_GROUNDING_SECONDS,
    FRAME_FRESH_SECONDS,
    MAX_ACTION_RPC_SECONDS,
    MAX_ACTIONS,
    exact_keys,
    input_eligible,
    observation_input,
)
from .render import compact_sequence_receipt
from .store import canonical_hash

MAX_SEQUENCE_STEPS = 8
MAX_SEQUENCE_SECONDS = 30.0
MAX_SEQUENCE_POINTS = 256
MAX_SEQUENCE_TEXT = 512
MAX_SEQUENCE_STROKE_SECONDS = 4.0


def sequence_arguments(inp):
    """Validate the complete plan, including every later step, before input."""
    operation = inp.get("operation")
    collection = "strokes" if operation == "strokes" else "steps"
    binding = _REQUIRED - {"expect", "operation", "action_id"}
    required = binding | {"action_id", "operation", collection}
    exact_keys(inp, required | {"expected_modal"}, required)
    if type(operation) is not str or operation not in {"sequence", "strokes"}:
        raise ComputerError("unsupported_operation")
    items = inp[collection]
    if type(items) is not list or not 1 <= len(items) <= MAX_SEQUENCE_STEPS:
        raise ComputerError("invalid_sequence_length")
    shared = {key: inp[key] for key in binding | {"expected_modal"} if key in inp}
    steps, ids = [], set()
    for item in items:
        if operation == "strokes":
            exact_keys(
                item,
                {"action_id", "points", "duration", "modifiers"},
                {"action_id", "points", "duration"},
            )
            item = {**item, "operation": "polyline", "expect": {"type": "visual_change"}}
        else:
            exact_keys(
                item,
                {
                    "action_id",
                    "operation",
                    "expect",
                    "x",
                    "y",
                    "text",
                    "key",
                    "direction",
                    "count",
                    "duration",
                    "points",
                    "modifiers",
                    "region",
                    "target",
                },
                {"action_id", "operation", "expect"},
            )
        step = {**shared, **item}
        action_arguments(step)
        action_arguments({**step, "action_id": inp["action_id"]})
        if len(inp["action_id"]) > 96 or len(step["action_id"]) > 96:
            raise ComputerError("invalid_arguments")
        if step["action_id"] in ids or step["action_id"] == inp["action_id"]:
            raise ComputerError("action_id_conflict")
        ids.add(step["action_id"])
        steps.append(step)
    if (
        sum(len(s.get("points", [])) for s in steps) > MAX_SEQUENCE_POINTS
        or sum(len(s.get("text", "")) for s in steps) > MAX_SEQUENCE_TEXT
        or sum(s.get("duration", 0) for s in steps) > MAX_SEQUENCE_STROKE_SECONDS
    ):
        raise ComputerError("sequence_budget_exceeded")
    return steps


def _stable_target(controller, context, original, current, step, *, attached_keyboard=False):
    """Exact original binding plus original target pixels, never new authority."""
    if current.geometry != original.geometry:
        raise ComputerError("sequence_target_changed")
    if step["operation"] == "replace_field":
        reconcile_accessible_action(step, original, current)
        return
    if current.image_sha256 == original.image_sha256:
        return
    # A native focused editable node can tolerate selection/text changes without
    # accepting a different widget. No name-only or bounds-only rebinding.
    if step["operation"] in {"type", "key"} and (
        attached_keyboard or _same_focused_field(original, current)
    ):
        return
    if step["operation"] not in POINTER_OPERATIONS:
        raise ComputerError("sequence_visual_target_changed")
    before, _ = controller.store.read_evidence(context, original.evidence_id)
    after, _ = controller.store.read_evidence(context, current.evidence_id)
    if not pointer_target_stable(before, after, *pointer_anchor(step)):
        raise ComputerError("sequence_visual_target_changed")


def _same_focused_field(original, current):
    def focused(observation):
        return [
            node
            for node in observation.accessibility
            if node.get("focused") is True
            and node.get("text_readable") is True
            and "replace_field" in node.get("capabilities", [])
        ]

    before, after = focused(original), focused(current)
    if len(before) != 1 or len(after) != 1:
        return False
    old, new = before[0], after[0]
    identities = ("node_identity", "root_identity", "ancestor_identity")
    if any(
        not isinstance(old.get(key), str) or not old[key] or old[key] != new.get(key)
        for key in identities
    ):
        return False
    return all(
        old.get(key) == new.get(key) for key in ("role", "bounds", "bounds_space", "capabilities")
    )


def _preflight_backend(grant, steps):
    # Static backend limits reject the WHOLE plan; actual native keymap
    # availability remains checked immediately before input by each guardian.
    for step in steps:
        if grant.platform == "wayland" and (
            step["expect"] != {"type": "visual_change"} or len(step.get("text", "")) > 256
        ):
            raise ComputerError("sequence_backend_limit")
        if any(127 <= ord(c) <= 159 for c in step.get("text", "")):
            raise ComputerError("invalid_text")


def _stroke_completed(step, raw, result, *, raster_satisfied, binding_matches):
    """Acknowledge a preplanned line, not a semantic mark or generic execution.

    Complete native dispatch/release and independently measured localized path
    changes are conjunctive. Original-view anchors and lifecycle gates still
    veto NEXT input. A helper flag alone never excuses a failed expectation.
    """
    if not isinstance(raw, dict):
        return False
    diagnostics = raw.get("diagnostics", {})
    if not isinstance(diagnostics, dict):
        return False
    planned, completed = (diagnostics.get(k) for k in ("steps_planned", "steps_completed"))
    verification = result.get("verification", {})
    return (
        step["operation"] == "polyline"
        and step["expect"] == {"type": "visual_change"}
        and result.get("status") == "executed"
        and raw.get("status") in {"executed", "verified"}
        and raw.get("injected") is True
        and raw.get("released") is True
        and raw.get("reason", "complete") == "complete"
        and diagnostics.get("phase") == "complete"
        and diagnostics.get("release") == "confirmed"
        and diagnostics.get("reason") == "complete"
        and type(planned) is int
        and type(completed) is int
        and planned > 0
        and completed == planned
        and raster_satisfied
        and binding_matches
        and verification.get("target_application_matches") is True
        and verification.get("semantic_mark_verified") is False
        and verification.get("path_evidence", {}).get("continuation_supported") is True
    )


async def execute_sequence(controller, context, inp):
    """Serialized finite plan. Uncertain input stops; known interruption yields."""
    from .controller import _bounded

    steps = sequence_arguments(inp)
    inp, steps = deepcopy(inp), deepcopy(steps)
    payload_hash = canonical_hash(inp)
    async with controller._actions:
        await controller._auth(context)
        grant = controller._grant(context, inp, generation=False)
        existing = controller.store.receipt(grant.session_id, inp["action_id"], payload_hash)
        if existing is not None:
            return compact_sequence_receipt(existing)
        grant = controller._grant(context, inp)
        live = controller._active(grant)
        if live.capabilities is None or live.capabilities.environment != grant.environment:
            raise ComputerError("attachment_unavailable")
        input_eligible(live.capabilities)
        if controller._delivered_observations.get(grant.session_id) != inp["observation_id"]:
            raise ComputerError("observation_not_delivered")
        original = live.observations.get(inp["observation_id"])
        if original is None:
            raise ComputerError("stale_observation")
        observation_input(grant, live, original)
        if not 0 <= controller.monotonic() - original.captured_at <= DELIVERED_GROUNDING_SECONDS:
            raise ComputerError("stale_observation")
        _preflight_backend(grant, steps)
        for step in steps:
            supported = getattr(live.backend, "input_limits", {}).get("effect_expectations")
            if supported is not None and step["expect"]["type"] not in supported:
                raise ComputerError("unsupported_postcondition")
            if step["operation"] == "replace_field_pixels":
                raise ComputerError("pixel_field_requires_single_action")
            try:
                action_payload(step, original)
                reconcile_accessible_action(step, original, original)
            except ComputerError:
                if original.modal is not None:
                    await controller._pause(grant.session_id)
                raise
        if not callable(getattr(live.backend, "act", None)):
            raise ComputerError("grounded_actions_unavailable")
        reserved = [
            (s["action_id"], canonical_hash({"sequence": inp["action_id"], "step": s}))
            for s in steps
        ]
        existing = controller.store.begin_sequence(
            grant,
            inp["action_id"],
            payload_hash,
            reserved,
            MAX_ACTIONS,
            provenance=getattr(live.backend, "application_provenance", None),
        )
        if existing is not None:
            return compact_sequence_receipt(existing)
        controller._delivered_observations.pop(grant.session_id, None)
        live.observations.clear()
        if live.task_context is not None:
            live.task_context.invalidate("sequence_dispatched")
        deadline = min(
            controller.monotonic() + MAX_SEQUENCE_SECONDS,
            live.deadline,
            original.captured_at + DELIVERED_GROUNDING_SECONDS,
        )
        crop = (
            asdict(original.frame_metadata.crop)
            if original.frame_metadata is not None and original.frame_metadata.crop is not None
            else None
        )
        settled, attempted = [], None
        completed_steps, review_required = 0, False
        latest, latest_image = None, None
        reason, cancelled, stop_required, effect_uncertain = None, False, False, False

        def remaining():
            controller._active(grant)
            value = deadline - controller.monotonic()
            if value <= 0:
                raise ComputerError("sequence_deadline")
            return value

        async def capture():
            budget = min(5.0, remaining())
            return await _bounded(
                controller._capture(grant, crop=crop, strict_binding=True), budget
            )

        async def authorize():
            budget = min(5.0, remaining())
            await _bounded(controller._auth(context), budget)
            remaining()

        def stable_target(step):
            # Match single-action X11 attached keyboard policy: exact native
            # source/focus geometry, not unrelated canvas/caret raster changes.
            # Pointer anchors still compare against the MODEL's original view.
            _stable_target(
                controller,
                context,
                original,
                latest,
                step,
                attached_keyboard=(
                    grant.platform == "x11" and grant.environment == "existing_session"
                ),
            )

        try:
            for index, step in enumerate(steps):
                await authorize()
                if latest is None:
                    latest, latest_image = await capture()
                stable_target(step)
                observation_input(grant, live, latest)
                dispatch_step = reconcile_accessible_action(step, original, latest)
                payload, target = action_payload(dispatch_step, latest)
                await authorize()
                if not 0 <= controller.monotonic() - latest.captured_at <= FRAME_FRESH_SECONDS:
                    raise ComputerError("stale_observation")
                budget = min(MAX_ACTION_RPC_SECONDS, remaining())
                current = latest
                latest, latest_image = None, None
                attempted = index
                raw = await _bounded(live.backend.act(payload), budget)
                result = effect_receipt(raw, current, dispatch_step["expect"], target)
                raster_satisfied = result.get("status") == "verified"
                # Never persist raster-only stroke success as semantic proof,
                # even if cancellation arrives before the checkpoint capture.
                stroke_effect(result, step, None, None, binding_matches=False)
                # Commit injection/release facts BEFORE any capture/auth await.
                controller._finish_action(
                    live.capabilities, grant.session_id, step["action_id"], result
                )
                settled.append(result)
                attempted = None
                if result["status"] == "unknown":
                    stop_required = True
                    raise ComputerError("input_outcome_unknown")
                if result["status"] == "interrupted":
                    effect_uncertain = True
                await authorize()
                latest, latest_image = await capture()
                if (
                    step["expect"]["type"] == "region_changed"
                    or step["operation"] in {"polyline", "drag"}
                ) and not effect_uncertain:
                    before_image = controller.store.read_evidence(context, current.evidence_id)[0]
                    region_effect(
                        result,
                        step["expect"],
                        before_image,
                        latest_image,
                        binding_matches=latest.geometry == current.geometry,
                    )
                    stroke_effect(
                        result,
                        step,
                        before_image,
                        latest_image,
                        binding_matches=latest.geometry == current.geometry,
                    )
                if (
                    latest.modal is not None
                    and latest.modal != current.modal
                    and not (
                        latest.modal_kind == "safe_application" and measured_appearance(result)
                    )
                ):
                    if result["status"] not in {"unknown", "interrupted"}:
                        result["status"] = "not_satisfied"
                    result.setdefault("verification", {}).update(
                        status="not_satisfied", reason="unexpected_dialog_transition"
                    )
                result.setdefault("verification", {}).update(evidence_id=latest.evidence_id)
                result["observation_id"] = latest.observation_id
                stroke_completed = _stroke_completed(
                    step,
                    raw,
                    result,
                    raster_satisfied=raster_satisfied,
                    binding_matches=(
                        latest.geometry == current.geometry and latest.modal == current.modal
                    ),
                )
                if stroke_completed:
                    result["verification"].update(
                        continuation_accepted=True,
                        visual_review_required=True,
                    )
                controller._finish_action(
                    live.capabilities, grant.session_id, step["action_id"], result
                )
                if result["status"] != "verified" and not stroke_completed:
                    raise ComputerError("sequence_step_not_verified")
                completed_steps += 1
                review_required |= stroke_completed
                if index + 1 < len(steps):
                    # These are NEXT-input vetoes, not retroactive failures of
                    # a verified final step. A new dialog must be delivered and
                    # inspected by the model before any action inside it.
                    if isinstance(raw, dict) and raw.get("sampled_target_changed") is True:
                        raise ComputerError("sequence_sampled_target_changed")
                    stable_target(steps[index + 1])
        except (Exception, asyncio.CancelledError) as exc:
            cancelled = isinstance(exc, asyncio.CancelledError)
            reason = (
                "sequence_cancelled"
                if cancelled
                else exc.code
                if isinstance(exc, ComputerError)
                else "sequence_interrupted"
            )
            stop_required |= cancelled or attempted is not None
            if attempted is not None:
                # Set the cleanup requirement before a possibly failing write.
                result = {
                    "status": "unknown",
                    "reason": "input_outcome_unknown",
                    "execution": {"injected": None, "released": False},
                }
                settled.append(result)
                controller._finish_action(
                    live.capabilities, grant.session_id, steps[attempted]["action_id"], result
                )
        finally:
            # Cleanup cannot be skipped if durable settlement itself fails.
            try:
                for step in steps[len(settled) :]:
                    controller._finish_action(
                        live.capabilities,
                        grant.session_id,
                        step["action_id"],
                        {
                            "status": "unavailable",
                            "reason": "sequence_not_dispatched",
                            "execution": {"injected": False, "released": True},
                        },
                    )
                verification = {
                    "type": "sequence",
                    "status": (
                        "interrupted"
                        if reason is not None
                        else "visual_review_required"
                        if review_required
                        else "satisfied"
                    ),
                    "scope": "individual_postconditions_only",
                    "step_action_ids": [s[0] for s in reserved],
                    "settled_steps": len(settled),
                    "total_steps": len(steps),
                    "grounding_observation_id": original.observation_id,
                    "automatic_replay": False,
                    "frame_status": "available" if latest is not None else "unavailable",
                }
                if latest is not None:
                    verification["evidence_id"] = latest.evidence_id
                if review_required:
                    verification.update(
                        visual_review_required=True,
                        semantic_mark_verified=False,
                        next_action="inspect_final_marks_before_new_input",
                    )
                if reason is not None:
                    verification["next_action"] = "inspect_interruption_then_plan_new_action_ids"
                    if live.task_context is not None:
                        live.task_context.invalidate(reason)
                result = {
                    "status": ("executed" if review_required else "verified")
                    if reason is None
                    else "unknown"
                    if stop_required
                    else "interrupted"
                    if effect_uncertain
                    else "not_satisfied",
                    "verification": verification,
                    "execution": {
                        "injected": (
                            True
                            if any(s.get("execution", {}).get("injected") is True for s in settled)
                            else None
                            if any(
                                s.get("execution", {}).get("injected") is not False for s in settled
                            )
                            else False
                        ),
                        "released": not stop_required
                        and all(s.get("execution", {}).get("released") is True for s in settled),
                        "completed_steps": completed_steps,
                        "verified_steps": sum(s.get("status") == "verified" for s in settled),
                        "planned_steps": len(steps),
                    },
                }
                if reason is not None:
                    result["reason"] = reason
                controller._finish_action(
                    live.capabilities, grant.session_id, inp["action_id"], result
                )
            except BaseException:
                stop_required = True
                raise
            finally:
                if stop_required:
                    # Never delay uncertain release for a screenshot.
                    await controller._stop(grant.session_id, "cancelled")
        if cancelled:
            raise asyncio.CancelledError
        receipt = compact_sequence_receipt(
            controller.store.receipt(grant.session_id, inp["action_id"], payload_hash)
        )
        if (
            reason is not None
            and latest is not None
            and latest.modal is not None
            and latest.modal != original.modal
            and not stop_required
        ):
            # Preserve ordinary-action unexpected-modal policy. Pausing revokes
            # the old generation, so do not publish its frame as actionable.
            await controller._pause(grant.session_id)
            return receipt
        if latest is not None and latest_image is not None and not stop_required:
            # A known interruption yields its new view to the MODEL, not another
            # step. Only actual final/interruption delivery grants later authority.
            return {
                **receipt,
                "next_observation": {
                    **latest.public(),
                    "image_bytes": latest_image,
                    "task_context": controller._task_context(live),
                    **controller._input_status(live, grant),
                    "sources": (
                        live.backend.sources()
                        if callable(getattr(live.backend, "sources", None))
                        else []
                    ),
                    "backend_capabilities": (
                        live.capabilities.public() if live.capabilities is not None else None
                    ),
                },
            }
        return receipt
