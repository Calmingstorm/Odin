"""Real HTTP middleware/UI error paths with disposable content and fake backends."""
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import WebConfig
from src.health.server import (
    HealthServer,
    SessionManager,
    _make_admin_middleware,
    _make_auth_middleware,
)


@pytest.mark.parametrize("header", ["Origin", "Referer"])
async def test_cross_origin_writes_are_blocked_before_handler(header):
    server = HealthServer(port=0)
    calls = []

    async def write(request):
        calls.append(await request.json())
        return web.json_response({"saved": True})

    server._app.router.add_post("/api/test-write", write)
    async with TestClient(TestServer(server._app)) as client:
        response = await client.post("/api/test-write", json={"value": 1}, headers={
            header: "https://untrusted.example.invalid/page",
        })
        assert response.status == 403
        assert (await response.json())["error"] == "cross-origin request blocked"
        assert response.headers["X-Frame-Options"] == "DENY"
        assert calls == []
        same_origin = str(client.make_url("/"))
        response = await client.post("/api/test-write", json={"value": 2}, headers={
            header: same_origin,
        })
        assert response.status == 200
        assert calls == [{"value": 2}]


async def test_ui_serves_asset_spa_and_refuses_symlink_escape(tmp_path):
    server = HealthServer(port=0)
    ui = tmp_path / "ui"
    ui.mkdir()
    (ui / "index.html").write_text("<html>disposable test UI</html>")
    (ui / "app.js").write_text("test asset")
    outside = tmp_path / "operator-private.txt"
    outside.write_text("must not be served")
    (ui / "escape.txt").symlink_to(outside)
    server._ui_dir = ui
    server._app.router.add_get("/", server._redirect_to_ui)
    server._app.router.add_get("/ui/{path:.*}", server._serve_ui_file)
    async with TestClient(TestServer(server._app)) as client:
        response = await client.get("/", allow_redirects=False)
        assert response.status == 302
        assert response.headers["Location"] == "/ui/"
        for path in ("/ui/", "/ui/client-route"):
            response = await client.get(path)
            assert response.status == 200
            assert "disposable test UI" in await response.text()
        assert await (await client.get("/ui/app.js")).text() == "test asset"
        response = await client.get("/ui/escape.txt")
        assert response.status == 403
        assert "must not be served" not in await response.text()


@pytest.mark.parametrize("manager,expected", [
    (SimpleNamespace(credential_inventory=SimpleNamespace(has_usable_auth=True)), 401),
    (SimpleNamespace(list_tokens=lambda: [{"user_id": "test"}]), 401),
    (SimpleNamespace(list_tokens=lambda: []), 200),
    (SimpleNamespace(), 200),
])
async def test_auth_inventory_fallbacks_fail_closed_when_credentials_exist(manager, expected):
    app = web.Application(middlewares=[_make_auth_middleware(WebConfig(), SessionManager())])
    app["token_manager"] = manager

    async def protected(_request):
        return web.json_response({"reached": True})

    app.router.add_get("/api/test", protected)
    async with TestClient(TestServer(app)) as client:
        response = await client.get("/api/test")
        assert response.status == expected
        if expected == 200:
            assert (await response.json()) == {"reached": True}


@pytest.mark.parametrize("config,manager,identity,expected", [
    (WebConfig(), None, None, 200),
    (WebConfig(), SimpleNamespace(credential_store_auth_required=True), None, 403),
    (WebConfig(api_token="test-admin"), None, SimpleNamespace(tier="admin"), 200),
    (WebConfig(api_token="test-admin"), None, SimpleNamespace(tier="user"), 403),
])
async def test_standalone_admin_middleware_enforces_recovery_and_tier(config, manager, identity, expected):
    @web.middleware
    async def bind(request, handler):
        request._api_identity = identity
        return await handler(request)

    app = web.Application(middlewares=[bind, _make_admin_middleware(config)])
    app["token_manager"] = manager

    async def protected(_request):
        return web.json_response({"reached": True})

    app.router.add_post("/api/config", protected)
    async with TestClient(TestServer(app)) as client:
        assert (await client.post("/api/config", json={})).status == expected


def test_missing_session_has_no_expiry_lease():
    assert SessionManager().seconds_until_expiry("not-issued") is None
