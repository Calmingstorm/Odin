from __future__ import annotations

from .defs.agents import TOOLS_SECTION as _AGENTS
from .defs.browser_web import TOOLS_SECTION as _BROWSER_WEB
from .defs.channel_process_loops import TOOLS_SECTION as _CHANNEL_PROCESS_LOOPS
from .defs.devops import TOOLS_SECTION as _DEVOPS
from .defs.integrations_email import TOOLS_SECTION as _INTEGRATIONS_EMAIL
from .defs.media_scheduling import TOOLS_SECTION as _MEDIA_SCHEDULING
from .defs.memory_skills import TOOLS_SECTION as _MEMORY_SKILLS
from .defs.system_files import TOOLS_SECTION as _SYSTEM_FILES
from .defs.tasks_knowledge import TOOLS_SECTION as _TASKS_KNOWLEDGE

# RFC-004 P1: TOOLS is the exact-order concatenation of the section
# slices in src/tools/defs/. ORDER IS BEHAVIOR (prompt catalog) — the
# characterization contract (test_tool_parity) pins the full order, and
# sections are positional slices, never semantic regroupings.
TOOLS: list[dict] = [
    *_SYSTEM_FILES,
    *_MEDIA_SCHEDULING,
    *_MEMORY_SKILLS,
    *_TASKS_KNOWLEDGE,
    *_BROWSER_WEB,
    *_CHANNEL_PROCESS_LOOPS,
    *_AGENTS,
    *_DEVOPS,
    *_INTEGRATIONS_EMAIL,
]

TOOL_MAP: dict[str, dict] = {t["name"]: t for t in TOOLS}

# NOTE: the old MUTATING_TOOLS / READ_ONLY_TOOLS frozensets were removed — they
# were imported only by a schema test and NOT consulted by any runtime
# authorization path (the governor uses risk_classifier; mutation detection uses
# post_validation.detect_mutation). Keeping them was an approval-bypass trap: a
# reviewer moving a tool between the sets would think they'd changed
# authorization while nothing actually changed.


# Cache for get_tool_definitions — avoids rebuilding dicts on every message.
_tool_defs_cache: list[dict] | None = None


def get_tool_definitions() -> list[dict]:
    """Return tool definitions.

    Each description is decorated with an affordance footer (cost / risk /
    latency / preconditions) so the LLM can price a call before making it.

    Results are cached. Call invalidate_tool_defs_cache()
    if TOOLS list is modified at runtime (e.g. by tests).
    """
    from .affordances import decorate_description

    global _tool_defs_cache
    if _tool_defs_cache is not None:
        return _tool_defs_cache
    _tool_defs_cache = [
        {
            "name": t["name"],
            "description": decorate_description(t["name"], t["description"]),
            "input_schema": t["input_schema"],
            **({"is_core": True} if t.get("is_core") else {}),
        }
        for t in TOOLS
    ]
    return _tool_defs_cache


def invalidate_tool_defs_cache() -> None:
    """Clear the tool definitions cache.

    Call after modifying TOOLS at runtime (e.g. in tests) or after
    config changes that affect tool availability.
    """
    global _tool_defs_cache
    _tool_defs_cache = None
