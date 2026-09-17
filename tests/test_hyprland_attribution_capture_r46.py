"""Actual cursor-control status capture, distinct from synthetic parser cases."""

import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/hyprland-scope/cursor-control-status-2026-09-12.json"
SHA256 = "53a2f3f8d569201d9e6efbe43a009b4b9eca11d47b791dd128377808d2d6a338"
PARSER_TEST = ROOT / "tests/test_hyprland_scope_parser_r45.py"

spec = importlib.util.spec_from_file_location("hyprland_scope_parser_r45", PARSER_TEST)
assert spec and spec.loader
parser_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parser_module)
native_parser = parser_module.native_parser


def test_actual_35_field_cursor_control_capture_attribution(native_parser):
    """Parse the exact saved cursor-control reply, never a reconstructed object."""
    raw = FIXTURE.read_bytes()
    assert len(raw) == 1054
    assert raw.endswith(b"}\n")
    assert hashlib.sha256(raw).hexdigest() == SHA256

    fields = json.loads(raw, object_pairs_hook=list)
    assert len(fields) == len({name for name, _ in fields}) == 35
    status = dict(fields)
    assert [status[f"rejection_guard_{number}"] for number in range(1, 4)] == [
        "warp-post-pointer-focus-mismatch",
        "scope-not-armed",
        "scope-not-armed",
    ]
    assert status["accepted"] == 1
    assert status["rejected"] == 3

    parsed = native_parser(raw)
    assert parsed["accepted"] is True
    assert parsed["rejected"] == 3
    assert parsed["have_rejected"] == 1
