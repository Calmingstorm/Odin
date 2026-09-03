"""Action diff tracker — captures before/after state for file and config changes.

Records unified diffs in audit log entries so operators can see exactly what
changed, not just that a tool ran.
"""

from __future__ import annotations

import difflib

MAX_DIFF_CHARS = 4000

DIFF_TOOLS: frozenset[str] = frozenset()


def compute_unified_diff(
    before: str,
    after: str,
    label: str = "file",
    max_chars: int = MAX_DIFF_CHARS,
) -> str:
    """Return a unified diff string, truncated to *max_chars*."""
    before_lines = before.splitlines(keepends=True)
    after_lines = after.splitlines(keepends=True)
    diff = difflib.unified_diff(
        before_lines,
        after_lines,
        fromfile=f"a/{label}",
        tofile=f"b/{label}",
        lineterm="",
    )
    result = "".join(diff)
    if len(result) > max_chars:
        return result[:max_chars] + "\n[diff truncated]"
    return result


def compute_dict_diff(
    before: dict,
    after: dict,
    label: str = "config",
    max_chars: int = MAX_DIFF_CHARS,
) -> str:
    """Compute a unified diff between two dicts serialised as sorted YAML-like text."""
    import json

    before_text = json.dumps(before, indent=2, sort_keys=True, default=str)
    after_text = json.dumps(after, indent=2, sort_keys=True, default=str)
    return compute_unified_diff(before_text, after_text, label=label, max_chars=max_chars)


def extract_file_target(tool_name: str, tool_input: dict) -> tuple[str, str] | None:
    """No current built-in exposes a single whole-file before/after target."""
    del tool_name, tool_input
    return None


class DiffTracker:
    """Compatibility no-op: no current built-in has one whole-file target."""

    def __init__(self) -> None:
        self._snapshots: dict[str, str] = {}

    async def capture_before(self, *args, **kwargs) -> str | None:
        del args, kwargs
        return None

    def compute_diff(self, *args, **kwargs) -> str | None:
        del kwargs
        if len(args) >= 3 and args[2] is not None:
            self._snapshots.pop(args[2], None)
        return None

    def clear(self) -> None:
        self._snapshots.clear()
