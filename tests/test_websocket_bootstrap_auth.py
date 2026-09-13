"""D3 bootstrap WebSocket authorization must follow live credentials."""

from __future__ import annotations

import asyncio
import base64
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig
from src.web.websocket import setup_websocket


def _protocol(token: str) -> str:
    encoded = base64.urlsafe_b64encode(token.encode()).decode().rstrip("=")
    return "odin.bearer." + encoded


def _client(config: WebConfig):  # type: ignore[arg-type]
    bot = SimpleNamespace(config=SimpleNamespace(web=config), name="odin")
    app = web.Application()
    return TestClient(TestServer(app)), setup_websocket(app, bot, web_config=config)


async def test_bootstrap_socket_is_denied_after_live_static_token_published():
    config = WebConfig(host="127.0.0.1")
    client, _ = _client(config)
    async with client:
        async with client.ws_connect("/api/ws") as anonymous:
            await anonymous.send_json({"type": "ping", "ts": 1})
            assert (await anonymous.receive_json())["type"] == "pong"

            config.api_tokens = [
                ApiTokenIdentity(
                    token="new-token",
                    user_id="admin",
                    username="Admin",
                    tier="admin",
                )
            ]
            await anonymous.send_json({"type": "ping", "ts": 2})
            await anonymous.receive()
            assert anonymous.closed

        async with client.ws_connect(
            "/api/ws", protocols=[_protocol("new-token")]
        ) as authenticated:
            await authenticated.send_json({"type": "ping", "ts": 3})
            assert (await authenticated.receive_json())["type"] == "pong"


async def test_live_config_replaces_setup_time_static_token():
    config = WebConfig(host="127.0.0.1", api_token="old-token")
    client, _ = _client(config)
    config.api_token = "new-token"
    async with client:
        async with client.ws_connect("/api/ws", protocols=[_protocol("old-token")]) as stale:
            await stale.receive()
            assert stale.closed
        async with client.ws_connect("/api/ws", protocols=[_protocol("new-token")]) as current:
            await current.send_json({"type": "ping", "ts": 1})
            assert (await current.receive_json())["type"] == "pong"


async def test_anonymous_passive_event_subscriber_loses_delivery_when_auth_appears():
    config = WebConfig(host="127.0.0.1")
    client, manager = _client(config)
    async with client:
        async with client.ws_connect("/api/ws") as anonymous:
            # Simulate the previously permitted bootstrap stream membership.
            # The outbound fence, rather than another inbound command, must
            # remove it when the credential inventory becomes non-empty.
            server_ws = next(iter(manager._clients))
            manager._event_subscribers.add(server_ws)

            config.api_tokens = [
                ApiTokenIdentity(
                    token="new-token",
                    user_id="admin",
                    username="Admin",
                    tier="admin",
                )
            ]
            await manager.broadcast_event({"kind": "must-not-leak"})
            assert anonymous.closed is False
            assert server_ws not in manager._event_subscribers
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(anonymous.receive(), timeout=0.05)


async def test_unusable_credentials_do_not_disable_bootstrap():
    class UnusableDynamicTokens:
        def list_tokens(self):
            return [{"token": ""}, {"token": "${WEB_TOKEN}"}]

    config = WebConfig(
        host="127.0.0.1",
        api_token=" ",
        api_tokens=[
            ApiTokenIdentity(token="${WEB_TOKEN}", user_id="placeholder"),
            ApiTokenIdentity(token="", user_id="empty"),
        ],
    )
    client, manager = _client(config)
    manager._bot.api_token_manager = UnusableDynamicTokens()
    async with client:
        async with client.ws_connect("/api/ws") as anonymous:
            await anonymous.send_json({"type": "ping", "ts": 1})
            assert (await anonymous.receive_json())["type"] == "pong"


async def test_bootstrap_socket_is_denied_after_live_dynamic_token_published():
    class DynamicTokens:
        identity = None

        def list_tokens(self):
            return [self.identity] if self.identity is not None else []

        def resolve(self, token: str):
            if self.identity is not None and token == self.identity.token:
                return self.identity
            return None

        def get(self, user_id: str):
            if self.identity is not None and user_id == self.identity.user_id:
                return self.identity
            return None

    config = WebConfig(host="127.0.0.1")
    dynamic_tokens = DynamicTokens()
    client, manager = _client(config)
    manager._bot.api_token_manager = dynamic_tokens
    async with client:
        async with client.ws_connect("/api/ws") as anonymous:
            await anonymous.send_json({"type": "ping", "ts": 1})
            assert (await anonymous.receive_json())["type"] == "pong"
            dynamic_tokens.identity = ApiTokenIdentity(
                token="dynamic-token",
                user_id="dynamic",
                username="Dynamic",
                tier="admin",
            )
            await anonymous.send_json({"type": "ping", "ts": 2})
            await anonymous.receive()
            assert anonymous.closed

        async with client.ws_connect(
            "/api/ws", protocols=[_protocol("dynamic-token")]
        ) as authenticated:
            await authenticated.send_json({"type": "ping", "ts": 3})
            assert (await authenticated.receive_json())["type"] == "pong"
