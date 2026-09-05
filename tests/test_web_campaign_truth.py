from types import SimpleNamespace

import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, Config
from src.discord.llm_gateway import LLMGateway
from tests.test_web_campaign_authorization import production_server


@pytest.mark.asyncio
async def test_session_demotion_resolves_detached_authority():
    server, _ = production_server()
    old = ApiTokenIdentity(token="", user_id="actor", tier="admin")
    current = old.model_copy(update={"tier": "guest"})
    token, _ = server._session_manager.create(identity=old)
    server._app["token_manager"] = SimpleNamespace(
        get=lambda _: current, resolve=lambda _: None, list_tokens=lambda: [current],
    )
    async with TestClient(TestServer(server._app)) as client:
        response = await client.get("/api/processes",
                                    headers={"Authorization": f"Bearer {token}"})
        assert response.status == 403
    assert old.tier == "admin"


@pytest.mark.asyncio
@pytest.mark.parametrize("carrier", ["header", "query"])
@pytest.mark.parametrize("kind", ["legacy", "static", "dynamic", "session"])
async def test_auth_status_authoritative_identity(carrier, kind):
    server, _ = production_server()
    identity = ApiTokenIdentity(token="synthetic-scoped", user_id="actor", tier="guest")
    token = identity.token
    expected = identity.user_id
    if kind == "legacy":
        token, expected = "synthetic-admin", "api-admin"
    elif kind == "session":
        token, _ = server._session_manager.create(identity=identity)
    elif kind == "static":
        server._web_config.api_tokens = [identity]
    else:
        server._app["token_manager"] = SimpleNamespace(
            list_tokens=lambda: [identity],
            resolve=lambda value: identity if value == token else None,
        )
    assert "api_token" not in server._app
    async with TestClient(TestServer(server._app)) as client:
        response = await client.get(
            "/api/auth/session", params={"token": token} if carrier == "query" else {},
            headers={"Authorization": f"Bearer {token}"} if carrier == "header" else {},
        )
        assert response.status == 200
        body = await response.json()
        assert body["authenticated"] is True
        assert body["user_id"] == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("requested", ["codex", "ollama", "kimi"])
@pytest.mark.parametrize("available", [True, False])
async def test_status_captures_actual_serving_identity(requested, available):
    server, bot = production_server()
    config = Config(discord={"token": "synthetic"})
    config.web = server._web_config
    config.llm_provider.active_provider = requested
    bot.config = config
    gateway = bot.llm_gateway
    gateway.codex_client = SimpleNamespace(model="primary-model", reasoning_effort="high")
    gateway.ollama_client = SimpleNamespace(model="local-model") if available else None
    gateway.kimi_client = SimpleNamespace(model="alternate-model") if available else None
    gateway.auxiliary_llm_client = None
    gateway.get_config = lambda: config
    gateway.capture_serving_identity = lambda: LLMGateway.capture_serving_identity(gateway)
    async with TestClient(TestServer(server._app)) as client:
        response = await client.get("/api/llm/status",
                                    headers={"Authorization": "Bearer synthetic-admin"})
        assert response.status == 200
        body = await response.json()
        expected = requested if available else "codex"
        assert body["configured_provider"] == requested
        assert body["serving_provider"] == expected
        assert body["active_provider_name"] == expected
        assert body["active_model"] == gateway.capture_serving_identity().model
