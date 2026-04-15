from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import aiofiles

from ..odin_log import get_logger
from .signer import AuditSigner, verify_log

log = get_logger("audit")


class AuditLogger:
    """Append-only JSON Lines audit log for tool executions."""

    def __init__(self, path: str = "./data/audit.jsonl", *, hmac_key: str = "") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._event_callback: Callable | None = None
        self._signer: AuditSigner | None = AuditSigner(hmac_key) if hmac_key else None

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
            "result_summary": result_summary[:500],
            "execution_time_ms": execution_time_ms,
            "error": error,
        }
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

    async def log_web_action(
        self,
        *,
        method: str,
        path: str,
        status: int,
        ip: str = "",
        execution_time_ms: int = 0,
        diff: str | None = None,
    ) -> None:
        """Log a web UI API action (state-changing requests)."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": "web_action",
            "method": method,
            "path": path,
            "status": status,
            "ip": ip,
            "execution_time_ms": execution_time_ms,
        }
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
        limit: int = 20,
    ) -> list[dict]:
        """Search audit log (most recent first). Filters are ANDed."""
        if not self.path.exists():
            return []

        results: list[dict] = []
        try:
            async with aiofiles.open(self.path, "r") as f:
                lines = await f.readlines()
        except Exception as e:
            log.error("Failed to read audit log: %s", e)
            return []

        # Read in reverse for most-recent-first
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
