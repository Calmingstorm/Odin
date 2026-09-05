"""Tests for health endpoint enhancements.

Covers:
- /health (basic + detail mode)
- /health/live (liveness probe)
- /health/ready (readiness probe)
- Component registration and checking
- Degraded state reporting
- Error-resilient component checks
"""

from __future__ import annotations

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import ApiTokenIdentity, WebConfig, WebhookConfig
from src.health.server import HealthServer, _is_admin_only_path

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_server(*, ready: bool = True) -> HealthServer:
    cfg = WebhookConfig(enabled=False)
    server = HealthServer(port=0, webhook_config=cfg)
    if ready:
        server.set_ready(True)
    return server


# ---------------------------------------------------------------------------
# /health — basic (backward-compatible)
# ---------------------------------------------------------------------------

class TestHealthBasic:
    async def test_health_ok_when_ready(self):
        server = _make_server(ready=True)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health")
            assert resp.status == 200
            data = await resp.json()
            assert data == {"status": "ok"}

    async def test_health_503_when_not_ready(self):
        server = _make_server(ready=False)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health")
            assert resp.status == 503
            data = await resp.json()
            assert data["status"] == "starting"


# ---------------------------------------------------------------------------
# /health?detail=1 — detailed mode
# ---------------------------------------------------------------------------

class TestHealthDetail:
    async def test_detail_includes_version_and_uptime(self):
        server = _make_server(ready=True)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health", params={"detail": "1"})
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "ok"
            assert "version" in data
            assert "uptime_seconds" in data
            assert isinstance(data["uptime_seconds"], float)
            assert data["uptime_seconds"] >= 0
            assert "components" in data
            assert isinstance(data["components"], dict)

    async def test_detail_returns_503_when_not_ready(self):
        server = _make_server(ready=False)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health", params={"detail": "1"})
            assert resp.status == 503
            data = await resp.json()
            assert data["status"] == "starting"

    async def test_detail_shows_registered_components(self):
        server = _make_server(ready=True)
        server.register_component("database", lambda: (True, "connected"))
        server.register_component("cache", lambda: (True, "12 entries"))
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health", params={"detail": "1"})
            data = await resp.json()
            assert data["status"] == "ok"
            assert data["components"]["database"] == {"healthy": True, "detail": "connected"}
            assert data["components"]["cache"] == {"healthy": True, "detail": "12 entries"}

    async def test_detail_reports_degraded_when_component_unhealthy(self):
        server = _make_server(ready=True)
        server.register_component("llm", lambda: (False, "circuit open"))
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health", params={"detail": "1"})
            data = await resp.json()
            assert data["status"] == "degraded"
            assert data["components"]["llm"]["healthy"] is False

    async def test_detail_handles_component_check_exception(self):
        def broken_check():
            raise RuntimeError("kaboom")

        server = _make_server(ready=True)
        server.register_component("broken", broken_check)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health", params={"detail": "1"})
            data = await resp.json()
            assert data["status"] == "degraded"
            assert data["components"]["broken"]["healthy"] is False
            assert "kaboom" in data["components"]["broken"]["detail"]


# ---------------------------------------------------------------------------
# /health/live — liveness probe
# ---------------------------------------------------------------------------

class TestHealthLive:
    async def test_live_always_200_when_ready(self):
        server = _make_server(ready=True)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health/live")
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "alive"

    async def test_live_always_200_even_when_not_ready(self):
        server = _make_server(ready=False)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health/live")
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "alive"


# ---------------------------------------------------------------------------
# /health/ready — readiness probe
# ---------------------------------------------------------------------------

class TestHealthReady:
    async def test_ready_200_when_ready_no_components(self):
        server = _make_server(ready=True)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health/ready")
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "ready"

    async def test_ready_503_when_not_ready(self):
        server = _make_server(ready=False)
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health/ready")
            assert resp.status == 503
            data = await resp.json()
            assert data["status"] == "not_ready"

    async def test_ready_503_when_component_unhealthy(self):
        server = _make_server(ready=True)
        server.register_component("api_provider", lambda: (False, "timeout"))
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health/ready")
            assert resp.status == 503
            data = await resp.json()
            assert data["status"] == "degraded"
            assert data["components"]["api_provider"]["healthy"] is False

    async def test_ready_200_when_all_components_healthy(self):
        server = _make_server(ready=True)
        server.register_component("db", lambda: (True, "ok"))
        server.register_component("llm", lambda: (True, "closed"))
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health/ready")
            assert resp.status == 200
            data = await resp.json()
            assert data["status"] == "ready"
            assert len(data["components"]) == 2

    async def test_ready_includes_components_in_response(self):
        server = _make_server(ready=True)
        server.register_component("sessions", lambda: (True, "5 active"))
        async with TestClient(TestServer(server._app)) as client:
            resp = await client.get("/health/ready")
            data = await resp.json()
            assert data["components"]["sessions"] == {"healthy": True, "detail": "5 active"}


# ---------------------------------------------------------------------------
# Component registration
# ---------------------------------------------------------------------------

class TestComponentRegistration:
    def test_register_component(self):
        server = _make_server()
        server.register_component("test", lambda: (True, "ok"))
        assert "test" in server._components

    def test_register_overwrites_existing(self):
        server = _make_server()
        server.register_component("test", lambda: (True, "v1"))
        server.register_component("test", lambda: (True, "v2"))
        _, detail = server._components["test"]()
        assert detail == "v2"

    def test_check_components_empty(self):
        server = _make_server()
        assert server._check_components() == {}

    def test_check_components_mixed(self):
        server = _make_server()
        server.register_component("good", lambda: (True, "fine"))
        server.register_component("bad", lambda: (False, "down"))
        results = server._check_components()
        assert results["good"]["healthy"] is True
        assert results["bad"]["healthy"] is False


class TestContextWindowsAdminPolicy:
    def test_context_surface_is_centrally_admin_only(self):
        assert _is_admin_only_path("/api/context/windows")
        assert _is_admin_only_path("/api/context/windows/clear")

    async def test_get_and_post_reject_user_and_guest_but_allow_admin(self):
        web_config = WebConfig(
            api_tokens=[
                ApiTokenIdentity(token="admin-token", user_id="a", tier="admin"),
                ApiTokenIdentity(token="user-token", user_id="u", tier="user"),
                ApiTokenIdentity(token="guest-token", user_id="g", tier="guest"),
            ]
        )
        server = HealthServer(port=0, webhook_config=WebhookConfig(), web_config=web_config)
        server._app.router.add_get(
            "/api/context/windows", lambda _r: web.json_response({"ok": True})
        )
        server._app.router.add_post(
            "/api/context/windows/clear",
            lambda _r: web.json_response({"ok": True}),
        )
        async with TestClient(TestServer(server._app)) as client:
            for token in ("user-token", "guest-token"):
                headers = {"Authorization": f"Bearer {token}"}
                assert (await client.get("/api/context/windows", headers=headers)).status == 403
                assert (
                    await client.post("/api/context/windows/clear", headers=headers)
                ).status == 403
            headers = {"Authorization": "Bearer admin-token"}
            assert (await client.get("/api/context/windows", headers=headers)).status == 200
            assert (await client.post("/api/context/windows/clear", headers=headers)).status == 200


class TestBuiltinToolsAdminPolicy:
    def test_builtin_tools_surface_is_centrally_admin_only(self):
        assert _is_admin_only_path("/api/tools/builtins")
        assert _is_admin_only_path("/api/tools/builtins/kubectl/enabled")
        # Operational inventory is also administrative under deny-by-default.
        assert _is_admin_only_path("/api/tools")
        assert _is_admin_only_path("/api/tools/stats")

    async def test_both_routes_reject_user_and_guest_but_allow_admin(self):
        web_config = WebConfig(
            api_tokens=[
                ApiTokenIdentity(token="admin-token", user_id="a", tier="admin"),
                ApiTokenIdentity(token="user-token", user_id="u", tier="user"),
                ApiTokenIdentity(token="guest-token", user_id="g", tier="guest"),
            ]
        )
        server = HealthServer(port=0, webhook_config=WebhookConfig(), web_config=web_config)
        server._app.router.add_get(
            "/api/tools/builtins", lambda _r: web.json_response({"ok": True})
        )
        server._app.router.add_post(
            "/api/tools/builtins/{name}/enabled",
            lambda _r: web.json_response({"ok": True}),
        )
        async with TestClient(TestServer(server._app)) as client:
            routes = (
                ("GET", "/api/tools/builtins"),
                ("POST", "/api/tools/builtins/kubectl/enabled"),
            )
            for token in ("user-token", "guest-token"):
                headers = {"Authorization": f"Bearer {token}"}
                for method, route_path in routes:
                    response = (
                        await client.get(route_path, headers=headers)
                        if method == "GET"
                        else await client.post(
                            route_path, headers=headers, json={"enabled": False}
                        )
                    )
                    assert response.status == 403, (
                        token,
                        method,
                        route_path,
                        response.status,
                    )
            headers = {"Authorization": "Bearer admin-token"}
            assert (await client.get("/api/tools/builtins", headers=headers)).status == 200
            assert (
                await client.post(
                    "/api/tools/builtins/kubectl/enabled",
                    headers=headers,
                    json={"enabled": False},
                )
            ).status == 200
