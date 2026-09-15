"""Final web-route error-path coverage using the real aiohttp registration layer."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.environment import EnvironmentSource
from src.config.schema import Config, set_active_config_path
from src.permissions.token_manager import ApiTokenManager
from src.web.api.discord_connection import register_discord_connection
from src.web.api.schedules_api import register_schedules
from src.web.api_common import _safe_int_param
from src.web.websocket import WebSocketManager


class _Supervisor:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.detached = 0

    def status(self):
        return SimpleNamespace(state="detached", detail="safe detail", generation=0)

    async def detach(self):
        self.detached += 1
        if self.error:
            raise self.error

    async def attach(self, _token):
        if self.error:
            raise self.error


def _bot(tmp_path: Path, supervisor: _Supervisor | None = None):
    config_path = tmp_path / "config.yml"
    config_path.write_text("discord:\n  token: ${DISCORD_TOKEN}\n", encoding="utf-8")
    set_active_config_path(config_path)
    return SimpleNamespace(
        config=Config(discord={"token": "alpha.token.value"}),
        onboarding=SimpleNamespace(
            environment_source=EnvironmentSource(tmp_path / ".env"),
            initialization_store=SimpleNamespace(binding=SimpleNamespace(config_path=config_path)),
        ),
        connection_supervisor=supervisor,
        api_token_manager=None,
    )


def _app(bot, identity=None):
    routes = web.RouteTableDef()
    register_discord_connection(routes, bot)

    @web.middleware
    async def identity_middleware(request, handler):
        if identity is not None:
            request._api_identity = identity
        return await handler(request)

    app = web.Application(middlewares=[identity_middleware])
    app.router.add_routes(routes)
    return app


async def test_discord_connection_rejects_malformed_admin_requests_without_side_effects(tmp_path):
    supervisor = _Supervisor()
    bot = _bot(tmp_path, supervisor)
    bot.config.discord.token = "invalid"
    async with TestClient(TestServer(_app(bot))) as client:
        assert (await client.post("/api/discord/connection", data="{" )).status == 400
        assert (
            await client.post(
                "/api/discord/connection", json={"operation": "detach", "extra": True}
            )
        ).status == 400
        assert (
            await client.post("/api/discord/connection", json={"operation": "connect"})
        ).status == 409
    assert supervisor.detached == 0


async def test_discord_connection_admin_errors_do_not_expose_credentials(tmp_path):
    secret = "alpha.token.value"
    bot = _bot(tmp_path, _Supervisor(RuntimeError(f"gateway rejected {secret}")))
    (tmp_path / ".env").write_text(f"DISCORD_TOKEN={secret}\n", encoding="utf-8")
    async with TestClient(TestServer(_app(bot))) as client:
        response = await client.post("/api/discord/connection", json={"operation": "detach"})
        assert response.status == 502
        response = await client.post("/api/discord/connection", json={"operation": "connect"})
        assert response.status == 502
        assert secret not in await response.text()


async def test_discord_connection_requires_real_admin_identity_and_supervisor(tmp_path):
    bot = _bot(tmp_path, None)
    async with TestClient(
        TestServer(_app(bot, identity=SimpleNamespace(tier="user")))
    ) as client:
        response = await client.post("/api/discord/connection", json={"operation": "status"})
        assert response.status == 403

    async with TestClient(TestServer(_app(bot))) as client:
        response = await client.post("/api/discord/connection", json={"operation": "status"})
        assert response.status == 200
        response = await client.post("/api/discord/connection", json={"operation": "detach"})
        assert response.status == 503

# Remaining defensive branches in the web/security surface.  These deliberately
# use direct helpers where a socket would add ceremony but no additional proof.


async def test_token_guard_accepts_async_bool_and_rejects_non_bool(tmp_path):
    manager = ApiTokenManager(tmp_path / "tokens.json")

    async def yes(_inventory):
        return True

    manager.set_last_credential_guard(yes)
    assert await manager._may_publish_candidate({}) is True
    manager.set_last_credential_guard(lambda _inventory: "yes")
    try:
        await manager._may_publish_candidate({})
    except TypeError as exc:
        assert "must return bool" in str(exc)
    else:
        raise AssertionError("non-bool guard must fail closed")


async def test_schedule_unavailable_and_bad_json_are_safe():
    bot = MagicMock()
    bot.scheduler.connection_status.return_value = {"state": "offline"}
    bot.scheduler.list_all.return_value = []
    bot.scheduler.add = AsyncMock()
    routes = web.RouteTableDef()
    register_schedules(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        assert (await client.get("/api/schedules/status")).status == 200
        # aiohttp's JSON parser failure must not invoke scheduler mutation.
        assert (await client.post("/api/schedules", data="{" )).status == 500
    bot.scheduler.add.assert_not_awaited()


def test_safe_int_param_clamps_invalid_and_missing():
    request = MagicMock()
    request.query = {}
    assert _safe_int_param(request, "limit", 999, 1, 10) == 10
    request.query = {"limit": "nonsense"}
    assert _safe_int_param(request, "limit", 0, 1, 10) == 1
    request.query = {"limit": "-8"}
    assert _safe_int_param(request, "limit", 4, 1, 10) == 1
    request.query = {"limit": "88"}
    assert _safe_int_param(request, "limit", 4, 1, 10) == 10



def _ws_bot():
    return SimpleNamespace(config=SimpleNamespace(web=SimpleNamespace(api_token="", api_tokens=[])))


async def test_websocket_auth_inventory_and_revoked_chat_are_denied():
    manager = WebSocketManager(_ws_bot())
    dynamic = SimpleNamespace(list_tokens=lambda: [{"token": " usable "}])
    assert manager._dynamic_auth_required(dynamic)
    assert manager._authentication_required(SimpleNamespace(_odin_token_manager=dynamic))

    ws = SimpleNamespace(
        closed=False,
        _odin_policy_revoked=True,
        send_json=AsyncMock(),
    )
    await manager._handle_chat_scoped(ws, {"content": "should never execute"})
    assert ws.send_json.await_count == 1
    assert "authorization changed" in ws.send_json.await_args.args[0]["error"]


async def test_websocket_invalid_chat_inputs_do_not_call_bot():
    bot = _ws_bot()
    bot.handle_message = AsyncMock()
    manager = WebSocketManager(bot)
    ws = SimpleNamespace(closed=False, send_json=AsyncMock())
    # Override policy fence only for validation coverage; no transport execution.
    manager._policy_authorized = lambda _ws: True
    await manager._handle_chat_scoped(ws, {"content": ""})
    await manager._handle_chat_scoped(ws, {"content": "x" * 10001})
    bot.handle_message.assert_not_awaited()
