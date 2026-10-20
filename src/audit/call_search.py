"""Tool-facing audit search that groups each tool call's records.

A chat tool call writes a canonical execution record plus lifecycle events
(start, and an end carrying the result text). Rendering every record on its
own showed two phantom "by ? (denied)" rows per call. Records are grouped by
scoped call identity BEFORE filtering and the limit:

- each filter is satisfied when any record of the call satisfies it, so every
  call a per-record search matched is still represented;
- the limit counts calls, not rows;
- records that can't be correlated stay on their own.

Raw ``AuditLogger.search`` (the REST API and WebUI) is unchanged.
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime

# Documented and stored spellings, normalised to one outcome vocabulary.
STATUS_ALIASES = {
    "error": "failed", "errors": "failed", "failed": "failed", "failure": "failed",
    "fail": "failed", "success": "succeeded", "succeeded": "succeeded",
    "successful": "succeeded", "ok": "succeeded", "denied": "denied",
    "refused": "denied", "blocked": "denied", "cancelled": "cancelled",
    "canceled": "cancelled", "outcome_unknown": "outcome_unknown",
    "unknown": "outcome_unknown", "started": "started",
}
# How far past a call's expected start the scan looks for its start record.
_START_SLACK_SECONDS = 120.0


@dataclass
class SearchFilters:
    tool_name: str | None = None
    user: str | None = None
    host: str | None = None
    keyword: str | None = None
    date: str | None = None
    status: str | None = None
    has_error: bool | None = None
    min_duration_ms: int | None = None


@dataclass
class CallGroup:
    order: int
    members: list[dict] = field(default_factory=list)
    call: dict | None = None
    start: dict | None = None
    end: dict | None = None
    newest_ts: float = 0.0
    matched_in: list[str] = field(default_factory=list)

    @property
    def canonical(self) -> dict:
        return self.call or self.end or self.start or self.members[0]

    def outcome(self) -> str:
        if self.call is not None:
            stored = STATUS_ALIASES.get(str(self.call.get("status") or "").lower())
            if stored:
                return stored
            if self.call.get("approved") is False:
                return "denied"
            return "failed" if self.call.get("error") else "succeeded"
        return "finished" if self.end is not None else "started"


def _dict_field(entry: dict, name: str) -> dict:
    value = entry.get(name)
    return value if isinstance(value, dict) else {}


def _timestamp(entry: dict) -> float:
    try:
        return datetime.fromisoformat(str(entry.get("timestamp", ""))).timestamp()
    except ValueError:
        return 0.0


def _role(entry: dict) -> str:
    if "approved" in entry:
        return "call"
    if entry.get("type") == "tool_start":
        return "start"
    if entry.get("type") == "tool_end":
        return "end"
    return "other"


def _is_agent_lifecycle(entry: dict) -> bool:
    return bool(entry.get("agent_id")) and entry.get("type") in {"loop_tool_start", "loop_tool"}


def call_key(entry: dict) -> tuple | None:
    """Scoped identity of a chat tool call's record, or None when uncorrelatable."""
    if entry.get("agent_id") or _role(entry) == "other":
        return None
    meta = _dict_field(entry, "metadata")
    turn = _dict_field(entry, "turn")
    turn_id = entry.get("turn_id") or meta.get("turn_id") or turn.get("turn_id")
    call_id = entry.get("call_id") or meta.get("call_id")
    if not turn_id or not call_id:
        return None
    iteration = entry.get("iteration", meta.get("iteration"))
    actor = entry.get("user_id") or entry.get("actor") or ""
    return (str(turn_id), iteration, str(call_id), entry.get("tool_name"),
            str(entry.get("channel_id") or ""), str(actor))


def _duration(entry: dict) -> int:
    meta = _dict_field(entry, "metadata")
    return (
        entry.get("execution_time_ms") or meta.get("duration_ms") or entry.get("duration_ms")
        or meta.get("elapsed_ms") or 0
    )


def _member_label(entry: dict) -> str:
    return {"call": "call record", "start": "start record", "end": "result text"}.get(
        _role(entry), "record")


def _matches(group: CallGroup, f: SearchFilters) -> bool:
    members = group.members

    def any_member(test) -> bool:
        return any(test(entry) for entry in members)

    if f.tool_name and not any_member(lambda e: e.get("tool_name") == f.tool_name):
        return False
    if f.user:
        needle = f.user.lower()
        if not any_member(lambda e: needle in (
            str(e.get("user_name", "")).lower() + str(e.get("user_id", ""))
        )):
            return False
    if f.host:
        def host_ok(entry: dict) -> bool:
            inp = entry.get("tool_input", {})
            return not (isinstance(inp, dict) and inp.get("host") != f.host)
        if not any_member(host_ok):
            return False
    if f.date and not any_member(lambda e: str(e.get("timestamp", "")).startswith(f.date)):
        return False
    if f.keyword:
        needle = f.keyword.lower()
        hits = [e for e in members if needle in json.dumps(e).lower()]
        if not hits:
            return False
        if group.call is None or group.call not in hits:
            group.matched_in = sorted({_member_label(e) for e in hits})
    if f.status:
        wanted = f.status.lower()

        def stored_status(entry: dict) -> str:
            meta = _dict_field(entry, "metadata")
            return str(entry.get("status") or meta.get("status", "")).lower()

        if not (STATUS_ALIASES.get(wanted) == group.outcome()
                or any_member(lambda e: stored_status(e) == wanted)):
            return False
    if f.has_error is True:
        def has_error(entry: dict) -> bool:
            meta = _dict_field(entry, "metadata")
            return bool(entry.get("error") or meta.get("error", ""))
        if not any_member(has_error):
            return False
    if f.min_duration_ms is not None and not any_member(
        lambda e: _duration(e) >= f.min_duration_ms
    ):
        return False
    return True


def _closed(group: CallGroup, scan_ts: float) -> bool:
    """A call's records are all seen once its start record is (it is the oldest)."""
    if group.start is not None:
        return True
    expected = group.newest_ts - _duration(group.call or group.end or {}) / 1000
    return scan_ts < expected - _START_SLACK_SECONDS


async def search_calls(
    entries: AsyncIterator[dict], filters: SearchFilters, limit: int,
) -> list[CallGroup]:
    """Newest-first matching calls, grouped before filtering and the limit."""
    if limit <= 0:
        return []
    open_groups: dict[tuple, CallGroup] = {}
    finished: list[CallGroup] = []
    order = 0

    def settle(group: CallGroup) -> None:
        if _matches(group, filters):
            finished.append(group)

    def done() -> bool:
        if len(finished) < limit:
            return False
        cutoff = sorted(g.order for g in finished)[limit - 1]
        return all(g.order > cutoff for g in open_groups.values())

    async for entry in entries:
        if _is_agent_lifecycle(entry):
            continue
        ts = _timestamp(entry)
        for closed in [k for k, g in open_groups.items() if _closed(g, ts)]:
            settle(open_groups.pop(closed))
        if done():
            break
        key = call_key(entry)
        group = open_groups.get(key) if key is not None else None
        if group is None:
            group = CallGroup(order=order, newest_ts=ts)
            order += 1
            if key is not None:
                open_groups[key] = group
        group.members.append(entry)
        role = _role(entry)
        if role in {"call", "start", "end"} and getattr(group, role) is None:
            setattr(group, role, entry)
        if key is None:
            settle(group)
        elif _closed(group, ts):
            settle(open_groups.pop(key))
        if done():
            break
    for group in open_groups.values():
        settle(group)
    finished.sort(key=lambda g: g.order)
    return finished[:limit]
