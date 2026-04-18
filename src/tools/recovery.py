"""Recovery-before-escalation for transient tool failures.

Classifies error strings into recoverable categories and provides
single-retry recovery with appropriate delays. Known transient failure
patterns are retried once automatically before surfacing to the user.
"""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum


class RecoveryCategory(str, Enum):
    SSH_TRANSIENT = "ssh_transient"
    CONNECTION_ERROR = "connection_error"
    RESOURCE_BUSY = "resource_busy"
    TIMEOUT = "timeout"
    RATE_LIMITED = "rate_limited"
    BULKHEAD_FULL = "bulkhead_full"


UNSAFE_TO_RETRY: frozenset[str] = frozenset({
    "run_command",
    "run_script",
    "run_command_multi",
    "write_file",
    "git_ops",
    "manage_process",
    "claude_code",
    "delete_knowledge",
    "delete_schedule",
    "update_schedule",
    "purge_messages",
    "create_skill",
    "edit_skill",
    "delete_skill",
    "invoke_skill",
    "spawn_agent",
    "kill_agent",
    "start_loop",
    "stop_loop",
    "schedule_task",
    "delegate_task",
    "generate_image",
    "browser_click",
    "browser_fill",
    "browser_evaluate",
    "post_file",
    "generate_file",
    "add_reaction",
    "create_poll",
    "set_permission",
    "memory_manage",
    "manage_list",
    "ingest_document",
    "bulk_ingest_knowledge",
})


# Substrings that indicate a transient, recoverable failure.
_RECOVERABLE_PATTERNS: dict[RecoveryCategory, tuple[str, ...]] = {
    RecoveryCategory.SSH_TRANSIENT: (
        "Connection refused",
        "Connection reset",
        "Connection timed out",
        "No route to host",
        "Network is unreachable",
        "ssh_exchange_identification",
        "kex_exchange_identification",
    ),
    RecoveryCategory.CONNECTION_ERROR: (
        "ConnectionResetError",
        "ConnectionRefusedError",
        "ConnectionAbortedError",
        "BrokenPipeError",
        "ServerDisconnectedError",
        "ClientConnectorError",
        "ClientOSError",
    ),
    RecoveryCategory.RESOURCE_BUSY: (
        "database is locked",
        "resource temporarily unavailable",
        "Resource temporarily unavailable",
    ),
    RecoveryCategory.TIMEOUT: (
        "timed out",
    ),
    RecoveryCategory.RATE_LIMITED: (
        "rate limit exceeded",
        "Rate limit exceeded",
        "RateLimitError",
        "Too Many Requests",
    ),
    RecoveryCategory.BULKHEAD_FULL: (
        "bulkhead full",
    ),
}

# Error prefixes that indicate a tool returned an error (not normal output).
_ERROR_PREFIXES = (
    "Error:",
    "Error executing",
    "Command failed",
)

# Delay in seconds before retry, per category.
_CATEGORY_DELAYS: dict[RecoveryCategory, float] = {
    RecoveryCategory.SSH_TRANSIENT: 2.0,
    RecoveryCategory.CONNECTION_ERROR: 1.0,
    RecoveryCategory.RESOURCE_BUSY: 1.0,
    RecoveryCategory.TIMEOUT: 0.0,
    RecoveryCategory.RATE_LIMITED: 2.0,
    RecoveryCategory.BULKHEAD_FULL: 1.0,
}

# Categories that should NOT be retried at the tool-result level
# (they already have their own internal retry logic).
_SKIP_RESULT_CATEGORIES = frozenset({
    RecoveryCategory.TIMEOUT,
})


def classify_error(error_text: str) -> RecoveryCategory | None:
    """Classify a tool error string into a recoverable category.

    Only examines strings that start with known error prefixes to avoid
    false-positives on normal command output containing error-like text.
    Returns None for non-errors or non-recoverable errors.
    """
    if not isinstance(error_text, str):
        return None
    if not any(error_text.startswith(p) for p in _ERROR_PREFIXES):
        return None
    for category, patterns in _RECOVERABLE_PATTERNS.items():
        if category in _SKIP_RESULT_CATEGORIES:
            continue
        for pattern in patterns:
            if pattern in error_text:
                return category
    return None


def classify_exception(error_text: str) -> RecoveryCategory | None:
    """Classify an exception description into a recoverable category.

    More permissive than classify_error — exceptions are inherently
    error conditions so no prefix check is needed.
    """
    if not isinstance(error_text, str):
        return None
    for category, patterns in _RECOVERABLE_PATTERNS.items():
        for pattern in patterns:
            if pattern in error_text:
                return category
    return None


def get_retry_delay(category: RecoveryCategory) -> float:
    """Get the retry delay in seconds for a recovery category."""
    return _CATEGORY_DELAYS.get(category, 1.0)


@dataclass
class RecoveryEvent:
    """Record of a single recovery attempt."""
    tool_name: str
    category: str
    succeeded: bool
    timestamp: float
    error_snippet: str = ""


class RecoveryStats:
    """Track recovery attempt/success/failure counts for observability."""

    def __init__(self, max_recent: int = 100) -> None:
        self._attempts: dict[str, int] = defaultdict(int)
        self._successes: dict[str, int] = defaultdict(int)
        self._failures: dict[str, int] = defaultdict(int)
        self._tool_attempts: dict[str, int] = defaultdict(int)
        self._tool_successes: dict[str, int] = defaultdict(int)
        self._recent: list[RecoveryEvent] = []
        self._max_recent = max_recent

    def record_attempt(self, tool_name: str, category: RecoveryCategory, error_snippet: str = "") -> None:
        self._attempts[category.value] += 1
        self._tool_attempts[tool_name] += 1

    def record_success(self, tool_name: str, category: RecoveryCategory, error_snippet: str = "") -> None:
        self._successes[category.value] += 1
        self._tool_successes[tool_name] += 1
        self._recent.append(RecoveryEvent(tool_name, category.value, True, time.time(), error_snippet))
        if len(self._recent) > self._max_recent:
            self._recent = self._recent[-self._max_recent:]

    def record_failure(self, tool_name: str, category: RecoveryCategory, error_snippet: str = "") -> None:
        self._failures[category.value] += 1
        self._recent.append(RecoveryEvent(tool_name, category.value, False, time.time(), error_snippet))
        if len(self._recent) > self._max_recent:
            self._recent = self._recent[-self._max_recent:]

    def get_summary(self) -> dict:
        all_cats = set(list(self._attempts) + list(self._successes) + list(self._failures))
        return {
            "by_category": {
                cat: {
                    "attempts": self._attempts.get(cat, 0),
                    "successes": self._successes.get(cat, 0),
                    "failures": self._failures.get(cat, 0),
                }
                for cat in sorted(all_cats)
            },
            "by_tool": {
                tool: {
                    "attempts": self._tool_attempts.get(tool, 0),
                    "successes": self._tool_successes.get(tool, 0),
                }
                for tool in sorted(self._tool_attempts)
            },
            "totals": {
                "attempts": sum(self._attempts.values()),
                "successes": sum(self._successes.values()),
                "failures": sum(self._failures.values()),
            },
        }

    def get_recent(self, limit: int = 20) -> list[dict]:
        return [
            {
                "tool": e.tool_name,
                "category": e.category,
                "succeeded": e.succeeded,
                "timestamp": e.timestamp,
                "error_snippet": e.error_snippet,
            }
            for e in self._recent[-limit:]
        ]

    def reset(self) -> None:
        self._attempts.clear()
        self._successes.clear()
        self._failures.clear()
        self._tool_attempts.clear()
        self._tool_successes.clear()
        self._recent.clear()
