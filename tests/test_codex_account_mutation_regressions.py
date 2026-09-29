"""Real pools/routes, synthetic files and event-controlled OAuth transport."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.llm import codex_auth as ca
from src.llm.account_key import opaque_account_key
from src.llm.codex_quota_check import CodexQuotaCheckService
from src.web.api.codex_admin import register_codex_oauth


def creds(account):
    return {"account_id": account, "access_token": f"synthetic-{account}",
            "refresh_token": f"synthetic-refresh-{account}", "expires_at": 9999999999}


def setup(tmp_path, rows):
    path = tmp_path / "canonical.json"
    path.write_text(json.dumps(rows))
    pool = ca.CodexAuthPool(str(path))
    gateway = SimpleNamespace(codex_client=SimpleNamespace(auth=pool),
                              reload_codex=AsyncMock())
    bot = SimpleNamespace(llm_gateway=gateway, config=SimpleNamespace(
        openai_codex=SimpleNamespace(credentials_path=str(path))))
    routes = web.RouteTableDef()
    register_codex_oauth(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return path, pool, bot, app, routes


class OAuthTransport:
    def __init__(self):
        self.entered = asyncio.Event()
        self.release = asyncio.Event()
        self.calls = 0

    def session(self, **kwargs):
        transport = self

        class Response:
            status = 200

            async def __aenter__(self):
                transport.calls += 1
                transport.entered.set()
                await transport.release.wait()
                return self

            async def __aexit__(self, *args):
                pass

            async def read(self):
                return json.dumps({"access_token": "synthetic-rotated",
                                   "refresh_token": "synthetic-next",
                                   "expires_in": 3600}).encode()

        class Session:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            def post(self, url, **kwargs):
                assert url == ca.TOKEN_URL
                assert kwargs["data"]["grant_type"] == "refresh_token"
                return Response()

        return Session()


@pytest.mark.asyncio
async def test_auth_failure_clears_manual_override(tmp_path):
    _, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    await pool.set_active(0)
    assert await pool.mark_auth_failed(0)
    assert pool._manual_active_index is None
    token, account, index = await pool.acquire()
    assert (token, account, index) == ("synthetic-B", "B", 1)
    assert pool._accounts[0].is_rate_limited()


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["delete", "reorder", "reauth"])
async def test_retired_refresh_cannot_publish_shadow_or_canonical(tmp_path, monkeypatch, mutation):
    path, pool, _, app, _ = setup(tmp_path, [creds("A"), creds("B")])
    transport = OAuthTransport()
    async with TestClient(TestServer(app)) as client:
        monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
        old = pool._accounts[0]
        task = asyncio.create_task(old.force_refresh())
        await transport.entered.wait()
        if mutation == "delete":
            assert (await client.delete("/api/codex/account/0")).status == 200
        else:
            rows = [creds("B"), creds("A")] if mutation == "reorder" else [
                {**creds("A"), "access_token": "synthetic-reauth"}, creds("B")]
            ca._atomic_write_secure(path, json.dumps(rows))
            await pool.reload_async()
        before = path.read_text()
        shadow = (tmp_path / "codex_auth_0.json").read_text()
        transport.release.set()
        assert await task is False
        assert path.read_text() == before
        assert (tmp_path / "codex_auth_0.json").read_text() == shadow
        await pool.reload_async()
        assert path.read_text() == before


@pytest.mark.asyncio
async def test_admin_and_serving_share_single_use_refresh_lock(tmp_path, monkeypatch):
    path, pool, _, app, _ = setup(tmp_path, [creds("A")])
    transport = OAuthTransport()
    async with TestClient(TestServer(app)) as client:
        monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
        foreground = asyncio.create_task(pool.force_refresh(0, "synthetic-A"))
        await transport.entered.wait()
        admin = asyncio.create_task(client.post("/api/codex/account/0/refresh"))
        await asyncio.sleep(0.02)
        transport.release.set()
        assert await foreground
        assert (await admin).status == 200
        assert transport.calls == 1
        assert json.loads(path.read_text())[0]["refresh_token"] == "synthetic-next"


@pytest.mark.asyncio
@pytest.mark.parametrize("single_format", [False, True])
async def test_unchanged_reload_keeps_single_use_refresh_in_flight(
    tmp_path, monkeypatch, single_format,
):
    path, pool, *_ = setup(tmp_path, [creds("A")])
    if single_format:
        path.write_text(json.dumps(creds("A")))
        await pool.reload_async()
    transport = OAuthTransport()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    auth = pool._accounts[0]
    serving = asyncio.create_task(pool.force_refresh(0, "synthetic-A"))
    await transport.entered.wait()
    await pool.reload_async()
    assert pool._accounts[0] is auth
    concurrent = asyncio.create_task(pool.force_refresh(0, "synthetic-A"))
    transport.release.set()
    assert await serving and await concurrent
    assert transport.calls == 1
    raw = json.loads(path.read_text())
    assert (raw if single_format else raw[0])["refresh_token"] == "synthetic-next"


@pytest.mark.asyncio
async def test_reauth_same_identity_older_expiry_does_not_revive_shadow(tmp_path):
    path, pool, *_ = setup(tmp_path, [creds("A")])
    newer = {**creds("A"), "access_token": "synthetic-reauth", "expires_at": 5000}
    path.write_text(json.dumps([newer]))
    await pool.reload_async()
    assert pool._accounts[0]._load() == newer
    assert json.loads(path.read_text()) == [newer]


@pytest.mark.asyncio
async def test_cancelled_admin_settles_rotated_credentials(tmp_path, monkeypatch):
    path, pool, _, _, routes = setup(tmp_path, [creds("A")])
    handler = next(route.handler for route in routes
                   if route.path == "/api/codex/account/{index}/refresh")
    transport = OAuthTransport()
    monkeypatch.setattr(ca.aiohttp, "ClientSession", transport.session)
    request = SimpleNamespace(match_info={"index": "0"})
    task = asyncio.create_task(handler(request))
    await transport.entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not task.done()
    transport.release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert json.loads(path.read_text())[0]["refresh_token"] == "synthetic-next"
    assert pool._accounts[0]._load()["refresh_token"] == "synthetic-next"


@pytest.mark.asyncio
async def test_device_merged_write_failure_preserves_pool(tmp_path, monkeypatch):
    path, _, bot, app, _ = setup(tmp_path, [creds("A"), creds("B")])
    original = path.read_text()
    monkeypatch.setattr(ca.CodexAuth, "poll_device_auth", AsyncMock(return_value=creds("C")))
    calls = []

    def fail(path, content):
        calls.append(content)
        raise OSError("synthetic filesystem failure")

    monkeypatch.setattr(ca, "_atomic_write_secure", fail)
    async with TestClient(TestServer(app)) as client:
        response = await client.post("/api/codex/device-poll", json={
            "device_auth_id": "synthetic", "user_code": "synthetic"})
        assert response.status == 500
    assert len(calls) == 1
    assert path.read_text() == original
    bot.llm_gateway.reload_codex.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["label", "delete", "reauth"])
@pytest.mark.parametrize("invalid", [{}, None, "invalid"])
async def test_management_uses_displayed_valid_index(tmp_path, monkeypatch, operation, invalid):
    path, pool, _, app, _ = setup(tmp_path, [creds("A"), invalid, creds("B")])
    async with TestClient(TestServer(app)) as client:
        status = await (await client.get("/api/codex/status")).json()
        assert [row["account_id"] for row in status["accounts"]] == ["A", "B"]
        if operation == "label":
            response = await client.put("/api/codex/account/1/label", json={"label": "second"})
        elif operation == "delete":
            response = await client.delete("/api/codex/account/1")
        else:
            monkeypatch.setattr(ca.CodexAuth, "poll_device_auth",
                                AsyncMock(return_value={**creds("B"), "access_token": "new-B"}))
            response = await client.post("/api/codex/device-poll", json={
                "device_auth_id": "synthetic", "user_code": "synthetic", "save_index": 1})
        assert response.status == 200
    rows = json.loads(path.read_text())
    assert rows[0] == creds("A") and rows[1] == invalid
    if operation == "label":
        assert rows[2]["label"] == "second"
        assert pool._accounts[1]._load()["label"] == "second"
    elif operation == "delete":
        assert len(rows) == 2 and pool.account_count == 1
    else:
        assert rows[2]["access_token"] == "new-B"


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["shrink", "reorder"])
@pytest.mark.parametrize("phase", ["token", "response", "token_error", "response_error"])
async def test_in_place_quota_reload_fenced_across_awaits(tmp_path, mutation, phase):
    path, pool, *_ = setup(tmp_path, [creds("A"), creds("B")])
    service = CodexQuotaCheckService(lambda: pool)
    entered, release = asyncio.Event(), asyncio.Event()
    original_token_for = pool.token_for

    async def token_for(index):
        token = await original_token_for(index)
        if phase.startswith("token"):
            entered.set()
            await release.wait()
            if phase.endswith("error"):
                raise RuntimeError("synthetic refresh failure")
        return token

    pool.token_for = token_for

    class Response:
        status = 401
        headers = {"x-codex-primary-used-percent": "25",
                   "x-codex-primary-window-minutes": "300"}

        async def __aenter__(self):
            entered.set()
            await release.wait()
            if phase.endswith("error"):
                raise RuntimeError("synthetic request failure")
            return self

        async def __aexit__(self, *args):
            pass

    class Session:
        closed = False
        calls = 0

        def post(self, *args, **kwargs):
            self.calls += 1
            return Response()

        async def close(self):
            self.closed = True

    session = Session()
    service._session = session
    task = asyncio.create_task(service.check_once())
    await entered.wait()
    path.write_text(json.dumps([] if mutation == "shrink" else [creds("B"), creds("A")]))
    await pool.reload_async()
    release.set()
    await task
    assert pool._quota_check_failures == {}
    assert pool.quota.snapshot_for(opaque_account_key("A")) is None
    assert pool.quota.snapshot_for(opaque_account_key("B")) is None
    assert session.calls == (0 if phase.startswith("token") else 1)
    await service.close()
