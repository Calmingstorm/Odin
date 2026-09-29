"""Passive aggregation over recorded observability data.

Reads trajectory context traces and audit failure classifications, computes
windowed aggregates and drift candidates, and returns plain dicts for the
API layer. No alert delivery here — exposure only; consumers (Grafana,
future heartbeat) decide what to do with drift candidates.
"""
from __future__ import annotations

import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import BinaryIO

from ..odin_log import get_logger

log = get_logger("observability")

# A section is a drift candidate when its average token cost moves by more
# than BOTH thresholds vs the previous window (absolute floor avoids noise
# on tiny sections; relative floor avoids flagging large stable sections).
DRIFT_ABS_TOKENS = 300
DRIFT_REL_FRACTION = 0.25

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


def failure_aggregates(
    audit_path: str, window_hours: int = 24, *,
    snapshot: list[tuple[BinaryIO, os.stat_result]] | None = None,
) -> dict:
    """Failure-class counts for the current vs previous window.

    Only classification metadata is aggregated — raw error strings are
    never surfaced here.
    """
    now = datetime.now(UTC)
    window = timedelta(hours=window_hours)
    current: dict[str, int] = {}
    previous: dict[str, int] = {}
    by_tool: dict[str, dict[str, int]] = {}
    classified = 0

    # The HTTP caller supplies AuditLogger's rotation-locked descriptor snapshot.
    # Standalone callers still include retained numbered generations. Scan all
    # captured bytes, not an arbitrary tail, and never load whole files in RAM.
    owns_snapshot = snapshot is None
    read_errors = 0
    if snapshot is None:
        snapshot = []
        path = Path(audit_path)
        paths = [path] + sorted(
            p for p in path.parent.glob(path.name + ".*")
            if p.name.removeprefix(path.name + ".").isdigit()
        )
        seen = set()
        for candidate in paths:
            try:
                handle = candidate.open("rb")
                stat = os.fstat(handle.fileno())
                identity = (stat.st_dev, stat.st_ino)
                if identity in seen:
                    handle.close()
                    continue
                seen.add(identity)
                snapshot.append((handle, stat))
            except FileNotFoundError:
                continue
            except OSError as exc:
                read_errors += 1
                log.warning("Could not open retained audit log: %s", exc)

    def lines():
        nonlocal read_errors
        for handle, stat in snapshot:
            try:
                handle.seek(0)
                remaining = stat.st_size
                while remaining > 0:
                    raw = handle.readline(remaining)
                    if not raw:
                        break
                    remaining -= len(raw)
                    yield raw
            except OSError as exc:
                read_errors += 1
                log.warning("Could not scan retained audit log: %s", exc)

    def consume(line):
        nonlocal classified
        try:
            entry = json.loads(line)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return
        if not isinstance(entry, dict):
            return
        failure = entry.get("failure")
        if not isinstance(failure, dict):
            return
        try:
            ts = datetime.fromisoformat(entry.get("timestamp", ""))
        except (ValueError, TypeError):
            return
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        cls = failure.get("class", "unknown")
        if now - window <= ts <= now:
            classified += 1
            current[cls] = current.get(cls, 0) + 1
            tool = entry.get("tool_name", "?")
            by_tool.setdefault(cls, {})
            by_tool[cls][tool] = by_tool[cls].get(tool, 0) + 1
        elif now - 2 * window <= ts < now - window:
            previous[cls] = previous.get(cls, 0) + 1

    try:
        for line in lines():
            consume(line)
    finally:
        if owns_snapshot:
            for handle, _stat in snapshot:
                handle.close()

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
        "coverage": {
            "scope": "retained_audit_generations", "generations": len(snapshot),
            "tail_truncated": False, "read_errors": read_errors,
            "complete_retained_scan": read_errors == 0,
        },
        "by_class": {
            cls: {"count": n, "top_tools": dict(sorted(
                by_tool.get(cls, {}).items(), key=lambda kv: -kv[1])[:5])}
            for cls, n in sorted(current.items(), key=lambda kv: -kv[1])
        },
        "trends": trends,
    }
