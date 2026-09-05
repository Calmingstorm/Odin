"""Shared tool-output delivery budget and ranked snapshots."""
from __future__ import annotations

import contextvars
import json
import sqlite3
from datetime import UTC, datetime

from .output_retention import RetentionError

TOOL_OUTPUT_MAX_CHARS = 12000
delivery_scope = contextvars.ContextVar("output_delivery_scope", default=("", ""))


def get_delivery_budget(config=None) -> int:
    value = getattr(getattr(config, "tools", config), "tool_output_max_chars", 12000)
    return value if type(value) is int and value >= 1024 else 12000


class RankedOutput(str):
    matches: tuple[str, ...]

    def __new__(cls, text: str, *, matches: tuple[str, ...]):
        obj = super().__new__(cls, text)
        obj.matches = matches
        return obj


class DeliveredOutput(str):
    """Internal marker for canonical, scrubbed, serialization-bounded output.

    Never infer this property from untrusted content or a JSON kind field.
    """


def serialize(value: dict) -> str:
    return DeliveredOutput(json.dumps(value, ensure_ascii=True, separators=(",", ":")))


def delivery_failure(reason, status="unknown"):
    return serialize({"kind": "tool_output", "status": status, "retention": "failed",
                      "error": reason, "truncated": True, "cursor": None})


def render_page(snapshot, *, offset=0, budget=12000, limit=8000, initial=False):
    text, total = snapshot.text, len(snapshot.text)
    total_bytes = len(text.encode("utf-8"))
    expires = datetime.fromtimestamp(snapshot.expires_at, UTC).isoformat()

    def envelope(end, tail=0):
        cursor = f"{snapshot.result_id}:{end}" if end < total else None
        value = {
            "kind": "tool_output", "status": snapshot.status, "retention": "retained",
            "result_id": snapshot.result_id, "expires_at": expires,
            "total_chars": total, "total_bytes": total_bytes,
            "offset_unit": "unicode_code_points", "start": offset, "end": end,
            "head" if initial else "text": text[offset:end],
            "truncated": end < total, "cursor": cursor,
            "retrieval": {
                "tool": "get_tool_output", "arguments": {"cursor": cursor, "limit": limit}}
            if cursor else None,
        }
        if initial:
            value["tail"] = {"start": total-tail, "end": total, "text": text[total-tail:]}
            value["tail_is_context_only"] = True
        if snapshot.boundaries:
            before = sum(bound <= offset for bound in snapshot.boundaries)
            shown = sum(offset < bound <= end for bound in snapshot.boundaries)
            count = len(snapshot.boundaries)
            value["matches"] = {
                "showing": shown, "total_returned": count, "deferred": count-before-shown,
                "first_index": before, "fragment": end not in snapshot.boundaries and end < total,
                "summary": (
                    f"showing {shown} of {count} returned matches; {count-before-shown} deferred"),
            }
        return value

    tail = min(1000, max(0, (budget-800)//8), total) if initial and not snapshot.boundaries else 0
    while tail and len(serialize(envelope(offset, tail))) >= budget-32:
        tail //= 2
    low, high = offset, min(total, offset+limit)
    # EOF removes cursor/retrieval metadata, a non-monotonic size drop. Test
    # that candidate before searching the monotonic nonterminal interval.
    if high == total and len(serialize(envelope(total, tail))) <= budget:
        return serialize(envelope(total, tail))
    while low < high:
        middle = (low+high+1)//2
        if len(serialize(envelope(middle, tail))) <= budget:
            low = middle
        else:
            high = middle-1
    if snapshot.boundaries:
        whole = [end for end in snapshot.boundaries if offset < end <= low]
        if whole:
            low = whole[-1]
    if low == offset and offset < total:
        return delivery_failure(
            "Budget cannot fit a complete code point and envelope.", snapshot.status)
    rendered = serialize(envelope(low, tail))
    if len(rendered) > budget:
        return delivery_failure("Budget cannot fit the complete envelope.", snapshot.status)
    return rendered


def deliver(text, *, store=None, owner="", channel="", tool="", hosts=(),
            status="succeeded", budget=12000):
    matches = getattr(text, "matches", ())
    if len(text) <= budget and (not matches or all(match in text for match in matches)):
        return text
    if store is None:
        return delivery_failure(
            "Retention unavailable; output not retained; no continuation exists.", status)
    try:
        snapshot = store.retain(
            text, owner=owner, channel=channel, tool=tool, hosts=hosts, status=status)
        return render_page(snapshot, budget=budget, initial=True)
    except (RetentionError, OSError, sqlite3.Error, UnicodeError):
        return delivery_failure(
            "Retention failed or quota exhausted; no continuation exists.", status)
