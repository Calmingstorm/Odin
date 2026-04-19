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
    # Policy-driven categories (v2): failures that shouldn't be silently
    # retried but should annotate the result with a useful hint so the LLM
    # can adapt on the next iteration instead of blindly repeating.
    AUTH_FAILURE = "auth_failure"
    NOT_FOUND = "not_found"
    DISK_FULL = "disk_full"
    DEPENDENCY_MISSING = "dependency_missing"
    PERMISSION_DENIED = "permission_denied"


class RecoveryStrategy(str, Enum):
    """What to do when a category fires.

    RETRY_WITH_DELAY — sleep and try the same call once more (legacy behavior).
    HINT_AND_ESCALATE — don't retry; append a recovery hint to the result
        so the LLM can choose a different tool / host / input on the next
        iteration. Safe for UNSAFE_TO_RETRY tools because we never re-execute.
    NO_ACTION — don't retry, don't annotate (e.g. the error is already
        self-explanatory or the tool declines recovery).
    """
    RETRY_WITH_DELAY = "retry"
    HINT_AND_ESCALATE = "hint"
    NO_ACTION = "none"


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
    "docker_ops",
    "terraform_ops",
    "kubectl",
    "execute_plan",
    "issue_tracker",
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
    RecoveryCategory.AUTH_FAILURE: (
        "authentication failed",
        "Authentication failed",
        "401 Unauthorized",
        "403 Forbidden",
        # HTTP status strings from aiohttp use "<code>: <reason>" — the
        # colon-form needs its own entry.
        "HTTP 401:",
        "HTTP 403:",
        "Bad credentials",
        "invalid_token",
        "token expired",
        "Permission denied (publickey",
    ),
    RecoveryCategory.NOT_FOUND: (
        "404 Not Found",
        # aiohttp resp.reason form: "HTTP 404: Not Found" — different
        # from the bare "404 Not Found" pattern, so list both.
        "HTTP 404:",
        "No such file or directory",
        "does not exist",
        "ENOENT",
        "not found in",
    ),
    RecoveryCategory.DISK_FULL: (
        "No space left on device",
        "ENOSPC",
        "disk quota exceeded",
    ),
    RecoveryCategory.DEPENDENCY_MISSING: (
        "ModuleNotFoundError",
        "command not found",
        "ImportError",
        "No module named",
        "manifest unknown",
        "Unable to find image",
        # Debian/Ubuntu `sh` emits "<cmd>: not found" (no "command"
        # prefix) when a binary isn't on PATH. Typical shape:
        #   /bin/sh: 1: kubectl: not found
        # Order matters: the newline-anchored pattern is the clean
        # match; the second, unanchored pattern is a fallback for
        # output truncated at MAX_RESULT mid-line or emitted without
        # a trailing newline. NOT_FOUND owns "not found in" and is
        # checked first in _CLASSIFICATION_PRIORITY, so mid-line
        # prose like "error: config key: not found in map" routes
        # correctly and never reaches this fallback.
        ": not found\n",
        ": not found",
    ),
    RecoveryCategory.PERMISSION_DENIED: (
        "Permission denied",
        "EACCES",
        "Operation not permitted",
        "EPERM",
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


@dataclass(frozen=True)
class RecoveryPolicy:
    """A strategy + optional hint for handling a recovery category.

    Hints are short natural-language directives injected into the tool
    result. They're consumed by the LLM on the next iteration — 'try tool
    X', 'verify host Y', 'escalate to operator'. The point is that
    identical-retry is often wasted effort; a different next step is
    frequently the actual recovery.
    """
    strategy: RecoveryStrategy
    delay_seconds: float = 1.0
    hint: str = ""


# Default per-category policies. Transient categories keep the legacy
# one-shot retry; failure-class categories prefer hinting over retrying
# (retrying a 401 produces a second 401 — escalate to the LLM instead).
_DEFAULT_POLICIES: dict[RecoveryCategory, RecoveryPolicy] = {
    RecoveryCategory.SSH_TRANSIENT: RecoveryPolicy(
        RecoveryStrategy.RETRY_WITH_DELAY, 2.0,
    ),
    RecoveryCategory.CONNECTION_ERROR: RecoveryPolicy(
        RecoveryStrategy.RETRY_WITH_DELAY, 1.0,
    ),
    RecoveryCategory.RESOURCE_BUSY: RecoveryPolicy(
        RecoveryStrategy.RETRY_WITH_DELAY, 1.0,
    ),
    RecoveryCategory.TIMEOUT: RecoveryPolicy(
        RecoveryStrategy.NO_ACTION, 0.0,
    ),
    RecoveryCategory.RATE_LIMITED: RecoveryPolicy(
        RecoveryStrategy.RETRY_WITH_DELAY, 2.0,
    ),
    RecoveryCategory.BULKHEAD_FULL: RecoveryPolicy(
        RecoveryStrategy.RETRY_WITH_DELAY, 1.0,
    ),
    RecoveryCategory.AUTH_FAILURE: RecoveryPolicy(
        RecoveryStrategy.HINT_AND_ESCALATE, 0.0,
        hint=(
            "[recovery hint: authentication failure — do not retry the same "
            "call. Verify credentials, refresh the token/key, or escalate to "
            "the operator. If SSH, check ssh_key_path and known_hosts. If API, "
            "check the secret store entry for this host/service.]"
        ),
    ),
    RecoveryCategory.NOT_FOUND: RecoveryPolicy(
        RecoveryStrategy.HINT_AND_ESCALATE, 0.0,
        hint=(
            "[recovery hint: target not found — do not retry with the same "
            "path/URL. Use read_file or http_probe on a parent path to locate "
            "the real target, or ask the operator for the correct reference.]"
        ),
    ),
    RecoveryCategory.DISK_FULL: RecoveryPolicy(
        RecoveryStrategy.HINT_AND_ESCALATE, 0.0,
        hint=(
            "[recovery hint: disk full on target host — do not retry. Run "
            "'df -h' to confirm, then identify a cleanup candidate (logs, "
            "caches, old snapshots) before any follow-up write operation.]"
        ),
    ),
    RecoveryCategory.DEPENDENCY_MISSING: RecoveryPolicy(
        RecoveryStrategy.HINT_AND_ESCALATE, 0.0,
        hint=(
            "[recovery hint: missing dependency — do not retry. The command "
            "or module is not installed on the target. Propose an install "
            "step (apt/pip/docker pull/package) or switch to an alternative "
            "tool that doesn't need it.]"
        ),
    ),
    RecoveryCategory.PERMISSION_DENIED: RecoveryPolicy(
        RecoveryStrategy.HINT_AND_ESCALATE, 0.0,
        hint=(
            "[recovery hint: permission denied — do not retry with the same "
            "user. Verify file mode/owner (ls -l), consider sudo if the "
            "operator approved it for this task, or escalate.]"
        ),
    ),
}


def get_policy(category: RecoveryCategory) -> RecoveryPolicy:
    """Return the default policy for a category, or a NO_ACTION fallback."""
    return _DEFAULT_POLICIES.get(
        category,
        RecoveryPolicy(RecoveryStrategy.NO_ACTION, 0.0),
    )


def get_hint(category: RecoveryCategory) -> str:
    """Return the hint string for a category's policy (may be empty)."""
    return get_policy(category).hint


# Explicit classification priority. The first category in this list whose
# patterns match the error wins — AUTH_FAILURE before PERMISSION_DENIED,
# NOT_FOUND before DEPENDENCY_MISSING, etc. We rely on this order instead
# of dict-insertion ordering so a future refactor can't silently flip
# precedence.
_CLASSIFICATION_PRIORITY: tuple[RecoveryCategory, ...] = (
    # Transient / connectivity first — those patterns are the most specific
    # and shouldn't be misread as permission or dependency issues.
    RecoveryCategory.SSH_TRANSIENT,
    RecoveryCategory.CONNECTION_ERROR,
    RecoveryCategory.RESOURCE_BUSY,
    RecoveryCategory.TIMEOUT,
    RecoveryCategory.RATE_LIMITED,
    RecoveryCategory.BULKHEAD_FULL,
    # Auth BEFORE generic permission so "Permission denied (publickey" hits
    # AUTH_FAILURE rather than the broader PERMISSION_DENIED rule.
    RecoveryCategory.AUTH_FAILURE,
    RecoveryCategory.PERMISSION_DENIED,
    # Not-found BEFORE dependency-missing so "No such file" doesn't trip on
    # ModuleNotFoundError's 'No module named' substring by accident.
    RecoveryCategory.NOT_FOUND,
    RecoveryCategory.DEPENDENCY_MISSING,
    RecoveryCategory.DISK_FULL,
)


@dataclass(frozen=True)
class RecoveryAction:
    """Single-shot decision about what to do with a failed tool result.

    Having the full decision in one object means the executor never has
    to re-derive any of it. A future edit to the policy table cannot
    accidentally bypass the UNSAFE_TO_RETRY guard, because this function
    is the sole place the guard is consulted.
    """
    action: str  # "retry" | "hint" | "skip"
    category: RecoveryCategory | None
    delay_seconds: float = 0.0
    hint_text: str = ""


def decide_recovery_action(
    *, tool_name: str, category: RecoveryCategory | None,
) -> RecoveryAction:
    """Single source of truth for 'what do we do about this failure'.

    - category is None (un-classified failure) → skip
    - TIMEOUT → skip (handled elsewhere via timeout chain)
    - HINT_AND_ESCALATE policy → hint (safe for UNSAFE_TO_RETRY — no re-exec)
    - NO_ACTION policy → skip
    - RETRY_WITH_DELAY policy + tool in UNSAFE_TO_RETRY → skip (must not re-exec)
    - RETRY_WITH_DELAY policy + tool safe → retry with configured delay
    """
    if category is None:
        return RecoveryAction(action="skip", category=None)
    policy = get_policy(category)
    if policy.strategy == RecoveryStrategy.HINT_AND_ESCALATE:
        return RecoveryAction(
            action="hint", category=category, hint_text=policy.hint,
        )
    if policy.strategy == RecoveryStrategy.NO_ACTION:
        return RecoveryAction(action="skip", category=category)
    # Remaining case: RETRY_WITH_DELAY.
    if tool_name in UNSAFE_TO_RETRY:
        return RecoveryAction(action="skip", category=category)
    delay = policy.delay_seconds if policy.delay_seconds else get_retry_delay(category)
    return RecoveryAction(
        action="retry", category=category, delay_seconds=delay,
    )


def classify_error(error_text: str) -> RecoveryCategory | None:
    """Classify a tool error string into a recoverable category.

    Only examines strings that start with known error prefixes to avoid
    false-positives on normal command output containing error-like text.
    Categories are consulted in the order declared by
    ``_CLASSIFICATION_PRIORITY`` (AUTH before generic PERMISSION_DENIED,
    etc.) — we don't rely on dict insertion order.
    """
    if not isinstance(error_text, str):
        return None
    if not any(error_text.startswith(p) for p in _ERROR_PREFIXES):
        return None
    for category in _CLASSIFICATION_PRIORITY:
        if category in _SKIP_RESULT_CATEGORIES:
            continue
        for pattern in _RECOVERABLE_PATTERNS.get(category, ()):
            if pattern in error_text:
                return category
    return None


def classify_exception(error_text: str) -> RecoveryCategory | None:
    """Classify an exception description into a recoverable category.

    More permissive than classify_error — exceptions are inherently
    error conditions so no prefix check is needed. Priority ordering is
    shared with classify_error.
    """
    if not isinstance(error_text, str):
        return None
    for category in _CLASSIFICATION_PRIORITY:
        for pattern in _RECOVERABLE_PATTERNS.get(category, ()):
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
