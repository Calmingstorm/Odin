"""Pin fixed computer-boundary reason codes to the durable audit allowlist."""

import ast
from pathlib import Path

from src.computer.error_guidance import _AUDIT_REASON_CODES, audit_reason_code

COMPUTER_ROOT = Path(__file__).parents[1] / "src" / "computer"
WRAPPERS = {"preflight", "_fail", "_identity_error"}

# These are intentionally not audit failure reasons: property_read is an
# accessibility status label, while bounded_lifetime describes an internal
# receiver shutdown event. Neither is surfaced as a tool-boundary refusal.
_INTERNAL_ONLY = {
    "property_read": "accessibility property-read status, not a tool failure",
    "bounded_lifetime": "internal Wayland probe receiver shutdown event",
}

# Fixed codes emitted by lower-level lifecycle/inspection helpers are not
# stable tool-boundary reasons. Keep the distinction explicit rather than
# accidentally promoting every string literal in implementation internals.
_INTERNAL_REASON_CODES = {
    "cgroup_absence_unproven",
    "explicit_x11_capture_unavailable", "host_rebooted",
    "hyprland_application_group_changed", "hyprland_application_group_invalid",
    "hyprland_capture_configuration_invalid", "hyprland_capture_header_invalid",
    "hyprland_capture_helper_failed", "hyprland_capture_peer_mismatch",
    "hyprland_capture_transport_failed", "hyprland_cross_compositor_retirement_unavailable",
    "hyprland_executable_changed", "hyprland_executable_untrusted",
    "hyprland_explicit_build_trust_required", "hyprland_explicit_output_required",
    "hyprland_explicit_session_required", "hyprland_focus_outside_source",
    "hyprland_guardian_configuration_invalid", "hyprland_guardian_mapping_changed",
    "hyprland_guardian_revoked", "hyprland_guardian_scope_expired",
    "hyprland_guardian_scope_invalid", "hyprland_guardian_scope_unavailable",
    "hyprland_guardian_uid_unavailable", "hyprland_identity_deadline",
    "hyprland_identity_invalid_budget", "hyprland_identity_transport_failed",
    "hyprland_identity_unavailable", "hyprland_invalid_expected_peer",
    "hyprland_invalid_explicit_output", "hyprland_native_no_input_sent",
    "hyprland_owner_adoption_reply_invalid", "hyprland_owner_capture_late_or_retired",
    "hyprland_owner_descriptor_invalid", "hyprland_owner_identity_invalid",
    "hyprland_owner_protocol_unavailable", "hyprland_owner_reconnect_unavailable",
    "hyprland_owner_reply_invalid", "hyprland_owner_retirement_reply_invalid",
    "hyprland_parent_chain_unverified", "hyprland_peer_mismatch",
    "hyprland_peer_unavailable", "hyprland_pixel_out_of_bounds",
    "hyprland_process_changed", "hyprland_remote_portal_unqualified",
    "hyprland_retirement_protocol_unavailable", "hyprland_scope_closed",
    "hyprland_scope_instance_status_invalid", "hyprland_scope_plugin_incarnation_changed",
    "hyprland_scope_reply_invalid", "hyprland_scope_selection_invalid",
    "hyprland_scope_window_continuity_unavailable", "hyprland_version_reply_invalid",
    "input_guardian_unavailable", "inspection_timeout", "inspection_unavailable",
    "kwin_connect_to_eis_requires_6_1", "launch_identity_incomplete",
    "legacy_runtime_identity_missing", "operator_reconciliation_unsupported",
    "operator_verified_external_cleanup", "owned_input_release_unproven",
    "owned_runtime_gone", "persistent_input_state_unproven",
    "portal_remotedesktop_eis_unavailable", "recorded_processes_gone",
    "sequence_not_dispatched", "target_unavailable", "unit_absence_unproven",
    "wayland_application_changed",
    "wayland_bounds_unavailable", "wayland_compositor_backend_unavailable",
    "wayland_compositor_backend_unidentified", "wayland_compositor_executable_unqualified",
    "wayland_compositor_exited", "wayland_compositor_identity_unavailable",
    "wayland_compositor_name_mismatch", "wayland_compositor_start_changed",
    "wayland_compositor_uid_changed", "wayland_eis_compositor_peer_mismatch",
    "wayland_explicit_session_required", "wayland_focus_stale", "wayland_focus_unavailable",
    "wayland_guardian_binary_unavailable", "wayland_guardian_disconnected",
    "wayland_guardian_invalid_action", "wayland_guardian_not_active",
    "wayland_guardian_path_invalid", "wayland_guardian_path_untrusted",
    "wayland_guardian_revoked", "wayland_guardian_scope_lease_unavailable",
    "wayland_guardian_single_use", "wayland_guardian_uid_unavailable",
    "wayland_guardian_unexpected_receipt", "wayland_mapped_object_changed",
    "wayland_mapped_object_deleted", "wayland_mapped_object_untrusted_or_replaced",
    "wayland_mapping_identifier_invalid", "wayland_process_identity_unavailable",
    "wayland_process_identity_untrusted", "wayland_provider_owner_changed",
    "wayland_provider_untrusted", "wayland_source_geometry_unavailable",
    "wayland_source_unavailable",
}


def _fixed_boundary_codes():
    trees = {}
    class_bases = {}
    for path in COMPUTER_ROOT.rglob("*.py"):
        if path.name == "error_guidance.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        trees[path] = tree
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                class_bases[node.name] = {
                    base.id for base in node.bases if isinstance(base, ast.Name)
                }

    error_classes = {"ComputerError"}
    while True:
        subclasses = {name for name, bases in class_bases.items() if bases & error_classes}
        new = subclasses - error_classes
        if not new:
            break
        error_classes.update(new)

    codes = set()
    for tree in trees.values():
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in WRAPPERS:
                defaults = node.args.defaults + [
                    default for default in node.args.kw_defaults if default is not None
                ]
                for default in defaults:
                    _add_code(codes, default)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id in error_classes and node.args:
                    _add_code(codes, node.args[0])
                elif node.func.id in WRAPPERS and node.args:
                    _add_code(codes, node.args[0])
                for keyword in node.keywords:
                    if keyword.arg == "reason":
                        _add_code(codes, keyword.value)
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values):
                    if isinstance(key, ast.Constant) and key.value == "reason":
                        _add_code(codes, value)
            if isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                if any(
                    isinstance(target, ast.Name) and target.id == "reason" for target in targets
                ):
                    _add_code(codes, node.value)
    return codes


def _add_code(codes, node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        # Some codes include explanatory text after a colon. Runtime prose is
        # never retained, only the stable code prefix.
        code = node.value.split(":", 1)[0]
        if code.isidentifier() and code.islower():
            codes.add(code)


def test_all_fixed_computer_boundary_codes_are_audited_or_documented_internal():
    fixed = _fixed_boundary_codes()
    assert fixed - _AUDIT_REASON_CODES == _INTERNAL_REASON_CODES - _AUDIT_REASON_CODES
    assert not (_AUDIT_REASON_CODES & set(_INTERNAL_ONLY))
    assert all(_INTERNAL_ONLY.values())


def test_every_allowlisted_code_survives_and_runtime_text_stays_generic():
    assert all(audit_reason_code(code) == code for code in _AUDIT_REASON_CODES)
    assert audit_reason_code("desktop content supplied at runtime") == "computer_rejected"
