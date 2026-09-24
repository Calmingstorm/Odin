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


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [("name", []), ("url", {"bad": "type"})])
async def test_outbound_webhook_create_rejects_non_string_name_and_url(field, value):
    routes = web.RouteTableDef()
    register_outbound_webhooks(
        routes, SimpleNamespace(outbound_webhook_dispatcher=object())
    )
    app = web.Application()
    app.router.add_routes(routes)

    async with TestClient(TestServer(app)) as client:
        response = await client.post(
            "/api/outbound-webhooks",
            json={"name": "safe", "url": "https://example.test/hook", field: value},
        )
        body = await response.json()

    assert response.status == 400
    assert body == {"error": f"{field} must be a string"}


@pytest.mark.asyncio
async def test_outbound_webhook_routes_report_disabled_dispatcher():
    """The endpoint reports unavailable when optional webhook wiring is absent."""
    routes = web.RouteTableDef()
    register_outbound_webhooks(routes, SimpleNamespace())
    app = web.Application()
    app.router.add_routes(routes)

    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/outbound-webhooks/stats")
        body = await response.json()

    assert response.status == 503
    assert body == {"error": "outbound webhooks not available"}


@pytest.mark.asyncio
async def test_outbound_webhook_create_rejects_overlong_url():
    """Reject an over-limit URL before any dispatcher mutation is attempted."""
    routes = web.RouteTableDef()
    register_outbound_webhooks(
        routes, SimpleNamespace(outbound_webhook_dispatcher=object())
    )
    app = web.Application()
    app.router.add_routes(routes)

    async with TestClient(TestServer(app)) as client:
        response = await client.post(
            "/api/outbound-webhooks",
            json={"name": "valid", "url": "https://example.test/" + "x" * 2048},
        )
        body = await response.json()

    assert response.status == 400
    assert body == {"error": "url exceeds maximum length (2048 chars)"}
