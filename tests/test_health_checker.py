"""Tests for src.health.checker — component health dashboard."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, AsyncMock, PropertyMock, patch
from src.health.checker import (
    ComponentStatus,
    check_all,
    check_discord,
    check_codex,
    check_sessions,
    check_knowledge,
    check_ssh_hosts,
    check_voice,
    check_monitoring,
    check_browser,
    check_scheduler,
    check_loops,
    check_agents,
    _ALL_CHECKERS,
)


# ---------------------------------------------------------------------------
# ComponentStatus dataclass
# ---------------------------------------------------------------------------

class TestComponentStatus:
    def test_basic_to_dict(self):
        cs = ComponentStatus(name="test", healthy=True, status="ok", detail="fine")
        d = cs.to_dict()
        assert d == {"name": "test", "healthy": True, "status": "ok", "detail": "fine"}

    def test_to_dict_with_metadata(self):
        cs = ComponentStatus(
            name="codex", healthy=True, status="ok", detail="good",
            metadata={"model": "gpt-4o", "requests": 42},
        )
        d = cs.to_dict()
        assert d["metadata"] == {"model": "gpt-4o", "requests": 42}

    def test_to_dict_empty_metadata_omitted(self):
        cs = ComponentStatus(name="x", healthy=True, status="ok", detail="y")
        d = cs.to_dict()
        assert "metadata" not in d

    def test_default_metadata(self):
        cs = ComponentStatus(name="a", healthy=False, status="down", detail="b")
        assert cs.metadata == {}

    def test_all_fields(self):
        cs = ComponentStatus(
            name="n", healthy=False, status="degraded", detail="d", metadata={"k": "v"},
        )
        assert cs.name == "n"
        assert cs.healthy is False
        assert cs.status == "degraded"
        assert cs.detail == "d"
        assert cs.metadata == {"k": "v"}


# ---------------------------------------------------------------------------
# check_discord
# ---------------------------------------------------------------------------

class TestCheckDiscord:
    def test_online(self):
        bot = MagicMock()
        bot.is_ready.return_value = True
        guild = MagicMock()
        guild.member_count = 50
        bot.guilds = [guild]
        result = check_discord(bot)
        assert result.healthy is True
        assert result.status == "ok"
        assert "1 guild" in result.detail
        assert result.metadata["guild_count"] == 1
        assert result.metadata["user_count"] == 50

    def test_not_ready(self):
        bot = MagicMock()
        bot.is_ready.return_value = False
        bot.guilds = []
        result = check_discord(bot)
        assert result.healthy is False
        assert result.status == "degraded"

    def test_multiple_guilds(self):
        bot = MagicMock()
        bot.is_ready.return_value = True
        g1, g2 = MagicMock(), MagicMock()
        g1.member_count = 100
        g2.member_count = 200
        bot.guilds = [g1, g2]
        result = check_discord(bot)
        assert result.metadata["guild_count"] == 2
        assert result.metadata["user_count"] == 300

    def test_exception(self):
        bot = MagicMock()
        bot.is_ready.side_effect = RuntimeError("boom")
        result = check_discord(bot)
        assert result.healthy is False
        assert result.status == "down"
        assert "boom" in result.detail


# ---------------------------------------------------------------------------
# check_codex
# ---------------------------------------------------------------------------

class TestCheckCodex:
    def _make_bot(self, breaker_state="closed", session_ok=True, total_requests=42):
        bot = MagicMock()
        codex = MagicMock()
        codex.model = "gpt-4o"
        codex.breaker = MagicMock()
        type(codex.breaker).state = PropertyMock(return_value=breaker_state)
        codex.get_pool_metrics.return_value = {
            "http_pool_max_connections": 10,
            "http_pool_keepalive_timeout": 30,
            "http_pool_active_connections": 2,
            "http_pool_total_requests": total_requests,
        }
        session = MagicMock()
        session.closed = not session_ok
        codex._session = session
        bot.codex = codex
        return bot

    def test_healthy(self):
        bot = self._make_bot()
        result = check_codex(bot)
        assert result.healthy is True
        assert result.status == "ok"
        assert "42 total requests" in result.detail
        assert result.metadata["model"] == "gpt-4o"
        assert result.metadata["circuit_breaker"] == "closed"

    def test_circuit_open(self):
        bot = self._make_bot(breaker_state="open")
        result = check_codex(bot)
        assert result.healthy is False
        assert result.status == "down"
        assert "OPEN" in result.detail

    def test_circuit_half_open(self):
        bot = self._make_bot(breaker_state="half_open")
        result = check_codex(bot)
        assert result.healthy is True
        assert result.status == "degraded"
        assert "half-open" in result.detail

    def test_session_closed(self):
        bot = self._make_bot(session_ok=False)
        result = check_codex(bot)
        assert result.healthy is False
        assert result.status == "degraded"
        assert "session" in result.detail.lower()

    def test_no_codex(self):
        bot = MagicMock(spec=[])
        result = check_codex(bot)
        assert result.healthy is False
        assert result.status == "down"
        assert "not initialised" in result.detail

    def test_exception(self):
        bot = MagicMock()
        bot.codex = MagicMock()
        bot.codex.breaker = MagicMock()
        bot.codex.get_pool_metrics.side_effect = RuntimeError("fail")
        result = check_codex(bot)
        assert result.healthy is False
        assert result.status == "down"


# ---------------------------------------------------------------------------
# check_sessions
# ---------------------------------------------------------------------------

class TestCheckSessions:
    def test_healthy(self):
        bot = MagicMock()
        bot.sessions._sessions = {"ch1": MagicMock(), "ch2": MagicMock()}
        bot.sessions.count.return_value = 2
        bot.sessions.get_token_metrics.return_value = {
            "total_tokens": 5000,
            "over_budget_count": 0,
        }
        result = check_sessions(bot)
        assert result.healthy is True
        assert result.status == "ok"
        assert "2 active" in result.detail
        assert result.metadata["count"] == 2

    def test_over_budget(self):
        bot = MagicMock()
        bot.sessions._sessions = {"ch1": MagicMock()}
        bot.sessions.count.return_value = 1
        bot.sessions.get_token_metrics.return_value = {
            "total_tokens": 100000,
            "over_budget_count": 1,
        }
        result = check_sessions(bot)
        assert result.status == "degraded"
        assert "over token budget" in result.detail

    def test_no_sessions_manager(self):
        bot = MagicMock(spec=[])
        result = check_sessions(bot)
        assert result.healthy is False
        assert "not initialised" in result.detail

    def test_no_token_metrics_method(self):
        bot = MagicMock()
        bot.sessions._sessions = {}
        bot.sessions.count.return_value = 0
        del bot.sessions.get_token_metrics
        result = check_sessions(bot)
        assert result.healthy is True
        assert result.status == "ok"

    def test_exception(self):
        bot = MagicMock()
        bot.sessions._sessions = {}
        bot.sessions.count.return_value = 0
        bot.sessions.get_token_metrics.side_effect = RuntimeError("db error")
        result = check_sessions(bot)
        assert result.healthy is False
        assert result.status == "down"


# ---------------------------------------------------------------------------
# check_knowledge
# ---------------------------------------------------------------------------

class TestCheckKnowledge:
    def test_healthy_with_vec(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 150
        bot.knowledge._has_vec = True
        result = check_knowledge(bot)
        assert result.healthy is True
        assert "150 chunks" in result.detail
        assert "vector + FTS" in result.detail
        assert result.metadata["vector_search"] is True

    def test_fts_only(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 10
        bot.knowledge._has_vec = False
        result = check_knowledge(bot)
        assert "FTS only" in result.detail
        assert result.metadata["vector_search"] is False

    def test_conn_closed(self):
        bot = MagicMock()
        bot.knowledge.available = False
        result = check_knowledge(bot)
        assert result.healthy is False
        assert result.status == "down"

    def test_no_knowledge(self):
        bot = MagicMock(spec=[])
        result = check_knowledge(bot)
        assert result.status == "unconfigured"

    def test_exception(self):
        bot = MagicMock()
        bot.knowledge.available = True
        bot.knowledge.count.side_effect = RuntimeError("sqlite error")
        result = check_knowledge(bot)
        assert result.healthy is False
        assert result.status == "down"


# ---------------------------------------------------------------------------
# check_ssh_hosts
# ---------------------------------------------------------------------------

class TestCheckSSHHosts:
    def test_with_hosts_and_pool(self):
        bot = MagicMock()
        host_cfg = MagicMock()
        host_cfg.address = "10.0.0.1"
        host_cfg.ssh_user = "root"
        host_cfg.os = "linux"
        bot.tool_executor.config.hosts = {"server1": host_cfg}
        pool = MagicMock()
        pool.get_metrics.return_value = {
            "active_connections": 1,
            "active_hosts": ["root@10.0.0.1"],
            "total_opened": 5,
            "total_reused": 20,
        }
        bot.tool_executor.ssh_pool = pool
        result = check_ssh_hosts(bot)
        assert result.healthy is True
        assert result.status == "ok"
        assert "1 host" in result.detail
        hosts = result.metadata["hosts"]
        assert len(hosts) == 1
        assert hosts[0]["pool_connected"] is True
        assert result.metadata["pool_enabled"] is True

    def test_host_not_connected(self):
        bot = MagicMock()
        host_cfg = MagicMock()
        host_cfg.address = "10.0.0.2"
        host_cfg.ssh_user = "admin"
        host_cfg.os = "macos"
        bot.tool_executor.config.hosts = {"mac1": host_cfg}
        pool = MagicMock()
        pool.get_metrics.return_value = {
            "active_connections": 0,
            "active_hosts": [],
            "total_opened": 0,
            "total_reused": 0,
        }
        bot.tool_executor.ssh_pool = pool
        result = check_ssh_hosts(bot)
        hosts = result.metadata["hosts"]
        assert hosts[0]["pool_connected"] is False

    def test_no_pool(self):
        bot = MagicMock()
        host_cfg = MagicMock()
        host_cfg.address = "10.0.0.3"
        host_cfg.ssh_user = "root"
        host_cfg.os = "linux"
        bot.tool_executor.config.hosts = {"srv": host_cfg}
        bot.tool_executor.ssh_pool = None
        result = check_ssh_hosts(bot)
        hosts = result.metadata["hosts"]
        assert hosts[0]["pool_connected"] is None
        assert result.metadata["pool_enabled"] is False

    def test_no_hosts(self):
        bot = MagicMock()
        bot.tool_executor.config.hosts = {}
        result = check_ssh_hosts(bot)
        assert result.status == "unconfigured"
        assert "No SSH hosts" in result.detail

    def test_no_executor(self):
        bot = MagicMock(spec=[])
        result = check_ssh_hosts(bot)
        assert result.status == "unconfigured"

    def test_multiple_hosts(self):
        bot = MagicMock()
        h1 = MagicMock()
        h1.address = "10.0.0.1"
        h1.ssh_user = "root"
        h1.os = "linux"
        h2 = MagicMock()
        h2.address = "10.0.0.2"
        h2.ssh_user = "admin"
        h2.os = "macos"
        bot.tool_executor.config.hosts = {"web": h1, "db": h2}
        bot.tool_executor.ssh_pool = None
        result = check_ssh_hosts(bot)
        assert "2 host" in result.detail
        assert len(result.metadata["hosts"]) == 2


# ---------------------------------------------------------------------------
# check_voice
# ---------------------------------------------------------------------------

class TestCheckVoice:
    def test_connected_to_channel(self):
        bot = MagicMock()
        bot.voice_manager.is_connected = True
        channel = MagicMock()
        channel.name = "general"
        channel.id = 12345
        bot.voice_manager.current_channel = channel
        bot.voice_manager._connected = True
        result = check_voice(bot)
        assert result.healthy is True
        assert result.status == "ok"
        assert "#general" in result.detail

    def test_ws_connected_idle(self):
        bot = MagicMock()
        bot.voice_manager.is_connected = False
        bot.voice_manager.current_channel = None
        bot.voice_manager._connected = True
        result = check_voice(bot)
        assert result.status == "ok"
        assert "idle" in result.detail

    def test_not_connected(self):
        bot = MagicMock()
        bot.voice_manager.is_connected = False
        bot.voice_manager.current_channel = None
        bot.voice_manager._connected = False
        result = check_voice(bot)
        assert result.status == "degraded"

    def test_unconfigured(self):
        bot = MagicMock(spec=[])
        result = check_voice(bot)
        assert result.status == "unconfigured"

    def test_exception(self):
        bot = MagicMock()
        type(bot.voice_manager).is_connected = PropertyMock(side_effect=RuntimeError("voice err"))
        result = check_voice(bot)
        assert result.healthy is False
        assert result.status == "down"


# ---------------------------------------------------------------------------
# check_monitoring
# ---------------------------------------------------------------------------

class TestCheckMonitoring:
    def test_healthy_no_alerts(self):
        bot = MagicMock()
        bot.infra_watcher.get_status.return_value = {
            "enabled": True, "checks": 5, "running": 3, "active_alerts": 0,
        }
        result = check_monitoring(bot)
        assert result.healthy is True
        assert result.status == "ok"
        assert "5 checks" in result.detail

    def test_with_alerts(self):
        bot = MagicMock()
        bot.infra_watcher.get_status.return_value = {
            "enabled": True, "checks": 5, "running": 3, "active_alerts": 2,
        }
        result = check_monitoring(bot)
        assert result.status == "degraded"
        assert "2 active alert" in result.detail

    def test_unconfigured(self):
        bot = MagicMock(spec=[])
        result = check_monitoring(bot)
        assert result.status == "unconfigured"

    def test_exception(self):
        bot = MagicMock()
        bot.infra_watcher.get_status.side_effect = RuntimeError("fail")
        result = check_monitoring(bot)
        assert result.healthy is False
        assert result.status == "down"


# ---------------------------------------------------------------------------
# check_browser
# ---------------------------------------------------------------------------

class TestCheckBrowser:
    def test_connected(self):
        bot = MagicMock()
        browser = MagicMock()
        browser.is_connected.return_value = True
        bot.tool_executor._browser_manager._browser = browser
        result = check_browser(bot)
        assert result.healthy is True
        assert result.status == "ok"

    def test_not_connected(self):
        # Playwright opens lazily on the first browser_* tool call. If the
        # browser_manager is configured but no browser is attached yet, that's
        # the healthy "will connect on first use" state — not "degraded".
        bot = MagicMock()
        bot.tool_executor._browser_manager._browser = None
        result = check_browser(bot)
        assert result.status == "ok"
        assert "lazy" in result.detail.lower()

    def test_unconfigured(self):
        bot = MagicMock()
        bot.tool_executor._browser_manager = None
        result = check_browser(bot)
        assert result.status == "unconfigured"

    def test_no_executor(self):
        bot = MagicMock(spec=[])
        result = check_browser(bot)
        assert result.status == "unconfigured"


# ---------------------------------------------------------------------------
# check_scheduler
# ---------------------------------------------------------------------------

class TestCheckScheduler:
    def test_with_tasks(self):
        bot = MagicMock()
        bot.scheduler.list_all.return_value = [{"id": "1"}, {"id": "2"}]
        result = check_scheduler(bot)
        assert result.healthy is True
        assert result.status == "ok"
        assert "2 scheduled" in result.detail

    def test_empty(self):
        bot = MagicMock()
        bot.scheduler.list_all.return_value = []
        result = check_scheduler(bot)
        assert "0 scheduled" in result.detail

    def test_unconfigured(self):
        bot = MagicMock(spec=[])
        result = check_scheduler(bot)
        assert result.status == "unconfigured"

    def test_exception(self):
        bot = MagicMock()
        bot.scheduler.list_all.side_effect = RuntimeError("err")
        result = check_scheduler(bot)
        assert result.healthy is False


# ---------------------------------------------------------------------------
# check_loops
# ---------------------------------------------------------------------------

class TestCheckLoops:
    def test_active(self):
        bot = MagicMock()
        bot.loop_manager.active_count = 3
        result = check_loops(bot)
        assert result.healthy is True
        assert "3 active" in result.detail

    def test_none(self):
        bot = MagicMock()
        bot.loop_manager.active_count = 0
        result = check_loops(bot)
        assert "0 active" in result.detail

    def test_unconfigured(self):
        bot = MagicMock(spec=[])
        result = check_loops(bot)
        assert result.status == "unconfigured"


# ---------------------------------------------------------------------------
# check_agents
# ---------------------------------------------------------------------------

class TestCheckAgents:
    def test_with_agents(self):
        bot = MagicMock()
        a1 = MagicMock()
        a1.status = "running"
        a2 = MagicMock()
        a2.status = "done"
        bot.agent_manager._agents = {"a1": a1, "a2": a2}
        result = check_agents(bot)
        assert result.healthy is True
        assert result.metadata["running"] == 1
        assert result.metadata["total"] == 2

    def test_no_agents(self):
        bot = MagicMock()
        bot.agent_manager._agents = {}
        result = check_agents(bot)
        assert result.metadata["running"] == 0
        assert result.metadata["total"] == 0

    def test_unconfigured(self):
        bot = MagicMock(spec=[])
        result = check_agents(bot)
        assert result.status == "unconfigured"


# ---------------------------------------------------------------------------
# check_all aggregate
# ---------------------------------------------------------------------------

class TestCheckAll:
    def _make_healthy_bot(self):
        bot = MagicMock()
        bot.is_ready.return_value = True
        guild = MagicMock()
        guild.member_count = 10
        bot.guilds = [guild]
        # codex
        bot.codex.model = "gpt-4o"
        bot.codex.breaker = MagicMock()
        type(bot.codex.breaker).state = PropertyMock(return_value="closed")
        bot.codex.get_pool_metrics.return_value = {
            "http_pool_max_connections": 10,
            "http_pool_keepalive_timeout": 30,
            "http_pool_active_connections": 0,
            "http_pool_total_requests": 0,
        }
        session = MagicMock()
        session.closed = False
        bot.codex._session = session
        # sessions
        bot.sessions._sessions = {}
        bot.sessions.count.return_value = 0
        bot.sessions.get_token_metrics.return_value = {"total_tokens": 0, "over_budget_count": 0}
        # knowledge
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 10
        bot.knowledge._has_vec = True
        # tool executor (ssh hosts)
        bot.tool_executor.config.hosts = {}
        bot.tool_executor.ssh_pool = None
        bot.tool_executor._browser_manager = None
        # voice
        del bot.voice_manager
        # monitoring
        del bot.infra_watcher
        # scheduler
        bot.scheduler.list_all.return_value = []
        # loops
        bot.loop_manager.active_count = 0
        # agents
        bot.agent_manager._agents = {}
        return bot

    def test_all_healthy(self):
        bot = self._make_healthy_bot()
        result = check_all(bot)
        assert result["overall"] == "healthy"
        assert result["total"] == 11
        assert "checked_at" in result
        assert isinstance(result["components"], list)

    def test_has_all_component_names(self):
        bot = self._make_healthy_bot()
        result = check_all(bot)
        names = {c["name"] for c in result["components"]}
        expected = {
            "discord", "codex", "sessions", "knowledge", "ssh_hosts",
            "voice", "monitoring", "browser", "scheduler", "loops", "agents",
        }
        assert names == expected

    def test_degraded_overall(self):
        bot = self._make_healthy_bot()
        bot.sessions.get_token_metrics.return_value = {
            "total_tokens": 999999, "over_budget_count": 3,
        }
        result = check_all(bot)
        assert result["overall"] == "degraded"
        assert result["degraded_count"] >= 1

    def test_unhealthy_overall(self):
        bot = self._make_healthy_bot()
        bot.codex.breaker = MagicMock()
        type(bot.codex.breaker).state = PropertyMock(return_value="open")
        bot.codex._session = MagicMock()
        bot.codex._session.closed = False
        result = check_all(bot)
        assert result["overall"] == "unhealthy"
        assert result["down_count"] >= 1

    def test_checker_crash_handled(self):
        bot = self._make_healthy_bot()
        bot.sessions.count.side_effect = RuntimeError("crash")
        result = check_all(bot)
        session_comp = next(c for c in result["components"] if c["name"] == "sessions")
        assert session_comp["healthy"] is False
        assert "crash" in session_comp["detail"].lower() or "Error" in session_comp["detail"]

    def test_counts(self):
        bot = self._make_healthy_bot()
        result = check_all(bot)
        total = (
            result["healthy_count"] + result["degraded_count"]
            + result["down_count"] + result["unconfigured_count"]
        )
        assert total == result["total"]

    def test_checked_at_is_iso(self):
        bot = self._make_healthy_bot()
        result = check_all(bot)
        from datetime import datetime
        dt = datetime.fromisoformat(result["checked_at"])
        assert dt is not None


# ---------------------------------------------------------------------------
# _ALL_CHECKERS list
# ---------------------------------------------------------------------------

class TestCheckerList:
    def test_count(self):
        assert len(_ALL_CHECKERS) == 11

    def test_all_callable(self):
        for checker in _ALL_CHECKERS:
            assert callable(checker)

    def test_checker_names(self):
        names = [c.__name__ for c in _ALL_CHECKERS]
        assert "check_discord" in names
        assert "check_codex" in names
        assert "check_sessions" in names
        assert "check_knowledge" in names
        assert "check_ssh_hosts" in names
        assert "check_voice" in names
        assert "check_monitoring" in names
        assert "check_browser" in names
        assert "check_scheduler" in names
        assert "check_loops" in names
        assert "check_agents" in names


# ---------------------------------------------------------------------------
# Module exports
# ---------------------------------------------------------------------------

class TestExports:
    def test_health_init_exports(self):
        from src.health import ComponentStatus, check_all, HealthServer
        assert ComponentStatus is not None
        assert check_all is not None
        assert HealthServer is not None

    def test_checker_module_imports(self):
        from src.health.checker import ComponentStatus, check_all
        assert ComponentStatus is not None
        assert callable(check_all)


# ---------------------------------------------------------------------------
# REST API endpoint
# ---------------------------------------------------------------------------

class TestHealthAPI:
    @pytest.fixture
    def mock_bot(self):
        bot = MagicMock()
        bot.is_ready.return_value = True
        guild = MagicMock()
        guild.member_count = 5
        bot.guilds = [guild]
        bot.codex.model = "gpt-4o"
        bot.codex.breaker = MagicMock()
        type(bot.codex.breaker).state = PropertyMock(return_value="closed")
        bot.codex.get_pool_metrics.return_value = {
            "http_pool_max_connections": 10,
            "http_pool_keepalive_timeout": 30,
            "http_pool_active_connections": 0,
            "http_pool_total_requests": 0,
        }
        session = MagicMock()
        session.closed = False
        bot.codex._session = session
        bot.sessions._sessions = {}
        bot.sessions.count.return_value = 0
        bot.sessions.get_token_metrics.return_value = {"total_tokens": 0, "over_budget_count": 0}
        bot.knowledge.available = True
        bot.knowledge.count.return_value = 0
        bot.knowledge._has_vec = False
        bot.tool_executor.config.hosts = {}
        bot.tool_executor.ssh_pool = None
        bot.tool_executor._browser_manager = None
        del bot.voice_manager
        del bot.infra_watcher
        bot.scheduler.list_all.return_value = []
        bot.loop_manager.active_count = 0
        bot.agent_manager._agents = {}
        bot.config.model_dump.return_value = {}
        bot.skill_manager.list_skills.return_value = []
        bot._merged_tool_definitions.return_value = []
        return bot

    @pytest.mark.asyncio
    async def test_health_components_endpoint(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/health/components")
            assert resp.status == 200
            data = await resp.json()
            assert "overall" in data
            assert "components" in data
            assert isinstance(data["components"], list)
            assert data["total"] == 11

    @pytest.mark.asyncio
    async def test_health_components_has_all_names(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/health/components")
            data = await resp.json()
            names = {c["name"] for c in data["components"]}
            assert "discord" in names
            assert "codex" in names
            assert "knowledge" in names


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_knowledge_none_member_count(self):
        bot = MagicMock()
        bot.is_ready.return_value = True
        guild = MagicMock()
        guild.member_count = None
        bot.guilds = [guild]
        result = check_discord(bot)
        assert result.healthy is True
        assert result.metadata["user_count"] == 0

    def test_codex_no_breaker(self):
        bot = MagicMock()
        bot.codex.breaker = None
        bot.codex.get_pool_metrics.return_value = {
            "http_pool_max_connections": 10,
            "http_pool_keepalive_timeout": 30,
            "http_pool_active_connections": 0,
            "http_pool_total_requests": 0,
        }
        bot.codex._session = MagicMock()
        bot.codex._session.closed = False
        result = check_codex(bot)
        assert result.metadata["circuit_breaker"] == "unknown"

    def test_sessions_non_dict(self):
        bot = MagicMock()
        bot.sessions.count.return_value = 0
        bot.sessions.get_token_metrics.return_value = {"total_tokens": 0, "over_budget_count": 0}
        result = check_sessions(bot)
        assert result.metadata["count"] == 0

    def test_agents_non_dict(self):
        bot = MagicMock()
        bot.agent_manager._agents = "broken"
        result = check_agents(bot)
        assert result.metadata["total"] == 0

    def test_ssh_hosts_exception(self):
        bot = MagicMock()
        bot.tool_executor.config.hosts = MagicMock()
        bot.tool_executor.config.hosts.items.side_effect = RuntimeError("broken")
        result = check_ssh_hosts(bot)
        assert result.healthy is False
        assert result.status == "down"

    def test_check_all_returns_iso_timestamp(self):
        bot = MagicMock(spec=[])
        result = check_all(bot)
        assert "T" in result["checked_at"]
        assert result["total"] == 11
