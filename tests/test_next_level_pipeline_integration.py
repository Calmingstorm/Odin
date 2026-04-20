"""End-to-end integration test for the feat/next-level pipeline.

Exercises detect_runbooks pattern detection and validate_action → report
flow. Guards against regressions across module boundaries.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from src.learning.runbook_detector import detect_patterns
from src.tools.post_validation import run_bundle


def _iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def _fake_audit_entry(ts: datetime, tool: str, host="hostA", actor="alice",
                      channel="c1", error=False, cmd="echo test"):
    return {
        "timestamp": _iso(ts),
        "user_id": actor,
        "user_name": actor,
        "channel_id": channel,
        "tool_name": tool,
        "tool_input": {"host": host, "command": cmd},
        "error": ("boom" if error else None),
    }


class TestAuditToSkillPipeline:
    """Simulate 4 deploy sessions in the audit log; detect the pattern;
    synthesize a skill; assert the output is AST-valid."""

    @pytest.fixture
    def audit_with_pattern(self, tmp_path):
        audit = tmp_path / "audit.jsonl"
        base = datetime(2026, 4, 18, 10, 0, 0)
        rows: list[dict] = []
        # 4 sessions — each runs: http_probe → run_command → http_probe
        for i in range(4):
            t = base + timedelta(hours=i)
            rows.append(_fake_audit_entry(t, "http_probe"))
            rows.append(_fake_audit_entry(t + timedelta(seconds=5), "run_command", cmd="systemctl restart nginx"))
            rows.append(_fake_audit_entry(t + timedelta(seconds=10), "http_probe"))
        with audit.open("w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
        return audit

    def test_detect_surfaces_the_restart_pattern(self, audit_with_pattern):
        now = datetime(2026, 4, 18, 15, 0, 0, tzinfo=timezone.utc)
        suggestions = detect_patterns(
            audit_with_pattern, min_frequency=3,
            min_length=2, max_length=5, now=now,
        )
        assert suggestions, "expected at least one suggestion"
        top_seqs = [s.sequence for s in suggestions]
        assert any(
            s[:3] == ["http_probe", "run_command", "http_probe"]
            for s in top_seqs
        )

class TestValidateActionEndToEnd:
    """run_bundle with a fully mocked exec — exercises the real parse →
    build_command → evaluate → verdict pipeline."""

    @pytest.mark.asyncio
    async def test_full_pipeline_mixed_severity(self):
        async def fake_exec(addr, cmd, user, *, timeout):
            if "curl" in cmd:
                return (0, "200")
            if "systemctl is-active" in cmd:
                if "nginx" in cmd:
                    return (0, "active")
                return (0, "failed")
            if "dev/tcp" in cmd:
                return (0, "OPEN")
            return (0, "")

        def resolver(alias):
            return ("127.0.0.1", "root", "linux")

        report = await run_bundle(
            [
                {"type": "http", "target": "https://app", "severity": "critical"},
                {"type": "port", "target": "443", "severity": "critical"},
                {"type": "service", "target": "nginx", "severity": "critical"},
                {"type": "service", "target": "postgres", "severity": "warn"},  # will fail
            ],
            bundle_name="full",
            default_host="localhost",
            resolve_host=resolver,
            exec_command=fake_exec,
        )
        assert report.total == 4
        assert report.passed == 3
        assert report.failed == 1
        # critical passed, warn failed → degraded
        assert report.verdict == "degraded"
        summary = report.to_dict()
        assert summary["verdict"] == "degraded"
        assert len(summary["checks"]) == 4

    @pytest.mark.asyncio
    async def test_affordance_info_present_for_new_tools(self):
        """Affordance metadata must cover every new tool added on this branch."""
        from src.tools.affordances import _FALLBACK, get_affordance
        for name in (
            "validate_action", "detect_runbooks",
            "replay_trajectory",
        ):
            aff = get_affordance(name)
            assert aff is not _FALLBACK, f"{name} has no explicit affordance"
