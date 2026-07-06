#!/usr/bin/env python3
"""Type gate: fail on NEW mypy findings versus a base commit (RFC-005 P0).

The repo carries pre-existing type debt (committed baseline in
docs/plans/type-safety-findings.md — documentation only, never enforcement
truth), so a plain ``mypy`` run cannot gate. This gate compares the finding
MULTISETS of the base commit and HEAD, counted per normalized key so a
second identical error appearing in the same file is a regression even
though a plain set diff would miss it (RFC-005 R1 blocker B1).

Normalization is deliberately boring (R1 implementation advisory): key =
``(file, error-code, whitespace-collapsed message)``. Line numbers are
excluded so pure line drift never false-positives; the message text is
otherwise verbatim — quoted attribute/type names are never rewritten.

Two-tree evaluation (R1 advisory A1): BOTH trees are checked with HEAD's
mypy and HEAD's ``mypy.ini`` (absolute path), so comparisons stay
like-for-like even on the PR that introduces or changes the checker config.

Usage:
    python scripts/ci/type_gate.py [--base-ref origin/master] [--base <sha>]

Resolution order for the base commit:
  1. --base <sha> if given
  2. merge-base of HEAD and --base-ref (default: origin/$GITHUB_BASE_REF
     when set, else origin/master)

Exit codes: 0 = no new findings, 1 = new findings (printed), 2 = setup error.
Requires: git history deep enough for merge-base (checkout fetch-depth: 0)
and the project's dev environment installed (mypy + stubs + dependencies).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path


def run(cmd: list[str], cwd: str | None = None, check: bool = True) -> str:
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and res.returncode not in (0, 1):  # mypy exits 1 when findings exist
        sys.stderr.write(res.stdout + res.stderr)
        raise SystemExit(2)
    return res.stdout


def parse_finding(line: str) -> tuple[str, str, str] | None:
    """Normalize one mypy output line to (file, error-code, message).

    Accepts both ``file:line: error: msg [code]`` and the column form
    ``file:line:col: error: msg [code]`` (in case show_column_numbers is
    ever enabled) — a parser that silently skipped the column form would
    make the gate silently toothless. Non-error lines (notes, summaries)
    return None.
    """
    parts = line.split(":", 3)
    if len(parts) < 3 or not parts[1].strip().isdigit():
        return None
    if len(parts) == 4 and parts[2].strip().isdigit():
        rest = parts[3]  # column form
    else:
        rest = line.split(":", 2)[2]
    rest = rest.strip()
    if not rest.startswith("error:"):
        return None
    rest = rest[len("error:"):].strip()
    code = "?"
    if rest.endswith("]") and "[" in rest:
        rest, _, bracket = rest.rpartition("[")
        code = bracket[:-1]
    message = " ".join(rest.split())
    return (parts[0], code, message)


def findings(tree: str, config: Path) -> Counter:
    """Normalized finding multiset for a checked-out tree.

    Runs with cwd=tree and a relative ``src/`` target so reported paths are
    repo-relative by construction (no worktree prefix to strip). Each run
    gets a throwaway cache dir: deterministic, no cross-tree contamination,
    nothing written into the tree.
    """
    normalized: Counter = Counter()
    with tempfile.TemporaryDirectory(prefix="type-gate-cache-") as cache:
        out = run(
            [sys.executable, "-m", "mypy", "src/",
             "--config-file", str(config),
             "--cache-dir", cache,
             "--no-error-summary", "--no-pretty"],
            cwd=tree,
        )
    for line in out.splitlines():
        key = parse_finding(line)
        if key is not None:
            normalized[key] += 1
    return normalized


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", help="explicit base commit sha")
    ap.add_argument("--base-ref", default=None, help="ref to merge-base against")
    args = ap.parse_args()

    if args.base:
        base = args.base
    else:
        ref = args.base_ref or (
            f"origin/{os.environ['GITHUB_BASE_REF']}"
            if os.environ.get("GITHUB_BASE_REF")
            else "origin/master"
        )
        base = run(["git", "merge-base", ref, "HEAD"], check=False).strip()
        if not base:
            print(f"type-gate: cannot resolve merge-base against {ref} "
                  "(need fetch-depth: 0)", file=sys.stderr)
            return 2

    config = Path.cwd() / "mypy.ini"
    if not config.exists():
        print("type-gate: mypy.ini not found in HEAD tree", file=sys.stderr)
        return 2

    head_findings = findings(".", config)

    with tempfile.TemporaryDirectory(prefix="type-gate-base-") as tmp:
        wt = str(Path(tmp) / "base")
        res = subprocess.run(
            ["git", "worktree", "add", "--detach", wt, base],
            capture_output=True, text=True,
        )
        if res.returncode != 0:
            sys.stderr.write(res.stderr)
            return 2
        try:
            base_findings = findings(wt, config)
        finally:
            subprocess.run(["git", "worktree", "remove", "--force", wt],
                           capture_output=True)

    new = head_findings - base_findings
    resolved = base_findings - head_findings

    print(f"type-gate: base={base[:10]} "
          f"base-findings={sum(base_findings.values())} "
          f"head-findings={sum(head_findings.values())} "
          f"new={sum(new.values())} resolved={sum(resolved.values())}")
    if resolved:
        print(f"resolved {sum(resolved.values())} pre-existing finding(s) — thank you.")
    if new:
        print("\nNEW type findings (fix these — the debt may not grow):")
        for (fname, code, message), n in sorted(new.items()):
            suffix = f"  (x{n})" if n > 1 else ""
            print(f"  {fname}  [{code}]  {message[:120]}{suffix}")
        return 1
    print("no new type findings.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
