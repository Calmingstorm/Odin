from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections.abc import Awaitable, Callable
from typing import Any

import aiohttp
from croniter import croniter

from ..odin_log import get_logger
from .history import ScheduleHistory

log = get_logger("scheduler")

# Tools that can be scheduled for "check" actions
ALLOWED_CHECK_TOOLS = {
    "run_command", "run_command_multi", "run_script",
}

# Retry defaults
DEFAULT_MAX_RETRIES = 0  # disabled by default
DEFAULT_RETRY_BACKOFF_SECONDS = 60
MAX_BACKOFF_SECONDS = 3600  # cap at 1 hour
DEFAULT_FAILURE_ALERT_THRESHOLD = 3  # alert after N consecutive failures

# Webhook action defaults
WEBHOOK_VALID_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}
WEBHOOK_DEFAULT_METHOD = "POST"
WEBHOOK_DEFAULT_TIMEOUT = 30  # seconds
WEBHOOK_MAX_TIMEOUT = 300  # 5 minutes
WEBHOOK_MAX_URL_LEN = 2048
WEBHOOK_MAX_BODY_LEN = 1_000_000  # 1 MB


class Scheduler:
    """Manages scheduled tasks — recurring (cron), one-time, and webhook-triggered."""

    def __init__(self, data_path: str, history_path: str | None = None) -> None:
        self.data_path = Path(data_path)
        self.data_path.parent.mkdir(parents=True, exist_ok=True)
        self._schedules: list[dict] = []
        self._task: asyncio.Task | None = None
        self._callback: Callable[[dict], Awaitable[None]] | None = None
        self._failure_callback: Callable[[dict, int], Awaitable[None]] | None = None
        self._lock = asyncio.Lock()
        self._wake = asyncio.Event()
        # Execution history
        _hist_path = history_path or str(self.data_path.parent / "schedule_history.jsonl")
        self.history = ScheduleHistory(_hist_path)
        self._load()

    def _load(self) -> None:
        if self.data_path.exists():
            try:
                self._schedules = json.loads(self.data_path.read_text())
                log.info("Loaded %d schedule(s)", len(self._schedules))
            except Exception as e:
                log.error("Failed to load schedules: %s", e)
                self._schedules = []

    def _save(self) -> None:
        self.data_path.write_text(json.dumps(self._schedules, indent=2))

    async def add(
        self,
        description: str,
        action: str,
        channel_id: str,
        cron: str | None = None,
        run_at: str | None = None,
        message: str | None = None,
        tool_name: str | None = None,
        tool_input: dict | None = None,
        steps: list[dict] | None = None,
        trigger: dict | None = None,
        max_retries: int | None = None,
        retry_backoff_seconds: int | None = None,
        webhook_config: dict | None = None,
    ) -> dict:
        if action == "digest":
            # Digest is a predefined action, no tool validation needed
            pass
        elif action == "check":
            if not tool_name:
                raise ValueError("tool_name is required for 'check' actions")
            if tool_name not in ALLOWED_CHECK_TOOLS:
                raise ValueError(
                    f"Tool '{tool_name}' is not allowed for scheduled checks. "
                    f"Allowed: {', '.join(sorted(ALLOWED_CHECK_TOOLS))}"
                )
        elif action == "webhook":
            if not isinstance(webhook_config, dict):
                raise ValueError("'webhook_config' (dict) is required for 'webhook' actions")
            self._validate_webhook_config(webhook_config)
        elif action == "workflow":
            if not steps or not isinstance(steps, list):
                raise ValueError("'steps' (list) is required for 'workflow' actions")
            for i, step in enumerate(steps):
                if not isinstance(step, dict) or "tool_name" not in step:
                    raise ValueError(f"Step {i}: must be a dict with 'tool_name'")

        if trigger is not None:
            self._validate_trigger(trigger)
        elif not cron and not run_at:
            raise ValueError("Either 'cron', 'run_at', or 'trigger' is required")

        schedule: dict[str, Any] = {
            "id": uuid.uuid4().hex[:8],
            "description": description,
            "action": action,
            "channel_id": channel_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_run": None,
        }

        if trigger is not None:
            schedule["trigger"] = trigger
            schedule["one_time"] = False
        elif cron:
            # Validate cron expression
            if not croniter.is_valid(cron):
                raise ValueError(f"Invalid cron expression: {cron}")
            schedule["cron"] = cron
            schedule["one_time"] = False
            cr = croniter(cron, datetime.now(timezone.utc))
            schedule["next_run"] = cr.get_next(datetime).isoformat()
        else:
            if run_at:
                try:
                    datetime.fromisoformat(run_at)
                except (ValueError, TypeError):
                    raise ValueError(f"Invalid ISO datetime for run_at: {run_at!r}")
            schedule["run_at"] = run_at
            schedule["next_run"] = run_at
            schedule["one_time"] = True

        if action == "reminder":
            schedule["message"] = message or description
        elif action == "check":
            schedule["tool_name"] = tool_name
            schedule["tool_input"] = tool_input or {}
        elif action == "webhook":
            schedule["webhook_config"] = self._normalize_webhook_config(webhook_config)
        elif action == "workflow":
            schedule["steps"] = steps

        # Retry configuration
        retries = max_retries if max_retries is not None else DEFAULT_MAX_RETRIES
        if retries < 0:
            raise ValueError("max_retries must be >= 0")
        backoff = retry_backoff_seconds if retry_backoff_seconds is not None else DEFAULT_RETRY_BACKOFF_SECONDS
        if backoff < 1:
            raise ValueError("retry_backoff_seconds must be >= 1")
        schedule["max_retries"] = retries
        schedule["retry_backoff_seconds"] = backoff
        # Runtime failure tracking
        schedule["consecutive_failures"] = 0
        schedule["retry_count"] = 0
        schedule["last_error"] = None
        schedule["last_error_at"] = None

        async with self._lock:
            self._schedules.append(schedule)
            await asyncio.to_thread(self._save)
        self._wake.set()
        log_next = schedule.get("next_run", "on trigger")
        log.info("Added schedule %s: %s (next: %s)", schedule["id"], description, log_next)
        return schedule

    @staticmethod
    def _validate_trigger(trigger: dict) -> None:
        """Validate a webhook trigger definition."""
        if not isinstance(trigger, dict):
            raise ValueError("'trigger' must be a dict")
        valid_keys = {
            "source", "event", "repo", "alert_name", "emoji", "user_id", "channel_id",
            # discord_message content matching keys
            "author_id", "content_contains", "content_regex", "starts_with", "equals",
        }
        unknown = set(trigger.keys()) - valid_keys
        if unknown:
            raise ValueError(f"Unknown trigger keys: {', '.join(sorted(unknown))}")
        valid_sources = {"gitea", "grafana", "generic", "github", "gitlab", "discord_reaction", "discord_message"}
        source = trigger.get("source")
        if source and source not in valid_sources:
            raise ValueError(
                f"Invalid trigger source '{source}'. "
                f"Valid: {', '.join(sorted(valid_sources))}"
            )
        if not trigger:
            raise ValueError("Trigger must have at least one condition")

    @staticmethod
    def _validate_webhook_config(config: dict) -> None:
        """Validate a webhook action configuration."""
        if not isinstance(config, dict):
            raise ValueError("'webhook_config' must be a dict")

        url = config.get("url")
        if not url or not isinstance(url, str):
            raise ValueError("webhook_config.url is required and must be a string")
        if len(url) > WEBHOOK_MAX_URL_LEN:
            raise ValueError(f"webhook_config.url exceeds maximum length ({WEBHOOK_MAX_URL_LEN})")
        if not url.startswith(("http://", "https://")):
            raise ValueError("webhook_config.url must start with http:// or https://")

        method = config.get("method", WEBHOOK_DEFAULT_METHOD)
        if method.upper() not in WEBHOOK_VALID_METHODS:
            raise ValueError(
                f"Invalid webhook method '{method}'. "
                f"Valid: {', '.join(sorted(WEBHOOK_VALID_METHODS))}"
            )

        headers = config.get("headers")
        if headers is not None:
            if not isinstance(headers, dict):
                raise ValueError("webhook_config.headers must be a dict")
            for k, v in headers.items():
                if not isinstance(k, str) or not isinstance(v, str):
                    raise ValueError("webhook_config.headers keys and values must be strings")

        body = config.get("body")
        if body is not None and isinstance(body, str) and len(body) > WEBHOOK_MAX_BODY_LEN:
            raise ValueError(
                f"webhook_config.body exceeds maximum length ({WEBHOOK_MAX_BODY_LEN})"
            )

        timeout = config.get("timeout")
        if timeout is not None:
            if not isinstance(timeout, (int, float)) or timeout <= 0:
                raise ValueError("webhook_config.timeout must be a positive number")
            if timeout > WEBHOOK_MAX_TIMEOUT:
                raise ValueError(
                    f"webhook_config.timeout exceeds maximum ({WEBHOOK_MAX_TIMEOUT}s)"
                )

        expected_status = config.get("expected_status_codes")
        if expected_status is not None:
            if not isinstance(expected_status, list):
                raise ValueError("webhook_config.expected_status_codes must be a list")
            for code in expected_status:
                if not isinstance(code, int) or not (100 <= code <= 599):
                    raise ValueError(
                        "webhook_config.expected_status_codes must contain valid HTTP status codes (100-599)"
                    )

    @staticmethod
    def _normalize_webhook_config(config: dict) -> dict:
        """Return a webhook config with defaults filled in."""
        return {
            "url": config["url"],
            "method": config.get("method", WEBHOOK_DEFAULT_METHOD).upper(),
            "headers": config.get("headers") or {},
            "body": config.get("body"),
            "timeout": config.get("timeout", WEBHOOK_DEFAULT_TIMEOUT),
            "expected_status_codes": config.get("expected_status_codes"),
        }

    async def _execute_webhook(self, config: dict) -> dict:
        """Execute an outbound HTTP request for a webhook action.

        Returns a dict with status_code, response body (truncated), and headers.
        Raises on timeout, connection error, or unexpected status code.
        """
        method = config.get("method", WEBHOOK_DEFAULT_METHOD)
        url = config["url"]
        headers = config.get("headers") or {}
        body = config.get("body")
        timeout_sec = config.get("timeout", WEBHOOK_DEFAULT_TIMEOUT)
        expected_codes = config.get("expected_status_codes")

        timeout = aiohttp.ClientTimeout(total=timeout_sec)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            kwargs: dict[str, Any] = {"headers": headers}
            if body is not None:
                if isinstance(body, (dict, list)):
                    kwargs["json"] = body
                else:
                    kwargs["data"] = str(body)

            async with session.request(method, url, **kwargs) as resp:
                resp_body = await resp.text()
                result = {
                    "status_code": resp.status,
                    "body": resp_body[:4096],
                    "headers": dict(resp.headers),
                }

                if expected_codes and resp.status not in expected_codes:
                    raise RuntimeError(
                        f"Webhook returned status {resp.status}, "
                        f"expected one of {expected_codes}"
                    )

                return result

    @staticmethod
    def _trigger_matches(trigger: dict, source: str, event_data: dict) -> bool:
        """Check if webhook event data matches a trigger definition.

        Matching rules:
        - source: exact match (required if specified)
        - event: exact match against event_data["event"]
        - repo: case-insensitive substring match against event_data["repo"]
        - alert_name: case-insensitive substring match against event_data["alert_name"]

        All specified fields must match (AND logic).
        """
        if trigger.get("source") and trigger["source"] != source:
            return False
        if trigger.get("event"):
            if trigger["event"] != event_data.get("event"):
                return False
        if trigger.get("repo"):
            repo = event_data.get("repo", "")
            if trigger["repo"].lower() not in repo.lower():
                return False
        if trigger.get("alert_name"):
            alert = event_data.get("alert_name", "")
            if trigger["alert_name"].lower() not in alert.lower():
                return False
        if trigger.get("emoji"):
            if trigger["emoji"] != event_data.get("emoji", ""):
                return False
        if trigger.get("user_id"):
            if trigger["user_id"] != event_data.get("user_id", ""):
                return False
        if trigger.get("channel_id"):
            if trigger["channel_id"] != event_data.get("channel_id", ""):
                return False
        if trigger.get("author_id"):
            if trigger["author_id"] != event_data.get("author_id", ""):
                return False
        # Content matching (discord_message)
        content = event_data.get("content", "")
        if trigger.get("content_contains"):
            if trigger["content_contains"] not in content:
                return False
        if trigger.get("content_regex"):
            try:
                if not re.search(trigger["content_regex"], content):
                    return False
            except re.error:
                return False
        if trigger.get("starts_with"):
            if not content.startswith(trigger["starts_with"]):
                return False
        if trigger.get("equals"):
            if content != trigger["equals"]:
                return False
        return True

    async def fire_triggers(self, source: str, event_data: dict) -> int:
        """Check all trigger-based schedules against an incoming webhook event.

        Returns the number of triggers that fired.
        Holds _lock to prevent concurrent mutation with _tick().
        """
        if not self._callback:
            return 0

        async with self._lock:
            fired = 0
            now = datetime.now(timezone.utc)
            for schedule in self._schedules:
                trigger = schedule.get("trigger")
                if not trigger:
                    continue
                if not self._trigger_matches(trigger, source, event_data):
                    continue

                log.info(
                    "Webhook trigger fired: schedule %s (%s) on %s event",
                    schedule["id"], schedule["description"], source,
                )
                schedule["last_run"] = now.isoformat()
                fired += 1

                await self._execute_and_record(schedule)

            if fired:
                await asyncio.to_thread(self._save)
            return fired

    def list_all(self) -> list[dict]:
        return list(self._schedules)

    async def reset_failures(self, schedule_id: str) -> dict | None:
        """Reset failure counters and cancel pending retries for a schedule."""
        async with self._lock:
            for s in self._schedules:
                if s["id"] == schedule_id:
                    s["consecutive_failures"] = 0
                    s["retry_count"] = 0
                    s["last_error"] = None
                    s["last_error_at"] = None
                    s.pop("retry_at", None)
                    await asyncio.to_thread(self._save)
                    log.info("Reset failure state for schedule %s", schedule_id)
                    return dict(s)
        return None

    async def update(
        self,
        schedule_id: str,
        *,
        description: str | None = None,
        cron: str | None = None,
        run_at: str | None = None,
        message: str | None = None,
        tool_name: str | None = None,
        tool_input: dict | None = None,
        steps: list[dict] | None = None,
        trigger: dict | None = None,
        channel_id: str | None = None,
        max_retries: int | None = None,
        retry_backoff_seconds: int | None = None,
        webhook_config: dict | None = None,
    ) -> dict | None:
        """Update mutable fields on an existing schedule.

        Returns the updated schedule dict, or ``None`` if *schedule_id* was
        not found.  Only supplied (non-``None``) fields are changed.

        Changing timing (cron/run_at/trigger) replaces the previous timing
        mode entirely — e.g. passing ``cron`` on a one-time schedule converts
        it to recurring.
        """
        async with self._lock:
            target: dict | None = None
            for s in self._schedules:
                if s["id"] == schedule_id:
                    target = s
                    break
            if target is None:
                return None

            # --- simple text fields ---
            if description is not None:
                target["description"] = description
            if message is not None:
                target["message"] = message
            if channel_id is not None:
                target["channel_id"] = channel_id

            # --- action-specific payload fields ---
            action = target["action"]
            if tool_name is not None:
                if action == "check":
                    if tool_name not in ALLOWED_CHECK_TOOLS:
                        raise ValueError(
                            f"Tool '{tool_name}' is not allowed for scheduled checks. "
                            f"Allowed: {', '.join(sorted(ALLOWED_CHECK_TOOLS))}"
                        )
                target["tool_name"] = tool_name
            if tool_input is not None:
                target["tool_input"] = tool_input
            if steps is not None:
                if action == "workflow":
                    for i, step in enumerate(steps):
                        if not isinstance(step, dict) or "tool_name" not in step:
                            raise ValueError(f"Step {i}: must be a dict with 'tool_name'")
                target["steps"] = steps
            if webhook_config is not None:
                self._validate_webhook_config(webhook_config)
                target["webhook_config"] = self._normalize_webhook_config(webhook_config)

            # --- retry configuration ---
            if max_retries is not None:
                if max_retries < 0:
                    raise ValueError("max_retries must be >= 0")
                target["max_retries"] = max_retries
            if retry_backoff_seconds is not None:
                if retry_backoff_seconds < 1:
                    raise ValueError("retry_backoff_seconds must be >= 1")
                target["retry_backoff_seconds"] = retry_backoff_seconds

            # --- timing mode changes ---
            new_timing = trigger is not None or cron is not None or run_at is not None
            if new_timing:
                # Clear previous timing fields
                for key in ("cron", "run_at", "next_run", "trigger"):
                    target.pop(key, None)

                if trigger is not None:
                    self._validate_trigger(trigger)
                    target["trigger"] = trigger
                    target["one_time"] = False
                elif cron is not None:
                    if not croniter.is_valid(cron):
                        raise ValueError(f"Invalid cron expression: {cron}")
                    target["cron"] = cron
                    target["one_time"] = False
                    cr = croniter(cron, datetime.now(timezone.utc))
                    target["next_run"] = cr.get_next(datetime).isoformat()
                elif run_at is not None:
                    try:
                        datetime.fromisoformat(run_at)
                    except (ValueError, TypeError):
                        raise ValueError(f"Invalid ISO datetime for run_at: {run_at!r}")
                    target["run_at"] = run_at
                    target["next_run"] = run_at
                    target["one_time"] = True

            await asyncio.to_thread(self._save)
            log.info("Updated schedule %s", schedule_id)
            return dict(target)

    async def delete(self, schedule_id: str) -> bool:
        async with self._lock:
            before = len(self._schedules)
            self._schedules = [s for s in self._schedules if s["id"] != schedule_id]
            if len(self._schedules) < before:
                await asyncio.to_thread(self._save)
                log.info("Deleted schedule %s", schedule_id)
                return True
        return False

    def start(
        self,
        callback: Callable[[dict], Awaitable[None]],
        failure_callback: Callable[[dict, int], Awaitable[None]] | None = None,
    ) -> None:
        self._callback = callback
        self._failure_callback = failure_callback
        self._task = asyncio.create_task(self._loop())
        log.info("Scheduler started with %d schedule(s)", len(self._schedules))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            log.info("Scheduler stopped")

    async def _loop(self) -> None:
        while True:
            try:
                delay = self._compute_tick_delay()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=delay)
                except asyncio.TimeoutError:
                    pass
                self._wake.clear()
                await self._tick()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.error("Scheduler tick error: %s", e, exc_info=True)

    def _compute_tick_delay(self) -> float:
        """Sleep until the next schedule is due, capped at 60s.

        Hardcoded 60s ticks meant a one-off scheduled 2s from now could
        miss its run_at by up to 58s. Now we peek at the earliest pending
        next_run and sleep that long (min 1s, max 60s)."""
        try:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            soonest: datetime | None = None
            for schedule in self._schedules:
                if schedule.get("paused"):
                    continue
                nxt = schedule.get("next_run")
                if not nxt:
                    continue
                try:
                    parsed = datetime.fromisoformat(nxt)
                    if parsed.tzinfo is not None:
                        parsed = parsed.replace(tzinfo=None)
                except Exception:
                    continue
                if soonest is None or parsed < soonest:
                    soonest = parsed
            if soonest is None:
                return 60.0
            delta = (soonest - now).total_seconds()
            return max(1.0, min(60.0, delta))
        except Exception:
            return 60.0

    def _compute_retry_at(self, schedule: dict) -> str:
        """Compute the next retry time using exponential backoff."""
        retry_count = schedule.get("retry_count", 0)
        base = schedule.get("retry_backoff_seconds", DEFAULT_RETRY_BACKOFF_SECONDS)
        delay = min(base * (2 ** retry_count), MAX_BACKOFF_SECONDS)
        retry_time = datetime.now(timezone.utc) + timedelta(seconds=delay)
        return retry_time.isoformat()

    async def _execute_and_record(self, schedule: dict) -> None:
        """Execute the schedule callback and record the result in history.

        For 'webhook' actions, the built-in HTTP executor is used directly.
        All other actions are dispatched through the registered callback.
        """
        if schedule.get("action") == "webhook":
            await self._execute_and_record_webhook(schedule)
            return
        if not self._callback:
            return
        start = time.monotonic()
        try:
            await self._callback(schedule)
            duration_ms = int((time.monotonic() - start) * 1000)
            await self._handle_success(schedule)
            await self.history.record(
                schedule_id=schedule["id"],
                description=schedule.get("description", ""),
                action=schedule.get("action", ""),
                status="success",
                duration_ms=duration_ms,
            )
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            retry_attempt = schedule.get("retry_count", 0) + 1
            await self._handle_failure(schedule, e)
            await self.history.record(
                schedule_id=schedule["id"],
                description=schedule.get("description", ""),
                action=schedule.get("action", ""),
                status="failure",
                duration_ms=duration_ms,
                error=str(e),
                retry_attempt=retry_attempt if schedule.get("max_retries", 0) > 0 else 0,
            )

    async def _execute_and_record_webhook(self, schedule: dict) -> None:
        """Execute a webhook action and record the result."""
        config = schedule.get("webhook_config", {})
        start = time.monotonic()
        try:
            result = await self._execute_webhook(config)
            duration_ms = int((time.monotonic() - start) * 1000)
            await self._handle_success(schedule)
            await self.history.record(
                schedule_id=schedule["id"],
                description=schedule.get("description", ""),
                action="webhook",
                status="success",
                duration_ms=duration_ms,
            )
            log.info(
                "Webhook schedule %s executed: %s %s -> %d",
                schedule["id"], config.get("method", "POST"),
                config.get("url", ""), result.get("status_code", 0),
            )
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            retry_attempt = schedule.get("retry_count", 0) + 1
            await self._handle_failure(schedule, e)
            await self.history.record(
                schedule_id=schedule["id"],
                description=schedule.get("description", ""),
                action="webhook",
                status="failure",
                duration_ms=duration_ms,
                error=str(e),
                retry_attempt=retry_attempt if schedule.get("max_retries", 0) > 0 else 0,
            )

    async def _handle_success(self, schedule: dict) -> None:
        """Reset failure tracking after a successful execution."""
        schedule["consecutive_failures"] = 0
        schedule["retry_count"] = 0
        schedule.pop("retry_at", None)

    async def _handle_failure(self, schedule: dict, error: Exception) -> None:
        """Track failure and schedule retry if within limits."""
        now = datetime.now(timezone.utc)
        schedule["consecutive_failures"] = schedule.get("consecutive_failures", 0) + 1
        schedule["last_error"] = str(error)[:500]
        schedule["last_error_at"] = now.isoformat()

        max_retries = schedule.get("max_retries", DEFAULT_MAX_RETRIES)
        retry_count = schedule.get("retry_count", 0)

        if max_retries > 0 and retry_count < max_retries:
            schedule["retry_count"] = retry_count + 1
            schedule["retry_at"] = self._compute_retry_at(schedule)
            log.warning(
                "Schedule %s failed (attempt %d/%d), retry at %s: %s",
                schedule["id"], retry_count + 1, max_retries,
                schedule["retry_at"], error,
            )
        else:
            schedule.pop("retry_at", None)
            if max_retries > 0:
                log.error(
                    "Schedule %s exhausted all %d retries: %s",
                    schedule["id"], max_retries, error,
                )
            else:
                log.error("Schedule %s callback failed: %s", schedule["id"], error)

        # Fire failure alert callback
        consecutive = schedule["consecutive_failures"]
        threshold = DEFAULT_FAILURE_ALERT_THRESHOLD
        if self._failure_callback and consecutive >= threshold and consecutive % threshold == 0:
            try:
                await self._failure_callback(schedule, consecutive)
            except Exception as alert_err:
                log.error("Failure alert callback error for %s: %s", schedule["id"], alert_err)

    async def _tick(self) -> None:
        async with self._lock:
            now = datetime.now(timezone.utc)
            now_naive = now.replace(tzinfo=None)
            fired = False
            to_remove: list[str] = []

            for schedule in self._schedules:
                # Check for pending retries first
                retry_at_str = schedule.get("retry_at")
                if retry_at_str:
                    retry_at = datetime.fromisoformat(retry_at_str)
                    if retry_at.tzinfo is not None:
                        retry_at = retry_at.replace(tzinfo=None)
                    if now_naive >= retry_at:
                        log.info(
                            "Retrying schedule %s: %s (attempt %d)",
                            schedule["id"], schedule["description"],
                            schedule.get("retry_count", 0),
                        )
                        fired = True
                        await self._execute_and_record(schedule)
                    continue

                next_run_str = schedule.get("next_run")
                if not next_run_str:
                    continue

                next_run = datetime.fromisoformat(next_run_str)
                # Strip timezone info so comparison is always naive-vs-naive
                if next_run.tzinfo is not None:
                    next_run = next_run.replace(tzinfo=None)
                if now_naive < next_run:
                    continue

                log.info("Firing schedule %s: %s", schedule["id"], schedule["description"])
                schedule["last_run"] = now.isoformat()
                fired = True

                await self._execute_and_record(schedule)

                if schedule.get("one_time"):
                    # Don't remove if retry is pending
                    if not schedule.get("retry_at"):
                        to_remove.append(schedule["id"])
                elif schedule.get("cron"):
                    cr = croniter(schedule["cron"], now.replace(tzinfo=None))
                    schedule["next_run"] = cr.get_next(datetime).isoformat()

            for sid in to_remove:
                self._schedules = [s for s in self._schedules if s["id"] != sid]

            if fired or to_remove:
                await asyncio.to_thread(self._save)
