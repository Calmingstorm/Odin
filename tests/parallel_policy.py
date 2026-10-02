"""Conservative xdist grouping, including test-to-test fixture imports.

Grouping is intra-invocation, not a host lock. The two CI jobs have always
shared the host; their subprocess probes must still own their exact children.
New process tests are grouped automatically rather than relying on a stale
filename allowlist. False positives only cost speed, never isolation.
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

PROCESS_GROUP = "process-and-timing"
# Serial lanes for the grouped modules. Each lane is one xdist_group: its
# modules never run concurrently with each other. Lanes run concurrently with
# one another, as the two CI jobs' groups always have on the shared host.
PROCESS_LANES = 3
LANE_WEIGHTS = Path(__file__).with_name("process_group_weights.json")
# Seconds assumed for a grouped module with no measured weight (new tests).
# Weights only balance the lanes; they never decide isolation.
DEFAULT_LANE_WEIGHT = 3.0
# Measured seconds the lane holding the native display proofs must outlast every
# other lane before those deadline-sensitive proofs start, so they run after
# this run's other process lanes have drained, as with the single group.
NATIVE_SLACK_SECONDS = 60.0
NATIVE_DISPLAY_TESTS = frozenset({
    "test_computer_dispatch_native_r19.py",
    "test_computer_x11_native_safety_live_r11.py",
})
_RESOURCE = re.compile(
    r"subprocess|process_manager|ProcessRegistry|set_child_subreaper|"
    r"shutdown_asyncgens|os\.(?:fork|waitpid|killpg)|/proc/|"
    r"terminate_process_tree|Xvfb|xdotool|DISPLAY"
)


def resource_modules(root: Path) -> set[Path]:
    """Find direct resource users plus reverse closure of fixture imports."""
    files = sorted((root / "tests").rglob("*.py"))
    sources = {p: p.read_text(encoding="utf-8") for p in files}
    names = {".".join(p.relative_to(root).with_suffix("").parts): p for p in files}
    marked = {p for p, source in sources.items() if _RESOURCE.search(source)}
    # Admission and bounded watchdog settlement explicitly depend on scheduling
    # under load; keep them behind the same serialized resource queue.
    for name in ("test_resume_admission.py", "test_computer_task_ownership_r19.py"):
        marked.add(root / "tests" / name)
    imports: dict[Path, set[Path]] = {}
    for path, source in sources.items():
        dependencies = set()
        for node in ast.walk(ast.parse(source)):
            if isinstance(node, ast.Import):
                dependencies.update(names[a.name] for a in node.names if a.name in names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                module = node.module
                if node.level:
                    package = list(path.relative_to(root).parent.parts)
                    module = ".".join(package[:len(package) - node.level + 1] + [module])
                if module in names:
                    dependencies.add(names[module])
                dependencies.update(
                    names[f"{module}.{a.name}"] for a in node.names
                    if f"{module}.{a.name}" in names
                )
        imports[path] = dependencies
    while True:
        expanded = marked | {p for p, deps in imports.items() if deps & marked}
        if expanded == marked:
            return marked
        marked = expanded


def lane_weights(path: Path = LANE_WEIGHTS) -> dict[str, float]:
    """Measured seconds per grouped module, keyed by repo-relative POSIX path."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        str(key): float(value) for key, value in data.items()
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0
    }


def process_lanes(
    root: Path, grouped: set[Path], *, lanes: int = PROCESS_LANES,
    weights: dict[str, float] | None = None,
) -> dict[Path, str]:
    """Deterministically spread grouped modules over balanced serial lanes.

    Heaviest modules first, each to the lightest lane (ties by lane number).
    The native display proofs then join the heaviest lane together, and that
    lane takes the lightest modules of the heaviest other lane until it outlasts
    every other lane by NATIVE_SLACK_SECONDS. The proofs run last in it, after
    the other lanes have drained.
    """
    weights = lane_weights() if weights is None else weights

    def weight(path: Path) -> float:
        key = path.relative_to(root).as_posix()
        return weights.get(key, DEFAULT_LANE_WEIGHT)

    native = sorted(p for p in grouped if p.name in NATIVE_DISPLAY_TESTS)
    others = sorted(
        (p for p in grouped if p.name not in NATIVE_DISPLAY_TESTS),
        key=lambda p: (-weight(p), p.as_posix()),
    )
    totals = [0.0] * lanes
    assignment: dict[Path, int] = {}
    for path in others:
        lane = min(range(lanes), key=lambda index: (totals[index], index))
        assignment[path] = lane
        totals[lane] += weight(path)
    heaviest = max(range(lanes), key=lambda index: (totals[index], -index))
    if native and lanes > 1:
        def others() -> list[int]:
            return [index for index in range(lanes) if index != heaviest]

        while totals[heaviest] < max(totals[i] for i in others()) + NATIVE_SLACK_SECONDS:
            donor = max(others(), key=lambda index: (totals[index], -index))
            movable = sorted(
                (p for p, lane in assignment.items() if lane == donor and weight(p) > 0),
                key=lambda p: (weight(p), p.as_posix()),
            )
            if not movable:
                break
            assignment[movable[0]] = heaviest
            totals[donor] -= weight(movable[0])
            totals[heaviest] += weight(movable[0])
    for path in native:
        assignment[path] = heaviest
    return {path: f"{PROCESS_GROUP}-{index + 1}" for path, index in assignment.items()}
