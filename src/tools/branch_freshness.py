"""Branch freshness checker — detects stale branches on test failure.

When test commands fail, checks if the local branch is behind its remote
tracking branch. Annotates the result so the LLM/loop knows the failure
might be from outdated code rather than a real regression.
"""

from __future__ import annotations

import asyncio
import re
import shlex
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
            self._recent = self._recent[-self._max_recent :]

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


_LEADING_CD = re.compile(r"""\s*cd\s+(?:--\s+)?('[^']*'|"[^"]*"|[^\s;&|'"]+)\s*(?:&&|;)""")


def command_directory(command: str) -> str | None:
    """The directory a test command changes into first (``cd DIR && ...``).

    The freshness check must look at that repository, not at whatever the
    git commands' default directory happens to be. None when the command
    does not start with a plain ``cd`` (the check then uses the directory the
    command itself ran in).
    """
    match = _LEADING_CD.match(command)
    if not match:
        return None
    target = match.group(1)
    # Only single quotes make a target literal. Double quotes still expand
    # $VAR, $(...), `...` and backslash escapes; unquoted words also glob,
    # tilde-expand and brace-expand. An expanding target is never re-run:
    # the default directory is used instead.
    expanding = "" if target[0] == "'" else ("$`\\" if target[0] == '"' else "$~`*?[{\\")
    if any(c in target for c in expanding):
        return None
    parts = shlex.split(target)  # one quoted or plain word: never unbalanced
    return parts[0] if len(parts) == 1 and parts[0] else None


async def check_branch_freshness(
    exec_fn: ExecFn,
    address: str,
    ssh_user: str,
    timeout: int = FRESHNESS_CHECK_TIMEOUT,
    *,
    directory: str | None = None,
) -> BranchStatus:
    """Check if the test's branch is behind its configured upstream.

    Uses exec_fn(address, command, ssh_user) -> (exit_code, output) to run
    git where the test ran: in *directory* when the test command changed into
    one, else in the command's own default directory. The whole check shares
    one *timeout* budget. A branch without an upstream is reported, never
    counted as up to date.
    """
    prefix = f"cd -- {shlex.quote(directory)} && " if directory else ""

    async def git(command: str) -> tuple[int, str]:
        return await exec_fn(address, prefix + command, ssh_user)

    branch = "unknown"
    upstream = "unknown"
    try:
        async with asyncio.timeout(timeout):
            try:
                code, branch_out = await git("git rev-parse --abbrev-ref HEAD 2>/dev/null")
            except Exception:
                return BranchStatus(
                    is_stale=False,
                    commits_behind=0,
                    local_branch="unknown",
                    remote_ref="unknown",
                    error="exec_fn raised",
                )

            if code != 0:
                return BranchStatus(
                    is_stale=False,
                    commits_behind=0,
                    local_branch="unknown",
                    remote_ref="unknown",
                    error="not a git repo",
                )

            branch = branch_out.strip()
            if not branch or branch == "HEAD":
                return BranchStatus(
                    is_stale=False,
                    commits_behind=0,
                    local_branch=branch or "HEAD",
                    remote_ref="unknown",
                    error="detached HEAD",
                )

            try:
                code, upstream_out = await git(
                    "git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null"
                )
            except Exception:
                code, upstream_out = 1, ""
            upstream = upstream_out.strip()
            if code != 0 or not upstream:
                return BranchStatus(
                    is_stale=False,
                    commits_behind=0,
                    local_branch=branch,
                    remote_ref="none",
                    error="no upstream",
                )

            fetch_failed = False
            try:
                # Fetches the remote of the branch's upstream.
                f_code, _ = await git("git fetch --quiet 2>&1")
                if f_code != 0:
                    fetch_failed = True
            except Exception:
                fetch_failed = True

            try:
                code, count_out = await git("git rev-list --count 'HEAD..@{u}' 2>/dev/null")
            except Exception:
                code, count_out = 1, ""
            if code != 0:
                return BranchStatus(
                    is_stale=False,
                    commits_behind=0,
                    local_branch=branch,
                    remote_ref=upstream,
                    fetch_failed=fetch_failed,
                    error="rev-list failed",
                )
    except TimeoutError:
        return BranchStatus(
            is_stale=False,
            commits_behind=0,
            local_branch=branch,
            remote_ref=upstream,
            error="timed out",
        )

    try:
        commits_behind = int(count_out.strip())
    except (ValueError, AttributeError):
        commits_behind = 0

    return BranchStatus(
        is_stale=commits_behind > 0,
        commits_behind=commits_behind,
        local_branch=branch,
        remote_ref=upstream,
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
