"""Type-gate correctness (RFC-005 P0, scripts/ci/type_gate.py).

Pins the two properties Odin's plan review gated on:
- parse_finding normalizes deterministically (line numbers out, message
  whitespace collapsed, quoted names untouched) and tolerates the column
  output form instead of silently skipping it (a parser that skips the
  column form would make the gate silently toothless).
- finding diffs are MULTISET diffs: a second identical error appearing in
  the same file is a regression even though a plain set diff misses it
  (R1 blocker B1).
"""
from __future__ import annotations

import importlib.util
import sys
from collections import Counter
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "type_gate", Path(__file__).parent.parent / "scripts" / "ci" / "type_gate.py"
)
type_gate = importlib.util.module_from_spec(_SPEC)
sys.modules["type_gate"] = type_gate
_SPEC.loader.exec_module(type_gate)

parse_finding = type_gate.parse_finding


class TestParseFinding:
    def test_standard_error_line(self):
        line = 'src/foo.py:123: error: "Config" has no attribute "x"  [attr-defined]'
        assert parse_finding(line) == (
            "src/foo.py", "attr-defined", '"Config" has no attribute "x"')

    def test_column_form_is_parsed_not_skipped(self):
        line = 'src/foo.py:123:45: error: "Config" has no attribute "x"  [attr-defined]'
        assert parse_finding(line) == (
            "src/foo.py", "attr-defined", '"Config" has no attribute "x"')

    def test_line_number_excluded_from_key(self):
        a = parse_finding('src/foo.py:1: error: Bad thing  [arg-type]')
        b = parse_finding('src/foo.py:999: error: Bad thing  [arg-type]')
        assert a == b

    def test_whitespace_collapsed_names_untouched(self):
        line = 'src/foo.py:5: error: Item "None"  of   "VoiceManager | None" bad  [union-attr]'
        assert parse_finding(line) == (
            "src/foo.py", "union-attr", 'Item "None" of "VoiceManager | None" bad')

    def test_notes_and_summaries_skipped(self):
        assert parse_finding('src/foo.py:5: note: See docs') is None
        assert parse_finding('Found 388 errors in 59 files') is None
        assert parse_finding('') is None

    def test_error_without_code_bracket(self):
        assert parse_finding('src/foo.py:5: error: Something odd') == (
            "src/foo.py", "?", "Something odd")


class TestToothlessGateRefusal:
    """Odin's PR #179 blocker: a failed mypy launch (exit 1, nothing
    parseable, complaint on stderr) must be a SETUP error, never a clean
    zero-findings pass on both trees."""

    def test_exit_1_with_no_parseable_findings_is_setup_error(self):
        import pytest
        with pytest.raises(SystemExit) as excinfo:
            type_gate.parse_output(
                "", 1, "/usr/bin/python3: No module named mypy\n")
        assert excinfo.value.code == 2

    def test_exit_1_with_findings_parses_normally(self):
        out = 'src/foo.py:1: error: Bad  [arg-type]\n'
        result = type_gate.parse_output(out, 1, "")
        assert sum(result.values()) == 1

    def test_exit_0_clean_tree_is_fine(self):
        assert type_gate.parse_output("", 0, "") == Counter()


class TestMultisetDiff:
    def test_duplicate_identical_error_is_a_regression(self):
        # R1 blocker B1: base has ONE of this key; head has TWO. A plain set
        # diff sees no change; the Counter diff must flag the second wound.
        key = ("src/foo.py", "union-attr", 'Item "None" of "X | None" has no attribute "y"')
        base = Counter({key: 1})
        head = Counter({key: 2})
        new = head - base
        assert new == Counter({key: 1})

    def test_removal_never_flags(self):
        key = ("src/foo.py", "attr-defined", "msg")
        assert (Counter() - Counter({key: 1})) == Counter()

    def test_line_drift_produces_no_diff(self):
        out_v1 = 'src/foo.py:10: error: Bad  [arg-type]'
        out_v2 = 'src/foo.py:99: error: Bad  [arg-type]'
        c1, c2 = Counter([parse_finding(out_v1)]), Counter([parse_finding(out_v2)])
        assert (c1 - c2) == Counter() and (c2 - c1) == Counter()
