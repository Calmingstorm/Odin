"""Post-action validation framework.

A validation bundle is a list of checks executed concurrently after some
operational change (a deploy, a restart, a config push). Each check has a
type, a target, an expectation, and a severity. The framework returns a
structured verdict — pass, degraded, or fail — along with per-check
evidence: observed value, error, and duration.

Design principles:
- **Observability, not friction**: a failing verdict never blocks execution.
  It is informational; the LLM and operator decide what to do with it.
- **Cheap and composable**: checks reuse existing tool primitives (SSH,
  local subprocess, curl) — no new transport.
- **Evidence-bearing**: every result carries observed/error/duration so
  failures are diagnosable without re-running the check.
- **Severity-aware**: verdict weights critical checks heavier than warn /
  info checks, so a noisy warn doesn't poison the overall signal.
"""

from __future__ import annotations

import asyncio
import json
import re
import shlex
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from typing import Any

import regex as bounded_regex

from ..odin_log import get_logger

log = get_logger("tools.post_validation")

CheckRunner = Callable[[str, str, str], Awaitable[tuple[int, str]]]
HostResolver = Callable[[str], tuple[str, str, str] | None]

MAX_CHECKS = 25
MAX_TARGET_LEN = 500
DEFAULT_CHECK_TIMEOUT = 20
DEFAULT_LOG_WINDOW_SECONDS = 120
# Ceiling on in-bundle parallelism so a large fan-out doesn't starve
# other bundles or overload the ssh / subprocess bulkheads. Twelve lets
# a typical validation bundle finish in roughly one round-trip while
# leaving headroom for concurrent bot traffic.
DEFAULT_MAX_PARALLEL_CHECKS = 12

# ReDoS hardening limits for the regex_match compare op.
# Size limits and heuristic rejection are defense in depth, not a runtime
# bound. The regex engine's deadline is authoritative even for shapes the
# heuristic does not recognize.
MAX_REGEX_PATTERN_LEN = 200
MAX_REGEX_INPUT_CHARS = 10_000
REGEX_TIMEOUT_SECONDS = 0.05
# Patterns with nested quantifiers are a common ReDoS footgun — reject
# the obvious shapes at parse time rather than letting them run.
_REDOS_HEURISTIC = re.compile(
    r"""
    \([^)]*[+*]\)[+*]          # (a+)+ or (a*)*
    | \([^)]*\|[^)]*\)[+*]     # (a|b)+
    | \\[0-9]                  # backreferences — also a common ReDoS source
    """,
    re.VERBOSE,
)

VALID_TYPES = frozenset(
    {
        "http",
        "port",
        "service",
        "process",
        "log_absent",
        "log_present",
        "command",
    }
)
VALID_SEVERITIES = frozenset({"critical", "warn", "info"})
VALID_COMPARE_OPS = frozenset(
    {
        "equals",
        "status_in",
        "contains",
        "not_contains",
        "exit_zero",
        "exit_nonzero",
        "regex_match",
    }
)

# compare ops that require a non-empty 'expected' value
_COMPARE_OPS_REQUIRING_EXPECTED = frozenset(
    {
        "equals",
        "contains",
        "not_contains",
        "regex_match",
        "status_in",
    }
)

# compare ops that are valid for each check type (others are rejected at parse
# time so the API never silently promises flexibility it won't deliver).
_ALLOWED_COMPARE_FOR_TYPE: dict[str, frozenset[str]] = {
    "http": frozenset({"status_in", "equals"}),
    "port": frozenset({"exit_zero"}),
    "service": frozenset({"equals", "status_in"}),
    "process": frozenset({"exit_zero"}),
    "log_absent": frozenset({"not_contains"}),
    "log_present": frozenset({"contains"}),
    "command": frozenset(
        {
            "exit_zero",
            "exit_nonzero",
            "equals",
            "contains",
            "not_contains",
            "regex_match",
        }
    ),
}


@dataclass(slots=True)
class Check:
    type: str
    target: str
    expected: Any = None
    severity: str = "critical"
    host: str | None = None
    compare: str | None = None
    window_seconds: int = DEFAULT_LOG_WINDOW_SECONDS
    timeout_seconds: int = DEFAULT_CHECK_TIMEOUT
    name: str | None = None


@dataclass(slots=True)
class CheckResult:
    name: str
    type: str
    target: str
    severity: str
    status: str  # "pass" | "fail" | "error"
    observed: str = ""
    effective_shell: str | None = None
    error: str = ""
    duration_ms: int = 0
    host: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(slots=True)
class ValidationReport:
    verdict: str  # "pass" | "degraded" | "fail" | "error"
    passed: int
    failed: int
    errored: int
    total: int
    duration_ms: int
    bundle: str
    checks: list[CheckResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["checks"] = [c.to_dict() for c in self.checks]
        return d


def parse_checks(raw_checks: list[dict]) -> tuple[list[Check], list[str]]:
    """Normalize user-supplied checks into Check objects. Returns (checks, errors)."""
    checks: list[Check] = []
    errors: list[str] = []
    if not isinstance(raw_checks, list):
        return [], ["'checks' must be a list"]
    if len(raw_checks) > MAX_CHECKS:
        return [], [f"too many checks (max {MAX_CHECKS}, got {len(raw_checks)})"]

    for i, raw in enumerate(raw_checks):
        if not isinstance(raw, dict):
            errors.append(f"check[{i}]: must be an object")
            continue
        c_type = str(raw.get("type", "")).strip()
        if c_type not in VALID_TYPES:
            errors.append(f"check[{i}]: invalid type '{c_type}' (valid: {sorted(VALID_TYPES)})")
            continue
        target = str(raw.get("target", "")).strip()
        if not target:
            errors.append(f"check[{i}]: 'target' is required")
            continue
        if len(target) > MAX_TARGET_LEN:
            errors.append(f"check[{i}]: 'target' too long (max {MAX_TARGET_LEN})")
            continue
        severity = str(raw.get("severity", "critical")).strip().lower()
        if severity not in VALID_SEVERITIES:
            errors.append(f"check[{i}]: invalid severity '{severity}'")
            continue
        compare = raw.get("compare")
        if compare is not None:
            compare = str(compare).strip().lower()
            if compare not in VALID_COMPARE_OPS:
                errors.append(
                    f"check[{i}]: invalid compare '{compare}' (valid: {sorted(VALID_COMPARE_OPS)})"
                )
                continue
            allowed_for_type = _ALLOWED_COMPARE_FOR_TYPE.get(c_type, frozenset())
            if compare not in allowed_for_type:
                errors.append(
                    f"check[{i}]: compare '{compare}' is not valid for type '{c_type}' "
                    f"(allowed: {sorted(allowed_for_type)})"
                )
                continue
        expected = raw.get("expected")
        if "expected" in raw:
            # Keep the public union deliberately small, then enforce the
            # check-specific interpretation before any check is launched.
            valid_scalar = isinstance(expected, (int, str)) and not isinstance(expected, bool)
            valid_list = (
                isinstance(expected, list)
                and bool(expected)
                and all(
                    isinstance(item, (int, str)) and not isinstance(item, bool) for item in expected
                )
            )
            if not (valid_scalar or valid_list):
                errors.append(
                    f"check[{i}]: expected must be an integer, string, or non-empty list "
                    f"of integers/strings"
                )
                continue
            if c_type == "http":
                values = expected if isinstance(expected, list) else [expected]
                if not all(
                    isinstance(v, int) or (isinstance(v, str) and v.isdigit()) for v in values
                ):
                    errors.append(
                        f"check[{i}]: http expected values must be status-code integers or digit "
                        f"strings"
                    )
                    continue
            elif c_type == "service":
                if isinstance(expected, list) and not all(isinstance(v, str) for v in expected):
                    errors.append(f"check[{i}]: service expected lists must contain strings")
                    continue
            elif c_type in {"port", "process"} and expected is not None:
                errors.append(f"check[{i}]: expected is not used for {c_type} checks")
                continue
        # Require 'expected' for compare ops that need a value — but only when
        # the caller explicitly chose the compare op. Defaults have built-in
        # fallback expectations (e.g. http default = 2xx/3xx, service default
        # = 'active'), so leaving compare unset is still valid.
        needs_expected = (
            compare is not None
            and compare in _COMPARE_OPS_REQUIRING_EXPECTED
            and (
                expected is None
                or (isinstance(expected, (str, list, tuple)) and len(expected) == 0)
            )
        )
        if needs_expected:
            errors.append(f"check[{i}]: compare '{compare}' requires a non-empty 'expected' value")
            continue
        timeout = int(raw.get("timeout_seconds", DEFAULT_CHECK_TIMEOUT))
        timeout = max(1, min(timeout, 120))
        window = int(raw.get("window_seconds", DEFAULT_LOG_WINDOW_SECONDS))
        window = max(1, min(window, 3600))
        host = raw.get("host")
        host = str(host).strip() if host else None

        checks.append(
            Check(
                type=c_type,
                target=target,
                expected=raw.get("expected"),
                severity=severity,
                host=host,
                compare=compare,
                window_seconds=window,
                timeout_seconds=timeout,
                name=str(raw.get("name") or "").strip() or None,
            )
        )
    return checks, errors


def _default_compare_for(check_type: str) -> str:
    return {
        "http": "status_in",
        "port": "exit_zero",
        "service": "equals",
        "process": "exit_zero",
        "log_absent": "not_contains",
        "log_present": "contains",
        "command": "exit_zero",
    }.get(check_type, "equals")


# Filter the probe's own command line, not ancestors of the probe: a real
# target can itself be an ancestor. Concurrent process probes carry this same
# marker and are filtered as well. procps and BSD/macOS both print command
# lines with -a -l -f; the inner POSIX shell works under other login shells.
_PROCESS_PROBE_PGREP = "pgrep -a -l -f --"
_PROCESS_PROBE_SCRIPT = (
    f'o=$({_PROCESS_PROBE_PGREP} "$1"); r=$?; '
    'if [ "$r" -gt 1 ]; then echo "PROCESS_CHECK_ERROR pgrep exit $r"; exit 0; fi; '
    f'm=$(printf "%s\\n" "$o" | grep -v -F -e "{_PROCESS_PROBE_PGREP} "); '
    'if [ -n "$m" ]; then echo PRESENT; else echo ABSENT; fi'
)


# Validate the ERE first, then check journal visibility without -q; the data
# run uses -q to keep journalctl's own status lines out of the matches.
# Use cat output for the data run: unlike the default journalctl rendering it
# has no host/unit prefix, so the anchored filter identifies only Odin's own
# logger and tool-call message, not unrelated logs quoting the same text. Filter
# before the caller's regex, rather than trying to clean the matched output:
# a match only in the invocation must not prove presence or disprove absence.
_VALIDATION_INVOCATION_LINE = (
    # Python logging's default asctime includes comma-separated milliseconds;
    # accept older second-resolution journal entries as well.
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(,[0-9]{3})? "
    r"\[INFO\] odin\.discord: Tool call: validate_action\(\{"
)
_LOG_PROBE_SCRIPT = (
    'p="$3"; '
    'printf "" | grep -E -e "$p" >/dev/null 2>&1; '
    'if [ "$?" -gt 1 ]; then echo "LOG_CHECK_ERROR invalid pattern"; '
    'printf "" | grep -E -e "$p" 2>&1 | head -n 2; exit 0; fi; '
    'if [ -n "$1" ]; then set -- -u "$1" --since "$2 seconds ago"; '
    'else set -- --since "$2 seconds ago"; fi; '
    'e=$(journalctl "$@" --no-pager -n 1 2>&1 >/dev/null); r=$?; '
    'if [ "$r" -ne 0 ]; then echo "LOG_CHECK_ERROR journalctl exit $r"; '
    'printf "%s\\n" "$e" | tail -n 1; exit 0; fi; '
    'journalctl "$@" --no-pager -q -o cat 2>/dev/null | '
    f'grep -v -E -e {shlex.quote(_VALIDATION_INVOCATION_LINE)} | '
    'grep -E -e "$p" | head -n 20; '
    'case "$e" in *"not seeing messages from"*|*"insufficient permissions"*'
    '|*"No journal files were found"*) echo LOG_READ_PARTIAL;; *) echo LOG_READ_OK;; esac'
)
_LOG_STATUS_LINES = frozenset({"LOG_READ_OK", "LOG_READ_PARTIAL"})


def _build_command(check: Check) -> str | None:
    """Build the shell command the check will execute on the target host.

    Returns None for types that are dispatched differently (none currently).
    """
    t = check.type
    tgt = check.target
    timeout = check.timeout_seconds

    if t == "http":
        # HTTP errors are received responses; only transport errors fail curl.
        url = shlex.quote(tgt)
        return (
            f"curl -sS -o /dev/null -w '%{{http_code}}' "
            f"--max-time {timeout} -L {url} || echo FAILED_$?"
        )
    if t == "port":
        # target format: host:port (host optional, defaults to 127.0.0.1)
        if ":" in tgt:
            h, p = tgt.rsplit(":", 1)
        else:
            h, p = "127.0.0.1", tgt
        if not h or not p.isdigit():
            return None
        # Do not interpolate a quoted host inside another quoted shell program.
        # ``shlex.quote(h)`` embedded in ``bash -c '...{h}...'`` lets the outer
        # shell evaluate substitutions in crafted hosts before Bash starts.
        # Positional arguments keep the inner program constant and quote each
        # user value exactly once for the outer shell.
        script = 'cat < /dev/null > "/dev/tcp/$1/$2"'
        return (
            f"timeout {timeout} bash -c {shlex.quote(script)} _ "
            f"{shlex.quote(h)} {shlex.quote(p)} && echo OPEN || echo CLOSED"
        )
    if t == "service":
        return f"systemctl is-active {shlex.quote(tgt)} 2>/dev/null || true"
    if t == "process":
        return f"sh -c {shlex.quote(_PROCESS_PROBE_SCRIPT)} odin-process-check {shlex.quote(tgt)}"
    if t in ("log_absent", "log_present"):
        # target format: "unit=<name>:pattern" or just "pattern" (journalctl without unit)
        unit = ""
        pattern = tgt
        if tgt.startswith("unit="):
            rest = tgt[5:]
            if ":" not in rest:
                return None
            unit, pattern = rest.split(":", 1)
        return (
            f"sh -c {shlex.quote(_LOG_PROBE_SCRIPT)} odin-log-check "
            f"{shlex.quote(unit)} {int(check.window_seconds)} {shlex.quote(pattern)}"
        )
    if t == "command":
        return tgt
    return None


def _strip_log_status(output: str) -> str:
    """Only matched journal lines, without the probe's own status sentinel."""
    return "\n".join(
        line for line in output.strip().splitlines() if line.strip() not in _LOG_STATUS_LINES
    ).strip()


def _evaluate(check: Check, exit_code: int, output: str) -> tuple[str, str]:
    """Returns (status, error_message). status in pass/fail/error."""
    if check.type == "command":
        reason = getattr(output, "termination_reason", None)
        if reason == "shell_unavailable":
            return "error", str(output)
        if reason == "timeout":
            return "fail", f"timed out after {check.timeout_seconds}s"
    compare = check.compare or _default_compare_for(check.type)
    out_stripped = output.strip()

    if check.type == "http":
        # curl's stderr may precede or follow the marker, and a status code
        # may precede a failure after headers (404FAILED_28).
        failed = re.search(r"(?:\d{3})?FAILED_(\d+)", out_stripped)
        if failed:
            detail = (out_stripped[: failed.start()] + out_stripped[failed.end() :]).strip()
            reason = f"curl failed (exit {failed.group(1)})"
            return "fail", f"{reason}: {detail[:200]}" if detail else reason
        status_code = out_stripped
        expected = check.expected
        if expected is None:
            expected = [200, 201, 204, 301, 302, 307, 308]
        # 'equals' with scalar expected means exact match; 'status_in' with
        # list expected means membership; normalise both to a set of codes.
        if isinstance(expected, int):
            expected_list = [expected]
        elif isinstance(expected, str) and expected.isdigit():
            expected_list = [int(expected)]
        elif isinstance(expected, list):
            expected_list = expected
        else:
            return "error", f"invalid 'expected' for http check: {expected!r}"
        expected_codes = {
            str(int(c)) for c in expected_list if isinstance(c, (int, str)) and str(c).isdigit()
        }
        if not expected_codes:
            return "error", f"'expected' for http check yielded no status codes: {expected!r}"
        if compare == "equals" and len(expected_codes) != 1:
            return "error", "compare='equals' on http requires a single status code"
        if status_code in expected_codes:
            return "pass", ""
        return "fail", f"expected status in {sorted(expected_codes)}, got {status_code}"

    if check.type == "port":
        if "OPEN" in out_stripped:
            return "pass", ""
        return "fail", f"port closed (exit {exit_code})"

    if check.type == "service":
        expected = check.expected if check.expected is not None else "active"
        # 'status_in' + list, or 'equals' + scalar — both supported.
        if compare == "status_in" and not isinstance(expected, list):
            return "error", "compare='status_in' on service requires list 'expected'"
        if isinstance(expected, list):
            if out_stripped in {str(e) for e in expected}:
                return "pass", ""
            return "fail", f"expected state in {expected}, got '{out_stripped}'"
        if out_stripped == str(expected):
            return "pass", ""
        return "fail", f"expected state '{expected}', got '{out_stripped}'"

    if check.type == "process":
        lines = {line.strip() for line in out_stripped.splitlines()}
        if any(line.startswith("PROCESS_CHECK_ERROR") for line in lines):
            return "error", f"pgrep could not run: {out_stripped[:200]}"
        if "PRESENT" in lines:
            return "pass", ""
        if "ABSENT" in lines:
            return "fail", f"no process matching '{check.target}'"
        return "error", f"process check produced no result: {out_stripped[:200]}"

    if check.type in ("log_absent", "log_present"):
        log_lines = out_stripped.splitlines()
        if any(line.startswith("LOG_CHECK_ERROR") for line in log_lines):
            return "error", f"log check could not run: {out_stripped[:200]}"
        status_lines = [line.strip() for line in log_lines if line.strip() in _LOG_STATUS_LINES]
        if not status_lines:
            return "error", f"log check produced no result: {out_stripped[:200]}"
        partial = "LOG_READ_PARTIAL" in status_lines
        matches = _strip_log_status(out_stripped)
        blind = (
            "the journal is not fully readable here (the user running this check "
            "needs journal access, e.g. the systemd-journal group, or the host "
            "keeps no journal); "
        )
        if check.type == "log_absent":
            if matches:
                return "fail", f"unexpected log lines: {matches[:200]}"
            if partial:
                return "error", blind + "cannot confirm the pattern is absent"
            return "pass", ""
        if matches:
            return "pass", ""
        if partial:
            return "error", blind + "cannot confirm the pattern is missing"
        return "fail", f"no log lines matched '{check.target}' in window"

    if check.type == "command":
        if compare == "exit_zero":
            return (
                ("pass", "")
                if exit_code == 0
                else ("fail", f"exit {exit_code}: {out_stripped[:200]}")
            )
        if compare == "exit_nonzero":
            return (
                ("pass", "")
                if exit_code != 0
                else ("fail", "command succeeded but expected failure")
            )
        expected = check.expected
        if compare == "contains":
            if expected and str(expected) in output:
                return "pass", ""
            return "fail", f"expected substring '{expected}' not found"
        if compare == "not_contains":
            if expected and str(expected) in output:
                return "fail", f"forbidden substring '{expected}' found"
            return "pass", ""
        if compare == "equals":
            if out_stripped == str(expected if expected is not None else ""):
                return "pass", ""
            return "fail", f"expected '{expected}', got '{out_stripped[:200]}'"
        if compare == "regex_match":
            pattern = str(expected or "")
            # ReDoS hardening: length cap + heuristic rejection of
            # catastrophic-backtracking shapes + input truncation.
            if len(pattern) > MAX_REGEX_PATTERN_LEN:
                return "error", (
                    f"regex pattern too long ({len(pattern)} > "
                    f"{MAX_REGEX_PATTERN_LEN}); refusing to run"
                )
            if _REDOS_HEURISTIC.search(pattern):
                return "error", (
                    "regex rejected: nested quantifier or backreference detected — "
                    "catastrophic backtracking risk. Rewrite without (a+)+ style "
                    "shapes or prefer 'contains'."
                )
            haystack = output[:MAX_REGEX_INPUT_CHARS]
            try:
                if pattern and bounded_regex.search(
                    pattern, haystack, timeout=REGEX_TIMEOUT_SECONDS
                ):
                    return "pass", ""
                return "fail", f"regex '{pattern}' did not match"
            except TimeoutError:
                return "error", "regex evaluation exceeded its runtime deadline"
            except bounded_regex.error as e:
                return "error", f"bad regex: {e}"
        return "error", f"unsupported compare '{compare}' for command check"

    return "error", f"unknown check type '{check.type}'"


def compute_verdict(results: list[CheckResult]) -> str:
    """critical fail/error → fail; warn fail → degraded; all pass → pass.

    If every check errors out (e.g., host unresolved), verdict is 'error'.
    """
    if not results:
        return "error"
    crit_fail = any(r.severity == "critical" and r.status in ("fail", "error") for r in results)
    warn_fail = any(r.severity == "warn" and r.status in ("fail", "error") for r in results)
    all_errored = all(r.status == "error" for r in results)
    if all_errored:
        return "error"
    if crit_fail:
        return "fail"
    if warn_fail:
        return "degraded"
    return "pass"


async def run_bundle(
    raw_checks: list[dict],
    *,
    bundle_name: str,
    default_host: str | None,
    resolve_host: HostResolver,
    exec_command: Callable[..., Awaitable[tuple[int, str]]],
    grace_seconds: int = 0,
    max_parallel: int = DEFAULT_MAX_PARALLEL_CHECKS,
) -> ValidationReport:
    """Run a validation bundle. Host resolution: explicit > default > localhost.

    exec_command signature:
        (address, command, ssh_user, timeout=..., use_workspace=...,
         use_command_shell=...) -> (exit_code, output)
    ``use_workspace`` and ``use_command_shell`` independently opt in ONLY for
    ``type=command`` checks: raw user text uses the local workspace and configured
    shell. Fixed-shape probes (http/port/service/process/log) always use /bin/sh
    locally, without shell presentation annotations, and are
    generated command strings whose behaviour must not depend on the
    workspace: an unusable workspace must not stop a service probe
    (PR #239 round-11 review, reproduced).
    """
    start = time.monotonic()
    if grace_seconds > 0:
        await asyncio.sleep(min(grace_seconds, 60))

    checks, parse_errors = parse_checks(raw_checks)
    if parse_errors:
        dummies = [
            CheckResult(
                name=f"parse_error[{i}]",
                type="parse",
                target="",
                severity="critical",
                status="error",
                error=e,
            )
            for i, e in enumerate(parse_errors)
        ]
        return ValidationReport(
            verdict="error",
            passed=0,
            failed=0,
            errored=len(dummies),
            total=len(dummies),
            duration_ms=int((time.monotonic() - start) * 1000),
            bundle=bundle_name,
            checks=dummies,
        )

    # Bundle-level semaphore bounds fan-out so a 25-check bundle doesn't
    # exhaust the SSH/subprocess bulkheads the rest of the bot shares.
    cap = max(1, min(int(max_parallel) or DEFAULT_MAX_PARALLEL_CHECKS, MAX_CHECKS))
    sem = asyncio.Semaphore(cap)

    async def _run_one(idx: int, check: Check) -> CheckResult:
        resolved_host = check.host or default_host or "localhost"
        name = check.name or f"{check.type}[{idx}]"
        result = CheckResult(
            name=name,
            type=check.type,
            target=check.target,
            severity=check.severity,
            status="error",
            host=resolved_host,
        )
        t0 = time.monotonic()
        async with sem:
            try:
                resolved = resolve_host(resolved_host)
                if not resolved:
                    result.error = f"unknown host alias: {resolved_host}"
                    return result
                address, ssh_user, _os = resolved
                command = _build_command(check)
                if command is None:
                    result.error = (
                        f"could not build command for check type '{check.type}' (bad target?)"
                    )
                    return result
                try:
                    exit_code, output = await asyncio.wait_for(
                        exec_command(
                            address,
                            command,
                            ssh_user,
                            timeout=check.timeout_seconds,
                            # Raw user command text opts into the workspace;
                            # fixed-shape probes keep pre-PR cwd semantics.
                            use_workspace=check.type == "command",
                            use_command_shell=check.type == "command",
                        ),
                        timeout=check.timeout_seconds + 5,
                    )
                except TimeoutError:
                    result.status = "error"
                    result.error = f"timed out after {check.timeout_seconds}s"
                    return result
                observed = output.strip()
                if check.type == "command":
                    result.effective_shell = getattr(output, "effective_shell", None)
                if check.type in ("log_absent", "log_present"):
                    observed = _strip_log_status(observed)
                result.observed = observed[:500]
                if check.type == "command" and check.compare == "regex_match":
                    # No synchronous regex work on the event loop. The engine
                    # deadline also bounds the worker's lifetime on cancellation.
                    status, err = await asyncio.to_thread(_evaluate, check, exit_code, output)
                else:
                    status, err = _evaluate(check, exit_code, output)
                result.status = status
                result.error = err
                return result
            except Exception as e:
                result.status = "error"
                result.error = f"{type(e).__name__}: {e}"
                log.exception("validation check failed: %s", name)
                return result
            finally:
                result.duration_ms = int((time.monotonic() - t0) * 1000)

    # A sibling command mentioning the pattern must not satisfy a process
    # check while the real process is down. Keep original report order.
    results: list[CheckResult] = [None] * len(checks)  # type: ignore[list-item]
    phases = (
        [i for i, check in enumerate(checks) if check.type == "process"],
        [i for i, check in enumerate(checks) if check.type != "process"],
    )
    for phase in phases:
        phase_results = await asyncio.gather(*(_run_one(i, checks[i]) for i in phase))
        for i, result in zip(phase, phase_results, strict=True):
            results[i] = result

    passed = sum(1 for r in results if r.status == "pass")
    failed = sum(1 for r in results if r.status == "fail")
    errored = sum(1 for r in results if r.status == "error")
    verdict = compute_verdict(results)
    duration = int((time.monotonic() - start) * 1000)

    report = ValidationReport(
        verdict=verdict,
        passed=passed,
        failed=failed,
        errored=errored,
        total=len(results),
        duration_ms=duration,
        bundle=bundle_name,
        checks=results,
    )
    log.info(
        "validation bundle=%s verdict=%s passed=%d failed=%d errored=%d duration_ms=%d",
        bundle_name,
        verdict,
        passed,
        failed,
        errored,
        duration,
    )
    return report


def format_report_summary(report: ValidationReport) -> str:
    """Human-readable single-line summary, followed by per-check lines."""
    header = (
        f"[{report.verdict.upper()}] bundle='{report.bundle}' "
        f"passed={report.passed}/{report.total} failed={report.failed} "
        f"errored={report.errored} duration={report.duration_ms}ms"
    )
    lines = [header]
    for r in report.checks:
        icon = {"pass": "PASS", "fail": "FAIL", "error": "ERR "}.get(r.status, "?   ")
        host = f"@{r.host}" if r.host else ""
        base = f"  {icon} [{r.severity}] {r.name}{host} target={r.target} ({r.duration_ms}ms)"
        if r.error:
            base += f"\n       error: {r.error}"
        if r.observed and r.status != "pass":
            base += f"\n       observed: {r.observed[:200]}"
        lines.append(base)
    return "\n".join(lines)


def report_as_json(report: ValidationReport) -> str:
    return json.dumps(report.to_dict(), indent=2, default=str)


# --- Mutation detection ---------------------------------------------------
# Detects operational mutations from tool calls so the executor can
# auto-annotate results with a validation reminder.  Moves the
# "always validate after changes" invariant from the system prompt
# into enforced code.

_MUTATION_PATTERNS: list[tuple[re.Pattern, str]] = [
    (
        re.compile(r"\bsystemctl\s+(restart|stop|start|reload|enable|disable)\b"),
        "service lifecycle change",
    ),
    (re.compile(r"\bservice\s+\S+\s+(restart|stop|start)\b"), "service lifecycle change"),
    (
        re.compile(r"\bdocker\s+(compose\s+)?(up|down|restart|stop|start|rm)\b"),
        "container operation",
    ),
    (re.compile(r"\bdocker-compose\s+(up|down|restart|stop)\b"), "compose operation"),
    (re.compile(r"\bkubectl\s+(apply|delete|rollout|scale|patch)\b"), "kubernetes mutation"),
    (re.compile(r"\bterraform\s+(apply|destroy)\b"), "infrastructure mutation"),
    (re.compile(r"\bansible-playbook\b"), "ansible deployment"),
    (re.compile(r"\b(apt|apt-get|yum|dnf)\s+(install|remove|purge|upgrade)\b"), "package change"),
    (re.compile(r"\bpip3?\s+install\b"), "pip install"),
    (re.compile(r"\bnginx\s+-s\s+reload\b"), "nginx reload"),
    (re.compile(r"\biptables\b"), "firewall change"),
    (re.compile(r"\bufw\s+(allow|deny|delete|enable|disable)\b"), "firewall change"),
    # Filesystem mutations the original set missed.
    (re.compile(r"\brm\s+(-\w+\s+)*-?\w*[rf]"), "file deletion"),
    (re.compile(r"\bmv\s+\S"), "file move/rename"),
    (re.compile(r"\bsed\s+(-\w+\s+)*-i"), "in-place file edit"),
    (re.compile(r"\bchmod\s+\S"), "permission change"),
    (re.compile(r"\bchown\s+\S"), "ownership change"),
    (re.compile(r"\bdd\s+.*\bof="), "raw disk/file write"),
    (re.compile(r"\btruncate\s+-s"), "file truncation"),
    # Redirect/append to an absolute path other than /dev/null.
    (re.compile(r">>?\s*/(?!dev/null)\S"), "file overwrite via redirect"),
]

_MUTATION_TOOL_ACTIONS: dict[str, frozenset[str]] = {}

# Tools that are a mutation on every call, regardless of arguments.
_ALWAYS_MUTATING_TOOLS: frozenset[str] = frozenset({"email_send"})

_VALIDATION_HINT = (
    "\n\n[post-action] Operational mutation detected ({reason}). "
    "Consider running validate_action to confirm the change took effect."
)


class MutationDetection:
    __slots__ = ("detected", "reason")

    def __init__(self, detected: bool, reason: str):
        self.detected = detected
        self.reason = reason


def detect_mutation(tool_name: str, tool_input: dict) -> MutationDetection:
    """Check if a tool call represents an operational mutation."""
    if tool_name in _ALWAYS_MUTATING_TOOLS:
        return MutationDetection(True, f"tool: {tool_name}")
    if tool_name in _MUTATION_TOOL_ACTIONS:
        allowed_actions = _MUTATION_TOOL_ACTIONS[tool_name]
        if not allowed_actions:
            return MutationDetection(True, f"tool: {tool_name}")
        action = tool_input.get("action", "")
        if action in allowed_actions:
            return MutationDetection(True, f"{tool_name}: {action}")

    command = ""
    if tool_name == "run_command":
        command = tool_input.get("command", "")
    elif tool_name == "run_script":
        command = tool_input.get("script", "")
    elif tool_name == "run_command_multi":
        command = tool_input.get("command", "")

    if command:
        for pattern, reason in _MUTATION_PATTERNS:
            if pattern.search(command):
                return MutationDetection(True, reason)

    return MutationDetection(False, "")


def annotate_if_mutation(
    tool_name: str,
    tool_input: dict,
    output: str,
) -> tuple[str, MutationDetection]:
    """Append a validation hint if a mutation was detected.

    Returns (possibly annotated output, detection result).
    """
    detection = detect_mutation(tool_name, tool_input)
    if detection.detected and not output.startswith(("Error", "Command failed", "Script failed")):
        output = output + _VALIDATION_HINT.format(reason=detection.reason)
    return output, detection
