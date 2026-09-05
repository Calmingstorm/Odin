"""Provider-neutral tool transcript contract (not a Discord dependency).

Normalize at acceptance, never during replay. IDs correlate calls and results;
they do not make a side-effectful tool safe to retry.
"""

from copy import deepcopy
from uuid import uuid4


def normalize_tool_calls(calls, *, used_ids: set[str] | None = None) -> list[dict]:
    """Preserve provider fields; repair absent identities once at acceptance.

    A duplicate identity receives a fresh correlation ID and a paired parse
    error, not permission to execute an ambiguous call. Legacy callbacks with
    no ID remain supported. The caller owns the lifetime identity set.
    """
    seen = used_ids if used_ids is not None else set()
    normalized = []
    for call in calls or []:

        def get(key, default=None):
            return call.get(key, default) if isinstance(call, dict) else getattr(call, key, default)

        call_id = get("id")
        error = get("parse_error")
        if not isinstance(call_id, str) or not call_id.strip():
            call_id = "call_" + uuid4().hex
        elif call_id in seen:
            error = error or "Duplicate tool call identity; call not executed."
            call_id = "call_" + uuid4().hex
        seen.add(call_id)
        arguments = get("input", {})
        if not isinstance(arguments, dict):
            error = error or "Tool arguments must be a JSON object; call not executed."
            arguments = {}
        normalized.append(
            {
                "id": call_id,
                "name": get("name", ""),
                "input": deepcopy(arguments),
                "parse_error": error,
            }
        )
    return normalized


def assistant_content(text: str, calls: list[dict]) -> list[dict]:
    """One accepted generation, all ordered calls, immutable replay inputs."""
    blocks = [{"type": "text", "text": text}] if text else []
    blocks.extend(
        {"type": "tool_use", "id": c["id"], "name": c["name"], "input": deepcopy(c["input"])}
        for c in calls
    )
    return blocks


def content_text(content) -> str:
    """Text only: neither an argument dictionary nor a list is progress."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            b["text"]
            for b in content
            if isinstance(b, dict) and b.get("type") == "text" and isinstance(b.get("text"), str)
        )
    return ""
