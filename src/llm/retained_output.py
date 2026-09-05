"""Keep retrieval instructions intact when emergency compression removes previews."""

from __future__ import annotations

import json


def compact_retained_output(text: str) -> str | None:
    """Return a minimal valid retrieval envelope, or None for ordinary content.

    The pointer rewinds to the START of the removed page, not its continuation:
    a preview removed from context is no longer evidence the reader has seen.
    The compressor treats this envelope as structural metadata. If it cannot
    fit, its existing admission failure is safer than destroying the pointer.
    """
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        return None
    if not isinstance(value, dict):
        return None
    if value.get("kind") == "tool_output_compacted":
        return text
    if value.get("kind") == "tool_output" and value.get("retention") == "retained":
        result_id, start = value.get("result_id"), value.get("start")
        if not isinstance(result_id, str) or type(start) is not int or start < 0:
            return None
        retrieval = {
            "tool": "get_tool_output",
            "arguments": {"cursor": f"{result_id}:{start}"},
        }
    elif {"id", "preview", "original_bytes", "result_bytes", "error_bytes"} <= value.keys():
        if not isinstance(value["id"], str):
            return None
        # The terminal page has no digest cursor. Restart read-only retrieval
        # rather than guessing a digest or silently losing a removed prefix.
        retrieval = {"tool": "get_agent_results", "arguments": {"agent_id": value["id"]}}
    else:
        return None
    compact = {
        "kind": "tool_output_compacted",
        "status": value.get("status", "unknown"),
        "notice": "Preview removed by context compression; retrieve retained evidence.",
        "retrieval": retrieval,
    }
    if value.get("expires_at"):
        compact["expires_at"] = value["expires_at"]
    return json.dumps(compact, ensure_ascii=True, separators=(",", ":"))
