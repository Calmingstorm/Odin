"""Tool-facing audit search that groups each tool call's records.

A tool call writes a canonical execution record plus lifecycle events (a
start, and an end carrying the result text): chat calls tool_start/tool_end,
agent calls loop_tool_start/loop_tool. Rendering every record on its own
showed two phantom "by ? (denied)" rows per call. Records are grouped by
scoped call identity (turn or agent, iteration, call id, tool, channel,
actor) BEFORE filtering and the limit:

- each filter is satisfied when any record of the call satisfies it, so every
  call a per-record search matched is still represented;
- the limit counts calls, not rows;
- records that can't be correlated stay on their own.

A call's records are appended start, canonical, end: the chat loop awaits
each write in that order, and an agent's outcome writer first awaits its
start. Reading newest first, a call's start is therefore its LAST record, so
a call is complete, and judged, once its start has been read. No timing is
assumed. A call whose start was never written is judged at the end of the
scan (a high-ranked one keeps the scan going to the end), and the limit stops
the scan only once every call ranked inside it is complete. Of the settled
calls, only the best ``limit`` matches are kept while scanning; open calls and
their records are not bounded by the limit.

Identity is unique per call in normal flow (iterations advance per model
call). It is not guaranteed across a crash and resume: a resumed generation
restarts at its checkpointed iteration, and a provider that numbers its call
ids could repeat one; the audit identity carries no generation. A repeated
identity joins a result that is being returned; otherwise its records form a
second group.

Raw ``AuditLogger.search`` (the REST API and WebUI) is unchanged.
"""
from __future__ import annotations

import bisect
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
_START_TYPES = {"tool_start", "loop_tool_start"}
_END_TYPES = {"tool_end", "loop_tool"}


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
    key: tuple | None = None
    members: list[dict] = field(default_factory=list)
    call: dict | None = None
    start: dict | None = None
    end: dict | None = None
    newest_ts: float = 0.0
    matched_in: list[str] = field(default_factory=list)

    @property
    def canonical(self) -> dict:
        return self.call or self.end or self.start or self.members[0]

    def add(self, entry: dict) -> None:
        self.members.append(entry)
        role = _role(entry)
        # Newest first: the first record of each role is its newest.
        if role in {"call", "start", "end"} and getattr(self, role) is None:
            setattr(self, role, entry)

    def outcome(self) -> str:
        """The stored status, exactly, when a writer recorded one; otherwise
        inferred from execution evidence. Approval is reported separately."""
        for record in (self.call, self.end):
            stored = _stored_status(record) if record is not None else ""
            if stored:
                return STATUS_ALIASES.get(stored.lower(), stored)
        evidence = [record for record in (self.call, self.end) if record is not None]
        if any(_uncertain(record) for record in evidence):
            return "outcome_unknown"
        if self.call is not None:
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


def _stored_status(entry: dict) -> str:
    """The status a writer stored on a record (top level or metadata), or ''."""
    meta = _dict_field(entry, "metadata")
    return str(entry.get("status") or meta.get("status") or "").strip()


def _uncertain(entry: dict) -> bool:
    """Execution evidence that a call's outcome is unknown (not a failure)."""
    meta = _dict_field(entry, "metadata")
    audit_meta = _dict_field(entry, "audit_metadata")
    return (
        "outcome_unknown" in (entry.get("error"), meta.get("error"))
        or any(source.get("uncertain_outcome") is True for source in (entry, meta, audit_meta))
    )


def _role(entry: dict) -> str:
    if "approved" in entry:
        return "call"
    if entry.get("type") in _START_TYPES:
        return "start"
    if entry.get("type") in _END_TYPES:
        return "end"
    return "other"


def call_key(entry: dict) -> tuple | None:
    """Scoped identity of a tool call's record, or None when uncorrelatable.

    Agent records carry the agent's id, iteration and call id (one tool-cycle
    attribution for all three of a call's records); chat records carry the
    turn, iteration and call id in their metadata or attribution.
    """
    if _role(entry) == "other":
        return None
    meta = _dict_field(entry, "metadata")
    call_id = entry.get("call_id") or meta.get("call_id")
    if not call_id:
        return None
    actor = entry.get("user_id") or entry.get("actor") or ""
    scope = (entry.get("tool_name"), str(entry.get("channel_id") or ""), str(actor))
    if entry.get("agent_id"):
        return ("agent", str(entry["agent_id"]), entry.get("iteration"), str(call_id), *scope)
    turn = _dict_field(entry, "turn")
    turn_id = entry.get("turn_id") or meta.get("turn_id") or turn.get("turn_id")
    if not turn_id:
        return None
    iteration = entry.get("iteration", meta.get("iteration"))
    return ("turn", str(turn_id), iteration, str(call_id), *scope)


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
        wanted = f.status.strip().lower()
        outcome = group.outcome()
        alias = STATUS_ALIASES.get(wanted)
        if not (outcome.lower() == wanted or (alias is not None and alias == outcome)
                or any_member(lambda e: _stored_status(e).lower() == wanted)):
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


async def search_calls(
    entries: AsyncIterator[dict], filters: SearchFilters, limit: int,
) -> list[CallGroup]:
    """Newest-first matching calls, grouped before filtering and the limit."""
    if limit <= 0:
        return []
    open_groups: dict[tuple, CallGroup] = {}  # insertion order = rank order
    returned: dict[tuple, CallGroup] = {}
    finished: list[CallGroup] = []
    finished_orders: list[int] = []
    order = 0

    def settle(group: CallGroup) -> None:
        if not _matches(group, filters):
            return
        if len(finished_orders) >= limit and group.order > finished_orders[-1]:
            return  # ranked below every kept match: it can never be returned
        finished.append(group)
        bisect.insort(finished_orders, group.order)
        if group.key is not None:
            returned[group.key] = group
        if len(finished_orders) > limit:
            # Keep only the best `limit` matches while scanning.
            worst = finished_orders.pop()
            dropped = next(g for g in finished if g.order == worst)
            finished.remove(dropped)
            if dropped.key is not None and returned.get(dropped.key) is dropped:
                del returned[dropped.key]

    def done() -> bool:
        # The limit is filled by complete calls, and none still open ranks
        # inside it (open calls are in rank order: the first is the highest).
        if len(finished_orders) < limit:
            return False
        first_open = next(iter(open_groups.values()), None)
        return first_open is None or first_open.order > finished_orders[limit - 1]

    async for entry in entries:
        key = call_key(entry)
        if key is not None and key not in open_groups and key in returned:
            # A repeated identity (see the module note): keep it one result.
            done_group = returned[key]
            done_group.add(entry)
            _matches(done_group, filters)  # refreshes which records matched
            continue
        group = open_groups.get(key) if key is not None else None
        if group is None:
            group = CallGroup(order=order, key=key, newest_ts=_timestamp(entry))
            order += 1
            if key is not None:
                open_groups[key] = group
        group.add(entry)
        if key is None:
            settle(group)
        elif _role(entry) == "start":
            # The start is a call's oldest record: every other one is read.
            settle(open_groups.pop(key))
        if done():
            break
    for group in open_groups.values():
        settle(group)
    finished.sort(key=lambda g: g.order)
    return finished[:limit]
