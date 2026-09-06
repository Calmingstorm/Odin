"""Aggregate wait snapshots: reserve the entire roster before allocating previews."""
from __future__ import annotations

import hashlib

from ..llm.secret_scrubber import scrub_output_secrets
from .results import canonical_result, result_page

INTERRUPTION_NOTICE = "Wait interrupted by parent message; children continue.\n\n"
SPLIT_ERROR = "Agent status roster exceeds delivery budget. Split agent_ids into smaller batches."


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
    return (f"**{label}** (`{aid}`): {snapshot.get('status', 'unknown')} "
            f"[iterations={snapshot.get('iteration_count', 0)}]{notice}\n{content}")


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
                   "wait_interrupted": "parent_message"}
        page = {"preview": "", "original_bytes": 10**20 - 1,
                "cursor": "x" * 64 + ":0"}
        rows.append(_row(aid, reserve, page, 0) + " " * 19)
    if len(INTERRUPTION_NOTICE + "\n\n".join(rows)) > max_chars:
        raise ValueError(SPLIT_ERROR)


def render_wait_results(agent_ids: list[str], snapshots: dict, max_chars: int) -> str:
    pages = {}
    for aid in agent_ids:
        snapshot = {"id": aid, **snapshots[aid]}
        page = result_page(snapshot, limit=800, max_chars=max_chars)
        if page["cursor"] is None:
            body = b"".join(canonical_result(snapshot))
            page["cursor"] = hashlib.sha256(body).hexdigest() + ":0"
        pages[aid] = page
    prefix = (INTERRUPTION_NOTICE if any(
        r.get("wait_interrupted") == "parent_message" for r in snapshots.values()) else "")

    def render(allowance: int) -> str:
        return prefix + "\n\n".join(
            _row(aid, snapshots[aid], pages[aid], allowance) for aid in agent_ids)

    if len(render(0)) > max_chars:
        raise ValueError(SPLIT_ERROR)
    if len(render(800)) <= max_chars:
        return render(800)
    # Equal byte ceilings are fair; short results donate unused space. Count
    # downward because completing a short result drops its cursor/metadata,
    # making rendered size non-monotonic at those completion boundaries.
    for allowance in range(799, -1, -1):
        rendered = render(allowance)
        if len(rendered) <= max_chars:
            return rendered
    raise ValueError(SPLIT_ERROR)  # guarded by the mandatory roster check
