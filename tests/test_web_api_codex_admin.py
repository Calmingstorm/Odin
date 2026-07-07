"""Route-level coverage for src/web/api/codex_admin.py (RFC-006 P4a).

Drives the Codex OAuth admin routes through the real aiohttp route layer with
a REAL CodexAuthPool wired at bot.llm_gateway.codex_client.auth (faking only
the network transport). These handler bodies were ~10% covered — never walked
by a test, the category the v3.52 TS bugs came from.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.llm import codex_auth as ca
from src.llm.codex_auth import CodexAuthPool
from src.web.api.codex_admin import register_codex_oauth


def _creds(access="tok", account_id="0", **extra):
    return {"access_token": access, "refresh_token": "r",
            "expires_at": 9_999_999_999, "account_id": account_id, **extra}


def _make_bot(tmp_path, *, accounts=2, configured=True):
    creds_path = tmp_path / "codex.json"
    bot = MagicMock()
    bot.config.openai_codex.credentials_path = str(creds_path)
    if configured:
        creds_path.write_text(json.dumps([
            _creds(access=f"a{i}", account_id=str(i), email=f"u{i}@x.co")
            for i in range(accounts)]))
        pool = CodexAuthPool(str(creds_path))
        bot.llm_gateway.codex_client.auth = pool
        bot._codex_auth_pool = pool
    else:
        bot.llm_gateway.codex_client = None
        bot._codex_auth_pool = None
    return bot, creds_path


def _app(bot):
    routes = web.RouteTableDef()
    register_codex_oauth(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


class TestCodexStatus:
    @pytest.mark.asyncio
    async def test_configured_lists_accounts(self, tmp_path):
        bot, _ = _make_bot(tmp_path, accounts=2)
        async with TestClient(TestServer(_app(bot))) as c:
            body = await (await c.get("/api/codex/status")).json()
            assert body["configured"] is True and body["account_count"] == 2
            assert body["accounts"][0]["email"] == "u0@x.co"
            assert body["accounts"][0]["is_current"] is True

    @pytest.mark.asyncio
    async def test_unconfigured(self, tmp_path):
        bot, _ = _make_bot(tmp_path, configured=False)
        async with TestClient(TestServer(_app(bot))) as c:
            body = await (await c.get("/api/codex/status")).json()
            assert body["configured"] is False and body["accounts"] == []


class TestDeviceFlow:
    @pytest.mark.asyncio
    async def test_device_code_success_and_error(self, tmp_path, monkeypatch):
        bot, _ = _make_bot(tmp_path)
        monkeypatch.setattr(ca.CodexAuth, "request_device_code",
                            AsyncMock(return_value={"device_auth_id": "d", "user_code": "AB"}))
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/codex/device-code")).status == 200
        monkeypatch.setattr(ca.CodexAuth, "request_device_code",
                            AsyncMock(side_effect=RuntimeError("boom")))
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/codex/device-code")).status == 500

    @pytest.mark.asyncio
    async def test_device_poll_validation(self, tmp_path):
        bot, _ = _make_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/codex/device-poll", data="bad")).status == 400
            assert (await c.post("/api/codex/device-poll", json={})).status == 400

    @pytest.mark.asyncio
    async def test_device_poll_saves_creds(self, tmp_path, monkeypatch):
        bot, path = _make_bot(tmp_path, accounts=1)
        bot.llm_gateway.reload_codex = AsyncMock(return_value={"configured": True})
        new = _creds(access="brand-new", account_id="0", email="new@x.co")
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth", AsyncMock(return_value=new))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB", "save_index": 0})
            assert r.status == 200
        assert json.loads(path.read_text())[0]["access_token"] == "brand-new"

    @pytest.mark.asyncio
    async def test_device_poll_appends_without_save_index(self, tmp_path, monkeypatch):
        bot, path = _make_bot(tmp_path, accounts=1)
        bot.llm_gateway.reload_codex = AsyncMock(return_value={"configured": True})
        new = _creds(access="appended", account_id="1", email="second@x.co")
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth", AsyncMock(return_value=new))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB"})
            assert r.status == 200
        # appended to the existing list
        saved = json.loads(path.read_text())
        assert len(saved) == 2 and saved[1]["access_token"] == "appended"

    @pytest.mark.asyncio
    async def test_device_poll_dict_format_file_promoted_to_list(self, tmp_path, monkeypatch):
        # Single-object (legacy) creds file → new account promotes it to a list.
        creds_path = tmp_path / "codex.json"
        creds_path.write_text(json.dumps(_creds(access="legacy", account_id="0")))
        bot = MagicMock()
        bot.config.openai_codex.credentials_path = str(creds_path)
        bot.llm_gateway.codex_client = None
        bot._codex_auth_pool = None
        bot.llm_gateway.reload_codex = AsyncMock(return_value={"configured": True})
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth",
                            AsyncMock(return_value=_creds(access="new2", account_id="1")))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB"})
            assert r.status == 200
        saved = json.loads(creds_path.read_text())
        assert isinstance(saved, list) and len(saved) == 2

    @pytest.mark.asyncio
    async def test_device_poll_bad_save_index(self, tmp_path, monkeypatch):
        bot, _ = _make_bot(tmp_path, accounts=1)
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth",
                            AsyncMock(return_value=_creds()))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB",
                                   "save_index": "notint"})
            assert r.status == 400

    @pytest.mark.asyncio
    async def test_device_poll_error(self, tmp_path, monkeypatch):
        bot, _ = _make_bot(tmp_path)
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth",
                            AsyncMock(side_effect=RuntimeError("poll boom")))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB"})
            assert r.status == 500

    @pytest.mark.asyncio
    async def test_device_poll_timeout(self, tmp_path, monkeypatch):
        bot, _ = _make_bot(tmp_path)
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth",
                            AsyncMock(side_effect=TimeoutError()))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB"})
            assert r.status == 408


class TestAccountOps:
    @pytest.mark.asyncio
    async def test_refresh_bad_index_and_range_and_503(self, tmp_path):
        bot, _ = _make_bot(tmp_path, accounts=2)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/codex/account/xx/refresh")).status == 400
            assert (await c.post("/api/codex/account/9/refresh")).status == 400
        bot2, _ = _make_bot(tmp_path, configured=False)
        async with TestClient(TestServer(_app(bot2))) as c:
            assert (await c.post("/api/codex/account/0/refresh")).status == 503

    @pytest.mark.asyncio
    async def test_refresh_success(self, tmp_path, monkeypatch):
        bot, path = _make_bot(tmp_path, accounts=1)
        pool = bot.llm_gateway.codex_client.auth

        async def fake_refresh(creds):
            pool._accounts[0]._credentials = _creds(access="refreshed", email="r@x.co")
        monkeypatch.setattr(pool._accounts[0], "_refresh", fake_refresh)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/account/0/refresh")
            assert r.status == 200 and (await r.json())["status"] == "refreshed"

    @pytest.mark.asyncio
    async def test_activate(self, tmp_path):
        bot, _ = _make_bot(tmp_path, accounts=2)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/account/1/activate")
            assert r.status == 200 and (await r.json())["active_index"] == 1
            assert (await c.post("/api/codex/account/9/activate")).status == 400
            assert (await c.post("/api/codex/account/xx/activate")).status == 400

    @pytest.mark.asyncio
    async def test_reload(self, tmp_path):
        bot, _ = _make_bot(tmp_path)
        bot.llm_gateway.reload_codex = AsyncMock(return_value={"configured": True})
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/codex/reload")).status == 200
        bot.llm_gateway.reload_codex = AsyncMock(return_value={"configured": False})
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/codex/reload")).status == 503

    @pytest.mark.asyncio
    async def test_set_label(self, tmp_path):
        bot, path = _make_bot(tmp_path, accounts=2)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.put("/api/codex/account/0/label", json={"label": "primary"})
            assert r.status == 200
            assert json.loads(path.read_text())[0]["label"] == "primary"
            assert (await c.put("/api/codex/account/xx/label",
                                json={"label": "x"})).status == 400
            assert (await c.put("/api/codex/account/0/label", data="bad")).status == 400
            assert (await c.put("/api/codex/account/0/label",
                                json={"label": 5})).status == 400
            assert (await c.put("/api/codex/account/9/label",
                                json={"label": "x"})).status == 400

    @pytest.mark.asyncio
    async def test_set_label_no_file(self, tmp_path):
        bot, path = _make_bot(tmp_path, accounts=1)
        path.unlink()
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.put("/api/codex/account/0/label",
                                json={"label": "x"})).status == 404

    @pytest.mark.asyncio
    async def test_delete_account(self, tmp_path):
        bot, path = _make_bot(tmp_path, accounts=2)
        bot.llm_gateway.codex_client.auth.reload_async = AsyncMock(return_value=1)
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.delete("/api/codex/account/0")
            assert r.status == 200
            remaining = json.loads(path.read_text())
            assert len(remaining) == 1 and remaining[0]["account_id"] == "1"
            assert (await c.delete("/api/codex/account/xx")).status == 400
            assert (await c.delete("/api/codex/account/9")).status == 400

    @pytest.mark.asyncio
    async def test_delete_account_no_file(self, tmp_path):
        bot, path = _make_bot(tmp_path, accounts=1)
        path.unlink()
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.delete("/api/codex/account/0")).status == 404
