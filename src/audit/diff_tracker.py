"""Action diff tracker — captures before/after state for file and config changes.

Records unified diffs in audit log entries so operators can see exactly what
changed, not just that a tool ran.
"""
from __future__ import annotations

import difflib
import shlex
from typing import TYPE_CHECKING

from ..odin_log import get_logger

if TYPE_CHECKING:
    from ..tools.executor import ToolExecutor

log = get_logger("diff_tracker")

MAX_DIFF_CHARS = 4000

DIFF_TOOLS: frozenset[str] = frozenset({"write_file"})


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
    """Return ``(host, path)`` for tools with a known file target, else ``None``."""
    if tool_name == "write_file":
        host = tool_input.get("host", "")
        path = tool_input.get("path", "")
        if host and path:
            return host, path
    return None


class DiffTracker:
    """Captures file snapshots before tool execution and computes diffs after."""

    def __init__(self) -> None:
        self._snapshots: dict[str, str] = {}

    async def capture_before(
        self,
        tool_name: str,
        tool_input: dict,
        executor: ToolExecutor,
    ) -> str | None:
        """Read the current file content before a write. Returns a snapshot key or ``None``."""
        target = extract_file_target(tool_name, tool_input)
        if target is None:
            return None

        host, path = target
        safe_path = shlex.quote(path)
        try:
            content = await executor._run_on_host(host, f"cat {safe_path} 2>/dev/null || true")
            if content.startswith("Unknown or disallowed host:"):
                content = ""
        except Exception:
            content = ""

        key = f"{host}:{path}"
        self._snapshots[key] = content
        return key

    def compute_diff(
        self,
        tool_name: str,
        tool_input: dict,
        snapshot_key: str | None,
    ) -> str | None:
        """Compute the before→after diff for a completed tool execution.

        For ``write_file``, the "after" is taken from ``tool_input["content"]``
        since we know exactly what was written.
        """
        if snapshot_key is None:
            return None

        before = self._snapshots.pop(snapshot_key, "")

        if tool_name == "write_file":
            after = tool_input.get("content", "")
            label = tool_input.get("path", "file")
            diff = compute_unified_diff(before, after, label=label)
            return diff if diff else None

        return None

    def clear(self) -> None:
        self._snapshots.clear()
