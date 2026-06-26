from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import aiofiles

from ..observability.correlation import get_turn
from ..observability.failure_classes import classify_failure
from ..odin_log import get_logger
from .signer import AuditSigner, verify_log

log = get_logger("audit")


DEFAULT_RESULT_CAP = 4000


class AuditLogger:
    """Append-only JSON Lines audit log for tool executions."""

    def __init__(
        self, path: str = "./data/audit.jsonl", *,
        hmac_key: str = "", classify_failures: bool = True,
        result_cap: int = DEFAULT_RESULT_CAP,
    ) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._event_callback: Callable | None = None
        self._signer: AuditSigner | None = AuditSigner(hmac_key) if hmac_key else None
        self._classify_failures = classify_failures
        self._result_cap = result_cap

    def set_event_callback(self, callback: Callable) -> None:
        """Set a callback to be invoked with each audit entry (for live WS events)."""
        self._event_callback = callback

    async def log_execution(
        self,
        *,
        user_id: str,
        user_name: str,
        channel_id: str,
        tool_name: str,
        tool_input: dict,
        approved: bool,
        result_summary: str,
        execution_time_ms: int,
        error: str | None = None,
        diff: str | None = None,
        risk_level: str | None = None,
        risk_reason: str | None = None,
    ) -> None:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "user_name": user_name,
            "channel_id": channel_id,
            "tool_name": tool_name,
            "tool_input": tool_input,
            "approved": approved,
            "result_summary": result_summary[:self._result_cap],
            "execution_time_ms": execution_time_ms,
            "error": error,
        }
        if error and self._classify_failures:
            # Write-time heuristic classification (observability). The raw
            # error string is classified here; aggregates never re-store it.
            entry["failure"] = classify_failure(error)
        turn = get_turn()
        if turn:
            # Correlation: join audit entries to the trajectory turn (and
            # loop iteration) they belong to. Metadata only.
            entry["turn"] = turn
        if diff:
            entry["diff"] = diff
        if risk_level:
            entry["risk_level"] = risk_level
        if risk_reason:
            entry["risk_reason"] = risk_reason
        if self._signer:
            self._signer.sign(entry)
        line = json.dumps(entry, default=str) + "\n"
        try:
            async with aiofiles.open(self.path, "a") as f:
                await f.write(line)
        except Exception as e:
            log.error("Failed to write audit log: %s", e)

        if self._event_callback:
            try:
                await self._event_callback(entry)
            except Exception:
                pass

    async def log_event(
        self,
        *,
        event_type: str,
        action: str,
        actor: str = "",
        detail: str = "",
        channel_id: str = "",
        metadata: dict | None = None,
    ) -> None:
        """Log a generic state-changing event (agents, schedules, permissions, etc.)."""
        elapsed = (metadata or {}).get("elapsed_ms")
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": event_type,
            "action": action,
            "actor": actor,
            "detail": detail[:self._result_cap],
            "tool_name": action,
            "user_id": actor,
        }
        if elapsed is not None:
            entry["execution_time_ms"] = elapsed
        if channel_id:
            entry["channel_id"] = channel_id
        if metadata:
            entry["metadata"] = metadata
        if self._signer:
            self._signer.sign(entry)
        line = json.dumps(entry, default=str) + "\n"
        try:
            async with aiofiles.open(self.path, "a") as f:
                await f.write(line)
        except Exception as e:
            log.error("Failed to write audit event: %s", e)

        if self._event_callback:
            try:
                await self._event_callback(entry)
            except Exception:
                pass

    async def log_web_action(
        self,
        *,
        method: str,
        path: str,
        status: int,
        ip: str = "",
        execution_time_ms: int = 0,
        diff: str | None = None,
        user_id: str = "",
        username: str = "",
        label: str = "",
    ) -> None:
        """Log a web UI API action (state-changing requests)."""
        entry: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": "web_action",
            "method": method,
            "path": path,
            "status": status,
            "success": status < 400,
            "ip": ip,
            "execution_time_ms": execution_time_ms,
        }
        if status >= 400:
            entry["error"] = f"HTTP {status}"
        if user_id:
            entry["user_id"] = user_id
            entry["actor"] = f"web:{user_id}"
        if username:
            entry["user_name"] = username
        if label:
            entry["label"] = label
        if diff:
            entry["diff"] = diff
        if self._signer:
            self._signer.sign(entry)
        line = json.dumps(entry, default=str) + "\n"
        try:
            async with aiofiles.open(self.path, "a") as f:
                await f.write(line)
        except Exception as e:
            log.error("Failed to write web audit log: %s", e)

        if self._event_callback:
            try:
                await self._event_callback(entry)
            except Exception:
                pass

    async def count_by_tool(self) -> dict[str, int]:
        """Return execution counts per tool name (most used first)."""
        if not self.path.exists():
            return {}
        counts: dict[str, int] = {}
        try:
            async with aiofiles.open(self.path, "r") as f:
                async for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    name = entry.get("tool_name")
                    if name:
                        counts[name] = counts.get(name, 0) + 1
        except Exception as e:
            log.error("Failed to read audit log for counts: %s", e)
        return dict(sorted(counts.items(), key=lambda x: x[1], reverse=True))

    async def search(
        self,
        *,
        tool_name: str | None = None,
        user: str | None = None,
        host: str | None = None,
        keyword: str | None = None,
        date: str | None = None,
        status: str | None = None,
        has_error: bool | None = None,
        min_duration_ms: int | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search audit log (most recent first). Filters are ANDed.

        New filters:
        - status: match entries with this status value (e.g. "error", "success")
        - has_error: True = only entries with non-empty error field
        - min_duration_ms: only entries with duration_ms >= this value
        """
        if not self.path.exists():
            return []

        results: list[dict] = []
        try:
            async with aiofiles.open(self.path, "r") as f:
                lines = await f.readlines()
        except Exception as e:
            log.error("Failed to read audit log: %s", e)
            return []

        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if tool_name and entry.get("tool_name") != tool_name:
                continue
            if user and user.lower() not in (
                entry.get("user_name", "").lower() + entry.get("user_id", "")
            ):
                continue
            if host:
                inp = entry.get("tool_input", {})
                if isinstance(inp, dict) and inp.get("host") != host:
                    continue
            if date and not entry.get("timestamp", "").startswith(date):
                continue
            if keyword:
                blob = json.dumps(entry).lower()
                if keyword.lower() not in blob:
                    continue
            if status:
                entry_status = entry.get("status") or entry.get("metadata", {}).get("status", "")
                if status.lower() != str(entry_status).lower():
                    continue
            if has_error is True:
                err = entry.get("error") or entry.get("metadata", {}).get("error", "")
                if not err:
                    continue
            if min_duration_ms is not None:
                dur = (
                    entry.get("execution_time_ms")
                    or entry.get("metadata", {}).get("duration_ms")
                    or entry.get("duration_ms")
                    or entry.get("metadata", {}).get("elapsed_ms")
                    or 0
                )
                if dur < min_duration_ms:
                    continue

            results.append(entry)
            if len(results) >= limit:
                break

        return results

    async def search_logs(
        self,
        *,
        level: Literal["error", "info", "all"] | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
        keyword: str | None = None,
        tool_name: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """Search audit log with level, time-range, and keyword filters.

        Level is derived from the ``error`` field: entries with a non-null
        ``error`` value are ``error``, everything else is ``info``.
        ``start_time`` / ``end_time`` are ISO-8601 prefixes compared
        lexicographically against the entry timestamp.
        """
        if not self.path.exists():
            return []

        try:
            async with aiofiles.open(self.path, "r") as f:
                lines = await f.readlines()
        except Exception as exc:
            log.error("Failed to read audit log for search_logs: %s", exc)
            return []

        results: list[dict] = []
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            ts = entry.get("timestamp", "")

            if start_time and ts < start_time:
                continue
            if end_time and ts > end_time:
                continue

            if level and level != "all":
                has_error = bool(entry.get("error"))
                if level == "error" and not has_error:
                    continue
                if level == "info" and has_error:
                    continue

            if tool_name and entry.get("tool_name") != tool_name:
                continue

            if keyword:
                blob = json.dumps(entry).lower()
                if keyword.lower() not in blob:
                    continue

            results.append(entry)
            if len(results) >= limit:
                break

        return results

    async def get_log_stats(self) -> dict:
        """Return summary statistics for the log file."""
        if not self.path.exists():
            return {"total": 0, "errors": 0, "tools": 0, "web_actions": 0}

        total = 0
        errors = 0
        tools: set[str] = set()
        web_actions = 0

        try:
            async with aiofiles.open(self.path, "r") as f:
                async for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    total += 1
                    if entry.get("error"):
                        errors += 1
                    tn = entry.get("tool_name")
                    if tn:
                        tools.add(tn)
                    if entry.get("type") == "web_action":
                        web_actions += 1
        except Exception as exc:
            log.error("Failed to read audit log for stats: %s", exc)

        return {
            "total": total,
            "errors": errors,
            "tool_count": len(tools),
            "tools": sorted(tools),
            "web_actions": web_actions,
        }

    async def search_diffs(
        self,
        *,
        tool_name: str | None = None,
        user: str | None = None,
        date: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Return audit entries that contain a diff, most recent first."""
        if not self.path.exists():
            return []

        try:
            async with aiofiles.open(self.path, "r") as f:
                lines = await f.readlines()
        except Exception as e:
            log.error("Failed to read audit log for diffs: %s", e)
            return []

        results: list[dict] = []
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if not entry.get("diff"):
                continue
            if tool_name and entry.get("tool_name") != tool_name:
                continue
            if user and user.lower() not in (
                entry.get("user_name", "").lower() + entry.get("user_id", "")
            ):
                continue
            if date and not entry.get("timestamp", "").startswith(date):
                continue

            results.append(entry)
            if len(results) >= limit:
                break

        return results

    async def search_by_risk(
        self,
        *,
        risk_level: str | None = None,
        tool_name: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Return audit entries that have a risk_level field, most recent first."""
        if not self.path.exists():
            return []

        try:
            async with aiofiles.open(self.path, "r") as f:
                lines = await f.readlines()
        except Exception as e:
            log.error("Failed to read audit log for risk search: %s", e)
            return []

        results: list[dict] = []
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if not entry.get("risk_level"):
                continue
            if risk_level and entry.get("risk_level") != risk_level:
                continue
            if tool_name and entry.get("tool_name") != tool_name:
                continue

            results.append(entry)
            if len(results) >= limit:
                break

        return results

    async def initialize_chain(self) -> None:
        """Read the last signed entry to resume the HMAC chain state."""
        if not self._signer or not self.path.exists():
            return
        try:
            async with aiofiles.open(self.path, "r") as f:
                lines = await f.readlines()
        except Exception as exc:
            log.error("Failed to read audit log for chain init: %s", exc)
            return
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            prev = entry.get("_hmac")
            if prev:
                self._signer.prev_hmac = prev
            return

    async def verify_integrity(self) -> dict:
        """Verify the HMAC chain of the audit log.

        Returns a dict with ``valid``, ``total``, ``verified``, ``first_bad``,
        and ``error`` fields.  Requires signing to be enabled.
        """
        if not self._signer:
            return {
                "valid": False,
                "total": 0,
                "verified": 0,
                "first_bad": None,
                "error": "Signing not enabled (no hmac_key configured)",
            }
        return await verify_log(self.path, self._signer._key.decode())
