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
from dataclasses import asdict, dataclass, field
from typing import Any, Awaitable, Callable

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
# The combination of pattern + output size caps is cheap belt-and-braces
# protection against catastrophic-backtracking patterns — we can't use
# re2 without adding a native dep, and Python's stdlib re has no
# timeout. We cap both the pattern length and the output window so the
# worst-case runtime is bounded.
MAX_REGEX_PATTERN_LEN = 200
MAX_REGEX_INPUT_CHARS = 10_000
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

VALID_TYPES = frozenset({
    "http", "port", "service", "process", "log_absent", "log_present", "command",
})
VALID_SEVERITIES = frozenset({"critical", "warn", "info"})
VALID_COMPARE_OPS = frozenset({
    "equals", "status_in", "contains", "not_contains",
    "exit_zero", "exit_nonzero", "regex_match",
})

# compare ops that require a non-empty 'expected' value
_COMPARE_OPS_REQUIRING_EXPECTED = frozenset({
    "equals", "contains", "not_contains", "regex_match", "status_in",
})

# compare ops that are valid for each check type (others are rejected at parse
# time so the API never silently promises flexibility it won't deliver).
_ALLOWED_COMPARE_FOR_TYPE: dict[str, frozenset[str]] = {
    "http": frozenset({"status_in", "equals"}),
    "port": frozenset({"exit_zero"}),
    "service": frozenset({"equals", "status_in"}),
    "process": frozenset({"exit_zero"}),
    "log_absent": frozenset({"not_contains"}),
    "log_present": frozenset({"contains"}),
    "command": frozenset({
        "exit_zero", "exit_nonzero", "equals", "contains",
        "not_contains", "regex_match",
    }),
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
                errors.append(f"check[{i}]: invalid compare '{compare}' (valid: {sorted(VALID_COMPARE_OPS)})")
                continue
            allowed_for_type = _ALLOWED_COMPARE_FOR_TYPE.get(c_type, frozenset())
            if compare not in allowed_for_type:
                errors.append(
                    f"check[{i}]: compare '{compare}' is not valid for type '{c_type}' "
                    f"(allowed: {sorted(allowed_for_type)})"
                )
                continue
        expected = raw.get("expected")
        # Require 'expected' for compare ops that need a value — but only when
        # the caller explicitly chose the compare op. Defaults have built-in
        # fallback expectations (e.g. http default = 2xx/3xx, service default
        # = 'active'), so leaving compare unset is still valid.
        needs_expected = (
            compare is not None
            and compare in _COMPARE_OPS_REQUIRING_EXPECTED
            and (expected is None or (isinstance(expected, (str, list, tuple)) and len(expected) == 0))
        )
        if needs_expected:
            errors.append(
                f"check[{i}]: compare '{compare}' requires a non-empty 'expected' value"
            )
            continue
        timeout = int(raw.get("timeout_seconds", DEFAULT_CHECK_TIMEOUT))
        timeout = max(1, min(timeout, 120))
        window = int(raw.get("window_seconds", DEFAULT_LOG_WINDOW_SECONDS))
        window = max(1, min(window, 3600))
        host = raw.get("host")
        host = str(host).strip() if host else None

        checks.append(Check(
            type=c_type,
            target=target,
            expected=raw.get("expected"),
            severity=severity,
            host=host,
            compare=compare,
            window_seconds=window,
            timeout_seconds=timeout,
            name=str(raw.get("name") or "").strip() or None,
        ))
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


def _build_command(check: Check) -> str | None:
    """Build the shell command the check will execute on the target host.

    Returns None for types that are dispatched differently (none currently).
    """
    t = check.type
    tgt = check.target
    timeout = check.timeout_seconds

    if t == "http":
        # curl with redirect following; print status on stderr-safe line
        url = shlex.quote(tgt)
        return (
            f"curl -fsS -o /dev/null -w '%{{http_code}}' "
            f"--max-time {timeout} -L {url} || echo FAILED_$?"
        )
    if t == "port":
        # target format: host:port (host optional, defaults to 127.0.0.1)
        if ":" in tgt:
            h, p = tgt.rsplit(":", 1)
        else:
            h, p = "127.0.0.1", tgt
        if not p.isdigit():
            return None
        return f"timeout {timeout} bash -c 'cat < /dev/null > /dev/tcp/{shlex.quote(h)}/{p}' && echo OPEN || echo CLOSED"
    if t == "service":
        return f"systemctl is-active {shlex.quote(tgt)} 2>/dev/null || true"
    if t == "process":
        return f"pgrep -f {shlex.quote(tgt)} >/dev/null && echo PRESENT || echo ABSENT"
    if t in ("log_absent", "log_present"):
        # target format: "unit=<name>:pattern" or just "pattern" (journalctl without unit)
        if tgt.startswith("unit="):
            rest = tgt[5:]
            if ":" not in rest:
                return None
            unit, pattern = rest.split(":", 1)
            return (
                f"journalctl -u {shlex.quote(unit)} --since '{check.window_seconds} seconds ago' "
                f"--no-pager 2>/dev/null | grep -E {shlex.quote(pattern)} | head -20 || true"
            )
        pattern = tgt
        return (
            f"journalctl --since '{check.window_seconds} seconds ago' "
            f"--no-pager 2>/dev/null | grep -E {shlex.quote(pattern)} | head -20 || true"
        )
    if t == "command":
        return tgt
    return None


def _evaluate(check: Check, exit_code: int, output: str) -> tuple[str, str]:
    """Returns (status, error_message). status in pass/fail/error."""
    compare = check.compare or _default_compare_for(check.type)
    out_stripped = output.strip()

    if check.type == "http":
        if out_stripped.startswith("FAILED_"):
            return "fail", f"curl failed: {out_stripped}"
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
            str(int(c)) for c in expected_list
            if isinstance(c, (int, str)) and str(c).isdigit()
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
        if "PRESENT" in out_stripped:
            return "pass", ""
        return "fail", f"no process matching '{check.target}'"

    if check.type == "log_absent":
        if out_stripped:
            return "fail", f"unexpected log lines: {out_stripped[:200]}"
        return "pass", ""

    if check.type == "log_present":
        if out_stripped:
            return "pass", ""
        return "fail", f"no log lines matched '{check.target}' in window"

    if check.type == "command":
        if compare == "exit_zero":
            return ("pass", "") if exit_code == 0 else ("fail", f"exit {exit_code}: {out_stripped[:200]}")
        if compare == "exit_nonzero":
            return ("pass", "") if exit_code != 0 else ("fail", "command succeeded but expected failure")
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
            if out_stripped == str(expected or ""):
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
                if pattern and re.search(pattern, haystack):
                    return "pass", ""
                return "fail", f"regex '{pattern}' did not match"
            except re.error as e:
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

    exec_command signature: (address, command, ssh_user, timeout=...) -> (exit_code, output)
    """
    start = time.monotonic()
    if grace_seconds > 0:
        await asyncio.sleep(min(grace_seconds, 60))

    checks, parse_errors = parse_checks(raw_checks)
    if parse_errors:
        dummies = [
            CheckResult(
                name=f"parse_error[{i}]", type="parse", target="", severity="critical",
                status="error", error=e,
            )
            for i, e in enumerate(parse_errors)
        ]
        return ValidationReport(
            verdict="error", passed=0, failed=0, errored=len(dummies),
            total=len(dummies), duration_ms=int((time.monotonic() - start) * 1000),
            bundle=bundle_name, checks=dummies,
        )

    # Bundle-level semaphore bounds fan-out so a 25-check bundle doesn't
    # exhaust the SSH/subprocess bulkheads the rest of the bot shares.
    cap = max(1, min(int(max_parallel) or DEFAULT_MAX_PARALLEL_CHECKS, MAX_CHECKS))
    sem = asyncio.Semaphore(cap)

    async def _run_one(idx: int, check: Check) -> CheckResult:
        resolved_host = check.host or default_host or "localhost"
        name = check.name or f"{check.type}[{idx}]"
        result = CheckResult(
            name=name, type=check.type, target=check.target,
            severity=check.severity, status="error", host=resolved_host,
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
                    result.error = f"could not build command for check type '{check.type}' (bad target?)"
                    return result
                try:
                    exit_code, output = await asyncio.wait_for(
                        exec_command(address, command, ssh_user, timeout=check.timeout_seconds),
                        timeout=check.timeout_seconds + 5,
                    )
                except asyncio.TimeoutError:
                    result.status = "error"
                    result.error = f"timed out after {check.timeout_seconds}s"
                    return result
                result.observed = output.strip()[:500]
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

    coros = [_run_one(i, c) for i, c in enumerate(checks)]
    results = await asyncio.gather(*coros)

    passed = sum(1 for r in results if r.status == "pass")
    failed = sum(1 for r in results if r.status == "fail")
    errored = sum(1 for r in results if r.status == "error")
    verdict = compute_verdict(results)
    duration = int((time.monotonic() - start) * 1000)

    report = ValidationReport(
        verdict=verdict, passed=passed, failed=failed, errored=errored,
        total=len(results), duration_ms=duration, bundle=bundle_name, checks=results,
    )
    log.info(
        "validation bundle=%s verdict=%s passed=%d failed=%d errored=%d duration_ms=%d",
        bundle_name, verdict, passed, failed, errored, duration,
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
