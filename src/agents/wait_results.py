"""Aggregate wait snapshots: reserve the entire roster before allocating previews."""
from __future__ import annotations

import hashlib

from ..llm.secret_scrubber import scrub_output_secrets
from .results import canonical_result

INTERRUPTION_NOTICE = "Wait interrupted by parent message; children continue.\n\n"
SPLIT_ERROR = "Agent status roster exceeds delivery budget. Split agent_ids into smaller batches."
#: The largest preview a wait shows of one agent (get_agent_results' largest page).
WAIT_PREVIEW_MAX_BYTES = 8000


def _row(aid: str, snapshot: dict, page: dict, preview_bytes: int) -> str:
    preview = page["preview"].encode("utf-8")[:preview_bytes].decode("utf-8", errors="ignore")
    end = len(preview.encode("utf-8"))
    content = preview or "(no output)"
    if end < page["original_bytes"]:
        digest = page["cursor"].split(":", 1)[0]
        content += (f"\n... [truncated; original_bytes={page['original_bytes']}; "
                    f"get_agent_results agent_id={aid} cursor={digest}:{end}]")
    label = scrub_output_secrets(snapshot.get("label", aid))[:200]
    notice = (" [wait_interrupted=parent_message]"
              if snapshot.get("wait_interrupted") == "parent_message" else "")
    activity = scrub_output_secrets(str(snapshot.get("activity", "")))[:300]
    activity_line = f" [activity={activity}]" if activity else ""
    return (f"**{label}** (`{aid}`): {snapshot.get('status', 'unknown')} "
            f"[iterations={snapshot.get('iteration_count', 0)}]{activity_line}{notice}\n{content}")


def validate_wait_roster(agent_ids: list[str], snapshots: dict, max_chars: int) -> None:
    """Reserve the worst-case mandatory roster before waiting, not concurrency.

    Status, iteration count, lengths and cursors reserve full runtime widths
    instead of assuming that currently running agents will have no result.
    """
    rows = []
    for aid in agent_ids:
        snapshot = snapshots.get(aid, {})
        reserve = {**snapshot, "label": "x" * 200, "status": "x" * 32,
                   "iteration_count": max(10**20 - 1, snapshot.get("iteration_count", 0)),
                   "activity": "x" * 300,
                   "wait_interrupted": "parent_message"}
        page = {"preview": "", "original_bytes": 10**20 - 1,
                "cursor": "x" * 64 + ":0"}
        rows.append(_row(aid, reserve, page, 0) + " " * 19)
    if len(INTERRUPTION_NOTICE + "\n\n".join(rows)) > max_chars:
        raise ValueError(SPLIT_ERROR)


def _wait_page(snapshot: dict) -> dict:
    """The scrubbed result's first WAIT_PREVIEW_MAX_BYTES, its size and cursor.

    The rows are plain text, so no single-page JSON envelope bounds this
    preview: only the aggregate budget of the whole wait result does.
    """
    body = b"".join(canonical_result(snapshot))
    return {
        "preview": body[:WAIT_PREVIEW_MAX_BYTES].decode("utf-8", errors="ignore"),
        "original_bytes": len(body),
        "cursor": hashlib.sha256(body).hexdigest() + ":0",
    }


def render_wait_results(agent_ids: list[str], snapshots: dict, max_chars: int) -> str:
    pages = {aid: _wait_page({"id": aid, **snapshots[aid]}) for aid in agent_ids}
    prefix = (INTERRUPTION_NOTICE if any(
        r.get("wait_interrupted") == "parent_message" for r in snapshots.values()) else "")

    def render(allowance: int) -> str:
        return prefix + "\n\n".join(
            _row(aid, snapshots[aid], pages[aid], allowance) for aid in agent_ids)

    if len(render(0)) > max_chars:
        raise ValueError(SPLIT_ERROR)
    # Equal byte ceilings are fair; short results donate unused space. The
    # rendered size never shrinks as the ceiling grows, except where a row's
    # first character replaces "(no output)" or a whole result fits and its
    # truncation notice goes. Search each stretch between those points from
    # the top: the first that fits at its start holds the largest ceiling.
    points = {0, WAIT_PREVIEW_MAX_BYTES}
    for page in pages.values():
        if page["preview"]:
            points.add(len(page["preview"][0].encode("utf-8")))
        if page["original_bytes"] < WAIT_PREVIEW_MAX_BYTES:
            points.add(page["original_bytes"])
    if len(render(WAIT_PREVIEW_MAX_BYTES)) <= max_chars:
        return render(WAIT_PREVIEW_MAX_BYTES)
    ordered = sorted(points)
    for lo, upper in reversed(list(zip(ordered, ordered[1:], strict=False))):
        hi = upper - 1
        if lo > hi or len(render(lo)) > max_chars:
            continue
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if len(render(mid)) <= max_chars:
                lo = mid
            else:
                hi = mid - 1
        return render(lo)
    raise ValueError(SPLIT_ERROR)  # guarded by the mandatory roster check
