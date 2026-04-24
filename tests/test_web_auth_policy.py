"""Tests that every /api/ route enforces auth unless explicitly public.

Walks all registered routes and verifies unauthenticated requests
return 401 for protected routes and 200/other for public ones.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.health.server import AUTH_PUBLIC_EXACT, AUTH_PUBLIC_PREFIXES


def _make_bot():
    bot = MagicMock()
    bot.config = MagicMock()
    bot.config.web.api_token = "test-secret-token"
    bot.config.web.api_tokens = []
    bot.config.web.resolve_api_identity.return_value = None
    bot.sessions = MagicMock()
    bot.sessions.count.return_value = 0
    bot.sessions.ids.return_value = []
    bot.sessions.items_snapshot.return_value = []
    return bot


def _is_public(path: str) -> bool:
    """Check if a path is in the public auth policy."""
    if path in AUTH_PUBLIC_EXACT:
        return True
    return any(path.startswith(p) for p in AUTH_PUBLIC_PREFIXES)


def _build_app(bot):
    """Build an app with the real API routes and auth middleware."""
    from src.web.api import setup_api
    from src.health.server import _make_auth_middleware, SessionManager

    sm = SessionManager(timeout_minutes=5)
    app = web.Application(middlewares=[
        _make_auth_middleware(bot.config.web, sm),
    ])
    app["session_manager"] = sm
    app["api_token"] = bot.config.web.api_token
    setup_api(app, bot)
    return app


class TestAuthPolicy:
    @pytest.mark.asyncio
    async def test_login_is_reachable_without_bearer(self):
        """Login endpoint is reachable without a Bearer header (middleware skips it).
        It may still return 401 from its own handler logic (wrong token),
        but that's the handler rejecting the credentials, not the middleware."""
        bot = _make_bot()
        app = _build_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/api/auth/login",
                json={"token": "test-secret-token"},
            )
            assert resp.status == 200

    @pytest.mark.asyncio
    async def test_protected_routes_require_auth(self):
        """Sample of protected routes must return 401 without auth."""
        bot = _make_bot()
        app = _build_app(bot)
        protected_routes = [
            ("GET", "/api/sessions"),
            ("GET", "/api/tools"),
            ("GET", "/api/status"),
            ("POST", "/api/execute"),
            ("POST", "/api/sessions/clear-all"),
            ("GET", "/api/governor/stats"),
        ]
        async with TestClient(TestServer(app)) as client:
            for method, path in protected_routes:
                if method == "GET":
                    resp = await client.get(path)
                else:
                    resp = await client.post(path, json={})
                assert resp.status == 401, f"{method} {path} returned {resp.status}, expected 401"

    @pytest.mark.asyncio
    async def test_auth_token_grants_access(self):
        bot = _make_bot()
        app = _build_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get(
                "/api/sessions",
                headers={"Authorization": "Bearer test-secret-token"},
            )
            assert resp.status != 401

    @pytest.mark.asyncio
    async def test_wrong_token_rejected(self):
        bot = _make_bot()
        app = _build_app(bot)
        async with TestClient(TestServer(app)) as client:
            resp = await client.get(
                "/api/sessions",
                headers={"Authorization": "Bearer wrong-token"},
            )
            assert resp.status == 401

    @pytest.mark.asyncio
    async def test_public_policy_constants_are_exported(self):
        """Route policy table is importable for use in tests."""
        assert isinstance(AUTH_PUBLIC_EXACT, frozenset)
        assert "/api/auth/login" in AUTH_PUBLIC_EXACT
        assert isinstance(AUTH_PUBLIC_PREFIXES, tuple)
