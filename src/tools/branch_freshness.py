"""Branch freshness checker — detects stale branches on test failure.

When test commands fail, checks if the local branch is behind its remote
tracking branch. Annotates the result so the LLM/loop knows the failure
might be from outdated code rather than a real regression.
"""
from __future__ import annotations

import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from ..odin_log import get_logger

log = get_logger("branch_freshness")

ExecFn = Callable[[str, str, str], Awaitable[tuple[int, str]]]

_TEST_COMMAND_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bpytest\b"),
    re.compile(r"\bpython3?\s+-m\s+pytest\b"),
    re.compile(r"\bnpm\s+test\b"),
    re.compile(r"\byarn\s+test\b"),
    re.compile(r"\bpnpm\s+test\b"),
    re.compile(r"\bgo\s+test\b"),
    re.compile(r"\bcargo\s+test\b"),
    re.compile(r"\bmake\s+test\b"),
    re.compile(r"\bgradle\s+test\b"),
    re.compile(r"\bmvn\s+(?:test|verify)\b"),
    re.compile(r"\brspec\b"),
    re.compile(r"\bjest\b"),
    re.compile(r"\bmocha\b"),
    re.compile(r"\bvitest\b"),
    re.compile(r"\bphpunit\b"),
    re.compile(r"\bdotnet\s+test\b"),
    re.compile(r"\bunittest\b"),
    re.compile(r"\bnosetest\b"),
)

_TEST_FAILURE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\d+\s+failed"),
    re.compile(r"FAILED\b"),
    re.compile(r"FAILURES"),
    re.compile(r"Tests?\s+failed", re.IGNORECASE),
    re.compile(r"Assertion(?:Error|Failed)"),
    re.compile(r"FAIL\s+\S"),
)

FRESHNESS_CHECK_TIMEOUT = 15

MAX_RECENT_CHECKS = 50


def is_test_command(command: str) -> bool:
    """Return True if command looks like a test suite invocation."""
    for pat in _TEST_COMMAND_PATTERNS:
        if pat.search(command):
            return True
    return False


def is_test_failure(result: str, exit_code: int | None = None) -> bool:
    """Return True if the result indicates a test failure."""
    if exit_code is not None and exit_code != 0:
        for pat in _TEST_FAILURE_PATTERNS:
            if pat.search(result):
                return True
    if result.startswith("Command failed") or result.startswith("Script failed"):
        for pat in _TEST_FAILURE_PATTERNS:
            if pat.search(result):
                return True
    return False


@dataclass
class BranchStatus:
    is_stale: bool
    commits_behind: int
    local_branch: str
    remote_ref: str
    fetch_failed: bool = False
    error: str | None = None


@dataclass
class FreshnessEvent:
    tool_name: str
    command: str
    is_stale: bool
    commits_behind: int
    branch: str
    timestamp: float = field(default_factory=time.time)


class FreshnessStats:
    """Tracks branch freshness check history."""

    def __init__(self, max_recent: int = MAX_RECENT_CHECKS) -> None:
        self._checks: int = 0
        self._stale_found: int = 0
        self._fetch_failures: int = 0
        self._recent: list[FreshnessEvent] = []
        self._max_recent = max_recent

    def record(self, event: FreshnessEvent) -> None:
        self._checks += 1
        if event.is_stale:
            self._stale_found += 1
        self._recent.append(event)
        if len(self._recent) > self._max_recent:
            self._recent = self._recent[-self._max_recent:]

    def record_fetch_failure(self) -> None:
        self._fetch_failures += 1

    def get_summary(self) -> dict:
        return {
            "total_checks": self._checks,
            "stale_found": self._stale_found,
            "fetch_failures": self._fetch_failures,
        }

    def get_recent(self, limit: int = 10) -> list[dict]:
        events = self._recent[-limit:]
        return [
            {
                "tool_name": e.tool_name,
                "command": e.command[:120],
                "is_stale": e.is_stale,
                "commits_behind": e.commits_behind,
                "branch": e.branch,
                "timestamp": e.timestamp,
            }
            for e in events
        ]

    def reset(self) -> None:
        self._checks = 0
        self._stale_found = 0
        self._fetch_failures = 0
        self._recent.clear()


async def check_branch_freshness(
    exec_fn: ExecFn,
    address: str,
    ssh_user: str,
    timeout: int = FRESHNESS_CHECK_TIMEOUT,
) -> BranchStatus:
    """Check if the local branch is behind its remote tracking branch.

    Uses exec_fn(address, command, ssh_user) -> (exit_code, output) to
    run git commands on the same host where the test ran.
    """
    try:
        code, branch_out = await exec_fn(
            address, "git rev-parse --abbrev-ref HEAD 2>/dev/null", ssh_user,
        )
    except Exception:
        return BranchStatus(
            is_stale=False, commits_behind=0,
            local_branch="unknown", remote_ref="unknown",
            error="exec_fn raised",
        )

    if code != 0:
        return BranchStatus(
            is_stale=False, commits_behind=0,
            local_branch="unknown", remote_ref="unknown",
            error="not a git repo",
        )

    branch = branch_out.strip()
    if not branch or branch == "HEAD":
        return BranchStatus(
            is_stale=False, commits_behind=0,
            local_branch=branch or "HEAD", remote_ref="unknown",
            error="detached HEAD",
        )

    fetch_failed = False
    try:
        f_code, _ = await exec_fn(
            address, "git fetch origin --quiet 2>&1", ssh_user,
        )
        if f_code != 0:
            fetch_failed = True
    except Exception:
        fetch_failed = True

    try:
        code, count_out = await exec_fn(
            address,
            f"git rev-list --count HEAD..origin/{branch} 2>/dev/null || echo 0",
            ssh_user,
        )
    except Exception:
        return BranchStatus(
            is_stale=False, commits_behind=0,
            local_branch=branch, remote_ref=f"origin/{branch}",
            fetch_failed=fetch_failed, error="rev-list failed",
        )

    try:
        commits_behind = int(count_out.strip())
    except (ValueError, AttributeError):
        commits_behind = 0

    return BranchStatus(
        is_stale=commits_behind > 0,
        commits_behind=commits_behind,
        local_branch=branch,
        remote_ref=f"origin/{branch}",
        fetch_failed=fetch_failed,
    )


def format_staleness_warning(status: BranchStatus) -> str:
    """Format a warning string if the branch is stale. Empty string if fresh."""
    if not status.is_stale:
        return ""
    return (
        f"\n[STALE BRANCH] {status.local_branch} is {status.commits_behind} "
        f"commit(s) behind {status.remote_ref}. This test failure may be from "
        f"outdated code — pull before investigating."
    )
