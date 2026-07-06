"""Passive aggregation over recorded observability data.

Reads trajectory context traces and audit failure classifications, computes
windowed aggregates and drift candidates, and returns plain dicts for the
API layer. No alert delivery here — exposure only; consumers (Grafana,
future heartbeat) decide what to do with drift candidates.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("observability")

# A section is a drift candidate when its average token cost moves by more
# than BOTH thresholds vs the previous window (absolute floor avoids noise
# on tiny sections; relative floor avoids flagging large stable sections).
DRIFT_ABS_TOKENS = 300
DRIFT_REL_FRACTION = 0.25

_AUDIT_TAIL_BYTES = 4 * 1024 * 1024  # parse at most the last 4MB of audit log


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, round(pct / 100 * (len(ordered) - 1))))
    return float(ordered[idx])


def _iter_trajectory_turns(directory: Path, since: datetime, until: datetime):
    """Yield parsed turns from date-partitioned JSONL files within range."""
    day = since.date()
    while day <= until.date():
        path = directory / f"{day.isoformat()}.jsonl"
        if path.exists():
            try:
                with path.open() as fh:
                    for line in fh:
                        try:
                            turn = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        ts = turn.get("timestamp", "")
                        try:
                            turn_dt = datetime.fromisoformat(ts)
                        except (ValueError, TypeError):
                            continue
                        if since <= turn_dt <= until:
                            yield turn
            except OSError as e:
                log.warning("Could not read trajectory file %s: %s", path, e)
        day += timedelta(days=1)


def _window_section_stats(turns: list[dict]) -> tuple[dict, list[float], int]:
    """Per-section average tokens + total-token samples for one window."""
    section_tokens: dict[str, list[float]] = {}
    totals: list[float] = []
    traced = 0
    for turn in turns:
        trace = turn.get("context_trace")
        if not isinstance(trace, dict):
            continue
        traced += 1
        summary = trace.get("summary", {})
        total = summary.get("system_tokens", 0) + summary.get("history_used_tokens", 0)
        totals.append(float(total))
        for section in trace.get("sections", []):
            name = section.get("section", "?")
            section_tokens.setdefault(name, []).append(float(section.get("tokens", 0)))
        learned = trace.get("learned", {})
        if learned:
            section_tokens.setdefault("learned", []).append(float(learned.get("tokens", 0)))
        history = trace.get("history", {})
        if history:
            section_tokens.setdefault("history", []).append(float(history.get("used", 0)))
    by_section = {
        name: round(sum(vals) / len(vals), 1)
        for name, vals in section_tokens.items() if vals
    }
    return by_section, totals, traced


def context_aggregates(trajectory_dir: str, window_hours: int = 24) -> dict:
    """Windowed prompt-assembly aggregates + drift candidates vs the
    previous window of the same length."""
    directory = Path(trajectory_dir)
    now = datetime.now(UTC)
    window = timedelta(hours=window_hours)

    current = list(_iter_trajectory_turns(directory, now - window, now))
    previous = list(_iter_trajectory_turns(directory, now - 2 * window, now - window))

    cur_sections, cur_totals, cur_traced = _window_section_stats(current)
    prev_sections, _, prev_traced = _window_section_stats(previous)

    by_section = {}
    drift_candidates = []
    for name, avg in sorted(cur_sections.items()):
        prev_avg = prev_sections.get(name)
        delta = round(avg - prev_avg, 1) if prev_avg is not None else None
        by_section[name] = {"avg_tokens": avg, "delta_vs_prev_window": delta}
        if (
            delta is not None
            and abs(delta) >= DRIFT_ABS_TOKENS
            # delta is not None (above) implies prev_avg is not None
            # by the ternary that produced delta.
            and prev_avg > 0  # type: ignore[operator]
            and abs(delta) / prev_avg >= DRIFT_REL_FRACTION
        ):
            drift_candidates.append({
                "type": "section_growth" if delta > 0 else "section_shrink",
                "section": name,
                "delta_tokens": delta,
                "window_hours": window_hours,
            })

    warnings_count = sum(
        len((t.get("context_trace") or {}).get("warnings", []))
        for t in current if isinstance(t.get("context_trace"), dict)
    )

    return {
        "window_hours": window_hours,
        "turns": len(current),
        "turns_traced": cur_traced,
        "previous_window_traced": prev_traced,
        "prompt_tokens_avg": round(sum(cur_totals) / len(cur_totals), 1) if cur_totals else 0,
        "prompt_tokens_p95": round(_percentile(cur_totals, 95), 1),
        "by_section": by_section,
        "trace_warnings": warnings_count,
        "drift_candidates": drift_candidates,
    }


def _tail_lines(path: Path, max_bytes: int) -> list[str]:
    size = path.stat().st_size
    with path.open("rb") as fh:
        if size > max_bytes:
            fh.seek(size - max_bytes)
            fh.readline()  # discard the partial first line
        return fh.read().decode(errors="replace").splitlines()


def failure_aggregates(audit_path: str, window_hours: int = 24) -> dict:
    """Failure-class counts for the current vs previous window.

    Only classification metadata is aggregated — raw error strings are
    never surfaced here.
    """
    path = Path(audit_path)
    if not path.exists():
        return {"window_hours": window_hours, "classified": 0, "by_class": {}, "trends": []}

    now = datetime.now(UTC)
    window = timedelta(hours=window_hours)
    current: dict[str, int] = {}
    previous: dict[str, int] = {}
    by_tool: dict[str, dict[str, int]] = {}
    classified = 0

    try:
        lines = _tail_lines(path, _AUDIT_TAIL_BYTES)
    except OSError as e:
        log.warning("Could not read audit log: %s", e)
        return {"window_hours": window_hours, "classified": 0, "by_class": {}, "trends": []}

    for line in lines:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        failure = entry.get("failure")
        if not isinstance(failure, dict):
            continue
        try:
            ts = datetime.fromisoformat(entry.get("timestamp", ""))
        except (ValueError, TypeError):
            continue
        cls = failure.get("class", "unknown")
        if now - window <= ts <= now:
            classified += 1
            current[cls] = current.get(cls, 0) + 1
            tool = entry.get("tool_name", "?")
            by_tool.setdefault(cls, {})
            by_tool[cls][tool] = by_tool[cls].get(tool, 0) + 1
        elif now - 2 * window <= ts < now - window:
            previous[cls] = previous.get(cls, 0) + 1

    trends = []
    for cls in sorted(set(current) | set(previous)):
        cur_n, prev_n = current.get(cls, 0), previous.get(cls, 0)
        if cur_n != prev_n:
            trends.append({
                "class": cls, "current": cur_n, "previous": prev_n,
                "delta": cur_n - prev_n,
            })

    return {
        "window_hours": window_hours,
        "classified": classified,
        "by_class": {
            cls: {"count": n, "top_tools": dict(sorted(
                by_tool.get(cls, {}).items(), key=lambda kv: -kv[1])[:5])}
            for cls, n in sorted(current.items(), key=lambda kv: -kv[1])
        },
        "trends": trends,
    }
