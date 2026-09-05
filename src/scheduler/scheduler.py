from __future__ import annotations

import asyncio
import copy
import json
import os
import re
import time
import uuid
from collections.abc import Awaitable, Callable, Collection
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import aiohttp
from croniter import croniter

from ..odin_log import get_logger
from .history import ScheduleHistory

log = get_logger("scheduler")


def _utc_iso(dt: datetime) -> str:
    """Ensure datetime is serialized with explicit UTC offset."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    else:
        dt = dt.astimezone(UTC)
    return dt.isoformat()


def _cron_next_run(cron_expr: str, tz_name: str | None = None) -> str:
    """Next cron occurrence as a UTC ISO string.

    When *tz_name* is set the schedule fires on that timezone's wall clock
    (so "0 9 * * *" means 9am local across DST), computed locally then stored
    as UTC. Without it, cron is evaluated in UTC as before.
    """
    if tz_name:
        try:
            base = datetime.now(ZoneInfo(tz_name))
            cr = croniter(cron_expr, base)
            return _utc_iso(cr.get_next(datetime))
        except (ZoneInfoNotFoundError, ValueError):
            log.warning("Unknown schedule timezone %r; evaluating cron in UTC", tz_name)
    cr = croniter(cron_expr, datetime.now(UTC))
    return _utc_iso(cr.get_next(datetime))


# Tools that can be scheduled for "check" actions
ALLOWED_CHECK_TOOLS = {
    "run_command", "run_command_multi", "run_script",
}

# Retry defaults
DEFAULT_MAX_RETRIES = 0  # disabled by default
DEFAULT_RETRY_BACKOFF_SECONDS = 60
MAX_BACKOFF_SECONDS = 3600  # cap at 1 hour
DEFAULT_FAILURE_ALERT_THRESHOLD = 3  # alert after N consecutive failures


class NonRetryableScheduleError(RuntimeError):
    """A failed scheduled effect that automation must never replay."""


# Webhook action defaults
WEBHOOK_VALID_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}
WEBHOOK_DEFAULT_METHOD = "POST"
WEBHOOK_DEFAULT_TIMEOUT = 30  # seconds
WEBHOOK_MAX_TIMEOUT = 300  # 5 minutes
WEBHOOK_MAX_URL_LEN = 2048
WEBHOOK_MAX_BODY_LEN = 1_000_000  # 1 MB


def _reject_multiple_timing_modes(
    *, cron: str | None, run_at: str | None, trigger: dict | None
) -> None:
    """A schedule fires one way. Supplying several used to keep one silently.

    ``add`` and ``update`` picked trigger, then cron, then run_at, and dropped
    the rest without a word — so a form that left Cron populated while the
    operator filled in a one-time date created a recurring schedule and said
    it had succeeded.
    """
    supplied = [
        name
        for name, value in (("cron", cron), ("run_at", run_at), ("trigger", trigger))
        if value
    ]
    if len(supplied) > 1:
        raise ValueError(
            "Specify exactly one of 'cron', 'run_at', or 'trigger' — got "
            + ", ".join(sorted(supplied))
        )


def _reject_naive_run_at(run_at: str | None) -> None:
    """An offsetless ``run_at`` names a wall clock, not an instant.

    It used to be stamped UTC regardless, so on a New York install a schedule
    fired five hours early, and on a fall-back night the same wall time
    happened twice. Every caller has an offset available: the web API sends one
    from the browser, and the schedule_task tool directs the model through
    parse_time, which always returns an offset-aware value.
    """
    if not run_at or not isinstance(run_at, str):
        return
    try:
        parsed = datetime.fromisoformat(run_at)
    except ValueError:
        return  # add()/update() report malformed input with their own message
    if parsed.tzinfo is None:
        raise ValueError(
            f"run_at must carry a UTC 'Z' or an explicit offset — {run_at!r} "
            "names a wall clock, which is ambiguous across timezones and "
            "repeats on a daylight-saving fall-back. Use parse_time."
        )


class Scheduler:
    """Manages scheduled tasks — recurring (cron), one-time, and webhook-triggered."""

    def __init__(self, data_path: str, history_path: str | None = None) -> None:
        self.data_path = Path(data_path)
        self.data_path.parent.mkdir(parents=True, exist_ok=True)
        self._schedules: list[dict] = []
        self._task: asyncio.Task | None = None
        self._callback: Callable[[dict], Awaitable[None]] | None = None
        self._failure_callback: Callable[[dict, int], Awaitable[None]] | None = None
        self._known_report_formats_provider: Callable[[], Collection[str]] | None = None
        self._lock = asyncio.Lock()
        self._wake = asyncio.Event()
        # Schedule ids currently executing — prevents the same schedule from
        # double-firing when a manual run_now overlaps a tick, a duplicate
        # webhook arrives, or (defensively) two scheduler loops tick at once.
        self._in_flight: set[str] = set()
        # Execution history
        _hist_path = history_path or str(self.data_path.parent / "schedule_history.jsonl")
        self.history = ScheduleHistory(_hist_path)
        self._http_session: aiohttp.ClientSession | None = None
        self._load()

    def _load(self) -> None:
        if self.data_path.exists():
            try:
                self._schedules = json.loads(self.data_path.read_text())
                log.info("Loaded %d schedule(s)", len(self._schedules))
                self._advance_stale_cron()
            except Exception as e:
                log.error("Failed to load schedules: %s", e)
                # Preserve the corrupt file instead of silently discarding every
                # schedule — a truncated/partial write must not erase persistence.
                try:
                    backup = self.data_path.with_suffix(self.data_path.suffix + ".corrupt")
                    self.data_path.replace(backup)
                    log.error("Backed up corrupt schedules file to %s", backup)
                except Exception:
                    log.exception("Could not back up corrupt schedules file")
                self._schedules = []

    def _advance_stale_cron(self) -> None:
        """Advance cron schedules whose next_run is in the past.

        After downtime, a cron schedule's persisted next_run may be hours or
        days old. Instead of firing immediately for a stale time, advance
        next_run to the next future occurrence so the schedule resumes on
        its normal cadence.
        """
        now = datetime.now(UTC).replace(tzinfo=None)
        advanced = 0
        for schedule in self._schedules:
            cron_expr = schedule.get("cron")
            next_run_str = schedule.get("next_run")
            if not cron_expr or not next_run_str:
                continue
            try:
                next_run = datetime.fromisoformat(next_run_str)
                if next_run.tzinfo is not None:
                    next_run = next_run.replace(tzinfo=None)
                if next_run < now:
                    schedule["next_run"] = _cron_next_run(cron_expr, schedule.get("timezone"))
                    advanced += 1
            except Exception:
                continue
        if advanced:
            log.info("Advanced %d stale cron schedule(s) to next future run", advanced)

    def _save(self) -> None:
        # Atomic write: serialize to a temp file, fsync, then replace. A crash
        # mid-write must never truncate schedules.json (which _load would then
        # treat as corrupt). Mirrors the tmp+replace pattern used elsewhere.
        tmp = self.data_path.with_suffix(self.data_path.suffix + ".tmp")
        with open(tmp, "w") as f:
            json.dump(self._schedules, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.data_path)

    async def _publish(self, candidate: list[dict]) -> None:
        """Caller holds _lock; persist detached state before making it visible."""
        candidate = copy.deepcopy(candidate)
        writer = copy.copy(self)
        writer._schedules = candidate
        write = asyncio.create_task(asyncio.to_thread(writer._save))
        cancelled = False
        while not write.done():
            try:
                await asyncio.shield(write)
            except asyncio.CancelledError:
                # Every wait must be shielded: repeated cancellation must not
                # cancel the task wrapping the still-running writer thread.
                cancelled = True
        write.result()  # A failed write must never publish the candidate.
        self._schedules = candidate
        if cancelled:
            raise asyncio.CancelledError

    @staticmethod
    def _execution_identity(schedule: dict) -> tuple:
        return (
            schedule.get("_generation", schedule.get("created_at")),
            schedule.get("_execution_revision", 0),
        )

    def set_known_report_formats_provider(
        self, provider: Callable[[], Collection[str]]
    ) -> None:
        """Install the composition-owned source of supported report formats."""
        if not callable(provider):
            raise TypeError("known report formats provider must be callable")
        self._known_report_formats_provider = provider

    def _validate_report_format(self, report_format: str | None, action: str) -> None:
        if report_format is not None and not isinstance(report_format, str):
            raise ValueError("report_format must be a string")
        if report_format and action != "check":
            raise ValueError("report_format is only valid for 'check' actions")
        if not report_format:
            return

        provider = self._known_report_formats_provider
        if provider is None:
            raise ValueError("No scheduled report formats are registered")
        try:
            known_formats = frozenset(provider())
        except Exception as exc:
            raise ValueError("Scheduled report formats are unavailable") from exc
        if report_format not in known_formats:
            raise ValueError(f"Unsupported scheduled report format: {report_format}")

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
        requester_id: str = "",
        cron_timezone: str | None = None,
        report_format: str | None = None,
    ) -> dict:
        self._validate_report_format(report_format, action)
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
            self._validate_workflow_steps(steps)

        _reject_multiple_timing_modes(cron=cron, run_at=run_at, trigger=trigger)
        _reject_naive_run_at(run_at)

        if trigger is not None:
            self._validate_trigger(trigger)
        elif not cron and not run_at:
            raise ValueError("Either 'cron', 'run_at', or 'trigger' is required")

        if cron_timezone is not None:
            self._validate_timezone(cron_timezone)

        schedule: dict[str, Any] = {
            "id": uuid.uuid4().hex[:8],
            "_generation": uuid.uuid4().hex,
            "_revision": 0,
            "_execution_revision": 0,
            "description": description,
            "action": action,
            "channel_id": channel_id,
            "requester_id": requester_id,
            "created_at": datetime.now(UTC).isoformat(),
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
            if cron_timezone:
                schedule["timezone"] = cron_timezone
            schedule["next_run"] = _cron_next_run(cron, cron_timezone)
        else:
            if run_at:
                try:
                    datetime.fromisoformat(run_at)
                except (ValueError, TypeError):
                    raise ValueError(f"Invalid ISO datetime for run_at: {run_at!r}")
            # Validated above: a one-time schedule without run_at already
            # raised; cast records the guarantee for the checker.
            normalized = _utc_iso(datetime.fromisoformat(cast(str, run_at)))
            schedule["run_at"] = normalized
            schedule["next_run"] = normalized
            schedule["one_time"] = True

        if action == "reminder":
            schedule["message"] = message or description
        elif action == "check":
            schedule["tool_name"] = tool_name
            schedule["tool_input"] = tool_input or {}
            if report_format:
                schedule["report_format"] = report_format
        elif action == "webhook":
            # action == "webhook" already raised unless webhook_config is a dict.
            schedule["webhook_config"] = self._normalize_webhook_config(
                cast(dict, webhook_config)
            )
        elif action == "workflow":
            schedule["steps"] = steps

        # Retry configuration
        retries = max_retries if max_retries is not None else DEFAULT_MAX_RETRIES
        if retries < 0:
            raise ValueError("max_retries must be >= 0")
        backoff = (retry_backoff_seconds
            if retry_backoff_seconds is not None else DEFAULT_RETRY_BACKOFF_SECONDS)
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
            await self._publish([*self._schedules, schedule])
        self._wake.set()
        log_next = schedule.get("next_run", "on trigger")
        log.info("Added schedule %s: %s (next: %s)", schedule["id"], description, log_next)
        return schedule

    @staticmethod
    def _validate_timezone(tz_name: str) -> None:
        """Validate an IANA timezone name (e.g. 'America/New_York')."""
        if not isinstance(tz_name, str) or not tz_name:
            raise ValueError("cron_timezone must be a non-empty string")
        try:
            ZoneInfo(tz_name)
        except (ZoneInfoNotFoundError, ValueError) as e:
            raise ValueError(f"Invalid timezone {tz_name!r}: {e}") from e

    # Required inputs for the command-executing tools. A workflow step naming
    # run_command with no command is not a workflow step, it is a silent no-op
    # that reports success — and update used to accept it (adversarial review).
    _STEP_REQUIRED_INPUTS = {
        "run_command": "command",
        "run_script": "script",
        "run_command_multi": "command",
    }

    @classmethod
    def _validate_workflow_steps(cls, steps: Any) -> None:
        """THE workflow-steps contract, shared by add() and update().

        Creation enforced this and update did not, so an existing workflow
        could be updated to an empty list, or to steps missing the input their
        tool requires, and the invalid version was persisted (adversarial
        review of v3.65.1, reproduced with [], [{"tool_name": "run_command",
        "tool_input": {}}] and [{"tool_name": "run_command"}]).
        """
        if not steps or not isinstance(steps, list):
            raise ValueError("'steps' (list) is required for 'workflow' actions")
        for i, step in enumerate(steps):
            if not isinstance(step, dict) or "tool_name" not in step:
                raise ValueError(f"Step {i}: must be a dict with 'tool_name'")
            tool_name = step.get("tool_name")
            required = cls._STEP_REQUIRED_INPUTS.get(str(tool_name))
            if required:
                tool_input = step.get("tool_input")
                if not isinstance(tool_input, dict) or not str(
                    tool_input.get(required, "")
                ).strip():
                    raise ValueError(
                        f"Step {i}: {tool_name} requires "
                        f"'tool_input.{required}'"
                    )

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
        valid_sources = {
            "gitea",
            "grafana",
            "generic",
            "github",
            "gitlab",
            "discord_reaction",
            "discord_message",
        }
        source = trigger.get("source")
        if source and source not in valid_sources:
            raise ValueError(
                f"Invalid trigger source '{source}'. "
                f"Valid: {', '.join(sorted(valid_sources))}"
            )
        regex = trigger.get("content_regex")
        if regex:
            if len(regex) > 200:
                raise ValueError("content_regex must be under 200 characters")
            try:
                re.compile(regex)
            except re.error as e:
                raise ValueError(f"Invalid content_regex: {e}") from e
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
                        "webhook_config.expected_status_codes must contain "
                        "valid HTTP status codes (100-599)"
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
        if self._http_session is None or self._http_session.closed:
            self._http_session = aiohttp.ClientSession()
        session = self._http_session
        kwargs: dict[str, Any] = {"headers": headers, "timeout": timeout}
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
                if not re.search(trigger["content_regex"], content[:10_000]):
                    return False
            except re.error:
                log.warning("Regex trigger evaluation failed: %s", trigger["content_regex"][:50])
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
        Collects matches under lock, executes callbacks outside it
        (same pattern as _tick) to prevent deadlock.
        """
        if not self._callback:
            return 0

        matched: list[dict] = []
        async with self._lock:
            now = datetime.now(UTC)
            candidate = copy.deepcopy(self._schedules)
            for schedule in candidate:
                if schedule.get("paused"):
                    continue
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
                matched.append(copy.deepcopy(schedule))

            if matched:
                await self._publish(candidate)

        for schedule in matched:
            await self._execute_and_record(schedule)
        return len(matched)

    def list_all(self) -> list[dict]:
        return list(self._schedules)

    async def reset_failures(self, schedule_id: str) -> dict | None:
        """Reset failure counters and cancel pending retries for a schedule."""
        async with self._lock:
            candidate = copy.deepcopy(self._schedules)
            for s in candidate:
                if s["id"] == schedule_id:
                    s["consecutive_failures"] = 0
                    s["retry_count"] = 0
                    s["last_error"] = None
                    s["last_error_at"] = None
                    s.pop("retry_at", None)
                    s["_revision"] = s.get("_revision", 0) + 1
                    s["_execution_revision"] = s.get("_execution_revision", 0) + 1
                    await self._publish(candidate)
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
        paused: bool | None = None,
        cron_timezone: str | None = None,
        report_format: str | None = None,
    ) -> dict | None:
        """Update mutable fields on an existing schedule.

        Returns the updated schedule dict, or ``None`` if *schedule_id* was
        not found.  Only supplied (non-``None``) fields are changed.

        Changing timing (cron/run_at/trigger) replaces the previous timing
        mode entirely — e.g. passing ``cron`` on a one-time schedule converts
        it to recurring.
        """
        if cron_timezone is not None:
            self._validate_timezone(cron_timezone)
        async with self._lock:
            target_index: int | None = None
            for i, schedule in enumerate(self._schedules):
                if schedule["id"] == schedule_id:
                    target_index = i
                    break
            if target_index is None:
                return None

            # Apply the complete update to a detached candidate. Validation of
            # cron/trigger/webhook/timing fields occurs throughout this method;
            # mutating the live dict first let ANY later ValueError leave
            # rejected fields in memory, where a subsequent valid update would
            # persist them. Commit only after every supplied field is valid.
            original = self._schedules[target_index]
            target = copy.deepcopy(original)
            action = target["action"]
            if steps is not None and action == "workflow":
                self._validate_workflow_steps(steps)

            # --- simple text fields ---
            if description is not None:
                target["description"] = description
            if message is not None:
                target["message"] = message
            if channel_id is not None:
                target["channel_id"] = channel_id
            if paused is not None:
                target["paused"] = paused

            # --- action-specific payload fields ---
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
            if report_format is not None:
                self._validate_report_format(report_format, target.get("action", ""))
                if report_format:
                    target["report_format"] = report_format
                else:
                    target.pop("report_format", None)
            if steps is not None:
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

            # A timezone change alone (no new cron) still needs next_run
            # recomputed on the existing cron.
            if cron_timezone is not None:
                target["timezone"] = cron_timezone

            # --- timing mode changes ---
            _reject_multiple_timing_modes(cron=cron, run_at=run_at, trigger=trigger)
            _reject_naive_run_at(run_at)
            new_timing = trigger is not None or cron is not None or run_at is not None
            if new_timing:
                # Clear previous timing fields
                for key in ("cron", "run_at", "next_run", "trigger"):
                    target.pop(key, None)

                if trigger is not None:
                    self._validate_trigger(trigger)
                    target["trigger"] = trigger
                    target["one_time"] = False
                    target.pop("timezone", None)
                elif cron is not None:
                    if not croniter.is_valid(cron):
                        raise ValueError(f"Invalid cron expression: {cron}")
                    target["cron"] = cron
                    target["one_time"] = False
                    target["next_run"] = _cron_next_run(cron, target.get("timezone"))
                elif run_at is not None:
                    try:
                        datetime.fromisoformat(run_at)
                    except (ValueError, TypeError):
                        raise ValueError(f"Invalid ISO datetime for run_at: {run_at!r}")
                    normalized = _utc_iso(datetime.fromisoformat(run_at))
                    target["run_at"] = normalized
                    target["next_run"] = normalized
                    target["one_time"] = True
                    target.pop("timezone", None)
            elif cron_timezone is not None and target.get("cron"):
                # Timezone changed on an existing cron schedule — recompute.
                target["next_run"] = _cron_next_run(target["cron"], cron_timezone)

            target["_revision"] = original.get("_revision", 0) + 1
            # Descriptive edits preserve outcomes; execution-affecting edits
            # supersede the old run's retry/completion policy.
            if any(target.get(key) != original.get(key) for key in
                   set(target) | set(original) if key not in {"description", "_revision"}):
                target["_execution_revision"] = original.get("_execution_revision", 0) + 1
            candidate = list(self._schedules)
            candidate[target_index] = target
            await self._publish(candidate)
            log.info("Updated schedule %s", schedule_id)
            return dict(target)

    async def run_now(self, schedule_id: str) -> dict:
        """Manually trigger a schedule immediately.

        Returns a result dict with status, schedule info, and optional warning.
        Raises ValueError if the schedule is not found or callback is not set.
        """
        if not self._callback:
            raise ValueError("Scheduler callback not configured")

        schedule: dict | None = None
        async with self._lock:
            for s in self._schedules:
                if s["id"] == schedule_id:
                    schedule = copy.deepcopy(s)
                    break
            if schedule is None:
                raise ValueError(f"Schedule '{schedule_id}' not found")
            schedule["last_run"] = datetime.now(UTC).isoformat()
            candidate = [schedule if s["id"] == schedule_id else s for s in self._schedules]
            await self._publish(candidate)

        log.info("Manual run: schedule %s (%s)", schedule_id, schedule.get("description", ""))
        failures_before = schedule.get("consecutive_failures", 0)
        executed = await self._execute_and_record(schedule)
        if not executed:
            skipped_result = {
                "status": "skipped",
                "schedule_id": schedule_id,
                "error": "schedule is already executing",
            }
            if schedule.get("paused"):
                skipped_result["warning"] = "schedule is paused — this was a manual override"
            return skipped_result

        failed = schedule.get("consecutive_failures", 0) > failures_before
        result: dict = {
            "status": "failure" if failed else "success",
            "schedule_id": schedule_id,
        }
        if failed:
            result["error"] = schedule.get("last_error", "unknown error")
        if schedule.get("paused"):
            result["warning"] = "schedule is paused — this was a manual override"

        return result

    async def delete(self, schedule_id: str) -> bool:
        async with self._lock:
            before = len(self._schedules)
            candidate = [s for s in self._schedules if s["id"] != schedule_id]
            if len(candidate) < before:
                await self._publish(candidate)
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
        # Idempotent: Discord fires on_ready on every reconnect, and start()
        # used to create_task() unconditionally, leaking a second _loop() that
        # ticked independently and double-fired one-time/retry schedules.
        if self._task is not None and not self._task.done():
            log.info("Scheduler already running; refreshed callbacks without a second loop")
            return
        self._task = asyncio.create_task(self._loop())
        log.info("Scheduler started with %d schedule(s)", len(self._schedules))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()
        log.info("Scheduler stopped")

    async def _loop(self) -> None:
        while True:
            try:
                self._wake.clear()
                delay = self._compute_tick_delay()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=delay)
                except TimeoutError:
                    pass
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
            now = datetime.now(UTC).replace(tzinfo=None)
            soonest: datetime | None = None
            for schedule in self._schedules:
                if schedule.get("paused"):
                    continue
                # A pending retry has its own due time; ignoring it here meant
                # retries waited for the next 60s tick instead of firing on time.
                nxt = schedule.get("retry_at") or schedule.get("next_run")
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
        """Compute the next retry time using exponential backoff.

        ``attempt`` is 1-based (the retry_count that was just incremented),
        so the first retry waits base·2⁰ = base, the second base·2¹, etc.
        Using retry_count directly made the first retry wait 2·base.
        """
        attempt = schedule.get("retry_count", 1)
        base = schedule.get("retry_backoff_seconds", DEFAULT_RETRY_BACKOFF_SECONDS)
        delay = min(base * (2 ** max(0, attempt - 1)), MAX_BACKOFF_SECONDS)
        retry_time = datetime.now(UTC) + timedelta(seconds=delay)
        return retry_time.isoformat()

    async def _execute_and_record(self, schedule: dict) -> bool:
        """Execute the schedule callback and record the result in history.

        For 'webhook' actions, the built-in HTTP executor is used directly.
        All other actions are dispatched through the registered callback.

        A per-schedule in-flight guard drops overlapping executions (manual
        run_now during a tick, duplicate webhook deliveries) so a schedule
        never runs twice concurrently.
        """
        sid = schedule.get("id", "")
        if sid in self._in_flight:
            log.warning(
                "Schedule %s is already executing — skipping overlapping fire", sid,
            )
            return False
        self._in_flight.add(sid)
        try:
            identity = self._execution_identity(schedule)
            await self._execute_and_record_inner(schedule)
            async with self._lock:
                candidate = copy.deepcopy(self._schedules)
                for current in candidate:
                    if current["id"] != sid or self._execution_identity(current) != identity:
                        continue
                    for key in ("last_run", "consecutive_failures", "retry_count",
                                "last_error", "last_error_at", "retry_at"):
                        if key in schedule:
                            current[key] = schedule[key]
                        else:
                            current.pop(key, None)
                    if schedule.get("one_time"):
                        if not schedule.get("last_error"):
                            candidate.remove(current)
                        elif "next_run" not in schedule:
                            current.pop("next_run", None)
                    await self._publish(candidate)
                    break
            return True
        finally:
            self._in_flight.discard(sid)

    async def _execute_and_record_inner(self, schedule: dict) -> None:
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
            retry_attempt = (
                0
                if isinstance(e, NonRetryableScheduleError)
                else schedule.get("retry_count", 0) + 1
            )
            await self._handle_failure(schedule, e)
            await self.history.record(
                schedule_id=schedule["id"],
                description=schedule.get("description", ""),
                action=schedule.get("action", ""),
                status="failure",
                duration_ms=duration_ms,
                error=str(e),
                retry_attempt=(
                    retry_attempt if retry_attempt and schedule.get("max_retries", 0) > 0 else 0
                ),
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
        schedule["last_error"] = None
        schedule["last_error_at"] = None
        schedule.pop("retry_at", None)

    async def _handle_failure(self, schedule: dict, error: Exception) -> None:
        """Track failure and schedule retry if within limits."""
        now = datetime.now(UTC)
        schedule["consecutive_failures"] = schedule.get("consecutive_failures", 0) + 1
        schedule["last_error"] = str(error)[:500]
        schedule["last_error_at"] = now.isoformat()

        max_retries = schedule.get("max_retries", DEFAULT_MAX_RETRIES)
        retry_count = schedule.get("retry_count", 0)

        if isinstance(error, NonRetryableScheduleError):
            schedule.pop("retry_at", None)
            if schedule.get("one_time"):
                schedule.pop("next_run", None)
            log.error(
                "Schedule %s requires manual resolution and will not be retried: %s",
                schedule["id"],
                error,
            )
        elif max_retries > 0 and retry_count < max_retries:
            schedule["retry_count"] = retry_count + 1
            schedule["retry_at"] = self._compute_retry_at(schedule)
            log.warning(
                "Schedule %s failed (attempt %d/%d), retry at %s: %s",
                schedule["id"], retry_count + 1, max_retries,
                schedule["retry_at"], error,
            )
        else:
            schedule.pop("retry_at", None)
            # A terminally failed one-time schedule must remain available for
            # manual recovery without firing again on every scheduler tick.
            if schedule.get("one_time"):
                schedule.pop("next_run", None)
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
        to_fire: list[dict] = []

        async with self._lock:
            now = datetime.now(UTC)
            now_naive = now.replace(tzinfo=None)

            candidate = copy.deepcopy(self._schedules)
            for schedule in candidate:
                if schedule.get("paused"):
                    continue

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
                        to_fire.append(copy.deepcopy(schedule))
                    continue

                next_run_str = schedule.get("next_run")
                if not next_run_str:
                    continue

                next_run = datetime.fromisoformat(next_run_str)
                if next_run.tzinfo is not None:
                    next_run = next_run.replace(tzinfo=None)
                if now_naive < next_run:
                    continue

                log.info("Firing schedule %s: %s", schedule["id"], schedule["description"])
                schedule["last_run"] = now.isoformat()
                to_fire.append(copy.deepcopy(schedule))

                if schedule.get("cron"):
                    schedule["next_run"] = _cron_next_run(
                        schedule["cron"], schedule.get("timezone"),
                    )

            if to_fire:
                await self._publish(candidate)

        # Execute callbacks OUTSIDE the lock so callbacks can safely
        # call add()/delete()/update() without deadlocking.  Keep only the
        # executions this tick actually owned: an overlapping run_now may hold
        # the in-flight guard, and a skipped one-time task is not completed.
        for schedule in to_fire:
            await self._execute_and_record(schedule)
