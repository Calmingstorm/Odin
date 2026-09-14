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


def guidance(reason: str, *, terminal: bool = False) -> dict:
    next_action = "operator_intervention_required"
    instruction = (
        "Stop input. Have the operator inspect safety and release state. If release is "
        "unknown, the operator must RELEASE-ALL, close the fenced session, and start "
        "anew with renewed consent and fresh observation."
    )
    if not terminal and reason == "effect_unknown_reconcile_no_replay":
        next_action = "inspect_session_and_reconcile_effect"
        instruction = (
            "Input release is confirmed, but the action's effect is uncertain. Read session "
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
            "No requested input was dispatched. The observed application target is stale, "
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
    return {
        "recoverable": recoverable,
        "terminal": not recoverable,
        "next_action": next_action,
        "instruction": (
            instruction + " Do not replay the previous action or reuse stale coordinates."
        ),
        "replay_permitted": False,
    }


def failure_guidance(result: dict, *, terminal: bool = False) -> dict:
    """Keep native reasons and receipts intact, adding a conservative summary."""
    evidence = result.get("verification")
    evidence = evidence if isinstance(evidence, dict) else {}
    reason = result.get("reason") or evidence.get("reason") or result.get("error")
    if not isinstance(reason, str):
        reason = "computer_not_satisfied"
    # Unknown outcome/release takes precedence over any recoverable stale reason.
    execution = result.get("execution")
    released_effect_unknown = (
        reason == "effect_unknown_reconcile_no_replay"
        and isinstance(execution, dict) and execution.get("released") is True
    )
    if isinstance(execution, dict):
        terminal = terminal or execution.get("released") is False
    for item in (result, evidence):
        cleanup = item.get("cleanup")
        terminal = terminal or item.get("status") in {"unknown", "interrupted"} and not (
            released_effect_unknown and item.get("status") == "interrupted"
        )
        terminal = terminal or item.get("state") in {"unknown", "quarantined"}
        terminal = terminal or item.get("uncertain_outcome") is True
        terminal = terminal or item.get("release_confirmed") is False
        # Native ACK and receiver proof are diagnostics, not a second safety
        # verdict over authoritative local cleanup. Never override actual
        # uncertainty/held-input or an explicitly failed release above.
        local_release = (
            item.get("released") is True or item.get("release_confirmed") is True
            or isinstance(execution, dict) and execution.get("released") is True
        )
        terminal = terminal or item.get("released") is False
        terminal = terminal or item.get("release_ack") is False and not local_release
        terminal = terminal or item.get("terminal") is True
        terminal = terminal or (isinstance(cleanup, dict) and cleanup.get("complete") is not True)
    return {**result, **guidance(reason, terminal=terminal)}
