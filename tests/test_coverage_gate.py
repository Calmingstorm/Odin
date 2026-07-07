"""Coverage-gate correctness (RFC-006 P0, scripts/ci/coverage_gate.py).

The gate must not be the first untested security-critical thing (R1 B3).
These pin the eight mandated behaviors: fail-closed setup paths, exact
exclusion matching, the missed-count ceiling, the new-file thresholds,
baseline ceremony, and rename/delete surfacing.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "coverage_gate", Path(__file__).parent.parent / "scripts" / "ci" / "coverage_gate.py"
)
coverage_gate = importlib.util.module_from_spec(_SPEC)
sys.modules["coverage_gate"] = coverage_gate
_SPEC.loader.exec_module(coverage_gate)


def _entry(statements=100, covered=90):
    return {
        "statements": statements,
        "covered": covered,
        "missing": statements - covered,
        "percent": round(covered / statements * 100, 2),
    }


class TestFailClosed:
    def test_missing_coverage_json_fails_closed(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        res = subprocess.run(
            [sys.executable, str(Path(coverage_gate.__file__)),
             "--coverage-json", str(tmp_path / "nope.json")],
            capture_output=True, text=True,
        )
        assert res.returncode == 2
        assert "failing closed" in res.stderr

    def test_coverage_run_failure_fails_closed(self, tmp_path, monkeypatch):
        # A suite that fails under coverage must exit 2, never pass the gate.
        monkeypatch.setattr(coverage_gate.subprocess, "run",
                            lambda *a, **k: subprocess.CompletedProcess(a, 1, "boom", ""))
        try:
            coverage_gate.run_coverage(tmp_path / "out.json")
            raise AssertionError("expected SystemExit")
        except SystemExit as exc:
            assert exc.code == 2

    def test_missing_baseline_fails_closed(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        report = tmp_path / "cov.json"
        report.write_text(json.dumps({"files": {}, "totals": {"percent_covered": 0}}))
        res = subprocess.run(
            [sys.executable, str(Path(coverage_gate.__file__)),
             "--coverage-json", str(report)],
            capture_output=True, text=True,
        )
        assert res.returncode == 2
        assert "no coverage-baseline.json" in res.stderr


class TestExclusions:
    def test_excluded_patterns_match_exactly_as_configured(self):
        assert coverage_gate.is_excluded("src/discord/cogs/moderation.py")
        assert coverage_gate.is_excluded("src/tools/browser.py")
        assert coverage_gate.is_excluded("src/__main__.py")
        # near-misses stay gated
        assert not coverage_gate.is_excluded("src/discord/attachments.py")
        assert not coverage_gate.is_excluded("src/permissions/host_access.py")

    def test_every_exclusion_carries_a_reason(self):
        for pattern, reason in coverage_gate.EXCLUDES.items():
            assert isinstance(reason, str) and len(reason) > 10, pattern

    def test_summarize_drops_excluded_and_non_src(self):
        report = {"files": {
            "src/discord/cogs/fun.py": {"summary": {
                "num_statements": 10, "covered_lines": 0, "percent_covered": 0.0}},
            "tests/test_x.py": {"summary": {
                "num_statements": 10, "covered_lines": 10, "percent_covered": 100.0}},
            "src/audit/logger.py": {"summary": {
                "num_statements": 100, "covered_lines": 88, "percent_covered": 88.0}},
        }}
        out = coverage_gate.summarize(report)
        assert list(out) == ["src/audit/logger.py"]


class TestMissedCountCeiling:
    def test_increased_missing_count_fails(self):
        base = {"src/a.py": _entry(100, 90)}
        cur = {"src/a.py": _entry(100, 85)}
        findings = coverage_gate.evaluate(base, cur)
        assert len(findings) == 1 and "missed lines grew 10 → 15" in findings[0]

    def test_unchanged_missing_passes_regardless_of_totals(self):
        # File-level ceiling holds even as the rest of the repo moves.
        base = {"src/a.py": _entry(100, 90)}
        cur = {"src/a.py": _entry(100, 90)}
        assert coverage_gate.evaluate(base, cur) == []

    def test_deleting_dead_uncovered_code_passes(self):
        # 100 stmts / 10 missing -> refactor deletes the dark code.
        base = {"src/a.py": _entry(100, 90)}
        cur = {"src/a.py": _entry(90, 90)}
        assert coverage_gate.evaluate(base, cur) == []

    def test_percent_guard_catches_swapped_coverage(self):
        # missing stays equal but the file shrank: percent regression fires
        # only beyond the 0.25 noise epsilon.
        base = {"src/a.py": _entry(200, 180)}   # 90.0%, missing 20
        cur = {"src/a.py": _entry(150, 130)}    # 86.7%, missing 20
        findings = coverage_gate.evaluate(base, cur)
        assert len(findings) == 1 and "coverage dropped" in findings[0]


class TestNewAndVanishedFiles:
    def test_new_gated_file_below_threshold_fails(self):
        findings = coverage_gate.evaluate({}, {"src/new_module.py": _entry(100, 50)})
        assert len(findings) == 1 and "NEW gated file" in findings[0]
        assert "85" in findings[0]

    def test_new_security_file_held_to_ninety(self):
        findings = coverage_gate.evaluate(
            {}, {"src/permissions/new_gate.py": _entry(100, 87)})
        assert len(findings) == 1 and "90" in findings[0]

    def test_new_file_meeting_threshold_passes(self):
        assert coverage_gate.evaluate({}, {"src/new_module.py": _entry(100, 92)}) == []

    def test_renamed_or_deleted_file_is_surfaced(self):
        findings = coverage_gate.evaluate({"src/gone.py": _entry(100, 90)}, {})
        assert len(findings) == 1
        assert "renamed/deleted" in findings[0]


class TestBaselineCeremony:
    def test_gate_mode_never_writes_baseline(self, tmp_path, monkeypatch):
        # Only --update-baseline may touch the file; gate mode with a failing
        # report must leave the baseline byte-identical.
        monkeypatch.chdir(tmp_path)
        baseline = {"src/a.py": _entry(100, 90)}
        (tmp_path / "coverage-baseline.json").write_text(json.dumps(baseline))
        before = (tmp_path / "coverage-baseline.json").read_text()
        report = tmp_path / "cov.json"
        report.write_text(json.dumps({
            "files": {"src/a.py": {"summary": {
                "num_statements": 100, "covered_lines": 80,
                "percent_covered": 80.0}}},
            "totals": {"percent_covered": 80.0},
        }))
        res = subprocess.run(
            [sys.executable, str(Path(coverage_gate.__file__)),
             "--coverage-json", str(report)],
            capture_output=True, text=True,
        )
        assert res.returncode == 1  # regression detected
        assert (tmp_path / "coverage-baseline.json").read_text() == before

    def test_update_mode_prints_decrease_table(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        (tmp_path / "coverage-baseline.json").write_text(
            json.dumps({"src/a.py": _entry(100, 90)}))
        report = tmp_path / "cov.json"
        report.write_text(json.dumps({
            "files": {"src/a.py": {"summary": {
                "num_statements": 100, "covered_lines": 80,
                "percent_covered": 80.0}}},
            "totals": {"percent_covered": 80.0},
        }))
        res = subprocess.run(
            [sys.executable, str(Path(coverage_gate.__file__)),
             "--coverage-json", str(report), "--update-baseline"],
            capture_output=True, text=True,
        )
        assert res.returncode == 0
        assert "DECREASED" in res.stdout and "justify in the PR" in res.stdout
