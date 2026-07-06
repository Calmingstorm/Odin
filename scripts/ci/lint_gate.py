#!/usr/bin/env python3
"""Lint gate: fail on NEW ruff findings versus a base commit (RFC-003 P0).

The repo carries pre-existing lint debt, so a plain ``ruff check`` cannot
gate. This gate compares the FINDING SETS of the base commit and HEAD,
normalized to ``(file, code, stripped-source-line-text)`` so pure line-number
shifts (insertions above old debt) never false-positive — the comparator
shape proven during the RFC-002 campaign.

Usage:
    python scripts/ci/lint_gate.py [--base-ref origin/master] [--base <sha>]

Resolution order for the base commit:
  1. --base <sha> if given
  2. merge-base of HEAD and --base-ref (default: origin/$GITHUB_BASE_REF
     when set, else origin/master)

Exit codes: 0 = no new findings, 1 = new findings (printed), 2 = setup error.
Requires: git history deep enough for merge-base (checkout fetch-depth: 0)
and ``ruff`` on PATH.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

RUFF_ARGS = ["check", "src/", "tests/", "--output-format", "concise", "--no-cache"]


def run(cmd: list[str], cwd: str | None = None, check: bool = True) -> str:
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and res.returncode not in (0, 1):  # ruff exits 1 when findings exist
        sys.stderr.write(res.stderr)
        raise SystemExit(2)
    return res.stdout


def findings(tree: str) -> Counter:
    """Normalized finding multiset for a checked-out tree."""
    out = run(["ruff", *RUFF_ARGS], cwd=tree)
    sources: dict[str, list[str]] = {}
    normalized: Counter = Counter()
    for line in out.splitlines():
        parts = line.split(":", 3)
        if len(parts) != 4 or not parts[1].isdigit():
            continue
        fname, lineno, _col, rest = parts[0], int(parts[1]), parts[2], parts[3]
        code = rest.strip().split()[0] if rest.strip() else "?"
        if fname not in sources:
            try:
                sources[fname] = (Path(tree) / fname).read_text(
                    encoding="utf-8", errors="replace"
                ).splitlines()
            except OSError:
                sources[fname] = []
        lines = sources[fname]
        src = lines[lineno - 1].strip() if 0 < lineno <= len(lines) else "?"
        normalized[(fname, code, src)] += 1
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
            print(f"lint-gate: cannot resolve merge-base against {ref} "
                  "(need fetch-depth: 0)", file=sys.stderr)
            return 2

    head_findings = findings(".")

    with tempfile.TemporaryDirectory(prefix="lint-gate-base-") as tmp:
        wt = str(Path(tmp) / "base")
        res = subprocess.run(
            ["git", "worktree", "add", "--detach", wt, base],
            capture_output=True, text=True,
        )
        if res.returncode != 0:
            sys.stderr.write(res.stderr)
            return 2
        try:
            base_findings = findings(wt)
        finally:
            subprocess.run(["git", "worktree", "remove", "--force", wt],
                           capture_output=True)

    new = head_findings - base_findings
    resolved = base_findings - head_findings

    print(f"lint-gate: base={base[:10]} "
          f"base-findings={sum(base_findings.values())} "
          f"head-findings={sum(head_findings.values())} "
          f"new={sum(new.values())} resolved={sum(resolved.values())}")
    if resolved:
        print(f"resolved {sum(resolved.values())} pre-existing finding(s) — thank you.")
    if new:
        print("\nNEW findings (fix these — the debt may not grow):")
        for (fname, code, src), n in sorted(new.items()):
            suffix = f"  (x{n})" if n > 1 else ""
            print(f"  {fname}  {code}  {src[:100]}{suffix}")
        return 1
    print("no new findings.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
