"""WebSocket authentication through HealthServer's deployed middleware list."""
from __future__ import annotations

import base64
from types import SimpleNamespace
from unittest.mock import MagicMock

import aiohttp
import pytest
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import WebConfig
from src.health.server import HealthServer
from src.web.websocket import setup_websocket


def _proto(token: str) -> str:
    payload = base64.urlsafe_b64encode(token.encode()).decode().rstrip("=")
    return "odin.bearer." + payload


def _production_client():
    config = WebConfig(api_token="configured-admin-token")
    server = HealthServer(web_config=config)
    identity = SimpleNamespace(user_id="browser-user", tier="admin")
    sid, _timeout = server._session_manager.create(identity=identity)
    manager = setup_websocket(
        server._app,
        SimpleNamespace(name="odin"),
        api_token=config.api_token,
        web_config=config,
    )
    server._app["ws_manager"] = manager
    return TestClient(TestServer(server._app)), server, manager, sid


async def test_health_server_middleware_accepts_session_subprotocol():
    client, _server, manager, sid = _production_client()
    async with client:
        ws = await client.ws_connect("/api/ws", protocols=[_proto(sid)])
        await ws.send_json({"type": "ping", "ts": 11})
        assert (await ws.receive_json())["type"] == "pong"
        assert next(iter(manager._clients))._odin_session_id == sid
        await ws.close()


@pytest.mark.parametrize("query", ["token=", "token=&token=x", "token=x&token="])
async def test_health_server_middleware_rejects_any_query_token_before_validation(
    query, monkeypatch,
):
    client, server, _manager, sid = _production_client()
    validate = MagicMock(wraps=server._session_manager.validate)
    monkeypatch.setattr(server._session_manager, "validate", validate)
    async with client:
        ws = await client.ws_connect(
            f"/api/ws?{query}",
            protocols=[_proto(sid)],
        )
        msg = await ws.receive()
        assert msg.type == aiohttp.WSMsgType.CLOSE
        assert msg.data == 4001
    validate.assert_not_called()
