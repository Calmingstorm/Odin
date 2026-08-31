"""Coverage for src/web/api/observability.py (RFC-006 P11, safe tier-1).

All read-only stat/audit routes (+ one PUT for tool timeouts) through the real
aiohttp route layer with a faked bot. SAFE: every route delegates to a bot
subsystem; file-reading aggregates (context/failure/affordances) are patched, so
nothing touches real trajectory/audit files.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.web.api import observability as obs


def _app(*registrars, bot):
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


def _bot():
    bot = MagicMock()
    bot.config = Config(discord={"token": "x"})
    a = bot.audit
    a.count_by_tool = AsyncMock(return_value={"run_command": 5})
    a.search = AsyncMock(return_value=[{"tool_name": "t", "error": "boom"}, {"tool_name": "u"}])
    a.search_diffs = AsyncMock(return_value=[{"d": 1}])
    a.verify_integrity = AsyncMock(return_value={"valid": True})
    a.search_logs = AsyncMock(return_value=[{"l": 1}])
    a.get_log_stats = AsyncMock(return_value={"total": 3})
    a.search_by_risk = AsyncMock(return_value=[{"r": 1}])
    ex = bot.tool_executor
    ex.risk_stats.get_summary.return_value = {"risk": 1}
    ex.risk_stats.get_recent.return_value = [{"e": 1}]
    ex.command_governor.stats.get_summary.return_value = {"g": 1}
    ex.recovery_stats.get_summary.return_value = {"rec": 1}
    ex.recovery_stats.get_recent.return_value = []
    ex.freshness_stats.get_summary.return_value = {"f": 1}
    ex.freshness_stats.get_recent.return_value = []
    ex.validation_stats.as_dict.return_value = {"v": 1}
    ex.bulkheads.get_all_metrics.return_value = {"b": 1}
    bot.cost_tracker.get_totals.return_value = {"c": 1}
    bot.cost_tracker.get_summary.return_value = {"c": 2}
    bot.usage_rollup.totals = AsyncMock(return_value={"available": True, "c": 1})
    bot.usage_rollup.summary = AsyncMock(return_value={"available": True, "c": 2})
    bot.compression_stats.as_dict.return_value = {"comp": 1}
    bot.services = None
    bot.subsystem_guard.get_status.return_value = {"s": 1}
    return bot


class TestToolsMeta:
    async def test_list_and_stats_and_timeouts(self):
        bot = _bot()
        # /api/tools now reports the runtime catalog (what the model sees).
        bot.tool_catalog.merged_definitions.return_value = [
            {"name": "t", "description": "d", "is_core": True}
        ]
        with pytest.MonkeyPatch().context() as mp:
            mp.setattr(
                obs,
                "get_tool_definitions",
                lambda: [{"name": "t", "description": "d", "is_core": True}],
            )
            async with TestClient(TestServer(_app(obs.register_tools_meta, bot=bot))) as c:
                assert (await (await c.get("/api/tools")).json())[0]["name"] == "t"
                assert (await (await c.get("/api/tools/stats")).json())["run_command"] == 5
                assert "default_timeout" in await (await c.get("/api/tools/timeouts")).json()

    async def test_set_timeouts(self):
        bot = _bot()
        async with TestClient(TestServer(_app(obs.register_tools_meta, bot=bot))) as c:
            assert (await c.put("/api/tools/timeouts", data="bad")).status == 400
            assert (await c.put("/api/tools/timeouts", json=[1])).status == 400
            assert (await c.put("/api/tools/timeouts", json={"overrides": "notdict"})).status == 400
            assert (await c.put("/api/tools/timeouts", json={"overrides": {"t": -1}})).status == 400
            assert (await c.put("/api/tools/timeouts", json={"default_timeout": 0})).status == 400
            r = await c.put(
                "/api/tools/timeouts", json={"overrides": {"t": 30}, "default_timeout": 60}
            )
            assert r.status == 200 and (await r.json())["default_timeout"] == 60


class TestBulkheadsAndAggregates:
    async def test_bulkheads(self):
        # The executor surface is bot.tool_executor. The old fake configured
        # bot.executor — a name that never existed post-decomposition — so the
        # test validated the dead route (audit 7.3). A MagicMock bot satisfies
        # ANY attribute name, so the positive arm uses a rigid bot exposing
        # only the real name: attribute drift now fails loudly instead of
        # being auto-satisfied.
        bulkheads = SimpleNamespace(get_all_metrics=lambda: {"b": 1})
        rigid = SimpleNamespace(tool_executor=SimpleNamespace(bulkheads=bulkheads))
        async with TestClient(TestServer(_app(obs.register_bulkheads, bot=rigid))) as c:
            assert (await (await c.get("/api/tools/bulkheads")).json())["b"] == 1
        bare = SimpleNamespace(tool_executor=None)
        async with TestClient(TestServer(_app(obs.register_bulkheads, bot=bare))) as c:
            assert (await c.get("/api/tools/bulkheads")).status == 503

    async def test_aggregates(self):
        bot = _bot()
        with pytest.MonkeyPatch().context() as mp:
            mp.setattr("src.observability.aggregates.context_aggregates", lambda d, w: {"ctx": w})
            mp.setattr("src.observability.aggregates.failure_aggregates", lambda p, w: {"fail": w})
            async with TestClient(TestServer(_app(obs.register_aggregates, bot=bot))) as c:
                assert (await (await c.get("/api/observability/context?window=5")).json())[
                    "ctx"
                ] == 5
                # non-integer window falls back to the 24h default
                assert (await (await c.get("/api/observability/context?window=abc")).json())[
                    "ctx"
                ] == 24
                assert (await (await c.get("/api/observability/failures")).json())["fail"] == 24
                assert (await (await c.get("/api/usage/totals")).json())["c"] == 1
        # disabled prompt-budget → 503
        bot.config.observability.prompt_budget_accounting = False
        async with TestClient(TestServer(_app(obs.register_aggregates, bot=bot))) as c:
            assert (await c.get("/api/observability/context")).status == 503
        bot.usage_rollup = None
        async with TestClient(TestServer(_app(obs.register_aggregates, bot=bot))) as c:
            assert (await c.get("/api/usage/totals")).status == 503


class TestAuditAndLogs:
    async def test_audit(self):
        bot = _bot()
        bot.audit.search = AsyncMock(return_value=[{"tool_name": "t", "error": "boom"}])
        async with TestClient(TestServer(_app(obs.register_audit_log, bot=bot))) as c:
            # error_only is delegated into the bounded search predicate.
            body = await (await c.get("/api/audit?error_only=true&tool=t")).json()
            assert len(body) == 1 and body[0]["error"] == "boom"
            bot.audit.search.assert_awaited_with(
                tool_name="t",
                user=None,
                host=None,
                keyword=None,
                date=None,
                has_error=True,
                limit=50,
            )
            assert (await (await c.get("/api/audit/diffs")).json())["count"] == 1
            assert (await c.get("/api/audit/verify")).status == 200
        bot.audit.verify_integrity = AsyncMock(return_value={"valid": False})
        async with TestClient(TestServer(_app(obs.register_audit_log, bot=bot))) as c:
            assert (await c.get("/api/audit/verify")).status == 409

    async def test_logs(self):
        bot = _bot()
        async with TestClient(TestServer(_app(obs.register_log_search, bot=bot))) as c:
            assert (await c.get("/api/logs/search?level=bogus")).status == 400
            assert (await (await c.get("/api/logs/search?level=error&q=x")).json())["count"] == 1
            assert (await (await c.get("/api/logs/stats")).json())["total"] == 3


class TestExecutorStats:
    async def test_risk_recovery_freshness_validation(self):
        bot = _bot()
        regs = (
            obs.register_risk_classification,
            obs.register_recovery_stats,
            obs.register_branch_freshness,
            obs.register_validation_stats,
        )
        async with TestClient(TestServer(_app(*regs, bot=bot))) as c:
            assert (await (await c.get("/api/risk/stats")).json())["risk"] == 1
            assert (await (await c.get("/api/risk/recent")).json())["entries"][0]["e"] == 1
            assert (await (await c.get("/api/governor/stats")).json())["g"] == 1
            assert (await (await c.get("/api/audit/risk?level=high")).json())["count"] == 1
            assert (await (await c.get("/api/recovery/stats")).json())["rec"] == 1
            assert "entries" in await (await c.get("/api/recovery/recent")).json()
            assert (await (await c.get("/api/freshness/stats")).json())["f"] == 1
            assert "entries" in await (await c.get("/api/freshness/recent")).json()
            assert (await (await c.get("/api/validation/stats")).json())["v"] == 1

    async def test_executor_unavailable_503(self):
        bot = _bot()
        bot.tool_executor = None
        regs = (
            obs.register_risk_classification,
            obs.register_recovery_stats,
            obs.register_branch_freshness,
            obs.register_validation_stats,
        )
        async with TestClient(TestServer(_app(*regs, bot=bot))) as c:
            for path in (
                "/api/risk/stats",
                "/api/risk/recent",
                "/api/governor/stats",
                "/api/recovery/stats",
                "/api/recovery/recent",
                "/api/freshness/stats",
                "/api/freshness/recent",
                "/api/validation/stats",
            ):
                assert (await c.get(path)).status == 503

    async def test_governor_missing(self):
        bot = _bot()
        bot.tool_executor.command_governor = None
        async with TestClient(TestServer(_app(obs.register_risk_classification, bot=bot))) as c:
            assert (await c.get("/api/governor/stats")).status == 503


class TestMiscStats:
    async def test_affordances_compression_usage_degradation(self):
        bot = _bot()
        regs = (
            obs.register_affordances,
            obs.register_compression_stats,
            obs.register_usage_cost,
            obs.register_degradation,
        )
        with pytest.MonkeyPatch().context() as mp:
            mp.setattr("src.tools.affordances.all_affordances", lambda: [{"tool": "t"}])
            async with TestClient(TestServer(_app(*regs, bot=bot))) as c:
                assert (await (await c.get("/api/affordances")).json())["affordances"]
                assert (await (await c.get("/api/compression/stats")).json())["comp"] == 1
                assert (await (await c.get("/api/usage")).json())["c"] == 2
                assert (await (await c.get("/api/subsystems/status")).json())["s"] == 1

    async def test_usage_duration_unavailability_survives_json_api_boundary(self):
        bot = _bot()
        bot.usage_rollup.summary = AsyncMock(return_value={
            "available": True,
            "work": {
                "recorded_processing_ms": None,
                "recorded_processing_samples": 0,
            },
            "activity": [{"duration_ms": None, "duration_samples": 0}],
            "serving": [{"duration_ms": None, "duration_samples": 0}],
            "tools": [{"avg_duration_ms": None, "duration_samples": 0}],
        })
        async with TestClient(TestServer(_app(obs.register_usage_cost, bot=bot))) as c:
            response = await c.get("/api/usage?range=all")
            body = await response.json()

        assert response.status == 200
        assert body["work"]["recorded_processing_ms"] is None
        assert body["activity"][0]["duration_ms"] is None
        assert body["serving"][0]["duration_ms"] is None
        assert body["tools"][0]["avg_duration_ms"] is None
        bot.usage_rollup.summary.assert_awaited_once_with("all")

    async def test_subsystem_status_exposes_server_computed_failure_age(self):
        from src.health.subsystem_guard import SubsystemGuard

        bot = _bot()
        guard = SubsystemGuard()
        guard.register("browser")
        info = guard.get_subsystem("browser")
        assert info is not None
        info.last_failure_at = 100.0
        bot.subsystem_guard = guard
        with pytest.MonkeyPatch().context() as mp:
            mp.setattr("src.health.subsystem_guard.time.monotonic", lambda: 220.25)
            async with TestClient(TestServer(_app(obs.register_degradation, bot=bot))) as c:
                response = await c.get("/api/subsystems/status")
                body = await response.json()
        assert response.status == 200
        assert body["subsystems"][0]["last_failure_age_seconds"] == 120.25

    async def test_compression_stats_use_composed_service(self):
        bot = _bot()
        bot.compression_stats = None
        stats = MagicMock()
        stats.as_dict.return_value = {"compressions": 4}
        bot.services = SimpleNamespace(compression_stats=stats)
        async with TestClient(TestServer(_app(obs.register_compression_stats, bot=bot))) as c:
            response = await c.get("/api/compression/stats")
            assert response.status == 200
            assert (await response.json())["compressions"] == 4

    async def test_misc_unavailable_503(self):
        bot = _bot()
        bot.compression_stats = None
        bot.usage_rollup = None
        bot.subsystem_guard = None
        regs = (obs.register_compression_stats, obs.register_usage_cost, obs.register_degradation)
        async with TestClient(TestServer(_app(*regs, bot=bot))) as c:
            assert (await c.get("/api/compression/stats")).status == 503
            assert (await c.get("/api/usage")).status == 503
            assert (await c.get("/api/subsystems/status")).status == 503
