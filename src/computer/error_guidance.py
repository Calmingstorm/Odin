"""Presentation-only recovery guidance. Never grants input or retries actions."""

from __future__ import annotations

import re

from .admission import InputAdmissionError

_SELECTION = frozenset({
    "target_selection_required", "target_selection_stale", "target_selection_changed",
    "invalid_source_selection", "source_selection_unavailable",
    "hyprland_explicit_output_changed",
    "hyprland_stale_topology_epoch", "hyprland_stale_or_ineligible_candidate",
})
_OBSERVATION = frozenset({
    "stale_observation", "stale_source_binding", "geometry_changed",
    "visual_target_changed", "sequence_visual_target_changed",
    "observation_expired", "wayland_scope_evidence_stale",
    "wayland_scope_evidence_expired",
    "hyprland_fresh_application_observation_required", "hyprland_observation_expired",
    "hyprland_observation_changed", "hyprland_capture_settle_budget_exhausted",
    "hyprland_scope_evidence_expired", "hyprland_capture_scope_changed",
    "hyprland_fractional_or_unknown_geometry", "hyprland_snapshot_capacity",
    "hyprland_fresh_observation_required", "hyprland_application_group_target_changed",
})
_FOCUS = frozenset({
    "input_focus_unavailable", "hyprland_focus_changed",
    "hyprland_focus_changed_before_dispatch", "hyprland_focus_outside_source",
    "human_focus_changed",
    "hyprland_native_focus_not_confirmed", "hyprland_unknown_or_nonnative_focus",
})
_SESSION_STATE = frozenset({
    "stale_generation", "resume_unavailable", "hyprland_resume_retryable",
})
_GROUP_PREFLIGHT = frozenset({
    "hyprland_stale_snapshot", "hyprland_application_group_target_epoch",
    "hyprland_application_group_member_refused", "hyprland_application_group_target_output",
    "hyprland_application_group_target_layer_surface", "hyprland_application_group_target_unknown",
    "hyprland_application_group_target_surface", "hyprland_application_group_target_ineligible",
    "hyprland_application_group_target_focus_unconfirmed",
})


def exception_reason(error: Exception) -> str:
    # ComputerError.code is the entire formatted message for admission errors.
    if isinstance(error, InputAdmissionError):
        return error.admission.code
    code = getattr(error, "code", None)
    if code is None:
        from .runtime.hyprland_scope import HyprlandScopeFailure

        if isinstance(error, HyprlandScopeFailure):
            code = str(error)
    if isinstance(code, str):
        code = code.split(":", 1)[0]
    if isinstance(code, str) and re.fullmatch(r"[a-z][a-z0-9_]{0,95}", code):
        return code
    return "permission_denied" if isinstance(error, PermissionError) else "computer_rejected"


def guidance(reason: str, *, terminal: bool = False, safe_receipt: bool = False) -> dict:
    # A reason selects useful guidance, never establishes dispatch/release facts.
    # Even familiar preflight codes can escape a later capture or batch step.
    # Only affirmative receipt evidence may classify a failure as recoverable.
    terminal = terminal or not safe_receipt
    next_action = "operator_intervention_required" if terminal else "observe_fresh"
    instruction = (
        "Stop input. Have the operator inspect safety and release state. If release is "
        "unknown, the operator must RELEASE-ALL, close the fenced session, and start "
        "anew with renewed consent and fresh observation."
        if terminal else
        "The receipt establishes a safe input boundary. This is not task failure. "
        "Observe once, inspect what happened, then CONTINUE the task with new action ids. "
        "Do not assume the previous input was sent or released without a receipt."
    )
    if not terminal and reason == "hyprland_dispatch_interrupted_after_release":
        next_action = "observe_fresh"
        instruction = (
            "When owned input release is confirmed, dispatch may still be interrupted and the UI "
            "effect is not established. Obtain and inspect fresh pixels and their binding "
            "before planning a DIFFERENT action. If paused, explicitly resume using the "
            "current session generation before observing. Never repeat the interrupted action. "
            "A confirmed-clean interruption does not require operator input-release intervention."
        )
    elif not terminal and reason == "effect_unknown_reconcile_no_replay":
        next_action = "inspect_session_and_reconcile_effect"
        instruction = (
            "A released action can still have an uncertain effect. Read session "
            "status, obtain fresh pixels, and inspect what actually happened before planning "
            "a DIFFERENT action. If the released session was closed, inventory and start a "
            "fresh authorized session first; if paused, explicitly resume with current "
            "generation. Never repeat the uncertain action. Effect uncertainty alone does "
            "not require operator input-release intervention."
        )
    elif not terminal and reason in {
        "unexpected_dialog_transition", "hyprland_fresh_modal_binding_required",
    }:
        next_action = "inspect_returned_view_and_use_new_modal_binding"
        instruction = (
            "The dialog requires a fresh explicit binding. Inspect the returned "
            "pixels and use that NEW observation and its exact expected_modal for a new "
            "action. If no current pixels were returned, observe again. Never repeat the "
            "dialog-opening action."
        )
    elif not terminal and reason in _SESSION_STATE:
        next_action = "inspect_session_status"
        instruction = (
            "Read current session status. If it is cleanly paused, resume using its current "
            "generation, then obtain and inspect a fresh observation. If it is active, use "
            "its current generation for a fresh observation. Closed/cancelled sessions need "
            "a fresh authorized start; quarantined or uncertain-release sessions still need "
            "safety reconciliation. A stale generation alone does not establish held input."
        )
    elif not terminal and reason in _SELECTION:
        next_action = "refresh_inventory_and_reselect_target"
        instruction = (
            "Refresh target inventory and reselect the intended application on its actual "
            "monitor. Never relocate the application or move it to another monitor. "
            "Obtain a fresh observation before planning new input."
        )
    elif not terminal and reason in _GROUP_PREFLIGHT:
        next_action = "observe_fresh"
        instruction = (
            "The observed application target is stale, "
            "occluded, or not currently eligible. Observe and inspect the current pixels and "
            "binding before choosing a new action. Do not act through another application's "
            "window or a desktop panel."
        )
    elif not terminal and reason in _OBSERVATION:
        next_action = "observe_fresh"
        instruction = (
            "Observe again and inspect the new pixels and binding before planning new input."
        )
    elif not terminal and reason in _FOCUS:
        next_action = "observe_intended_application"
        instruction = (
            "Let the user return focus to the intended application, then observe without "
            "crop and verify the application and target. Do not steal focus."
        )
    recoverable = next_action != "operator_intervention_required"
    if recoverable:
        instruction += (
            " This is not task failure. Inspect fresh evidence, then CONTINUE the task "
            "with new action ids."
        )
    return {
        "recoverable": recoverable,
        "terminal": not recoverable,
        "next_action": next_action,
        "instruction": (
            instruction + " Do not replay the previous action or reuse stale coordinates."
        ),
        "replay_permitted": False,
    }


def _receipt_nodes(value, local_release=False):
    """Walk nested batch and cleanup receipts, excluding observation payloads."""
    if isinstance(value, dict):
        execution = value.get("execution")
        local_release = local_release or (
            value.get("released") is True or value.get("release_confirmed") is True
            or isinstance(execution, dict) and execution.get("released") is True
        )
        yield value, local_release
        for key, child in value.items():
            if key in {"execution", "verification", "cleanup", "diagnostics",
                       "receipt", "receipts", "steps", "results", "release"}:
                yield from _receipt_nodes(child, local_release)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from _receipt_nodes(child)


def safety_terminal(result: dict) -> bool:
    """Negative safety evidence wins, regardless of reason or sibling releases."""
    for item, local_release in _receipt_nodes(result):
        # Present but malformed safety evidence is not equivalent to absence.
        for key in ("released", "release_confirmed", "release_ack", "held_input",
                    "unknown_release", "uncertain_outcome", "terminal"):
            if key in item and type(item[key]) is not bool:
                return True
        if "release" in item and not isinstance(item["release"], dict) and (
            item["release"] not in ("confirmed", "released", "complete", "completed")
        ):
            return True
        if (
            item.get("released") is False
            or item.get("release_confirmed") is False
            or item.get("release_ack") is False and not local_release
            or item.get("held_input") is True
            or item.get("unknown_release") is True
            or item.get("uncertain_outcome") is True
            or item.get("terminal") is True
            or "state" in item and item["state"] not in (
                "starting", "active", "paused", "closed", "cancelled", "fresh_target_required",
            )
            or "status" in item and item["status"] not in (
                "executed", "verified", "not_satisfied", "interrupted", "unavailable",
                "rejected", "failed", "satisfied", "visual_review_required", "complete",
                "completed", "ok", "success", "released", "confirmed",
            )
            or item.get("release") in ("unknown", "held", "failed", "unconfirmed")
        ):
            return True
        cleanup = item.get("cleanup")
        if isinstance(cleanup, dict) and (
            cleanup.get("complete") is not True
            or cleanup.get("status") in ("failed", "incomplete", "unknown")
        ):
            return True
        if cleanup in (False, "failed", "incomplete", "unknown"):
            return True
    return False


def safe_input_receipt(result: dict) -> bool:
    """Require affirmative aggregate release or non-dispatch, not missing risk."""
    if safety_terminal(result):
        return False
    execution = result.get("execution")
    cleanup = result.get("cleanup")
    aggregates = [result]
    if isinstance(execution, dict):
        aggregates.append(execution)
    if isinstance(cleanup, dict) and cleanup.get("complete") is True:
        aggregates.append(cleanup)
    if any(item.get("released") is True or item.get("release_confirmed") is True
           for item in aggregates):
        return True
    # A not-sent suffix or contradictory top-level flag cannot settle an earlier
    # sent step. Without independent release, all present dispatch evidence must
    # agree with the aggregate non-dispatch receipt.
    for item, _ in _receipt_nodes(result):
        if any(key in item and item[key] is not False for key in ("injected", "sent")):
            return False
    return any(item.get("injected") is False or item.get("sent") is False
               for item in aggregates)


def failure_guidance(result: dict, *, terminal: bool = False) -> dict:
    """Keep native reasons and receipts intact, adding a conservative summary."""
    evidence = result.get("verification")
    evidence = evidence if isinstance(evidence, dict) else {}
    reason = result.get("reason") or evidence.get("reason") or result.get("error")
    if not isinstance(reason, str):
        reason = "computer_not_satisfied"
    terminal = terminal or safety_terminal(result)
    summary = guidance(reason, terminal=terminal, safe_receipt=safe_input_receipt(result))
    if not summary["terminal"]:
        for source in (result, evidence, result.get("diagnostics")):
            if (isinstance(source, dict) and isinstance(source.get("next_action"), str)
                    and source["next_action"] not in {
                        "", "stop", "operator_intervention_required",
                    }):
                summary["next_action"] = source["next_action"]
                break
        execution = result.get("execution")
        if (result.get("released") is True or result.get("release_confirmed") is True
                or isinstance(execution, dict) and execution.get("released") is True):
            summary["instruction"] = (
                "Owned input is cleanly released according to the receipt. "
                + summary["instruction"]
            )
        elif (result.get("injected") is False or result.get("sent") is False
              or isinstance(execution, dict) and (
                  execution.get("injected") is False or execution.get("sent") is False
              )):
            summary["instruction"] = (
                "The previous requested input was not sent. " + summary["instruction"]
            )
        if (result.get("fresh_session_required") is True
                or result.get("state") in {"closed", "cancelled"}):
            summary["instruction"] += (
                " Obtain a fresh authorized session before observing; "
                "do not act on the closed binding."
            )
    return {**result, **summary}
