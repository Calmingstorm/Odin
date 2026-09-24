"""Pin fixed computer-boundary reason codes to the durable audit allowlist."""

import ast
import hashlib
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

# Internal codes must each justify why they are not a stable tool-boundary
# refusal. Never subtract the allowlist: removing any approved code must fail.
_INTERNAL_REASON_CODES = {
    "cgroup_absence_unproven": "Cgroup cleanup helper cannot prove absence, not a tool refusal.",
    "host_rebooted": "Persisted ownership recovery flag, not an action refusal.",
    "inspection_timeout": "Private inspection helper timeout, not a tool reason.",
    "inspection_unavailable": "Private inspection helper unavailable, not an action refusal.",
    "launch_identity_incomplete": "Persisted launch-provenance diagnostic, not a tool refusal.",
    "legacy_runtime_identity_missing": "Migration-era identity diagnostic, not a tool refusal.",
    "operator_reconciliation_unsupported": "Operator cleanup policy state, not an action refusal.",
    "operator_verified_external_cleanup": "Operator cleanup attestation, not an action refusal.",
    "owned_input_release_unproven": "Internal release-proof state, not an action refusal.",
    "owned_runtime_gone": "Owner retirement state, not an action refusal.",
    "persistent_input_state_unproven": "Durable release ledger state, not an action refusal.",
    "recorded_processes_gone": "Cleanup bookkeeping state, not an action refusal.",
    "unit_absence_unproven": "Systemd cleanup evidence diagnostic, not an action refusal.",
    "hyprland_postcapture_unavailable": "Postcapture helper state, not a boundary refusal.",
    "native_field_failed": "Accessibility field helper result, not a tool refusal.",
    "no_requested_path_raster_change": "Path-raster verification detail, not a tool refusal.",
    "operator_identity_unavailable": "Operator inspection identity detail, not an action refusal.",
    "property_unavailable": "Accessibility property helper status, not a tool refusal.",
    "read_timeout": "Accessibility property-read timeout, not a tool refusal.",
    "stroke_evidence_binding_unavailable": "Stroke raster evidence diagnostic, not a tool refusal.",
    "stroke_evidence_geometry_unavailable": "Stroke raster geometry detail, not a tool refusal.",
    "stroke_evidence_pixels_unavailable": "Stroke raster pixel diagnostic, not a tool refusal.",
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
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "_NATIVE_REFUSALS"
                for target in node.targets
            ):
                collection = node.value
                if isinstance(collection, ast.Call) and collection.args:
                    collection = collection.args[0]
                for item in getattr(collection, "elts", ()):
                    # Native refusal strings are hyphenated receiver errors,
                    # translated to the stable hyprland_ audit vocabulary.
                    if isinstance(item, ast.Constant) and isinstance(item.value, str):
                        codes.add("hyprland_" + item.value.replace("-", "_"))
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id == "HyprlandPluginError" and node.args:
                    _add_code(codes, node.args[0])
            if isinstance(node, ast.Assign):
                if any(
                    isinstance(target, ast.Subscript)
                    and isinstance(target.slice, ast.Constant)
                    and target.slice.value == "reason"
                    for target in node.targets
                ):
                    _add_code(codes, node.value)
            if isinstance(node, (ast.Assign, ast.AnnAssign, ast.NamedExpr)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                if any(
                    isinstance(target, ast.Name) and target.id in {"reason", "code"}
                    for target in targets
                ):
                    _add_code(codes, node.value)
    return codes


def _add_code(codes, node):
    if isinstance(node, ast.IfExp):
        _add_code(codes, node.body)
        _add_code(codes, node.orelse)
        return
    if isinstance(node, ast.BoolOp):
        for value in node.values:
            _add_code(codes, value)
        return
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        # Some codes include explanatory text after a colon. Runtime prose is
        # never retained, only the stable code prefix.
        code = node.value.split(":", 1)[0]
        if code.isidentifier() and code.islower():
            codes.add(code)


def test_all_fixed_computer_boundary_codes_are_audited_or_documented_internal():
    fixed = _fixed_boundary_codes()
    assert not (_AUDIT_REASON_CODES & _INTERNAL_REASON_CODES.keys())
    assert fixed - _AUDIT_REASON_CODES == _INTERNAL_REASON_CODES.keys()
    assert not (_AUDIT_REASON_CODES & set(_INTERNAL_ONLY))
    assert all(_INTERNAL_ONLY.values())
    assert all(_INTERNAL_REASON_CODES.values())


def test_regression_codes_cannot_silently_fall_back_to_internal():
    assert {"hyprland_guardian_revoked", "focus_not_obtained",
            "wayland_portal_start_failed", "hyprland_native_start_failed",
            "topology_monitor_unavailable"} <= _AUDIT_REASON_CODES
    fixed = _fixed_boundary_codes()
    assert {"hyprland_stale_snapshot", "hyprland_native_start_failed",
            "wayland_kwin_mapping_unavailable", "probe_deadline_exceeded"} <= fixed


def test_approved_audit_vocabulary_is_not_silently_shrunk():
    # Independent of the scanner: removing a code that is no longer emitted
    # must still fail. Update only after reviewing intentional vocabulary edits.
    assert hashlib.sha256("\n".join(sorted(_AUDIT_REASON_CODES)).encode()).hexdigest() == (
        "f4e49528648970c12035ed87046b60757499473ce6bcde16db81e166144ec0d1"
    )


def test_every_allowlisted_code_survives_and_runtime_text_stays_generic():
    assert all(audit_reason_code(code) == code for code in _AUDIT_REASON_CODES)
    assert audit_reason_code("desktop content supplied at runtime") == "computer_rejected"
