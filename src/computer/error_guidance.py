"""Presentation-only recovery guidance. Never grants input or retries actions."""

from __future__ import annotations

import re

from .admission import InputAdmissionError
from .models import ComputerError


class InputBoundaryError(ComputerError):
    """Controller refusal with explicit, server-owned input-boundary evidence.

    Only use where the controller has established non-dispatch or clean release.
    A reason string alone must never acquire these facts in the presentation layer.
    """

    def __init__(self, code: str, *, execution: dict, state: str):
        super().__init__(code)
        self.execution = dict(execution)
        self.state = state


_SELECTION = frozenset(
    {
        "target_selection_required",
        "target_selection_stale",
        "target_selection_changed",
        "invalid_source_selection",
        "source_selection_unavailable",
        "hyprland_explicit_output_changed",
        "hyprland_stale_topology_epoch",
        "hyprland_stale_or_ineligible_candidate",
    }
)
_OBSERVATION = frozenset(
    {
        "stale_observation",
        "stale_source_binding",
        "geometry_changed",
        "visual_target_changed",
        "sequence_visual_target_changed",
        "observation_expired",
        "wayland_scope_evidence_stale",
        "wayland_scope_evidence_expired",
        "hyprland_fresh_application_observation_required",
        "hyprland_observation_expired",
        "hyprland_observation_changed",
        "hyprland_capture_settle_budget_exhausted",
        "hyprland_scope_evidence_expired",
        "hyprland_capture_scope_changed",
        "hyprland_fractional_or_unknown_geometry",
        "hyprland_snapshot_capacity",
        "hyprland_fresh_observation_required",
        "hyprland_application_group_target_changed",
    }
)
_FOCUS = frozenset(
    {
        "input_focus_unavailable",
        "hyprland_focus_changed",
        "hyprland_focus_changed_before_dispatch",
        "hyprland_focus_outside_source",
        "human_focus_changed",
        "hyprland_native_focus_not_confirmed",
        "hyprland_unknown_or_nonnative_focus",
    }
)
_SESSION_STATE = frozenset(
    {
        "stale_generation",
        "resume_unavailable",
        "hyprland_resume_retryable",
    }
)
_GROUP_PREFLIGHT = frozenset(
    {
        "hyprland_stale_snapshot",
        "hyprland_application_group_target_epoch",
        "hyprland_application_group_member_refused",
        "hyprland_application_group_target_output",
        "hyprland_application_group_target_layer_surface",
        "hyprland_application_group_target_unknown",
        "hyprland_application_group_target_surface",
        "hyprland_application_group_target_ineligible",
        "hyprland_application_group_target_focus_unconfirmed",
    }
)
_PREFLIGHT_RETRY = frozenset(
    {
        "unsupported_operation",
        "target_inventory_unavailable",
        "inventory_targets_unsupported",
        "operation_unavailable",
        "focus_preflight_refused",
        "focus_candidate_unavailable",
        "focus_candidate_changed",
        "focus_full_observation_required",
        "focus_visual_target_changed",
        "focus_transition_unavailable",
        "focus_requires_new_observation",
    }
)
_INPUT_OUTCOMES = frozenset({"not_dispatched", "released_verified", "release_unknown"})

# Only stable, fixed reason codes enter durable audit metadata. Unknown values
# remain useful in the immediate response, but collapse to a generic audit code.
_AUDIT_REASON_CODES = frozenset(
    {
        "computer_rejected",
        "computer_not_satisfied",
        "outcome_unknown",
        "permission_denied",
        "unsupported_operation",
        "target_inventory_unavailable",
        "inventory_targets_unsupported",
        "operation_unavailable",
        "input_not_granted",
        "capture_not_granted",
        "input_focus_unavailable",
        "focus_transition_unavailable",
        "target_selection_required",
        "target_selection_stale",
        "target_selection_changed",
        "invalid_source_selection",
        "source_selection_unavailable",
        "stale_observation",
        "stale_source_binding",
        "geometry_changed",
        "visual_target_changed",
        "sequence_visual_target_changed",
        "observation_expired",
        "human_focus_changed",
        "hyprland_focus_changed",
        "hyprland_focus_changed_before_dispatch",
        "hyprland_native_focus_not_confirmed",
        "hyprland_unknown_or_nonnative_focus",
        "hyprland_dispatch_interrupted_after_release",
        "effect_unknown_reconcile_no_replay",
        "input_release_unknown",
        "input_outcome_unknown",
        "unexpected_dialog_transition",
        "hyprland_fresh_modal_binding_required",
        "stale_generation",
        "resume_unavailable",
        "hyprland_resume_retryable",
        "hyprland_inventory_owned_recovery_pending",
        "hyprland_owned_recovery_pending",
        "hyprland_inventory_seat_button_held",
        "hyprland_inventory_scope_armed",
        "hyprland_inventory_environment_unavailable",
        "hyprland_inventory_device_input_held_or_unavailable",
        "hyprland_lock_or_input_held",
        "focus_preflight_refused",
        "focus_candidate_unavailable",
        "focus_candidate_changed",
        "focus_full_observation_required",
        "focus_visual_target_changed",
        "focus_transition_unavailable",
        "focus_not_obtained",
        "focus_requires_new_observation",
        # Fixed ComputerError/RenderError/ProvisioningError codes and fixed reason
        # values surfaced by the computer tool boundary. Keep in sync with the
        # AST drift test in test_computer_audit_reason_codes.py.
        "accessible_native_identity_unavailable",
        "accessible_target_changed",
        "accessible_target_unavailable",
        "action_id_conflict",
        "application_environment_unsupported",
        "arguments_too_large",
        "aspect_ratio_cannot_fit_delivered_bounds",
        "aspect_ratio_cannot_fit_png_budget",
        "assisted_input_lifecycle_unproven",
        "attachment_unavailable",
        "backend_capabilities_changed",
        "backend_capabilities_unknown",
        "capture_crop_mismatch",
        "capture_render_mapping_mismatch",
        "capture_transform_outside_source",
        "cleanup_persistence_failed",
        "computer_dependency_unavailable",
        "computer_target_incomplete",
        "controller_lost",
        "delivered_image_too_large",
        "disabled",
        "display_asleep",
        "evidence_changed",
        "evidence_quota",
        "evidence_too_large",
        "evidence_unavailable",
        "existing_session_export_not_granted",
        "explicit_acknowledgment_required",
        "explicit_fresh_target",
        "field_text_verification_required",
        "field_text_verification_requires_replace_field",
        "focus_visual_verification_required",
        "foreground_only",
        "grant_revoked",
        "grant_revoked_or_limit",
        "grounded_actions_unavailable",
        "hyprland_action_revoked_outcome_unknown",
        "hyprland_application_group_target_changed",
        "hyprland_application_identity_unavailable",
        "hyprland_backend_not_startable",
        "hyprland_capture_generation_changed",
        "hyprland_capture_raster_invalid",
        "hyprland_capture_scope_changed",
        "hyprland_capture_settle_budget_exhausted",
        "hyprland_capture_source_not_granted",
        "hyprland_compositor_exited",
        "hyprland_durable_owner_required",
        "hyprland_explicit_output_changed",
        "hyprland_explicit_session_configuration_required",
        "hyprland_explicit_socket_required",
        "hyprland_fresh_application_observation_required",
        "hyprland_fresh_observation_required",
        "hyprland_fresh_target_required",
        "hyprland_generation_revoked",
        "hyprland_handoff_binding_unavailable",
        "hyprland_handoff_not_safe",
        "hyprland_input_extent_mismatch",
        "hyprland_invalid_point",
        "hyprland_native_output_unavailable",
        "hyprland_observation_changed",
        "hyprland_observation_expired",
        "hyprland_original_application_changed",
        "hyprland_original_target_changed",
        "hyprland_original_target_continuity_unproven",
        "hyprland_owned_cleanup_unverified",
        "hyprland_plugin_manifest_required",
        "hyprland_provider_owner_changed",
        "hyprland_reconciliation_required",
        "hyprland_reconnect_outcome_unknown",
        "hyprland_recovered_fresh_observation_required",
        "hyprland_recovery_authority_invalid",
        "hyprland_recovery_authority_unavailable",
        "hyprland_recovery_evidence_invalid",
        "hyprland_recovery_identity_unavailable",
        "hyprland_recovery_pending",
        "hyprland_recovery_revoked",
        "hyprland_recovery_trust_changed",
        "hyprland_recovery_unavailable",
        "hyprland_renewed_session_consent_required",
        "hyprland_resource_witness_invalid",
        "hyprland_scope_evidence_expired",
        "hyprland_scope_unknown_locked_or_stale",
        "hyprland_session_revoked",
        "invalid_arguments",
        "invalid_target",
        "stale_capture_consent",
        "stale_modal_binding",
        "stale_observation_binding",
        "stale_recovery_pending",
        "wayland_focus_changed",
        "wayland_focus_changed_before_dispatch",
        "render_dependency_unavailable",
        "isolated_request_conflicts_with_existing_session",
        "input_mapping_unknown",
        "input_outside_capture_scope",
        "invalid_accessibility_metadata",
        "invalid_application_provenance",
        "invalid_backend_observation",
        "invalid_bounds",
        "invalid_consent_generation",
        "invalid_delivered_bounds",
        "invalid_evidence",
        "invalid_export_name",
        "invalid_hyprland_application_identity",
        "invalid_hyprland_output_grant",
        "invalid_input_lifecycle",
        "invalid_input_separation",
        "invalid_limit",
        "invalid_modal_classification",
        "invalid_modifiers",
        "invalid_observation_crop",
        "invalid_observation_response",
        "invalid_packed_raster",
        "invalid_provenance",
        "invalid_receipt",
        "invalid_recovery_pending",
        "invalid_render_rotation",
        "invalid_runtime_identity",
        "invalid_sequence",
        "invalid_sequence_length",
        "invalid_source_crop",
        "invalid_source_dimensions",
        "invalid_state",
        "invalid_task_context",
        "invalid_text",
        "isolated_app_required",
        "legacy_acknowledgment_unavailable",
        "modal_not_present",
        "neutral_observation_required",
        "not_found",
        "observation_not_delivered",
        "operator_surface_required",
        "pending_no_replay",
        "pixel_field_requires_single_action",
        "pixel_field_visual_verification_required",
        "png_budget_unachievable",
        "post_action_capture_unavailable",
        "postcondition_binding_changed",
        "postcondition_region_changed_geometry",
        "postcondition_target_mismatch",
        "raster_render_failed",
        "recovery_unavailable",
        "requested_mark_requires_visual_inspection",
        "runtime_identity_changed",
        "runtime_identity_required",
        "sequence_backend_limit",
        "sequence_budget_exceeded",
        "sequence_deadline",
        "sequence_sampled_target_changed",
        "sequence_step_not_verified",
        "sequence_target_changed",
        "session_busy",
        "source_allocation_limit",
        "source_geometry_required",
        "start_unavailable",
        "storage_not_private",
        "storage_schema_unsupported",
        "storage_selection_required",
        "storage_unavailable",
        "target_changed_observe_again",
        "target_selection_forbidden",
        "target_selection_invalid",
        "target_selection_unsupported",
        "task_expired",
        "topology_changed",
        "unexpected_modal",
        "unsafe_storage_path",
        "unsupported_app",
        "unsupported_backend_contract",
        "unsupported_key",
        "unsupported_postcondition",
        "unsupported_raster_mode",
        "visual_target_unavailable",
        "wayland_action_revoked_outcome_unknown",
        "wayland_backend_not_startable",
        "wayland_capture_allocation_limit",
        "wayland_capture_clock_unverified",
        "wayland_capture_dimensions_changed",
        "wayland_capture_generation_changed",
        "wayland_capture_path_lost",
        "wayland_capture_source_changed",
        "wayland_capture_source_not_granted",
        "wayland_capture_sources_unavailable",
        "wayland_compositor_identity_changed",
        "wayland_existing_session_target_required",
        "wayland_explicit_session_configuration_required",
        "wayland_fresh_qualified_application_observation_required",
        "wayland_generation_revoked",
        "wayland_guardian_input_path_lost",
        "wayland_input_extent_mismatch",
        "wayland_invalid_configuration",
        "wayland_invalid_point",
        "wayland_invalid_polyline",
        "wayland_invalid_scroll",
        "wayland_invalid_unicode_text",
        "wayland_observation_changed",
        "wayland_observation_expired",
        "wayland_owned_cleanup_unverified",
        "wayland_pixel_fields_unavailable",
        "wayland_point_outside_authenticated_application",
        "wayland_pointer_modifiers_unavailable",
        "wayland_probe_evidence_invalid",
        "wayland_probe_identity_mismatch",
        "wayland_renewed_session_consent_required",
        "wayland_runtime_identity_missing",
        "wayland_runtime_process_limit",
        "wayland_scope_evidence_expired",
        "wayland_scope_evidence_stale",
        "wayland_session_identity_changed",
        "wayland_session_revoked",
        "wayland_source_mapping_unavailable",
        "wayland_stale_source_binding",
        "wayland_unsupported_grounded_action",
        "wayland_visual_postcondition_required",
    }
)


def exception_reason(error: BaseException) -> str:
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


def guidance(
    reason: str,
    *,
    terminal: bool = False,
    safe_receipt: bool = False,
    input_outcome: str | None = None,
) -> dict:
    # A reason selects useful guidance, never establishes dispatch/release facts.
    # Even familiar preflight codes can escape a later capture or batch step.
    # Only affirmative receipt evidence may classify a failure as recoverable.
    if input_outcome not in _INPUT_OUTCOMES:
        input_outcome = "released_verified" if safe_receipt else "release_unknown"
    terminal = terminal or (not safe_receipt and input_outcome == "release_unknown")
    next_action = "operator_intervention_required" if terminal else "observe_fresh"
    instruction = (
        "Stop input. Have the operator inspect safety and release state. RELEASE-ALL "
        "is appropriate only when release is unverified or the input outcome is unknown; "
        "then close the fenced session and start anew with renewed consent and fresh observation."
        if terminal
        else "The receipt establishes a safe input boundary. This is not task failure. "
        "Observe once, inspect what happened, then CONTINUE the task with new action ids. "
        "Do not assume the previous input was sent or released without a receipt."
    )
    if input_outcome == "not_dispatched" and reason in _PREFLIGHT_RETRY:
        terminal = False
        next_action = (
            "observe_fresh"
            if reason in {"focus_requires_new_observation", "focus_not_obtained"}
            else "retry_with_supported_operation"
        )
        instruction = (
            "The focus transition was dispatched and input release is verified, but focus is not "
            "confirmed. It granted no typing authority; obtain and inspect a fresh observation "
            "before any next action."
            if reason == "focus_not_obtained"
            else "The focus transition completed with verified input release. "
            "It did not grant typing "
            "authority; obtain and inspect a fresh observation before any next action."
            if reason == "focus_requires_new_observation"
            else "Preflight rejected this operation before dispatch; no input was sent. It is safe "
            "to retry with a supported operation. No input-release intervention is needed."
        )
    if reason in {"hyprland_inventory_owned_recovery_pending", "hyprland_owned_recovery_pending"}:
        terminal = True
        next_action = "inspect_release_evidence"
        instruction = (
            "Attributed native recovery did not establish clean release. No new press "
            "or action replay was authorized. Pending injection evidence is retained. "
            "Inspect the native journal and physical-device availability/held state; "
            "when temporary input is clear, request fresh inventory to retry only the "
            "outstanding releases. Do not erase evidence or manufacture ownership."
        )
    elif reason == "hyprland_inventory_seat_button_held":
        instruction = (
            "Hyprland still records a pressed pointer button after native recovery "
            "preflight. Recovery may send only durably attributed outstanding releases "
            "when device state is clear; it never injects a new press or replays an action. "
            "An unrecorded hold cannot be attributed retroactively. Do not synthesize "
            "an unattributed release or erase the compositor ledger. Check the native "
            "release evidence and held/device-access state before further input. "
            "Plugin reload alone does not clear it."
        )
    elif reason in {
        "hyprland_inventory_scope_armed",
        "hyprland_inventory_environment_unavailable",
        "hyprland_inventory_device_input_held_or_unavailable",
        "hyprland_lock_or_input_held",
    }:
        instruction = (
            "No new action press was authorized. Check the native preflight blocker: "
            "active input scope, desktop lock/input constraint, or held/unavailable device "
            "state. Recovery releases only durably attributed outstanding inputs when "
            "device state is clear. Let human input finish or unlock normally, then request "
            "fresh inventory. Do not infer a quarantined session or require a compositor "
            "restart from this inventory refusal. Do not force-release another device."
        )
    elif not terminal and reason == "hyprland_dispatch_interrupted_after_release":
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
        "unexpected_dialog_transition",
        "hyprland_fresh_modal_binding_required",
    }:
        next_action = "inspect_returned_view_and_use_new_modal_binding"
        instruction = (
            "The dialog requires a fresh explicit binding. Inspect the returned "
            "pixels and use that NEW observation and its exact expected_modal for a new "
            "action. If no current pixels were returned, observe again. Never repeat the "
            "dialog-opening action."
        )
    elif not terminal and reason in {"focus_not_obtained", "focus_requires_new_observation"}:
        next_action = "observe_fresh"
        instruction = (
            "Input release is verified, but this focus transition grants no typing authority. "
            "Obtain and inspect a fresh observation and binding before any next action. "
            "Never replay the focus action."
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
    # A specialized inspection action does not clear a terminal release state.
    recoverable = not terminal
    if recoverable:
        instruction += (
            " This is not task failure. Inspect fresh evidence, then CONTINUE the task "
            "with new action ids."
        )
    return {
        "recoverable": recoverable,
        "terminal": terminal,
        "next_action": next_action,
        "instruction": (
            instruction + " Do not replay the previous action or reuse stale coordinates."
        ),
        "replay_permitted": False,
        "input_outcome": input_outcome,
    }


def _receipt_nodes(value, local_release=False):
    """Walk nested batch and cleanup receipts, excluding observation payloads."""
    if isinstance(value, dict):
        execution = value.get("execution")
        local_release = local_release or (
            value.get("released") is True
            or value.get("release_confirmed") is True
            or isinstance(execution, dict)
            and execution.get("released") is True
        )
        yield value, local_release
        for key, child in value.items():
            if key in {
                "execution",
                "verification",
                "cleanup",
                "diagnostics",
                "receipt",
                "receipts",
                "steps",
                "results",
                "release",
            }:
                yield from _receipt_nodes(child, local_release)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from _receipt_nodes(child)


def safety_terminal(result: dict) -> bool:
    """Negative safety evidence wins, regardless of reason or sibling releases."""
    # Exact, controller-owned capability response: it describes a rejected
    # operation before any input session or dispatch existed. Keep the envelope
    # narrow so arbitrary caller data cannot claim non-dispatch.
    if (
        isinstance(result, dict)
        and result
        == {
            "status": "unsupported_operation",
            "backend": result.get("backend") if isinstance(result, dict) else None,
            "operation": "inventory_targets",
            "dispatch": "none",
            "supported_next_step": "start",
        }
        and result.get("backend") in {"x11", "wayland", "hyprland"}
    ):
        return False
    for item, local_release in _receipt_nodes(result):
        # Present but malformed safety evidence is not equivalent to absence.
        for key in (
            "released",
            "release_confirmed",
            "release_ack",
            "held_input",
            "unknown_release",
            "uncertain_outcome",
            "terminal",
        ):
            if key in item and type(item[key]) is not bool:
                return True
        if (
            "release" in item
            and not isinstance(item["release"], dict)
            and (item["release"] not in ("confirmed", "released", "complete", "completed"))
        ):
            return True
        if (
            item.get("released") is False
            or item.get("release_confirmed") is False
            or item.get("release_ack") is False
            and not local_release
            or item.get("held_input") is True
            or item.get("unknown_release") is True
            or item.get("uncertain_outcome") is True
            or item.get("terminal") is True
            or "state" in item
            and item["state"]
            not in (
                "starting",
                "active",
                "paused",
                "closed",
                "cancelled",
                "fresh_target_required",
            )
            or "status" in item
            and item["status"]
            not in (
                "executed",
                "verified",
                "not_satisfied",
                "interrupted",
                "unavailable",
                "rejected",
                "failed",
                "satisfied",
                "visual_review_required",
                "complete",
                "completed",
                "ok",
                "success",
                "released",
                "confirmed",
                "observed",
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
    if any(
        item.get("released") is True or item.get("release_confirmed") is True for item in aggregates
    ):
        return True
    # A not-sent suffix or contradictory top-level flag cannot settle an earlier
    # sent step. Without independent release, all present dispatch evidence must
    # agree with the aggregate non-dispatch receipt.
    for item, _ in _receipt_nodes(result):
        if any(key in item and item[key] is not False for key in ("injected", "sent")):
            return False
    return any(item.get("injected") is False or item.get("sent") is False for item in aggregates)


def input_outcome(result: dict) -> str:
    """Classify input dispatch/release from receipts, never from reason text."""
    if not isinstance(result, dict):
        return "release_unknown"
    if isinstance(result, dict) and (
        result
        == {
            "status": "unsupported_operation",
            "backend": result.get("backend"),
            "operation": "inventory_targets",
            "dispatch": "none",
            "supported_next_step": "start",
        }
        and result.get("backend") in {"x11", "wayland", "hyprland"}
    ):
        return "not_dispatched"
    nodes = list(_receipt_nodes(result))
    if safety_terminal(result):
        return "release_unknown"
    dispatch_evidence = [
        item[key] for item, _ in nodes for key in ("injected", "sent") if key in item
    ]
    if dispatch_evidence and all(value is False for value in dispatch_evidence):
        return "not_dispatched"
    if any(
        item.get("released") is True or item.get("release_confirmed") is True for item, _ in nodes
    ):
        return "released_verified"
    return "release_unknown"


def audit_reason_code(reason: object) -> str:
    """Return a fixed public reason for durable audit; never retain arbitrary text."""
    if isinstance(reason, str) and reason in _AUDIT_REASON_CODES:
        return reason
    return "computer_rejected"


def failure_guidance(result: dict, *, terminal: bool = False) -> dict:
    """Keep native reasons and receipts intact, adding a conservative summary."""
    evidence = result.get("verification")
    evidence = evidence if isinstance(evidence, dict) else {}
    reason = (
        result.get("reason")
        or evidence.get("reason")
        or result.get("error")
        or (result.get("status") if result.get("status") in _PREFLIGHT_RETRY else None)
    )
    if not isinstance(reason, str):
        reason = "computer_not_satisfied"
    outcome = input_outcome(result)
    terminal = terminal or safety_terminal(result)
    summary = guidance(
        reason,
        terminal=terminal,
        safe_receipt=safe_input_receipt(result),
        input_outcome=outcome,
    )
    if not summary["terminal"]:
        for source in (result, evidence, result.get("diagnostics")):
            if (
                isinstance(source, dict)
                and isinstance(source.get("next_action"), str)
                and source["next_action"]
                not in {
                    "",
                    "stop",
                    "operator_intervention_required",
                }
            ):
                summary["next_action"] = source["next_action"]
                break
        execution = result.get("execution")
        if (
            result.get("released") is True
            or result.get("release_confirmed") is True
            or isinstance(execution, dict)
            and execution.get("released") is True
        ):
            summary["instruction"] = (
                "Owned input is cleanly released according to the receipt. "
                + summary["instruction"]
            )
        elif (
            result.get("injected") is False
            or result.get("sent") is False
            or isinstance(execution, dict)
            and (execution.get("injected") is False or execution.get("sent") is False)
        ):
            summary["instruction"] = (
                "The previous requested input was not sent. " + summary["instruction"]
            )
        if result.get("fresh_session_required") is True or result.get("state") in {
            "closed",
            "cancelled",
        }:
            summary["instruction"] += (
                " Obtain a fresh authorized session before observing; "
                "do not act on the closed binding."
            )
    return {**result, **summary}
