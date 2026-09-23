"""Focused malformed-body branches for outbound-webhook API validation."""

from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api.integrations import register_outbound_webhooks


@pytest.mark.asyncio
async def test_outbound_webhook_create_and_update_reject_non_object_payloads():
    routes = web.RouteTableDef()
    register_outbound_webhooks(
        routes, SimpleNamespace(outbound_webhook_dispatcher=object())
    )
    app = web.Application()
    app.router.add_routes(routes)

    async with TestClient(TestServer(app)) as client:
        create = await client.post("/api/outbound-webhooks", json=[])
        update = await client.put("/api/outbound-webhooks/example", json=[])
        invalid_flag = await client.put(
            "/api/outbound-webhooks/example", json={"enabled": "yes"}
        )

    assert create.status == 400
    assert update.status == 400
    assert invalid_flag.status == 400
