#!/usr/bin/env python3
"""Coverage gate: fail when any gated file's MISSED-line count grows (RFC-006 P0).

Total coverage percent is trash as a gate — it is trivially gamed by adding
well-tested code elsewhere. The ratchet here (RFC-006 R1, Odin's shape):

- PRIMARY: per-file missed-line-count CEILING — for every gated file in the
  committed baseline, ``missing <= baseline_missing`` (epsilon 0). Punishes
  adding untested code; never punishes deleting dead uncovered code; cannot
  be masked by newly covered lines elsewhere in the same file.
- SECONDARY: per-file percent non-regression, ``percent >= baseline - 0.25``
  (noise epsilon only).
- New gated files must meet their bucket threshold (security 90 / core 85).
- Baseline entries with no matching current file are SURFACED and fail the
  gate until the baseline is deliberately updated — renames and deletions
  are reviewed, never silently passed.
- The baseline changes only via ``--update-baseline``, which prints a
  before/after table (improved / unchanged / DECREASED) for the PR review.
- Total percent is reported, never gated.

Usage:
    python scripts/ci/coverage_gate.py                  # gate against baseline
    python scripts/ci/coverage_gate.py --update-baseline  # regenerate + table
    python scripts/ci/coverage_gate.py --coverage-json F  # reuse an existing report

Exit codes: 0 = pass, 1 = gate findings (printed), 2 = setup/tooling failure
(missing report, failed suite, unparseable baseline — the gate fails CLOSED).
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
import tempfile
from pathlib import Path

BASELINE_PATH = Path("coverage-baseline.json")

# Ungated surfaces — reported, never gated. Every exclusion carries its reason
# (RFC-006 §3): these are legitimately hard to unit-test and chasing them buys
# tests that cost more than they protect.
EXCLUDES: dict[str, str] = {
    "src/discord/cogs/*": "prefix-command UI layer; exercised manually in guilds",
    "src/discord/views/*": "discord.py UI widgets; interaction-driven",
    "src/discord/helpers/error_handler.py": "discord.py error-event glue",
    "src/tools/browser.py": "playwright optional extra; external browser",
    "src/tools/comfyui.py": "external ComfyUI service client",
    "src/packaging/validate.py": "release-pipeline checker; runs in CI context",
    "src/web/middleware.py": "aiohttp middleware glue exercised via live server",
    "src/*/__main__.py": "module entry shims",
    "src/__main__.py": "process entry point; exit paths covered by test_main_exit_codes",
}

# Crown-jewel bucket: authorization / credential code holds the highest bar.
SECURITY_BUCKET = (
    "src/permissions/*",
    "src/web/api/security.py",
)
NEW_FILE_THRESHOLD_CORE = 85.0
NEW_FILE_THRESHOLD_SECURITY = 90.0
MISSING_EPSILON = 0
PERCENT_EPSILON = 0.25


def is_excluded(path: str) -> bool:
    return any(fnmatch.fnmatch(path, pat) for pat in EXCLUDES)


def is_security(path: str) -> bool:
    return any(fnmatch.fnmatch(path, pat) for pat in SECURITY_BUCKET)


def new_file_threshold(path: str) -> float:
    return NEW_FILE_THRESHOLD_SECURITY if is_security(path) else NEW_FILE_THRESHOLD_CORE


def summarize(coverage_json: dict) -> dict[str, dict]:
    """Per-file {statements, covered, missing, percent} for gated files."""
    out = {}
    for path, data in coverage_json.get("files", {}).items():
        norm = path.replace("\\", "/")
        if not norm.startswith("src/") or is_excluded(norm):
            continue
        s = data["summary"]
        out[norm] = {
            "statements": s["num_statements"],
            "covered": s["covered_lines"],
            "missing": s["num_statements"] - s["covered_lines"],
            "percent": round(s["percent_covered"], 2),
        }
    return out


def evaluate(baseline: dict[str, dict], current: dict[str, dict]) -> list[str]:
    """Pure gate logic — returns finding strings (empty = pass)."""
    findings: list[str] = []
    for path, base in sorted(baseline.items()):
        cur = current.get(path)
        if cur is None:
            findings.append(
                f"{path}: in baseline but missing from coverage report "
                "(renamed/deleted?) — update the baseline deliberately"
            )
            continue
        if cur["missing"] > base["missing"] + MISSING_EPSILON:
            findings.append(
                f"{path}: missed lines grew {base['missing']} → {cur['missing']} "
                f"(+{cur['missing'] - base['missing']} new dark lines)"
            )
        elif cur["percent"] < base["percent"] - PERCENT_EPSILON:
            findings.append(
                f"{path}: coverage dropped {base['percent']}% → {cur['percent']}%"
            )
    for path, cur in sorted(current.items()):
        if path in baseline:
            continue
        threshold = new_file_threshold(path)
        if cur["percent"] < threshold:
            findings.append(
                f"{path}: NEW gated file at {cur['percent']}% "
                f"(bucket minimum {threshold}%)"
            )
    return findings


def run_coverage(json_out: Path) -> None:
    res = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "--cov=src",
         f"--cov-report=json:{json_out}"],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        sys.stderr.write(res.stdout[-3000:] + res.stderr[-2000:])
        print("coverage-gate: test suite failed under coverage — failing closed",
              file=sys.stderr)
        raise SystemExit(2)
    if not json_out.exists():
        print("coverage-gate: coverage.json was not produced — failing closed",
              file=sys.stderr)
        raise SystemExit(2)


def load_json(path: Path, what: str) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"coverage-gate: cannot read {what} ({exc}) — failing closed",
              file=sys.stderr)
        raise SystemExit(2)


def print_update_table(old: dict[str, dict], new: dict[str, dict]) -> None:
    improved = unchanged = 0
    decreased: list[str] = []
    for path, cur in sorted(new.items()):
        base = old.get(path)
        if base is None:
            print(f"  NEW        {path}  {cur['percent']}%")
            continue
        if cur["missing"] < base["missing"]:
            improved += 1
        elif cur["missing"] == base["missing"]:
            unchanged += 1
        else:
            decreased.append(
                f"  DECREASED  {path}  missing {base['missing']} → {cur['missing']}"
                "  — justify in the PR"
            )
    for path in sorted(set(old) - set(new)):
        print(f"  REMOVED    {path}")
    print(f"  improved: {improved}  unchanged: {unchanged}  decreased: {len(decreased)}")
    for line in decreased:
        print(line)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--update-baseline", action="store_true",
                    help="regenerate the baseline (deliberate, reviewed)")
    ap.add_argument("--coverage-json", type=Path,
                    help="reuse an existing coverage.json instead of running the suite")
    args = ap.parse_args()

    if args.coverage_json:
        report = load_json(args.coverage_json, "coverage report")
    else:
        with tempfile.TemporaryDirectory(prefix="coverage-gate-") as tmp:
            out = Path(tmp) / "coverage.json"
            run_coverage(out)
            report = load_json(out, "coverage report")

    current = summarize(report)
    total = report.get("totals", {}).get("percent_covered")
    total_str = f"{total:.1f}%" if isinstance(total, (int, float)) else "?"

    if args.update_baseline:
        old = json.loads(BASELINE_PATH.read_text()) if BASELINE_PATH.exists() else {}
        BASELINE_PATH.write_text(json.dumps(current, indent=1, sort_keys=True) + "\n")
        print(f"coverage-gate: baseline updated ({len(current)} gated files, "
              f"total {total_str} — reported, not gated)")
        print_update_table(old, current)
        return 0

    if not BASELINE_PATH.exists():
        print("coverage-gate: no coverage-baseline.json — failing closed "
              "(run --update-baseline deliberately)", file=sys.stderr)
        return 2
    baseline = load_json(BASELINE_PATH, "baseline")

    findings = evaluate(baseline, current)
    print(f"coverage-gate: gated-files={len(current)} baseline-files={len(baseline)} "
          f"total={total_str} (reported, not gated) findings={len(findings)}")
    if findings:
        print("\nCoverage regressions (the dark may not grow):")
        for f in findings:
            print(f"  {f}")
        return 1
    print("no coverage regressions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
