"""Operator policy for built-in tool visibility (config-gated tools).

One shared policy object answers "is this built-in disabled for this
installation?" for every dispatch surface, reading through a LIVE config
provider — never a captured snapshot, so replacing ``bot.config`` can never
leave dispatch enforcement stale. The catalog filter consumes the same
normalized list at assembly time; this module is the single source of the
name universe (``BUILTIN_TOOL_NAMES``) and of the typed rejection.

Scope is exactly the static built-in catalog: skills have their own
lifecycle and MCP servers have per-server switches. Disabled built-in
names remain RESERVED — collision checks must use ``BUILTIN_TOOL_NAMES``,
never post-filter visibility, so a skill or MCP tool can never shadow a
disabled built-in.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..odin_log import get_logger
from .registry import TOOLS
from .result_validator import ToolResult

log = get_logger("tools.builtin_policy")

BUILTIN_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in TOOLS)


def normalize_disabled_tools(raw: Any) -> list[str]:
    """Normalize a configured disabled list: strings only, trimmed,
    empties dropped, deduplicated with order preserved. Names are
    case-sensitive. Unknown names are KEPT (they may belong to a newer or
    older catalog; startup must never brick on them) — consumers warn."""
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    result: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        name = item.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        result.append(name)
    return result


def disabled_rejection(name: str) -> ToolResult:
    """The typed dispatch-time rejection — returned BEFORE any handler,
    durability transition, recovery machinery, or external effect."""
    return ToolResult(
        output=(
            f"Tool disabled by configuration: '{name}' is disabled for "
            "this installation and was not executed."
        ),
        ok=False,
        error="tool_disabled",
        tool_name=name,
    )


class BuiltinToolPolicy:
    """Live-read policy over ``tools.disabled_tools``."""

    def __init__(self, get_config: Callable[[], Any]):
        self._get_config = get_config
        self._warned: set[str] = set()

    def disabled_set(self) -> set[str]:
        config = self._get_config()
        tools_cfg = getattr(config, "tools", None)
        raw = getattr(tools_cfg, "disabled_tools", None) if tools_cfg else None
        names = normalize_disabled_tools(list(raw) if raw else [])
        unknown = [n for n in names if n not in BUILTIN_TOOL_NAMES]
        for n in unknown:
            if n not in self._warned:
                self._warned.add(n)
                log.warning(
                    "tools.disabled_tools entry %r matches no built-in tool; "
                    "preserved and ignored",
                    n,
                )
        return {n for n in names if n in BUILTIN_TOOL_NAMES}

    def is_disabled(self, name: str) -> bool:
        return name in self.disabled_set()
