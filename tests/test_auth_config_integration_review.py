"""Independent real-route integration checks using disposable credentials/files."""

from unittest.mock import AsyncMock

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig
from src.permissions.token_manager import ApiTokenManager
from src.web.websocket import WebSocketManager
from tests.test_webauth_campaign_regressions import composition, login


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["legacy", "static"])
async def test_revoked_browser_socket_cannot_resurrect_after_same_secret_restored(
    source, monkeypatch,
):
    config = WebConfig(api_token="fixture-original") if source == "legacy" else WebConfig(
        api_tokens=[ApiTokenIdentity(token="fixture-original", user_id="fixture-owner")]
    )
    bot, sessions, app = composition(config)
    manager = WebSocketManager(bot, session_manager=sessions, web_config=config)
    app.router.add_get("/api/ws", manager.handle)
    chat = AsyncMock(return_value={"response": "fixture"})
    monkeypatch.setattr("src.web.websocket.process_web_chat", chat)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, "fixture-original")
        ws = await client.ws_connect("/api/ws", headers={"Authorization": f"Bearer {sid}"})
        if source == "legacy":
            config.api_token = "fixture-rotated"
        else:
            config.api_tokens[0].token = "fixture-rotated"
        await ws.send_json({"type": "chat", "content": "must refuse"})
        assert "authorization changed" in (await ws.receive_json(timeout=2))["error"]
        if source == "legacy":
            config.api_token = "fixture-original"
        else:
            config.api_tokens[0].token = "fixture-original"
        # A refusal ended this transport's authority, not a temporary suspension.
        response = await client.get("/api/probe", headers={"Authorization": f"Bearer {sid}"})
        assert response.status == 401
        assert not sessions.contains(sid)
        assert chat.await_count == 0
        await ws.close()
    await manager.close_all()


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["legacy", "static"])
async def test_revoked_raw_socket_never_regains_authority(source):
    config = WebConfig(api_token="fixture-original") if source == "legacy" else WebConfig(
        api_tokens=[ApiTokenIdentity(token="fixture-original")]
    )
    bot, sessions, app = composition(config)
    manager = WebSocketManager(bot, session_manager=sessions, web_config=config)
    app.router.add_get("/api/ws", manager.handle)
    async with TestClient(TestServer(app)) as client:
        ws = await client.ws_connect(
            "/api/ws", headers={"Authorization": "Bearer fixture-original"}
        )
        if source == "legacy":
            config.api_token = "fixture-rotated"
        else:
            config.api_tokens[0].token = "fixture-rotated"
        await ws.send_json({"subscribe": "events"})
        assert "error" in await ws.receive_json(timeout=2)
        if source == "legacy":
            config.api_token = "fixture-original"
        else:
            config.api_tokens[0].token = "fixture-original"
        await ws.send_json({"subscribe": "events"})
        assert "error" in await ws.receive_json(timeout=2)
        await ws.close()
    await manager.close_all()


@pytest.mark.asyncio
async def test_generic_new_profile_alias_persists_reloadable_validated_entry(tmp_path, monkeypatch):
    from aiohttp import web

    from src.config import schema
    from src.config.schema import Config, load_config
    from src.web.api.config_admin import register_discord_config
    from tests.test_web_api_config_admin import _bot

    monkeypatch.setattr(schema, "_ACTIVE_CONFIG_PATH", None)
    monkeypatch.setattr(schema, "_LAUNCH_CONFIG_PATH", None)
    path = tmp_path / "config.yml"
    path.write_text("discord: {token: fixture}\n")
    bot = _bot()
    bot.config = load_config(path)
    bot.health_server = None
    routes = web.RouteTableDef()
    register_discord_config(routes, bot)
    app = web.Application()
    app.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        response = await client.put("/api/config", json={
            "openai_compatible": {"model_profiles": {
                "fixture/model": {"context_window": 200000, "max_output_tokens": 4000}
            }}
        })
        assert response.status == 200, await response.text()
    profile = bot.config.openai_compatible.model_profiles["fixture/model"]
    assert profile.total_window_tokens == 200000
    reloaded = load_config(path)
    assert reloaded.openai_compatible.model_profiles["fixture/model"] == profile
    assert isinstance(reloaded, Config)


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["header", "subprotocol"])
async def test_three_way_collision_is_dynamic_on_every_carrier(tmp_path, carrier):
    import base64

    tokens = ApiTokenManager(str(tmp_path / "tokens.json"))
    dynamic = await tokens.create_token("fixture-owner", tier="user")
    config = WebConfig(api_token=dynamic.token, api_tokens=[
        ApiTokenIdentity(token=dynamic.token, user_id="fixture-static", tier="admin")
    ])
    bot, sessions, app = composition(config, tokens)
    manager = WebSocketManager(bot, session_manager=sessions, web_config=config)
    app.router.add_get("/api/ws", manager.handle)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, dynamic.token)
        assert sessions.get_auth_source(sid) == "dynamic"
        response = await client.get(
            "/api/probe", headers={"Authorization": f"Bearer {dynamic.token}"}
        )
        assert (await response.json())["user"] == dynamic.user_id
        encoded = base64.urlsafe_b64encode(dynamic.token.encode()).decode().rstrip("=")
        options = ({"headers": {"Authorization": f"Bearer {dynamic.token}"}} if carrier == "header"
                   else {"protocols": [f"odin.bearer.{encoded}"]})
        ws = await client.ws_connect("/api/ws", **options)
        server_ws = next(iter(manager._clients))
        assert server_ws._odin_identity.user_id == dynamic.user_id
        assert server_ws._odin_identity.tier == "user"
        assert server_ws._odin_credential_policy.source == "dynamic"
        await ws.close()
    await manager.close_all()


@pytest.mark.asyncio
async def test_second_same_id_static_session_real_handshake_survives():
    config = WebConfig(api_tokens=[
        ApiTokenIdentity(token="fixture-first", user_id="same", tier="guest"),
        ApiTokenIdentity(token="fixture-second", user_id="same", tier="admin"),
    ])
    bot, sessions, app = composition(config)
    manager = WebSocketManager(bot, session_manager=sessions, web_config=config)
    app.router.add_get("/api/ws", manager.handle)
    async with TestClient(TestServer(app)) as client:
        sid = await login(client, "fixture-second")
        ws = await client.ws_connect("/api/ws", headers={"Authorization": f"Bearer {sid}"})
        await ws.send_json({"subscribe": "events"})
        assert (await ws.receive_json(timeout=2))["type"] == "subscribed"
        await ws.close()
    await manager.close_all()
