"""The shared MCP dynamic-dispatch seam (MCP campaign P3).

One translation point between the MCP control plane's typed outcomes and
Odin's tool-result world, consumed by all three call paths — the chat tool
loop, the autonomous/agent/scheduled loop path, and background tasks. Call
sites branch on ``manager.has_tool(published_name)`` against the LIVE
publication index (freshness at dispatch); a stale call that loses the race
still fails typed inside ``manager.execute``.

Outcome mapping (the durability contract):

- ``ok``        → ``ToolResult(ok=True)`` with the model-facing text bounded
                  to the standard 12K result cap.
- ``failed``    → ``ok=False`` with the failure text (definite — the call did
                  not execute or the server rejected it).
- ``uncertain`` → ``ok=False`` AND ``outcome: "uncertain"`` in
                  ``audit_metadata`` — the request was written and its effect
                  is unknowable; the ledger must record OUTCOME_UNKNOWN and
                  nothing may replay it.

``audit_metadata`` carries bounded enums/identifiers only: server name,
original (pre-namespacing) tool name, config generation, negotiated protocol
version, and the outcome class. Tool ARGUMENTS never enter audit metadata —
MCP argument shapes are arbitrary third-party contracts and may carry
credentials.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, TypeGuard

from ..tools.result_validator import ToolResult

if TYPE_CHECKING:
    from ..tools.mcp import MCPManager

# The standard model-facing tool-result cap (mirrors the result validator's
# bound; wire results are already ceiling-bounded at 4 MiB by the client).
MODEL_RESULT_CAP = 12_000

OUTCOME_KEY = "outcome"


def is_mcp_tool(manager: MCPManager | None, tool_name: str) -> TypeGuard[MCPManager]:
    """Live publication check — THE branch predicate for every call path.

    A TypeGuard: a True result proves the manager is present, so guarded
    dispatch sites type-narrow without re-checking."""
    return manager is not None and manager.has_tool(tool_name)


def uncertain_outcome(result: ToolResult) -> bool:
    """Whether a seam result carries the uncertain (effect-unknown) class."""
    metadata = result.audit_metadata
    return metadata is not None and metadata.get(OUTCOME_KEY) == "uncertain"


async def dispatch_mcp_tool(
    manager: MCPManager,
    tool_name: str,
    tool_input: dict,
) -> ToolResult:
    """Execute one published MCP tool and translate its typed outcome."""
    started = time.monotonic()
    outcome = await manager.execute(tool_name, dict(tool_input or {}))
    duration_ms = int((time.monotonic() - started) * 1000)
    text = outcome.text or "(no output)"
    truncated = len(text) > MODEL_RESULT_CAP
    if truncated:
        text = text[:MODEL_RESULT_CAP] + "\n… [truncated at 12000 chars]"
    metadata = {
        "mcp_server": outcome.server,
        "mcp_tool": outcome.tool,
        "config_generation": outcome.generation,
        "negotiated_version": outcome.negotiated_version,
        OUTCOME_KEY: outcome.status,
    }
    return ToolResult(
        output=text,
        ok=outcome.ok,
        error=None if outcome.ok else text,
        truncated=truncated,
        duration_ms=duration_ms,
        tool_name=tool_name,
        audit_metadata=metadata,
    )
