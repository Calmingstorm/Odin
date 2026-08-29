"""Route-level coverage for src/web/api/security.py (RFC-006 P1, ≥90%).

Drives the RBAC, host-access, API-token, and auth registrars through the real
aiohttp route layer (Odin's advisory: real routes, faked boundaries). The bot
is faked but the managers are REAL (PermissionManager / HostAccessManager /
ApiTokenManager on tmp files), so the handlers exercise genuine behavior.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.permissions.host_access import HostAccessManager
from src.permissions.manager import PermissionManager
from src.permissions.token_manager import ApiTokenManager
from src.web.api.security import (
    register_api_tokens,
    register_auth,
    register_host_access,
    register_permissions_rbac,
)

HOSTS = ["alpha", "beta"]


def _make_bot(tmp_path, *, auth_configured=True, with_managers=True):
    bot = MagicMock()
    bot.config.web.api_token = "cfg-token" if auth_configured else ""
    bot.config.web.api_tokens = []
    bot.audit = MagicMock()
    bot.audit.log_event = AsyncMock()
    if with_managers:
        bot.permissions = PermissionManager(
            {"admin-user": "admin"}, "user", str(tmp_path / "perms.json"))
        bot.host_access_manager = HostAccessManager(
            path=str(tmp_path / "hosts.json"), available_hosts=HOSTS)
        bot.api_token_manager = ApiTokenManager(path=str(tmp_path / "tokens.json"))
    else:
        bot.permissions = None
        bot.host_access_manager = None
        bot.api_token_manager = None
    return bot


def _app(bot, *, identity="__admin__"):
    """Build an app with all security registrars; inject an api-identity so the
    admin gate can be exercised. identity=None → no identity (unauthenticated);
    "__admin__" → an admin-tier identity; otherwise a namespace with .tier."""
    routes = web.RouteTableDef()
    register_permissions_rbac(routes, bot)
    register_host_access(routes, bot)
    register_api_tokens(routes, bot)
    register_auth(routes, bot)

    if identity == "__admin__":
        ident = SimpleNamespace(tier="admin", user_id="admin-user")
    else:
        ident = identity

    @web.middleware
    async def _inject(request, handler):
        if ident is not None:
            request["_api_identity_holder"] = ident
            request.__dict__["_api_identity"] = ident
        return await handler(request)

    app = web.Application(middlewares=[_inject])
    app.router.add_routes(routes)
    return app


# ── RBAC ─────────────────────────────────────────────────────────────

class TestRbacRoutes:
    @pytest.mark.asyncio
    async def test_list_tiers(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.get("/api/permissions/tiers")
            assert r.status == 200
            body = await r.json()
            assert "admin" in body["valid_tiers"] and body["default_tier"] == "user"

    @pytest.mark.asyncio
    async def test_list_tiers_503_without_manager(self, tmp_path):
        bot = _make_bot(tmp_path, with_managers=False)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.get("/api/permissions/tiers")).status == 503

    @pytest.mark.asyncio
    async def test_get_user_tier(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            body = await (await c.get("/api/permissions/user/admin-user")).json()
            assert body["tier"] == "admin" and body["allowed_tools"] is None

    @pytest.mark.asyncio
    async def test_set_user_tier_and_audits(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.put("/api/permissions/user/u2", json={"tier": "guest"})
            assert r.status == 200
            assert bot.permissions.get_tier("u2") == "guest"
            bot.audit.log_event.assert_awaited()

    @pytest.mark.asyncio
    async def test_set_user_tier_rejects_bad_tier(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.put("/api/permissions/user/u2", json={"tier": "wizard"})
            assert r.status == 400

    @pytest.mark.asyncio
    async def test_set_user_tier_missing_tier_and_bad_json(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.put("/api/permissions/user/u2", json={})).status == 400
            r = await c.put("/api/permissions/user/u2", data="not json")
            assert r.status == 400

    @pytest.mark.asyncio
    async def test_delete_user_tier_present_and_absent(self, tmp_path):
        bot = _make_bot(tmp_path)
        await bot.permissions.async_set_tier("u2", "guest")
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.delete("/api/permissions/user/u2")).status == 200
            assert (await c.delete("/api/permissions/user/u2")).status == 404


# ── Host access ──────────────────────────────────────────────────────

class TestHostAccessRoutes:
    @pytest.mark.asyncio
    async def test_get_host_access(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            body = await (await c.get("/api/host-access")).json()
            assert body["available_hosts"] == HOSTS

    @pytest.mark.asyncio
    async def test_set_user_and_audit(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.put("/api/host-access/user/u1",
                            json={"allowed_hosts": ["alpha"], "default_host": "alpha"})
            assert r.status == 200
            assert bot.host_access_manager.is_host_allowed("u1", "alpha")
            bot.audit.log_event.assert_awaited()

    @pytest.mark.asyncio
    async def test_set_user_validation_errors(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.put("/api/host-access/user/u1",
                                json={"allowed_hosts": "x"})).status == 400
            assert (await c.put("/api/host-access/user/u1",
                                json={"allowed_hosts": [1]})).status == 400
            assert (await c.put("/api/host-access/user/u1",
                                json={"default_host": 5})).status == 400
            assert (await c.put("/api/host-access/user/u1", data="bad")).status == 400

    @pytest.mark.asyncio
    async def test_delete_user_present_and_absent(self, tmp_path):
        bot = _make_bot(tmp_path)
        await bot.host_access_manager.set_user("u1", ["alpha"], "alpha")
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.delete("/api/host-access/user/u1")).status == 200
            assert (await c.delete("/api/host-access/user/u1")).status == 404

    @pytest.mark.asyncio
    async def test_set_default_policy(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.put("/api/host-access/default-policy",
                            json={"allowed_hosts": ["alpha"], "default_host": "alpha"})
            assert r.status == 200
            assert not bot.host_access_manager.is_host_allowed("stranger", "beta")

    @pytest.mark.asyncio
    async def test_default_policy_validation_and_503(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.put("/api/host-access/default-policy",
                                json={"allowed_hosts": "x"})).status == 400
        bot2 = _make_bot(tmp_path, with_managers=False)
        async with TestClient(TestServer(_app(bot2))) as c:
            assert (await c.get("/api/host-access")).status == 503


# ── API tokens (admin-gated) ─────────────────────────────────────────

class TestApiTokenRoutes:
    @pytest.mark.asyncio
    async def test_create_list_update_regen_delete_lifecycle(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/tokens", json={"user_id": "svc1", "tier": "user"})
            assert r.status == 201
            created = await r.json()
            assert created["token"] and created["tier"] == "user"

            listed = await (await c.get("/api/tokens")).json()
            assert any(t["user_id"] == "svc1" for t in listed["tokens"])

            assert (await c.put("/api/tokens/svc1",
                                json={"label": "renamed"})).status == 200
            regen = await (await c.post("/api/tokens/svc1/regenerate")).json()
            assert regen["token"] != created["token"]
            assert (await c.delete("/api/tokens/svc1")).status == 200
            assert (await c.delete("/api/tokens/svc1")).status == 404

    @pytest.mark.asyncio
    async def test_create_validation_matrix(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/tokens", json={})).status == 400          # no user_id
            assert (await c.post("/api/tokens",
                                 json={"user_id": "bad id!"})).status == 400     # bad chars
            assert (await c.post("/api/tokens",
                                 json={"user_id": "u", "tier": "x"})).status == 400
            assert (await c.post("/api/tokens",
                                 json={"user_id": "u", "allowed_hosts": "x"})).status == 400
            assert (await c.post("/api/tokens",
                                 json={"user_id": "u", "allowed_tools": [1]})).status == 400
            assert (await c.post("/api/tokens",
                                 json={"user_id": "u", "allowed_hosts": ["ghost"]})).status == 400
            assert (await c.post("/api/tokens", data="bad")).status == 400

    @pytest.mark.asyncio
    async def test_create_duplicate_conflicts(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            await c.post("/api/tokens", json={"user_id": "dup"})
            assert (await c.post("/api/tokens", json={"user_id": "dup"})).status == 409

    @pytest.mark.asyncio
    async def test_default_host_must_be_in_allowed(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/tokens", json={
                "user_id": "u", "allowed_hosts": ["alpha"], "default_host": "beta"})
            assert r.status == 400

    @pytest.mark.asyncio
    async def test_update_not_found_and_no_fields(self, tmp_path):
        bot = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.put("/api/tokens/ghost", json={})).status == 400  # no fields
            assert (await c.put("/api/tokens/ghost",
                                json={"label": "x"})).status == 404
            assert (await c.post("/api/tokens/ghost/regenerate")).status == 404
            assert (await c.delete("/api/tokens/ghost")).status == 404

    @pytest.mark.asyncio
    async def test_admin_gate_denies_non_admin(self, tmp_path):
        bot = _make_bot(tmp_path)
        non_admin = SimpleNamespace(tier="user", user_id="u")
        async with TestClient(TestServer(_app(bot, identity=non_admin))) as c:
            assert (await c.get("/api/tokens")).status == 403
            assert (await c.post("/api/tokens", json={"user_id": "x"})).status == 403

    @pytest.mark.asyncio
    async def test_dev_mode_allows_without_identity(self, tmp_path):
        # No auth configured anywhere → admin gate is open.
        bot = _make_bot(tmp_path, auth_configured=False)
        async with TestClient(TestServer(_app(bot, identity=None))) as c:
            assert (await c.get("/api/tokens")).status == 200


# ── Auth ─────────────────────────────────────────────────────────────

class TestAuthRoutes:
    def _bot_with_sessions(self, tmp_path, **kw):
        bot = _make_bot(tmp_path, **kw)
        sm = MagicMock()
        sm.create.return_value = ("sess-123", 3600)
        sm.validate.return_value = True
        sm.timeout_seconds = 3600
        sm.active_count = 1
        return bot, sm

    def _app_with_sm(self, bot, sm, identity="__admin__"):
        app = _app(bot, identity=identity)
        app["session_manager"] = sm
        return app

    @pytest.mark.asyncio
    async def test_login_with_config_token(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path)
        bot.config.web.resolve_api_identity = MagicMock(return_value=None)
        async with TestClient(TestServer(self._app_with_sm(bot, sm))) as c:
            r = await c.post("/api/auth/login", json={"token": "cfg-token"})
            assert r.status == 200 and (await r.json())["session_id"] == "sess-123"

    @pytest.mark.asyncio
    async def test_login_invalid_token_401(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path)
        bot.config.web.resolve_api_identity = MagicMock(return_value=None)
        bot.api_token_manager = None  # force fall-through to legacy compare
        async with TestClient(TestServer(self._app_with_sm(bot, sm))) as c:
            r = await c.post("/api/auth/login", json={"token": "wrong"})
            assert r.status == 401

    @pytest.mark.asyncio
    async def test_login_missing_token_and_bad_json(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path)
        async with TestClient(TestServer(self._app_with_sm(bot, sm))) as c:
            assert (await c.post("/api/auth/login", json={})).status == 400
            assert (await c.post("/api/auth/login", data="x")).status == 400

    @pytest.mark.asyncio
    async def test_login_dev_mode_issues_session(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path, auth_configured=False)
        bot.api_token_manager = None
        async with TestClient(TestServer(self._app_with_sm(bot, sm))) as c:
            r = await c.post("/api/auth/login", json={"token": "anything"})
            assert r.status == 200

    @pytest.mark.asyncio
    async def test_login_dynamic_token_identity(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path)
        ident = await bot.api_token_manager.create_token("svc", tier="user")
        bot.config.web.resolve_api_identity = MagicMock(return_value=None)
        async with TestClient(TestServer(self._app_with_sm(bot, sm))) as c:
            r = await c.post("/api/auth/login", json={"token": ident.token})
            assert r.status == 200

    @pytest.mark.asyncio
    async def test_logout(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path)
        async with TestClient(TestServer(self._app_with_sm(bot, sm))) as c:
            r = await c.post("/api/auth/logout",
                             headers={"Authorization": "Bearer sess-123"})
            assert (await r.json())["status"] == "logged_out"
            sm.destroy.assert_called_once_with("sess-123")

    @pytest.mark.asyncio
    async def test_logout_closes_only_exact_session_websockets(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path)
        sm.destroy.return_value = True
        ws = SimpleNamespace(close_by_session_id=AsyncMock())
        app = self._app_with_sm(bot, sm)
        app["ws_manager"] = ws
        async with TestClient(TestServer(app)) as c:
            r = await c.post(
                "/api/auth/logout", headers={"Authorization": "Bearer sess-exact"},
            )
            assert r.status == 200
        sm.destroy.assert_called_once_with("sess-exact")
        ws.close_by_session_id.assert_awaited_once_with("sess-exact")

    @pytest.mark.asyncio
    async def test_session_check(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path)
        app = self._app_with_sm(bot, sm)
        app["api_token"] = "cfg-token"
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get(
                "/api/auth/session",
                headers={"Authorization": "Bearer cfg-token"})).json()
            assert body["authenticated"] is True

    @pytest.mark.asyncio
    async def test_session_check_unauthenticated_and_via_session(self, tmp_path):
        bot, sm = self._bot_with_sessions(tmp_path)
        async with TestClient(TestServer(self._app_with_sm(bot, sm))) as c:
            # No app-level api_token → falls to sm.validate (mocked True)
            body = await (await c.get(
                "/api/auth/session",
                headers={"Authorization": "Bearer some-session"})).json()
            assert body["authenticated"] is True
            # No auth header at all → unauthenticated
            body2 = await (await c.get("/api/auth/session")).json()
            assert body2["authenticated"] is False

    @pytest.mark.asyncio
    async def test_login_resolves_dynamic_identity_path(self, tmp_path):
        # api_token_manager.resolve returns None, config.resolve_api_identity
        # returns an identity → the identity branch issues a session.
        bot, sm = self._bot_with_sessions(tmp_path)
        bot.api_token_manager = MagicMock()
        bot.api_token_manager.resolve.return_value = None
        bot.api_token_manager.list_tokens.return_value = [{"x": 1}]  # auth configured
        ident = SimpleNamespace(user_id="cfgid", tier="user")
        bot.config.web.resolve_api_identity = MagicMock(return_value=ident)
        async with TestClient(TestServer(self._app_with_sm(bot, sm))) as c:
            r = await c.post("/api/auth/login", json={"token": "matches-config"})
            assert r.status == 200

    @pytest.mark.asyncio
    async def test_logout_without_session_manager(self, tmp_path):
        bot = _make_bot(tmp_path)
        # no session_manager on the app
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/auth/logout")
            assert (await r.json())["status"] == "ok"


class TestTokenRoute503AndTeardown:
    @pytest.mark.asyncio
    async def test_token_routes_503_when_manager_missing(self, tmp_path):
        # auth still configured (api_token set) so the admin gate passes, but
        # the token manager is absent → each mutating route 503s.
        bot = _make_bot(tmp_path, with_managers=False)
        bot.config.web.api_token = "cfg-token"
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/tokens", json={"user_id": "x"})).status == 503
            assert (await c.put("/api/tokens/x", json={"label": "y"})).status == 503
            assert (await c.post("/api/tokens/x/regenerate")).status == 503
            assert (await c.delete("/api/tokens/x")).status == 503

    @pytest.mark.asyncio
    async def test_rbac_and_host_routes_503(self, tmp_path):
        bot = _make_bot(tmp_path, with_managers=False)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.get("/api/permissions/user/x")).status == 503
            assert (await c.put("/api/permissions/user/x", json={"tier": "user"})).status == 503
            assert (await c.delete("/api/permissions/user/x")).status == 503
            assert (await c.put("/api/host-access/user/x", json={})).status == 503
            assert (await c.delete("/api/host-access/user/x")).status == 503
            assert (await c.put("/api/host-access/default-policy", json={})).status == 503

    @pytest.mark.asyncio
    async def test_update_token_host_validation(self, tmp_path):
        bot = _make_bot(tmp_path)
        await bot.api_token_manager.create_token("svc", allowed_hosts=["alpha"],
                                                 default_host="alpha")
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.put("/api/tokens/svc",
                                json={"tier": "wizard"})).status == 400
            assert (await c.put("/api/tokens/svc",
                                json={"allowed_tools": [1]})).status == 400
            assert (await c.put("/api/tokens/svc",
                                json={"allowed_hosts": [1]})).status == 400
            assert (await c.put("/api/tokens/svc",
                                json={"allowed_hosts": ["ghost"]})).status == 400
            assert (await c.put("/api/tokens/svc",
                                json={"default_host": "ghost"})).status == 400
            assert (await c.put("/api/tokens/svc",
                                json={"default_host": "beta"})).status == 400  # not in allowed

    @pytest.mark.asyncio
    async def test_audit_failure_never_breaks_the_operation(self, tmp_path):
        # A raising audit sink must not fail the permission/host change — the
        # except-pass around every audit call is a resilience property.
        bot = _make_bot(tmp_path)
        bot.audit.log_event = AsyncMock(side_effect=RuntimeError("audit down"))
        await bot.permissions.async_set_tier("u9", "guest")
        await bot.host_access_manager.set_user("u9", ["alpha"], "alpha")
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.put("/api/permissions/user/u9",
                                json={"tier": "user"})).status == 200
            assert (await c.delete("/api/permissions/user/u9")).status == 200
            assert (await c.put("/api/host-access/user/u9",
                                json={"allowed_hosts": ["alpha"]})).status == 200

    @pytest.mark.asyncio
    async def test_login_dev_mode_no_session_manager_500(self, tmp_path):
        bot = _make_bot(tmp_path, auth_configured=False)
        bot.api_token_manager = None
        # no session_manager on the app → dev-mode login can't issue a session
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/auth/login", json={"token": "x"})).status == 500

    @pytest.mark.asyncio
    async def test_regenerate_and_delete_trigger_session_teardown(self, tmp_path):
        bot = _make_bot(tmp_path)
        await bot.api_token_manager.create_token("svc")
        sm = MagicMock()
        ws = MagicMock()
        ws.close_by_user_id = AsyncMock()
        app = _app(bot)
        app["session_manager"] = sm
        app["ws_manager"] = ws
        async with TestClient(TestServer(app)) as c:
            assert (await c.post("/api/tokens/svc/regenerate")).status == 200
            assert (await c.delete("/api/tokens/svc")).status == 200
        sm.destroy_by_user_id.assert_called_with("svc")
        ws.close_by_user_id.assert_awaited_with("svc")
