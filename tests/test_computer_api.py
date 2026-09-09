"""Hermetic HTTP operator contracts; no runtime/desktop/host effects."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api.computer import register_computer


def expiry(seconds=3600):
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat()


class Controller:
    def __init__(self):
        self.calls = []
        self.state = "active"
        self.expiration = expiry()
        self.observing = asyncio.Event()
        self.release = asyncio.Event()
        self.block = False

    def check(self, owner_id, web_session_id):
        if (owner_id, web_session_id) != ("alice", "private-session"):
            raise PermissionError("private path or desktop text must not leak")

    async def operator_status(self, **actor):
        self.check(**actor)
        self.calls.append("status")
        return {
            "available": True, "state": self.state, "owner_id": "alice",
            "session_id": "computer-session", "app": "drawing", "last_action": "executed",
            "last_verification": "unknown", "pixels": "must not leak",
        }

    async def operator_stop(self, **actor):
        self.check(**actor)
        self.calls.append("stop")
        self.state = "cancelled"
        return await self.operator_status(**actor)

    async def operator_pause(self, **actor):
        self.check(**actor)
        self.calls.append("pause")
        self.state = "paused"
        return await self.operator_status(**actor)

    async def operator_observe(self, **actor):
        self.check(**actor)
        self.calls.append("observe")
        self.observing.set()
        if self.block:
            await self.release.wait()
        return {"frame": {
            "evidence_id": "opaque-frame", "captured_at": expiry(-1),
            "expires_at": self.expiration, "fresh_for_ms": 2000, "pixels": "must not leak",
        }}

    async def operator_evidence(self, evidence_id, **actor):
        self.check(**actor)
        self.calls.append("evidence")
        if evidence_id != "opaque-frame":
            raise FileNotFoundError
        return {
            "data": b"\x89PNG\r\n\x1a\nfixture", "content_type": "image/png",
            "expires_at": self.expiration,
        }

    async def operator_export(self, name, **actor):
        self.check(**actor)
        self.calls.append("export")
        return {"artifact_id": "opaque-artifact", "expires_at": self.expiration}

    async def operator_download(self, artifact_id, **actor):
        self.check(**actor)
        self.calls.append("download")
        return {"data": b"saved file", "expires_at": self.expiration}


def client(controller, *, enabled=True, user="alice", tier="admin", session="private-session",
           toggle=None):
    import time

    from src.config.schema import ApiTokenIdentity
    from src.health.server import SessionManager

    principal = ApiTokenIdentity(token="fixture-only", user_id=user or "absent", tier=tier)
    sessions = SessionManager()
    if session is not None:
        sessions._sessions[session] = time.monotonic()
        sessions._identities[session] = principal

    @web.middleware
    async def identity(request, handler):
        if user is not None:
            request._api_identity = principal
        if session is not None:
            request._session_id = session
            request._session_managed = True
        return await handler(request)

    bot = SimpleNamespace(computer=controller,
        host_access_manager=SimpleNamespace(is_host_allowed=lambda *_: True),
        tool_executor=SimpleNamespace(check_permission=lambda *_: None), config=SimpleNamespace(
        computer=SimpleNamespace(enabled=enabled),
        web=SimpleNamespace(api_token="", api_tokens=[principal]),
    ))
    app = web.Application(middlewares=[identity])
    if toggle is not None:
        bot.computer_set_enabled = toggle
    app["session_manager"] = sessions
    routes = web.RouteTableDef()
    register_computer(routes, bot)
    app.router.add_routes(routes)
    return TestClient(TestServer(app))


@pytest.mark.asyncio
@pytest.mark.parametrize("kwargs,code", [
    ({"user": None}, 401), ({"tier": "user"}, 403), ({"session": None}, 401),
    ({"user": "bob"}, 404), ({"session": "other-session"}, 404),
])
async def test_auth_disabled_and_owner_fences(kwargs, code):
    controller = Controller()
    async with client(controller, **kwargs) as c:
        response = await c.get("/api/computer")
        assert response.status == code
        assert "private path" not in await response.text()
    assert controller.calls == []


@pytest.mark.asyncio
async def test_status_is_private_summary_without_capture():
    controller = Controller()
    async with client(controller) as c:
        response = await c.get("/api/computer")
        body = await response.json()
        assert response.status == 200
        assert "pixels" not in body and "frame" not in body
        assert "private-session" not in str(body)
        assert response.headers["Cache-Control"] == "no-store, private"
        assert controller.calls == ["status"]
        assert (await c.get("/api/computer?token=not-a-credential")).status == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", [
    ("post", "stop"), ("post", "pause"), ("post", "observe"),
    ("get", "evidence/opaque-frame"), ("post", "export"), ("get", "download/opaque-artifact"),
])
async def test_all_routes_require_auth_owner_and_session(method, path):
    for kwargs, expected in [
        ({"user": None}, 401), ({"user": "bob"}, 404),
        ({"session": "other"}, 404), ({"tier": "user"}, 403),
    ]:
        async with client(Controller(), **kwargs) as c:
            response = await getattr(c, method)(
                "/api/computer/" + path, json={"name": "drawing.png"},
            )
            assert response.status == expected


@pytest.mark.asyncio
async def test_emergency_stop_not_blocked_by_observe_or_disable():
    controller = Controller()
    controller.block = True
    async with client(controller) as c:
        observation = asyncio.create_task(c.post("/api/computer/observe", json={}))
        await asyncio.wait_for(controller.observing.wait(), 1)
        response = await asyncio.wait_for(c.post("/api/computer/stop", json={}), 1)
        assert response.status == 200
        assert (await response.json())["state"] == "cancelled"
        controller.release.set()
        await observation
    async with client(controller, enabled=False) as c:
        assert (await c.post("/api/computer/stop", json={})).status == 200
        assert (await c.post("/api/computer/pause", json={})).status == 200
        assert (await c.post("/api/computer/observe", json={})).status == 503


@pytest.mark.asyncio
async def test_explicit_frame_download_and_expiration():
    controller = Controller()
    async with client(controller) as c:
        result = await (await c.post("/api/computer/observe", json={})).json()
        assert "pixels" not in result["frame"]
        response = await c.get("/api/computer/evidence/opaque-frame")
        assert response.content_type == "image/png"
        assert (await response.read()).startswith(b"\x89PNG")
        controller.expiration = expiry(-1)
        assert (await c.get("/api/computer/evidence/opaque-frame")).status == 410
        assert (await c.get("/api/computer/download/opaque-artifact")).status == 410


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"name": "../secret"}, {"name": "/tmp/file"}, {"name": "ok", "owner_id": "bob"},
    {"name": "."}, {"name": "a\u0000"}, {"name": "x" * 110}, {"name": 12}, [],
])
async def test_export_rejects_paths_identity_and_invalid_names(body):
    controller = Controller()
    async with client(controller) as c:
        assert (await c.post("/api/computer/export", json=body)).status == 400
    assert controller.calls == []


@pytest.mark.asyncio
async def test_export_opaque_then_forced_safe_download():
    async with client(Controller()) as c:
        response = await c.post("/api/computer/export", json={"name": "drawing.png"})
        body = await response.json()
        assert set(body) == {"artifact_id", "name", "expires_at"}
        response = await c.get("/api/computer/download/" + body["artifact_id"])
        assert response.content_type == "application/octet-stream"
        assert response.headers["Content-Disposition"].startswith("attachment;")
        assert response.headers["Content-Security-Policy"].startswith("sandbox;")
        assert await response.read() == b"saved file"


@pytest.mark.asyncio
async def test_toggle_fail_closed_without_lifecycle_hook_and_strict_input():
    async with client(Controller(), enabled=False) as c:
        response = await c.post("/api/computer/enabled", json={"enabled": True})
        assert response.status == 503
        for body in ({"enabled": 1}, {"enabled": "true"}, {"enabled": True, "storage_dir": "/x"}):
            response = await c.post("/api/computer/enabled", json=body)
            assert response.status == 400
    async with client(Controller(), user=None, enabled=False) as c:
        assert (await c.post("/api/computer/enabled", json={"enabled": True})).status == 401


@pytest.mark.asyncio
async def test_typed_provisioning_preflight_is_not_applied_with_safe_remedy():
    from src.computer.provisioning import ComputerProvisioningError

    calls = []
    failure = ComputerProvisioningError("storage_unavailable")

    async def toggle(enabled):
        calls.append(enabled)
        raise failure

    controller = Controller()
    async with client(controller, enabled=False, toggle=toggle) as c:
        before = await (await c.get("/api/computer")).json()
        response = await c.post("/api/computer/enabled", json={"enabled": True})
        body = await response.json()
        assert response.status == 409
        assert body == {"code": failure.code, "error": failure.message,
                        "remedy": failure.remedy, "outcome": "not_applied",
                        "next_action": "repair_provisioning"}
        assert "no-store" in response.headers["Cache-Control"]
        after = await (await c.get("/api/computer")).json()
        # The read-only accessibility probe has its own fresh timestamp.
        before.pop("accessibility")
        after.pop("accessibility")
        assert after == before
    assert calls == [True]
    assert controller.calls == ["status", "status"]


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [ValueError, TypeError, KeyError, RuntimeError,
                                     PermissionError, FileNotFoundError, TimeoutError])
async def test_dispatched_enable_failure_is_unknown_not_bad_request(failure):
    calls = []

    async def toggle(enabled):
        calls.append(enabled)  # stand-in for a mutation before failed publication
        raise failure("/private/path bearer-secret desktop text")

    async with client(Controller(), enabled=False, toggle=toggle) as c:
        response = await c.post("/api/computer/enabled", json={"enabled": True})
        body = await response.json()
        assert response.status == 409
        assert body["outcome"] == "outcome_unknown"
        assert body["next_action"] == "refresh_status"
        assert "not_applied" not in str(body)
        assert "bearer-secret" not in str(body) and "/private" not in str(body)
    assert calls == [True]


@pytest.mark.asyncio
async def test_provisioning_error_does_not_bypass_auth_or_validation():
    calls = []

    async def toggle(enabled):
        calls.append(enabled)

    async with client(Controller(), toggle=toggle) as c:
        assert (await c.post("/api/computer/enabled", json={"enabled": "true"})).status == 400
    async with client(Controller(), user=None, toggle=toggle) as c:
        assert (await c.post("/api/computer/enabled", json={"enabled": True})).status == 401
    assert calls == []
