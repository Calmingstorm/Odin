"""Finite plans grounded in ONE delivered view, not chained unseen observations.

Internal captures only veto previously planned targets. They cannot introduce
new coordinates, acknowledge dialogs, or authorize later calls. Native action
leases and release guardians are unchanged; each stroke is a separate action.
"""

import asyncio
from copy import deepcopy
from dataclasses import asdict

from .actions import _REQUIRED
from .effects import effect_receipt, region_effect
from .grounding import POINTER_OPERATIONS, pointer_anchor, pointer_target_stable
from .gui_actions import action_arguments, action_payload
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
            exact_keys(item, {"action_id", "points", "duration"},
                       {"action_id", "points", "duration"})
            item = {**item, "operation": "polyline", "expect": {"type": "visual_change"}}
        else:
            exact_keys(item, {"action_id", "operation", "expect", "x", "y", "text", "key",
                              "direction", "count", "duration", "points", "modifiers",
                              "region", "target"},
                       {"action_id", "operation", "expect"})
        step = {**shared, **item}
        action_arguments(step)
        action_arguments({**step, "action_id": inp["action_id"]})
        if len(inp["action_id"]) > 96 or len(step["action_id"]) > 96:
            raise ComputerError("invalid_arguments")
        if step["action_id"] in ids or step["action_id"] == inp["action_id"]:
            raise ComputerError("action_id_conflict")
        ids.add(step["action_id"])
        steps.append(step)
    if (sum(len(s.get("points", [])) for s in steps) > MAX_SEQUENCE_POINTS
            or sum(len(s.get("text", "")) for s in steps) > MAX_SEQUENCE_TEXT
            or sum(s.get("duration", 0) for s in steps) > MAX_SEQUENCE_STROKE_SECONDS):
        raise ComputerError("sequence_budget_exceeded")
    return steps


def _stable_target(controller, context, original, current, step):
    """Exact original binding plus original target pixels, never new authority."""
    if current.geometry != original.geometry:
        raise ComputerError("sequence_target_changed")
    if current.image_sha256 == original.image_sha256:
        return
    # Keyboard is deliberately stricter than ordinary single-action X11: a
    # same-window field/menu transition must not silently retarget later typing.
    if step["operation"] not in POINTER_OPERATIONS:
        raise ComputerError("sequence_visual_target_changed")
    before, _ = controller.store.read_evidence(context, original.evidence_id)
    after, _ = controller.store.read_evidence(context, current.evidence_id)
    if not pointer_target_stable(before, after, *pointer_anchor(step)):
        raise ComputerError("sequence_visual_target_changed")


def _preflight_backend(grant, steps):
    # Static backend limits reject the WHOLE plan; actual native keymap
    # availability remains checked immediately before input by each guardian.
    for step in steps:
        if grant.platform == "wayland" and (step["expect"] != {"type": "visual_change"}
                or len(step.get("text", "")) > 256):
            raise ComputerError("sequence_backend_limit")
        if any(127 <= ord(c) <= 159 for c in step.get("text", "")):
            raise ComputerError("invalid_text")


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
            return existing
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
            supported = (live.capabilities.limits or {}).get("effect_expectations")
            if supported is not None and step["expect"]["type"] not in supported:
                raise ComputerError("unsupported_postcondition")
            # Fresh accessible handles require per-view reconciliation; the
            # initial sequence contract does not silently synthesize that.
            if step["operation"] == "replace_field":
                raise ComputerError("sequence_accessible_target_requires_single_action")
            try:
                action_payload(step, original)
            except ComputerError:
                if original.modal is not None:
                    await controller._pause(grant.session_id)
                raise
        if not callable(getattr(live.backend, "act", None)):
            raise ComputerError("grounded_actions_unavailable")
        reserved = [(s["action_id"], canonical_hash({"sequence": inp["action_id"], "step": s}))
                    for s in steps]
        existing = controller.store.begin_sequence(
            grant, inp["action_id"], payload_hash, reserved, MAX_ACTIONS,
            provenance=getattr(live.backend, "application_provenance", None))
        if existing is not None:
            return existing
        controller._delivered_observations.pop(grant.session_id, None)
        live.observations.clear()
        if live.task_context is not None:
            live.task_context.invalidate("sequence_dispatched")
        deadline = min(controller.monotonic() + MAX_SEQUENCE_SECONDS, live.deadline,
                       original.captured_at + DELIVERED_GROUNDING_SECONDS)
        crop = (asdict(original.frame_metadata.crop) if original.frame_metadata is not None
                and original.frame_metadata.crop is not None else None)
        settled, attempted = [], None
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
            return await _bounded(controller._capture(grant, crop=crop, strict_binding=True),
                                  budget)

        async def authorize():
            budget = min(5.0, remaining())
            await _bounded(controller._auth(context), budget)
            remaining()

        try:
            for index, step in enumerate(steps):
                await authorize()
                if latest is None:
                    latest, latest_image = await capture()
                _stable_target(controller, context, original, latest, step)
                observation_input(grant, live, latest)
                payload, target = action_payload(step, latest)
                await authorize()
                if not 0 <= controller.monotonic() - latest.captured_at <= FRAME_FRESH_SECONDS:
                    raise ComputerError("stale_observation")
                budget = min(MAX_ACTION_RPC_SECONDS, remaining())
                current = latest
                latest, latest_image = None, None
                attempted = index
                raw = await _bounded(live.backend.act(payload), budget)
                result = effect_receipt(raw, current, step["expect"], target)
                # Commit injection/release facts BEFORE any capture/auth await.
                controller.store.finish_action(grant.session_id, step["action_id"], result)
                settled.append(result)
                attempted = None
                if result["status"] == "unknown":
                    stop_required = True
                    raise ComputerError("input_outcome_unknown")
                if result["status"] == "interrupted":
                    effect_uncertain = True
                await authorize()
                latest, latest_image = await capture()
                if step["expect"]["type"] == "region_changed" and not effect_uncertain:
                    before_image = controller.store.read_evidence(context, current.evidence_id)[0]
                    region_effect(result, step["expect"], before_image, latest_image,
                                  binding_matches=latest.geometry == current.geometry)
                result.setdefault("verification", {}).update(evidence_id=latest.evidence_id)
                result["observation_id"] = latest.observation_id
                controller.store.finish_action(grant.session_id, step["action_id"], result)
                if isinstance(raw, dict) and raw.get("sampled_target_changed") is True:
                    raise ComputerError("sequence_sampled_target_changed")
                if latest.geometry != original.geometry:
                    raise ComputerError("sequence_target_changed")
                if result["status"] != "verified":
                    raise ComputerError("sequence_step_not_verified")
                if index + 1 < len(steps):
                    _stable_target(controller, context, original, latest, steps[index + 1])
        except (Exception, asyncio.CancelledError) as exc:
            cancelled = isinstance(exc, asyncio.CancelledError)
            reason = ("sequence_cancelled" if cancelled else exc.code
                      if isinstance(exc, ComputerError) else "sequence_interrupted")
            stop_required |= cancelled or attempted is not None
            if attempted is not None:
                # Set the cleanup requirement before a possibly failing write.
                result = {"status": "unknown", "reason": "input_outcome_unknown"}
                settled.append(result)
                controller.store.finish_action(
                    grant.session_id, steps[attempted]["action_id"], result)
        finally:
            # Cleanup cannot be skipped if durable settlement itself fails.
            try:
                for step in steps[len(settled):]:
                    controller.store.finish_action(grant.session_id, step["action_id"], {
                        "status": "unavailable", "reason": "sequence_not_dispatched",
                        "execution": {"injected": False, "released": True}})
                verification = {
                    "type": "sequence", "status": "satisfied" if reason is None else "interrupted",
                    "scope": "individual_postconditions_only",
                    "step_action_ids": [s[0] for s in reserved],
                    "settled_steps": len(settled), "total_steps": len(steps),
                    "grounding_observation_id": original.observation_id,
                    "automatic_replay": False,
                    "frame_status": "available" if latest is not None else "unavailable",
                }
                if latest is not None:
                    verification["evidence_id"] = latest.evidence_id
                if reason is not None:
                    verification["next_action"] = "inspect_interruption_then_plan_new_action_ids"
                    if live.task_context is not None:
                        live.task_context.invalidate(reason)
                result = {"status": "verified" if reason is None else
                          "unknown" if stop_required else
                          "interrupted" if effect_uncertain else "not_satisfied",
                          "verification": verification}
                if reason is not None:
                    result["reason"] = reason
                controller.store.finish_action(grant.session_id, inp["action_id"], result)
            except BaseException:
                stop_required = True
                raise
            finally:
                if stop_required:
                    # Never delay uncertain release for a screenshot.
                    await controller._stop(grant.session_id, "cancelled")
        if cancelled:
            raise asyncio.CancelledError
        receipt = controller.store.receipt(grant.session_id, inp["action_id"], payload_hash)
        if (reason is not None and latest is not None and latest.modal is not None
                and latest.modal != original.modal and not stop_required):
            # Preserve ordinary-action unexpected-modal policy. Pausing revokes
            # the old generation, so do not publish its frame as actionable.
            await controller._pause(grant.session_id)
            return receipt
        if latest is not None and latest_image is not None and not stop_required:
            # A known interruption yields its new view to the MODEL, not another
            # step. Only actual final/interruption delivery grants later authority.
            return {**receipt, "next_observation": {
                **latest.public(), "image_bytes": latest_image,
                "task_context": controller._task_context(live),
                **controller._input_status(live, grant),
                "sources": (live.backend.sources()
                            if callable(getattr(live.backend, "sources", None)) else []),
                "backend_capabilities": (live.capabilities.public()
                                         if live.capabilities is not None else None),
            }}
        return receipt
