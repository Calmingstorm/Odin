"""Shared tool-output delivery budget and ranked snapshots."""
from __future__ import annotations

import contextvars
import json
import sqlite3
from datetime import UTC, datetime

from ..llm.secret_scrubber import scrub_output_secrets
from .output_retention import RetentionError

TOOL_OUTPUT_MAX_CHARS = 12000
delivery_scope = contextvars.ContextVar("output_delivery_scope", default=("", ""))


def get_delivery_budget(config=None) -> int:
    value = getattr(getattr(config, "tools", config), "tool_output_max_chars", 12000)
    return value if type(value) is int and value >= 1024 else 12000


class RankedOutput(str):
    matches: tuple[str, ...]
    recovery_required: bool

    def __new__(cls, text: str, *, matches: tuple[str, ...], recovery_required: bool = True):
        obj = super().__new__(cls, text)
        obj.matches = matches
        obj.recovery_required = recovery_required
        return obj


class DeliveredOutput(str):
    """Internal marker for canonical, scrubbed, serialization-bounded output.

    Never infer this property from untrusted content or a JSON kind field.
    """


def serialize(value: dict) -> str:
    return DeliveredOutput(json.dumps(value, ensure_ascii=True, separators=(",", ":")))


def delivery_failure(reason, status="unknown", *, text="", budget=12000):
    """Keep bounded scrubbed evidence without a misleading continuation.

    A bounded head lookahead covers secret-pattern minimum lengths before
    clipping. Drop the partial tail line whose identifying prefix is unknown.
    """
    text = str(text)
    head, tail = text[:budget+256], text[-budget:]
    if len(text) > budget:
        if text[-budget-1] != "\n":
            newline = tail.find("\n")
            tail = tail[newline+1:] if newline >= 0 else ""
            tail = "[partial line omitted]\n" + tail
    head, tail = scrub_output_secrets(head)[:budget], scrub_output_secrets(tail)

    metadata = {"kind": "tool_output", "status": status, "retention": "failed",
                "error": reason, "truncated": True, "cursor": None}

    def envelope(count):
        return serialize({**metadata, "head": head[:count],
                          "tail": {"text": tail[-count:] if count else ""}})

    if len(envelope(0)) > budget:
        # Only compatibility callers can request less than the configured
        # minimum (1024). Preserve valid framing rather than cut serialized JSON.
        metadata = {"retention": "failed", "error": "no continuation exists", "cursor": None}
        compact = serialize(metadata)
        if len(compact) > budget:
            compact = serialize({"retention": "failed", "cursor": None})
        return compact if len(compact) <= budget else DeliveredOutput("{}" if budget >= 2 else "")

    low, high = 0, min(budget, max(len(head), len(tail)))
    while low < high:
        middle = (low+high+1)//2
        if len(envelope(middle)) <= budget:
            low = middle
        else:
            high = middle-1
    return envelope(low)


def render_page(snapshot, *, offset=0, budget=12000, limit=4000, initial=False):
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
                "first_index": before,
                "fragment": ((offset > 0 and offset not in snapshot.boundaries)
                             or (end not in snapshot.boundaries and end < total)),
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
            "Budget cannot fit a complete code point and envelope.", snapshot.status,
            text=text, budget=budget)
    rendered = serialize(envelope(low, tail))
    if len(rendered) > budget:
        return delivery_failure("Budget cannot fit the complete envelope.", snapshot.status,
                                text=text, budget=budget)
    return rendered


def deliver(text, *, store=None, owner="", channel="", tool="", hosts=(),
            status="succeeded", budget=12000):
    matches = getattr(text, "matches", ())
    recovery_required = getattr(text, "recovery_required", bool(matches))
    if len(text) <= budget and (not recovery_required or all(match in text for match in matches)):
        cleaned = scrub_output_secrets(str(text))
        if len(cleaned) <= budget:
            return text if cleaned == text else cleaned
        text = cleaned
    if store is None:
        return delivery_failure(
            "Retention unavailable; output not retained; no continuation exists.", status,
            text=text, budget=budget)
    try:
        snapshot = store.retain(
            text, owner=owner, channel=channel, tool=tool, hosts=hosts, status=status)
        if matches and len(text) <= budget:
            pointer = f"\nfull matches: get_tool_output cursor={snapshot.result_id}:0"
            preview = scrub_output_secrets(str(text))
            available = budget-len(pointer)
            if len(preview) > available:
                preview = preview[:available-6] + "\n[...]"
            return DeliveredOutput(preview + pointer)
        return render_page(snapshot, budget=budget, initial=True)
    except (RetentionError, OSError, sqlite3.Error, UnicodeError) as exc:
        reason = str(exc) if isinstance(exc, RetentionError) else "Retention storage unavailable."
        return delivery_failure(
            reason + " no continuation exists.", status, text=text, budget=budget)
