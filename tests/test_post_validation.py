"""Tests for the post-action validation framework."""
from __future__ import annotations

import asyncio
import json

import pytest

from src.tools.post_validation import (
    Check,
    CheckResult,
    ValidationReport,
    _build_command,
    _evaluate,
    compute_verdict,
    format_report_summary,
    parse_checks,
    report_as_json,
    run_bundle,
)


def _resolver(alias: str):
    if alias in ("localhost", "hostA", "hostB"):
        return ("127.0.0.1", "root", "linux")
    return None


class TestParseChecks:
    def test_minimal_valid(self):
        checks, errors = parse_checks([
            {"type": "http", "target": "https://example.com"},
        ])
        assert errors == []
        assert len(checks) == 1
        assert checks[0].severity == "critical"

    def test_unknown_type_errors(self):
        checks, errors = parse_checks([{"type": "psychic", "target": "x"}])
        assert checks == []
        assert "invalid type" in errors[0]

    def test_missing_target(self):
        checks, errors = parse_checks([{"type": "http"}])
        assert "'target' is required" in errors[0]

    def test_invalid_severity(self):
        _, errors = parse_checks([
            {"type": "http", "target": "x", "severity": "catastrophic"},
        ])
        assert any("invalid severity" in e for e in errors)

    def test_too_many_checks(self):
        raw = [{"type": "http", "target": f"t{i}"} for i in range(30)]
        _, errors = parse_checks(raw)
        assert "too many checks" in errors[0]

    def test_timeout_clamped(self):
        checks, _ = parse_checks([
            {"type": "http", "target": "x", "timeout_seconds": 9999},
        ])
        assert checks[0].timeout_seconds == 120

    def test_non_list_input(self):
        _, errors = parse_checks("not-a-list")  # type: ignore[arg-type]
        assert errors


class TestBuildCommand:
    def test_http(self):
        cmd = _build_command(Check(type="http", target="https://ex.com"))
        assert "curl" in cmd
        assert "https://ex.com" in cmd

    def test_port_with_host(self):
        cmd = _build_command(Check(type="port", target="1.2.3.4:8080"))
        assert "/dev/tcp/1.2.3.4/8080" in cmd

    def test_port_bare(self):
        cmd = _build_command(Check(type="port", target="5432"))
        assert "/dev/tcp/127.0.0.1/5432" in cmd

    def test_port_invalid(self):
        assert _build_command(Check(type="port", target="notaport")) is None

    def test_service(self):
        cmd = _build_command(Check(type="service", target="nginx"))
        assert "systemctl is-active" in cmd
        assert "nginx" in cmd

    def test_log_absent_unit(self):
        cmd = _build_command(Check(type="log_absent", target="unit=nginx:ERROR"))
        assert "journalctl -u" in cmd
        assert "grep" in cmd

    def test_log_absent_bare(self):
        cmd = _build_command(Check(type="log_absent", target="kernel panic"))
        assert "journalctl" in cmd

    def test_command_passthrough(self):
        assert _build_command(Check(type="command", target="echo hi")) == "echo hi"


class TestEvaluate:
    def test_http_pass_default_status(self):
        status, err = _evaluate(Check(type="http", target="x"), 0, "200")
        assert status == "pass"
        assert err == ""

    def test_http_fail_wrong_status(self):
        status, err = _evaluate(Check(type="http", target="x", expected=200), 0, "502")
        assert status == "fail"
        assert "got 502" in err

    def test_http_failed_curl(self):
        status, err = _evaluate(Check(type="http", target="x"), 0, "FAILED_28")
        assert status == "fail"
        assert "curl failed" in err

    def test_http_expected_list(self):
        status, _ = _evaluate(
            Check(type="http", target="x", expected=[200, 204]), 0, "204",
        )
        assert status == "pass"

    def test_port_open(self):
        status, _ = _evaluate(Check(type="port", target="80"), 0, "OPEN")
        assert status == "pass"

    def test_port_closed(self):
        status, err = _evaluate(Check(type="port", target="80"), 1, "CLOSED")
        assert status == "fail"

    def test_service_active_default(self):
        status, _ = _evaluate(Check(type="service", target="nginx"), 0, "active")
        assert status == "pass"

    def test_service_failed_state(self):
        status, err = _evaluate(Check(type="service", target="nginx"), 0, "failed")
        assert status == "fail"

    def test_service_multi_ok(self):
        status, _ = _evaluate(
            Check(type="service", target="x", expected=["active", "activating"]),
            0, "activating",
        )
        assert status == "pass"

    def test_log_absent_with_output_fails(self):
        status, _ = _evaluate(Check(type="log_absent", target="ERROR"), 0, "ERROR found")
        assert status == "fail"

    def test_log_absent_empty_passes(self):
        status, _ = _evaluate(Check(type="log_absent", target="ERROR"), 0, "")
        assert status == "pass"

    def test_log_present_empty_fails(self):
        status, _ = _evaluate(Check(type="log_present", target="OK"), 0, "")
        assert status == "fail"

    def test_command_exit_zero(self):
        status, _ = _evaluate(Check(type="command", target="x", compare="exit_zero"), 0, "ok")
        assert status == "pass"

    def test_command_exit_zero_fails(self):
        status, err = _evaluate(Check(type="command", target="x", compare="exit_zero"), 1, "oops")
        assert status == "fail"
        assert "exit 1" in err

    def test_command_contains(self):
        status, _ = _evaluate(
            Check(type="command", target="x", compare="contains", expected="OK"),
            0, "stuff OK more",
        )
        assert status == "pass"

    def test_command_not_contains_fails(self):
        status, err = _evaluate(
            Check(type="command", target="x", compare="not_contains", expected="ERR"),
            0, "saw ERR",
        )
        assert status == "fail"

    def test_command_regex(self):
        status, _ = _evaluate(
            Check(type="command", target="x", compare="regex_match", expected=r"\d+ up"),
            0, "42 up",
        )
        assert status == "pass"

    def test_command_bad_regex(self):
        status, err = _evaluate(
            Check(type="command", target="x", compare="regex_match", expected="(unclosed"),
            0, "",
        )
        assert status == "error"
        assert "bad regex" in err


class TestVerdict:
    def _r(self, severity: str, status: str) -> CheckResult:
        return CheckResult(name="n", type="t", target="tt", severity=severity, status=status)

    def test_all_pass(self):
        assert compute_verdict([self._r("critical", "pass"), self._r("warn", "pass")]) == "pass"

    def test_critical_fail_is_fail(self):
        assert compute_verdict([self._r("critical", "fail")]) == "fail"

    def test_warn_fail_is_degraded(self):
        assert compute_verdict([
            self._r("critical", "pass"), self._r("warn", "fail"),
        ]) == "degraded"

    def test_info_fail_not_degraded(self):
        assert compute_verdict([
            self._r("critical", "pass"), self._r("info", "fail"),
        ]) == "pass"

    def test_empty_is_error(self):
        assert compute_verdict([]) == "error"

    def test_all_errored_is_error(self):
        assert compute_verdict([self._r("critical", "error"), self._r("warn", "error")]) == "error"


class TestRunBundleIntegration:
    @pytest.mark.asyncio
    async def test_full_bundle_mixed_results(self):
        async def fake_exec(addr, cmd, user, *, timeout):
            if "curl" in cmd:
                return (0, "200")
            if "dev/tcp" in cmd:
                return (1, "CLOSED")
            if "systemctl" in cmd:
                return (0, "active")
            return (0, "")

        report = await run_bundle(
            [
                {"type": "http", "target": "https://ex.com", "severity": "critical"},
                {"type": "port", "target": "9999", "severity": "critical"},
                {"type": "service", "target": "nginx", "severity": "warn"},
            ],
            bundle_name="test",
            default_host="localhost",
            resolve_host=_resolver,
            exec_command=fake_exec,
        )
        assert report.total == 3
        assert report.passed == 2
        assert report.failed == 1
        assert report.verdict == "fail"  # port fail is critical

    @pytest.mark.asyncio
    async def test_parse_errors_short_circuit(self):
        async def fake_exec(*a, **kw):
            raise AssertionError("should not be called")

        report = await run_bundle(
            [{"type": "nonsense", "target": "x"}],
            bundle_name="b",
            default_host="localhost",
            resolve_host=_resolver,
            exec_command=fake_exec,
        )
        assert report.verdict == "error"
        assert report.errored >= 1

    @pytest.mark.asyncio
    async def test_unknown_host_errors_cleanly(self):
        called = False

        async def fake_exec(*a, **kw):
            nonlocal called
            called = True
            return (0, "")

        report = await run_bundle(
            [{"type": "http", "target": "x", "host": "ghost-host"}],
            bundle_name="b",
            default_host=None,
            resolve_host=_resolver,
            exec_command=fake_exec,
        )
        assert called is False
        assert report.checks[0].status == "error"
        assert "unknown host" in report.checks[0].error

    @pytest.mark.asyncio
    async def test_check_timeout_is_recorded(self):
        async def slow_exec(*a, **kw):
            await asyncio.sleep(30)
            return (0, "200")

        report = await run_bundle(
            [{"type": "http", "target": "x", "timeout_seconds": 1}],
            bundle_name="b",
            default_host="localhost",
            resolve_host=_resolver,
            exec_command=slow_exec,
        )
        assert report.checks[0].status == "error"
        assert "timed out" in report.checks[0].error

    @pytest.mark.asyncio
    async def test_host_resolution_order(self):
        seen_hosts: list[str] = []

        async def fake_exec(addr, cmd, user, *, timeout):
            seen_hosts.append(addr)
            return (0, "active")

        def tracker(alias):
            seen_hosts.append(f"resolve:{alias}")
            return ("127.0.0.1", "root", "linux")

        await run_bundle(
            [
                {"type": "service", "target": "a"},  # uses default_host
                {"type": "service", "target": "b", "host": "hostB"},  # explicit
            ],
            bundle_name="b",
            default_host="hostA",
            resolve_host=tracker,
            exec_command=fake_exec,
        )
        assert "resolve:hostA" in seen_hosts
        assert "resolve:hostB" in seen_hosts

    @pytest.mark.asyncio
    async def test_report_json_roundtrip(self):
        async def fake_exec(*a, **kw):
            return (0, "200")

        report = await run_bundle(
            [{"type": "http", "target": "x"}],
            bundle_name="ok",
            default_host="localhost",
            resolve_host=_resolver,
            exec_command=fake_exec,
        )
        payload = json.loads(report_as_json(report))
        assert payload["verdict"] == "pass"
        assert payload["bundle"] == "ok"
        assert payload["checks"][0]["status"] == "pass"

    @pytest.mark.asyncio
    async def test_summary_formats_per_check_lines(self):
        async def fake_exec(*a, **kw):
            return (0, "200")

        report = await run_bundle(
            [{"type": "http", "target": "x", "name": "homepage"}],
            bundle_name="ok",
            default_host="localhost",
            resolve_host=_resolver,
            exec_command=fake_exec,
        )
        text = format_report_summary(report)
        assert "PASS" in text
        assert "homepage" in text
        assert "duration=" in text
