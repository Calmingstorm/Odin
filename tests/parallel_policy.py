"""Conservative xdist grouping, including test-to-test fixture imports.

Grouping is intra-invocation, not a host lock. The two CI jobs have always
shared the host; their subprocess probes must still own their exact children.
New process tests are grouped automatically rather than relying on a stale
filename allowlist. False positives only cost speed, never isolation.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

PROCESS_GROUP = "process-and-timing"
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
