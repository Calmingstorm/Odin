"""Pin fixed computer-boundary reason codes to the durable audit allowlist."""

import ast
from pathlib import Path

from src.computer.error_guidance import _AUDIT_REASON_CODES, audit_reason_code

COMPUTER_ROOT = Path(__file__).parents[1] / "src" / "computer"
ERROR_CONSTRUCTORS = {
    "ComputerError",
    "ComputerProvisioningError",
    "RenderError",
    "InputBoundaryError",
}

# These are intentionally not audit failure reasons: property_read is an
# accessibility status label, while bounded_lifetime describes an internal
# receiver shutdown event. Neither is surfaced as a tool-boundary refusal.
_INTERNAL_ONLY = {
    "property_read": "accessibility property-read status, not a tool failure",
    "bounded_lifetime": "internal Wayland probe receiver shutdown event",
}


def _fixed_boundary_codes():
    codes = set()
    for path in COMPUTER_ROOT.rglob("*.py"):
        if path.name == "error_guidance.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if (
                isinstance(node.func, ast.Name)
                and node.func.id in ERROR_CONSTRUCTORS
                and node.args
                and isinstance(node.args[0], ast.Constant)
                and isinstance(node.args[0].value, str)
            ):
                # Some codes include explanatory text after a colon. Runtime
                # prose is never retained, only the stable code prefix.
                code = node.args[0].value.split(":", 1)[0]
                if code.isidentifier() and code.islower():
                    codes.add(code)
            for keyword in node.keywords:
                value = keyword.value
                if (
                    keyword.arg == "reason"
                    and isinstance(value, ast.Constant)
                    and isinstance(value.value, str)
                ):
                    if value.value.isidentifier() and value.value.islower():
                        codes.add(value.value)
    return codes


def test_all_fixed_computer_boundary_codes_are_audited_or_documented_internal():
    fixed = _fixed_boundary_codes()
    assert fixed - _AUDIT_REASON_CODES == set(_INTERNAL_ONLY)
    assert not (_AUDIT_REASON_CODES & set(_INTERNAL_ONLY))
    assert all(_INTERNAL_ONLY.values())


def test_every_allowlisted_code_survives_and_runtime_text_stays_generic():
    assert all(audit_reason_code(code) == code for code in _AUDIT_REASON_CODES)
    assert audit_reason_code("desktop content supplied at runtime") == "computer_rejected"
