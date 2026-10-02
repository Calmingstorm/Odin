"""Refresh the per-module weights that balance the serial process-and-timing lanes.

Usage: python scripts/ci/refresh_process_group_weights.py <junit.xml> [--root ROOT] [--output PATH]

Produce the JUnit file from a full plain run, for example
`pytest -q -n 6 --dist loadgroup --junitxml=timing.xml`. Only modules that
tests/parallel_policy.py groups are recorded. Weights only balance the lanes:
a stale or missing weight can make one lane slower, never weaken isolation.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

_POLICY = Path(__file__).resolve().parents[2] / "tests" / "parallel_policy.py"


def _resource_modules(root: Path) -> set[Path]:
    """The repository's own grouping policy, applied to the scanned root."""
    spec = importlib.util.spec_from_file_location("odin_parallel_policy", _POLICY)
    policy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(policy)
    return policy.resource_modules(root)


def _module_for(classname: str, root: Path) -> Path | None:
    """Map a JUnit classname (tests.test_x.TestCase) to its test module."""
    parts = classname.split(".")
    for end in range(len(parts), 0, -1):
        candidate = root.joinpath(*parts[:end]).with_suffix(".py")
        if candidate.is_file():
            return candidate
    return None


def build_weights(junit: Path, root: Path) -> dict[str, float]:
    grouped = {path.resolve() for path in _resource_modules(root)}
    seconds: Counter[Path] = Counter()
    for case in ET.parse(junit).getroot().iter("testcase"):
        module = _module_for(case.get("classname", ""), root)
        if module is not None and module.resolve() in grouped:
            seconds[module.resolve()] += float(case.get("time") or 0.0)
    # Grouped helper modules with no tests of their own weigh nothing; policy
    # names that do not exist in this tree are skipped.
    return {
        path.relative_to(root.resolve()).as_posix(): round(seconds.get(path, 0.0), 1)
        for path in sorted(grouped) if path.is_file()
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("junit", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    output = args.output or args.root / "tests" / "process_group_weights.json"
    weights = build_weights(args.junit, args.root.resolve())
    output.write_text(json.dumps(weights, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {len(weights)} module weights ({sum(weights.values()) / 60:.1f} min) to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
