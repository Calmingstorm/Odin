"""End-to-end integration test for validate_action pipeline.

Guards against regressions across module boundaries.
"""
from __future__ import annotations

import pytest

from src.tools.post_validation import run_bundle


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
            "validate_action",
        ):
            aff = get_affordance(name)
            assert aff is not _FALLBACK, f"{name} has no explicit affordance"
