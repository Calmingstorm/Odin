"""Tests for Tool RBAC — Round 29.

Covers: PermissionManager, ToolExecutor RBAC enforcement,
background_task error detection, REST API permission endpoints.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.permissions.manager import (
    VALID_TIERS,
    USER_TIER_TOOLS,
    PermissionManager,
)
from src.tools.executor import ToolExecutor
from src.config.schema import ToolsConfig, PermissionsConfig


# ---------------------------------------------------------------------------
# PermissionManager basics
# ---------------------------------------------------------------------------

class TestPermissionManagerInit:
    def test_default_tier(self, tmp_path):
        pm = PermissionManager({}, overrides_path=str(tmp_path / "p.json"))
        assert pm._default_tier == "user"

    def test_custom_default_tier(self, tmp_path):
        pm = PermissionManager({}, default_tier="admin", overrides_path=str(tmp_path / "p.json"))
        assert pm._default_tier == "admin"

    def test_invalid_default_falls_back(self, tmp_path):
        pm = PermissionManager({}, default_tier="superuser", overrides_path=str(tmp_path / "p.json"))
        assert pm._default_tier == "user"

    def test_config_tiers_stored(self, tmp_path):
        tiers = {"123": "admin", "456": "guest"}
        pm = PermissionManager(tiers, overrides_path=str(tmp_path / "p.json"))
        assert pm._config_tiers == tiers

    def test_config_tiers_are_copied(self, tmp_path):
        tiers = {"123": "admin"}
        pm = PermissionManager(tiers, overrides_path=str(tmp_path / "p.json"))
        tiers["999"] = "admin"
        assert "999" not in pm._config_tiers


class TestGetTier:
    def test_returns_config_tier(self, tmp_path):
        pm = PermissionManager({"123": "admin"}, overrides_path=str(tmp_path / "p.json"))
        assert pm.get_tier("123") == "admin"

    def test_returns_default_for_unknown(self, tmp_path):
        pm = PermissionManager({}, overrides_path=str(tmp_path / "p.json"))
        assert pm.get_tier("unknown") == "user"

    def test_override_takes_precedence(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        pm.set_tier("123", "admin")
        assert pm.get_tier("123") == "admin"

    def test_custom_default(self, tmp_path):
        pm = PermissionManager({}, default_tier="guest", overrides_path=str(tmp_path / "p.json"))
        assert pm.get_tier("anybody") == "guest"


class TestSetTier:
    def test_set_valid_tier(self, tmp_path):
        pm = PermissionManager({}, overrides_path=str(tmp_path / "p.json"))
        pm.set_tier("123", "admin")
        assert pm.get_tier("123") == "admin"

    def test_set_invalid_tier_raises(self, tmp_path):
        pm = PermissionManager({}, overrides_path=str(tmp_path / "p.json"))
        with pytest.raises(ValueError, match="Invalid tier"):
            pm.set_tier("123", "superuser")

    def test_persists_to_file(self, tmp_path):
        path = tmp_path / "p.json"
        pm = PermissionManager({}, overrides_path=str(path))
        pm.set_tier("123", "admin")
        data = json.loads(path.read_text())
        assert data["123"] == "admin"

    def test_loads_persisted_overrides(self, tmp_path):
        path = tmp_path / "p.json"
        path.write_text(json.dumps({"123": "admin"}))
        pm = PermissionManager({}, overrides_path=str(path))
        assert pm.get_tier("123") == "admin"

    def test_invalid_overrides_ignored(self, tmp_path):
        path = tmp_path / "p.json"
        path.write_text(json.dumps({"123": "superuser", "456": "admin"}))
        pm = PermissionManager({}, overrides_path=str(path))
        assert pm.get_tier("123") == "user"  # invalid tier ignored
        assert pm.get_tier("456") == "admin"

    def test_corrupt_file_handled(self, tmp_path):
        path = tmp_path / "p.json"
        path.write_text("not json")
        pm = PermissionManager({}, overrides_path=str(path))
        assert pm.get_tier("123") == "user"


class TestFilterTools:
    def _make_tools(self):
        return [
            {"name": "run_command"},
            {"name": "write_file"},
            {"name": "search_knowledge"},
            {"name": "claude_code"},
        ]

    def test_admin_gets_all(self, tmp_path):
        pm = PermissionManager({"123": "admin"}, overrides_path=str(tmp_path / "p.json"))
        tools = self._make_tools()
        result = pm.filter_tools("123", tools)
        assert result == tools

    def test_user_gets_filtered(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        result = pm.filter_tools("123", self._make_tools())
        names = {t["name"] for t in result}
        assert "run_command" in names
        assert "search_knowledge" in names
        assert "write_file" not in names
        assert "claude_code" not in names

    def test_guest_gets_none(self, tmp_path):
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        result = pm.filter_tools("123", self._make_tools())
        assert result is None

    def test_default_tier_applied(self, tmp_path):
        pm = PermissionManager({}, default_tier="guest", overrides_path=str(tmp_path / "p.json"))
        result = pm.filter_tools("unknown", self._make_tools())
        assert result is None


class TestAllowedToolNames:
    def test_admin_returns_none(self, tmp_path):
        pm = PermissionManager({"123": "admin"}, overrides_path=str(tmp_path / "p.json"))
        assert pm.allowed_tool_names("123") is None

    def test_user_returns_set(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        result = pm.allowed_tool_names("123")
        assert result == set(USER_TIER_TOOLS)

    def test_guest_returns_empty(self, tmp_path):
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        result = pm.allowed_tool_names("123")
        assert result == set()


class TestIsAdminIsGuest:
    def test_is_admin(self, tmp_path):
        pm = PermissionManager({"123": "admin"}, overrides_path=str(tmp_path / "p.json"))
        assert pm.is_admin("123") is True
        assert pm.is_admin("456") is False

    def test_is_guest(self, tmp_path):
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        assert pm.is_guest("123") is True
        assert pm.is_guest("456") is False


# ---------------------------------------------------------------------------
# VALID_TIERS and USER_TIER_TOOLS constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_valid_tiers(self):
        assert "admin" in VALID_TIERS
        assert "user" in VALID_TIERS
        assert "guest" in VALID_TIERS
        assert len(VALID_TIERS) == 3

    def test_user_tier_tools_is_frozenset(self):
        assert isinstance(USER_TIER_TOOLS, frozenset)

    def test_user_tier_tools_contains_read_only(self):
        assert "run_command" in USER_TIER_TOOLS
        assert "search_knowledge" in USER_TIER_TOOLS
        assert "web_search" in USER_TIER_TOOLS
        assert "fetch_url" in USER_TIER_TOOLS

    def test_user_tier_tools_excludes_write_tools(self):
        assert "write_file" not in USER_TIER_TOOLS
        assert "claude_code" not in USER_TIER_TOOLS
        assert "run_script" not in USER_TIER_TOOLS


# ---------------------------------------------------------------------------
# ToolExecutor RBAC enforcement
# ---------------------------------------------------------------------------

class TestExecutorRBACCheck:
    def test_check_permission_no_manager(self):
        executor = ToolExecutor()
        assert executor.check_permission("run_command", "123") is None

    def test_check_permission_no_user_id(self, tmp_path):
        pm = PermissionManager({"123": "admin"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        assert executor.check_permission("run_command", None) is None

    def test_admin_allowed(self, tmp_path):
        pm = PermissionManager({"123": "admin"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        assert executor.check_permission("write_file", "123") is None

    def test_user_allowed_tool(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        assert executor.check_permission("run_command", "123") is None

    def test_user_denied_tool(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        result = executor.check_permission("write_file", "123")
        assert result is not None
        assert "Permission denied" in result
        assert "write_file" in result
        assert "user" in result

    def test_guest_denied_all(self, tmp_path):
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        result = executor.check_permission("run_command", "123")
        assert result is not None
        assert "Permission denied" in result

    def test_guest_denied_even_allowed_tools(self, tmp_path):
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        result = executor.check_permission("search_knowledge", "123")
        assert result is not None
        assert "Permission denied" in result


class TestExecutorRBACEnforcement:
    @pytest.mark.asyncio
    async def test_admin_executes_normally(self, tmp_path):
        pm = PermissionManager({"123": "admin"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "ok"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {}, user_id="123")
        assert result == "ok"

    @pytest.mark.asyncio
    async def test_user_denied_returns_error(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "should not reach"

        executor._handle_write_file = _handler
        result = await executor.execute("write_file", {}, user_id="123")
        assert "Permission denied" in result

    @pytest.mark.asyncio
    async def test_user_allowed_executes_normally(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "search result"

        executor._handle_search_knowledge = _handler
        result = await executor.execute("search_knowledge", {}, user_id="123")
        assert result == "search result"

    @pytest.mark.asyncio
    async def test_guest_denied_all(self, tmp_path):
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "should not reach"

        executor._handle_run_command = _handler
        result = await executor.execute("run_command", {}, user_id="123")
        assert "Permission denied" in result

    @pytest.mark.asyncio
    async def test_no_user_id_bypasses_check(self, tmp_path):
        pm = PermissionManager({}, default_tier="guest", overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "ok"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {}, user_id=None)
        assert result == "ok"

    @pytest.mark.asyncio
    async def test_no_permission_manager_bypasses_check(self):
        executor = ToolExecutor()

        async def _handler(inp):
            return "ok"

        executor._handle_test_tool = _handler
        result = await executor.execute("test_tool", {}, user_id="123")
        assert result == "ok"

    @pytest.mark.asyncio
    async def test_denied_records_error_metric(self, tmp_path):
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "should not reach"

        executor._handle_run_command = _handler
        await executor.execute("run_command", {}, user_id="123")
        metrics = executor.get_metrics()
        assert "run_command" in metrics
        assert metrics["run_command"]["errors"] == 1

    @pytest.mark.asyncio
    async def test_denied_does_not_call_handler(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        called = []

        async def _handler(inp):
            called.append(True)
            return "ok"

        executor._handle_write_file = _handler
        await executor.execute("write_file", {}, user_id="123")
        assert len(called) == 0

    @pytest.mark.asyncio
    async def test_denied_does_not_classify_risk(self, tmp_path):
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "ok"

        executor._handle_run_command = _handler
        await executor.execute("run_command", {"host": "test", "command": "rm -rf /"}, user_id="123")
        assert sum(executor.risk_stats.get_summary()["totals"].values()) == 0


class TestExecutorPermissionManagerAttribute:
    def test_default_none(self):
        executor = ToolExecutor()
        assert executor._permission_manager is None

    def test_accepts_permission_manager(self, tmp_path):
        pm = PermissionManager({}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        assert executor._permission_manager is pm


# ---------------------------------------------------------------------------
# Background task error detection
# ---------------------------------------------------------------------------

class TestBackgroundTaskErrorDetection:
    def test_permission_denied_detected(self):
        from src.discord.background_task import _is_error_output
        assert _is_error_output("Permission denied: tool 'write_file' is not available for tier 'user'.") is True

    def test_normal_output_not_detected(self):
        from src.discord.background_task import _is_error_output
        assert _is_error_output("command output here") is False

    def test_other_errors_still_detected(self):
        from src.discord.background_task import _is_error_output
        assert _is_error_output("Error executing run_command: timeout") is True
        assert _is_error_output("Unknown tool: bad_tool") is True


# ---------------------------------------------------------------------------
# REST API permission endpoints
# ---------------------------------------------------------------------------

class TestPermissionAPI:
    @pytest.fixture
    def mock_bot(self, tmp_path):
        bot = MagicMock()
        bot.permission_manager = PermissionManager(
            {"100": "admin", "200": "user", "300": "guest"},
            overrides_path=str(tmp_path / "p.json"),
        )
        bot.tool_executor = MagicMock()
        bot.tool_executor.risk_stats = MagicMock()
        bot.tool_executor.risk_stats.get_summary.return_value = {"total": 0}
        bot.tool_executor.risk_stats.get_recent.return_value = []
        bot.audit = MagicMock()
        bot.audit.search_by_risk = AsyncMock(return_value=[])
        return bot

    @pytest.mark.asyncio
    async def test_list_tiers(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/permissions/tiers")
            assert resp.status == 200
            data = await resp.json()
            assert data["valid_tiers"] == ["admin", "user", "guest"]
            assert data["default_tier"] == "user"
            assert data["config_tiers"]["100"] == "admin"
            assert "user_tier_tools" in data
            assert "run_command" in data["user_tier_tools"]

    @pytest.mark.asyncio
    async def test_get_user_tier_admin(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/permissions/user/100")
            assert resp.status == 200
            data = await resp.json()
            assert data["user_id"] == "100"
            assert data["tier"] == "admin"
            assert data["allowed_tools"] is None  # admin = no restriction

    @pytest.mark.asyncio
    async def test_get_user_tier_user(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/permissions/user/200")
            assert resp.status == 200
            data = await resp.json()
            assert data["tier"] == "user"
            assert isinstance(data["allowed_tools"], list)
            assert "run_command" in data["allowed_tools"]

    @pytest.mark.asyncio
    async def test_get_user_tier_guest(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/permissions/user/300")
            assert resp.status == 200
            data = await resp.json()
            assert data["tier"] == "guest"
            assert data["allowed_tools"] == []

    @pytest.mark.asyncio
    async def test_get_unknown_user_default(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/permissions/user/999")
            assert resp.status == 200
            data = await resp.json()
            assert data["tier"] == "user"

    @pytest.mark.asyncio
    async def test_set_user_tier(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.put(
                "/api/permissions/user/999",
                json={"tier": "admin"},
            )
            assert resp.status == 200
            data = await resp.json()
            assert data["tier"] == "admin"
            assert data["status"] == "updated"

            # Verify it took effect
            resp2 = await client.get("/api/permissions/user/999")
            data2 = await resp2.json()
            assert data2["tier"] == "admin"

    @pytest.mark.asyncio
    async def test_set_invalid_tier(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.put(
                "/api/permissions/user/999",
                json={"tier": "superuser"},
            )
            assert resp.status == 400
            data = await resp.json()
            assert "error" in data

    @pytest.mark.asyncio
    async def test_set_missing_tier(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.put(
                "/api/permissions/user/999",
                json={},
            )
            assert resp.status == 400

    @pytest.mark.asyncio
    async def test_set_invalid_json(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.put(
                "/api/permissions/user/999",
                data="not json",
                headers={"Content-Type": "application/json"},
            )
            assert resp.status == 400

    @pytest.mark.asyncio
    async def test_delete_override(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        # First set an override
        mock_bot.permission_manager.set_tier("999", "admin")

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.delete("/api/permissions/user/999")
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "override_removed"

            # Verify it reverted to default
            resp2 = await client.get("/api/permissions/user/999")
            data2 = await resp2.json()
            assert data2["tier"] == "user"

    @pytest.mark.asyncio
    async def test_delete_nonexistent_override(self, mock_bot):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        app = web.Application()
        routes = create_api_routes(mock_bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.delete("/api/permissions/user/999")
            assert resp.status == 404

    @pytest.mark.asyncio
    async def test_no_permission_manager_503(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        from src.web.api import create_api_routes

        bot = MagicMock()
        del bot.permission_manager
        bot.tool_executor = MagicMock()
        bot.tool_executor.risk_stats = MagicMock()
        bot.tool_executor.risk_stats.get_summary.return_value = {"total": 0}
        bot.tool_executor.risk_stats.get_recent.return_value = []
        bot.audit = MagicMock()
        bot.audit.search_by_risk = AsyncMock(return_value=[])

        app = web.Application()
        routes = create_api_routes(bot)
        app.router.add_routes(routes)

        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/permissions/tiers")
            assert resp.status == 503

            resp2 = await client.get("/api/permissions/user/123")
            assert resp2.status == 503

            resp3 = await client.put("/api/permissions/user/123", json={"tier": "admin"})
            assert resp3.status == 503

            resp4 = await client.delete("/api/permissions/user/123")
            assert resp4.status == 503


# ---------------------------------------------------------------------------
# Config schema
# ---------------------------------------------------------------------------

class TestPermissionsConfig:
    def test_default(self):
        cfg = PermissionsConfig()
        assert cfg.tiers == {}
        assert cfg.default_tier == "user"
        assert cfg.overrides_path == "./data/permissions.json"

    def test_custom(self):
        cfg = PermissionsConfig(
            tiers={"123": "admin"},
            default_tier="guest",
            overrides_path="/tmp/test.json",
        )
        assert cfg.tiers == {"123": "admin"}
        assert cfg.default_tier == "guest"

    def test_config_has_permissions_field(self):
        from src.config.schema import Config, DiscordConfig
        cfg = Config(discord=DiscordConfig(token="test"))
        assert hasattr(cfg, "permissions")
        assert isinstance(cfg.permissions, PermissionsConfig)


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------

class TestModuleImports:
    def test_import_permission_manager(self):
        from src.permissions import PermissionManager
        assert PermissionManager is not None

    def test_import_valid_tiers(self):
        from src.permissions.manager import VALID_TIERS
        assert isinstance(VALID_TIERS, tuple)

    def test_import_user_tier_tools(self):
        from src.permissions.manager import USER_TIER_TOOLS
        assert isinstance(USER_TIER_TOOLS, frozenset)

    def test_executor_imports_permission_manager(self):
        from src.tools.executor import ToolExecutor
        import inspect
        sig = inspect.signature(ToolExecutor.__init__)
        assert "permission_manager" in sig.parameters


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_user_tier_all_tools(self, tmp_path):
        """Every tool in USER_TIER_TOOLS is allowed for user tier."""
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        allowed = pm.allowed_tool_names("123")
        for tool in USER_TIER_TOOLS:
            assert tool in allowed

    @pytest.mark.asyncio
    async def test_executor_unknown_tool_before_rbac(self, tmp_path):
        """Unknown tool returns unknown error (RBAC doesn't intercept)."""
        pm = PermissionManager({"123": "admin"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        result = await executor.execute("nonexistent", {}, user_id="123")
        assert "Unknown tool" in result

    @pytest.mark.asyncio
    async def test_rbac_before_handler_lookup_for_denied(self, tmp_path):
        """Even for existing tools, denied users get the RBAC error first."""
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "should not reach"

        executor._handle_run_command = _handler
        result = await executor.execute("run_command", {}, user_id="123")
        assert "Permission denied" in result

    @pytest.mark.asyncio
    async def test_tier_change_takes_effect_immediately(self, tmp_path):
        """Changing tier via set_tier immediately affects next execute call."""
        pm = PermissionManager({"123": "guest"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "ok"

        executor._handle_run_command = _handler

        # Denied as guest
        result = await executor.execute("run_command", {}, user_id="123")
        assert "Permission denied" in result

        # Upgrade to admin
        pm.set_tier("123", "admin")
        result = await executor.execute("run_command", {}, user_id="123")
        assert result == "ok"

    def test_overrides_dir_created(self, tmp_path):
        """Override save creates parent directory if needed."""
        path = tmp_path / "subdir" / "deep" / "p.json"
        pm = PermissionManager({}, overrides_path=str(path))
        pm.set_tier("123", "admin")
        assert path.exists()

    def test_missing_override_file_ok(self, tmp_path):
        """Non-existent overrides path handled gracefully."""
        pm = PermissionManager({}, overrides_path=str(tmp_path / "nofile.json"))
        assert pm.get_tier("123") == "user"

    @pytest.mark.asyncio
    async def test_multiple_users_different_tiers(self, tmp_path):
        pm = PermissionManager(
            {"admin1": "admin", "user1": "user", "guest1": "guest"},
            overrides_path=str(tmp_path / "p.json"),
        )
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "ok"

        executor._handle_write_file = _handler

        assert await executor.execute("write_file", {}, user_id="admin1") == "ok"
        assert "Permission denied" in await executor.execute("write_file", {}, user_id="user1")
        assert "Permission denied" in await executor.execute("write_file", {}, user_id="guest1")

    @pytest.mark.asyncio
    async def test_user_tier_run_command_allowed(self, tmp_path):
        """run_command is in USER_TIER_TOOLS and should work for user tier."""
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            return "listing"

        executor._handle_run_command = _handler
        result = await executor.execute("run_command", {}, user_id="123")
        assert result == "listing"

    def test_check_permission_denial_message_format(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        executor = ToolExecutor(permission_manager=pm)
        result = executor.check_permission("write_file", "123")
        assert "Permission denied" in result
        assert "'write_file'" in result
        assert "'user'" in result
        assert "admin" in result.lower()

    def test_filter_tools_preserves_order(self, tmp_path):
        pm = PermissionManager({"123": "user"}, overrides_path=str(tmp_path / "p.json"))
        tools = [
            {"name": "web_search"},
            {"name": "write_file"},
            {"name": "run_command"},
            {"name": "claude_code"},
            {"name": "fetch_url"},
        ]
        result = pm.filter_tools("123", tools)
        names = [t["name"] for t in result]
        assert names == ["web_search", "run_command", "fetch_url"]

    @pytest.mark.asyncio
    async def test_concurrent_permission_checks(self, tmp_path):
        """Multiple concurrent executions with different users."""
        import asyncio
        pm = PermissionManager(
            {"admin": "admin", "user": "user"},
            overrides_path=str(tmp_path / "p.json"),
        )
        executor = ToolExecutor(permission_manager=pm)

        async def _handler(inp):
            await asyncio.sleep(0.01)
            return "ok"

        executor._handle_write_file = _handler

        results = await asyncio.gather(
            executor.execute("write_file", {}, user_id="admin"),
            executor.execute("write_file", {}, user_id="user"),
            executor.execute("write_file", {}, user_id="admin"),
        )
        assert results[0] == "ok"
        assert "Permission denied" in results[1]
        assert results[2] == "ok"
