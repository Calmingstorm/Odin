"""Exhaustive registered-route boundary matrix, using production middleware.

The final middleware records handler reachability without executing management
effects. Separate tests exercise actual object and scheduler/dispatch handlers.
"""
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig, WebhookConfig
from src.health.server import HealthServer
from src.permissions.manager import PermissionManager
from src.tools.executor import ToolExecutor


def production_server():
    config = WebConfig(enabled=True, api_token="synthetic-admin")
    server = HealthServer(web_config=config, webhook_config=WebhookConfig(enabled=True))
    bot = MagicMock()
    bot.config.web = config
    bot.api_token_manager = None
    bot.audit.log_web_action = AsyncMock()
    bot.sessions.items_snapshot.return_value = []
    bot.sessions.get.return_value = None
    server.set_bot(bot)
    return server, bot


# Intentionally independent of the production policy constants.
SELF_SERVICE = {
    ("POST", "/api/auth/login"), ("POST", "/api/auth/logout"),
    ("GET", "/api/auth/session"), ("POST", "/api/chat"),
    ("POST", "/api/execute"), ("GET", "/api/ws"),
    ("GET", "/api/sessions"), ("GET", "/api/sessions/search"),
    ("GET", "/api/sessions/{channel_id}"),
    ("GET", "/api/sessions/{channel_id}/export"),
    ("DELETE", "/api/sessions/{channel_id}"),
}


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["session", "static", "dynamic"])
async def test_every_registered_route_tier_matrix(monkeypatch, carrier):
    monkeypatch.setattr("src.health.server._RATE_LIMIT_MAX", 100000, raising=False)
    server, _ = production_server()
    credentials = {}
    identities = {}
    for tier in ("admin", "user", "guest"):
        identity = ApiTokenIdentity(token=f"synthetic-{tier}", user_id=f"actor-{tier}", tier=tier)
        identities[identity.token] = identity
        if carrier == "session":
            credentials[tier], _ = server._session_manager.create(identity=identity)
        else:
            credentials[tier] = identity.token
    if carrier == "static":
        server._web_config.api_tokens = list(identities.values())
    elif carrier == "dynamic":
        server._app["token_manager"] = SimpleNamespace(
            list_tokens=lambda: list(identities), resolve=identities.get,
        )

    @web.middleware
    async def boundary(request, handler):
        return web.Response(status=209)

    server._app.middlewares.append(boundary)
    routes = list(server._app.router.routes())
    assert len(routes) > 150
    async with TestClient(TestServer(server._app)) as client:
        for route in routes:
            canonical = route.resource.canonical
            path = route.resource.url_for(**{
                key: "sample" for key in re.findall(r"\{(\w+)(?::[^}]+)?\}", canonical)
            })
            method = "GET" if route.method == "HEAD" else route.method
            public = not canonical.startswith("/api/") or canonical == "/api/auth/login"
            for tier in ("admin", "user", "guest", "unauthenticated"):
                headers = ({"Authorization": f"Bearer {credentials[tier]}"}
                           if tier in credentials else {})
                response = await client.request(
                    route.method, path, headers=headers, allow_redirects=False,
                )
                expected = 209 if public or tier == "admin" or (
                    tier != "unauthenticated" and (method, canonical) in SELF_SERVICE
                ) else 401 if tier == "unauthenticated" else 403
                assert response.status == expected, (
                    carrier, tier, route.method, canonical, response.status,
                )


@pytest.mark.asyncio
async def test_session_owner_boundary():
    server, bot = production_server()
    identity = ApiTokenIdentity(token="", user_id="owner", tier="user")
    token, _ = server._session_manager.create(identity=identity)
    async with TestClient(TestServer(server._app)) as client:
        for method, suffix in (("GET", ""), ("GET", "/export"), ("DELETE", "")):
            response = await client.request(method, f"/api/sessions/other{suffix}",
                                            headers={"Authorization": f"Bearer {token}"})
            assert response.status == 403
    bot.sessions.get.assert_not_called()
    bot.sessions.reset.assert_not_called()


@pytest.mark.parametrize("identity", [None, ""])
def test_falsy_requester_never_bypasses_rbac(tmp_path, identity):
    executor = ToolExecutor.__new__(ToolExecutor)
    executor._permission_manager = PermissionManager({}, overrides_path=str(tmp_path / "rbac.json"))
    assert executor.check_permission("run_command", identity)


@pytest.mark.asyncio
async def test_system_schedule_has_explicit_scoped_authority(tmp_path):
    from src.discord.scheduled_events import ScheduledEventHandlers
    from src.discord.tool_loop import ToolLoopRunner

    executor = ToolExecutor.__new__(ToolExecutor)
    executor._permission_manager = PermissionManager({}, overrides_path=str(tmp_path / "rbac.json"))
    effect = AsyncMock(return_value="executed")
    executor.execute = effect
    loop = SimpleNamespace(
        _tool_executor=executor, _native_tools=SimpleNamespace(handles=lambda _: False),
        _mcp_manager=None,
    )

    async def dispatch(*args):
        return await ToolLoopRunner.dispatch_loop_tool_inner(loop, *args)

    loop.dispatch_loop_tool_inner = dispatch
    owner = SimpleNamespace(_tool_executor=executor, _tool_loop=loop, _audit=MagicMock())
    result = await ScheduledEventHandlers._execute_scheduled_tool(owner, "run_command", {},
                                                                 SimpleNamespace(id=123), None)
    assert result.ok
    effect.assert_awaited_once_with("run_command", {}, user_id="scheduler")
    assert executor._permission_manager.get_tier("scheduler") == "user"
    effect.reset_mock()
    result = await ScheduledEventHandlers._execute_scheduled_tool(
        owner, "run_command", {}, SimpleNamespace(id=123), "ordinary-user",
    )
    assert not result.ok
    effect.assert_not_called()
