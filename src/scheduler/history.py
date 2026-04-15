"""Scheduler execution history — persistent JSONL log of schedule runs.

Records every scheduler execution with timing, status, and error details.
Supports querying by schedule ID with pagination and optional pruning.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiofiles

from ..odin_log import get_logger

log = get_logger("scheduler.history")

# Maximum entries to keep per schedule (oldest pruned on write)
DEFAULT_MAX_ENTRIES = 200
# Maximum total entries in the history file before compaction
MAX_TOTAL_ENTRIES = 5000


class ScheduleHistory:
    """Append-only JSONL log for scheduler execution records."""

    def __init__(
        self,
        path: str = "./data/schedule_history.jsonl",
        max_entries_per_schedule: int = DEFAULT_MAX_ENTRIES,
    ) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._max_per_schedule = max_entries_per_schedule

    async def record(
        self,
        *,
        schedule_id: str,
        description: str,
        action: str,
        status: str,
        duration_ms: int,
        error: str | None = None,
        retry_attempt: int = 0,
    ) -> dict[str, Any]:
        """Record a schedule execution. Returns the saved entry."""
        entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "schedule_id": schedule_id,
            "description": description,
            "action": action,
            "status": status,
            "duration_ms": duration_ms,
        }
        if error:
            entry["error"] = error[:500]
        if retry_attempt > 0:
            entry["retry_attempt"] = retry_attempt

        line = json.dumps(entry, default=str) + "\n"
        try:
            async with aiofiles.open(self.path, "a") as f:
                await f.write(line)
        except Exception as e:
            log.error("Failed to write schedule history: %s", e)
        return entry

    async def query(
        self,
        schedule_id: str | None = None,
        *,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Query history entries (most recent first).

        Args:
            schedule_id: Filter to a specific schedule. None = all.
            status: Filter by status (success/failure).
            limit: Max entries to return.
        """
        if not self.path.exists():
            return []

        results: list[dict] = []
        try:
            async with aiofiles.open(self.path, "r") as f:
                lines = await f.readlines()
        except Exception as e:
            log.error("Failed to read schedule history: %s", e)
            return []

        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if schedule_id and entry.get("schedule_id") != schedule_id:
                continue
            if status and entry.get("status") != status:
                continue

            results.append(entry)
            if len(results) >= limit:
                break

        return results

    async def stats(self, schedule_id: str) -> dict[str, Any]:
        """Compute summary stats for a schedule: total runs, successes,
        failures, avg duration, last run time."""
        entries = await self.query(schedule_id, limit=self._max_per_schedule)

        if not entries:
            return {
                "schedule_id": schedule_id,
                "total_runs": 0,
                "successes": 0,
                "failures": 0,
                "avg_duration_ms": 0,
                "last_run": None,
            }

        successes = sum(1 for e in entries if e.get("status") == "success")
        failures = sum(1 for e in entries if e.get("status") == "failure")
        durations = [e.get("duration_ms", 0) for e in entries]
        avg_dur = int(sum(durations) / len(durations)) if durations else 0

        return {
            "schedule_id": schedule_id,
            "total_runs": len(entries),
            "successes": successes,
            "failures": failures,
            "avg_duration_ms": avg_dur,
            "last_run": entries[0].get("timestamp") if entries else None,
        }

    async def prune(self) -> int:
        """Compact history file, keeping only the most recent entries per schedule.

        Returns the number of entries removed.
        """
        if not self.path.exists():
            return 0

        try:
            async with aiofiles.open(self.path, "r") as f:
                lines = await f.readlines()
        except Exception as e:
            log.error("Failed to read history for pruning: %s", e)
            return 0

        # Parse all entries
        entries: list[dict] = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue

        if len(entries) <= MAX_TOTAL_ENTRIES:
            return 0

        # Keep most recent N per schedule
        from collections import defaultdict
        by_schedule: dict[str, list[dict]] = defaultdict(list)
        for entry in entries:
            sid = entry.get("schedule_id", "unknown")
            by_schedule[sid].append(entry)

        kept: list[dict] = []
        for sid, sid_entries in by_schedule.items():
            # Entries are in chronological order; keep last N
            kept.extend(sid_entries[-self._max_per_schedule:])

        # Sort by timestamp to maintain chronological order
        kept.sort(key=lambda e: e.get("timestamp", ""))

        removed = len(entries) - len(kept)
        if removed > 0:
            try:
                content = "".join(json.dumps(e, default=str) + "\n" for e in kept)
                async with aiofiles.open(self.path, "w") as f:
                    await f.write(content)
                log.info("Pruned %d history entries", removed)
            except Exception as e:
                log.error("Failed to write pruned history: %s", e)
                return 0

        return removed
