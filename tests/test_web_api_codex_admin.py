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
    async def test_status_includes_per_account_quota_and_check_failure(self, tmp_path, monkeypatch):
        from src.llm.account_key import opaque_account_key
        bot, _ = _make_bot(tmp_path, accounts=2)
        pool = bot.llm_gateway.codex_client.auth
        monkeypatch.setattr("src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "account-key")
        first_key = opaque_account_key("0")
        second_key = opaque_account_key("1")
        pool.quota.record_headers(first_key, {
            "x-codex-primary-used-percent": "59",
            "x-codex-primary-window-minutes": "300",
            "x-codex-primary-reset-after-seconds": "3600",
            "x-codex-rate-limit-reached-type": "primary",
            "x-codex-secondary-used-percent": "12",
            "x-codex-secondary-window-minutes": "10080",
        })
        pool.quota.record_headers(second_key, {
            "x-codex-secondary-used-percent": "73",
            "x-codex-secondary-window-minutes": "10080",
        })
        monkeypatch.setattr(
            pool,
            "quota_check_failure",
            lambda index: "timeout" if index == 1 else None,
            raising=False,
        )

        async with TestClient(TestServer(_app(bot))) as c:
            accounts = (await (await c.get("/api/codex/status")).json())["accounts"]
        assert accounts[0]["quota"]["primary"] == {
            "used_percent": 59.0,
            "window_minutes": 300,
            "resets_at": pytest.approx(accounts[0]["quota"]["observed_at"] + 3600, abs=1),
        }
        assert accounts[0]["quota"]["secondary"]["used_percent"] == 12.0
        assert accounts[0]["quota"]["observed_at"] > 0
        assert accounts[0]["quota"]["limit_reached_type"] == "primary"
        assert accounts[0]["limit_reached"] is False
        assert accounts[0]["quota_check_failed"] is None
        assert accounts[1]["quota"]["primary"] is None
        assert accounts[1]["quota"]["secondary"]["used_percent"] == 73.0
        assert accounts[1]["quota_check_failed"] == "timeout"
        assert accounts[1]["limit_reached"] is False

    @pytest.mark.asyncio
    async def test_status_empty_quota_before_observation(self, tmp_path):
        bot, _ = _make_bot(tmp_path, accounts=1)
        async with TestClient(TestServer(_app(bot))) as c:
            account = (await (await c.get("/api/codex/status")).json())["accounts"][0]
        assert account["quota"] is None
        assert account["quota_check_failed"] is None

    @pytest.mark.asyncio
    async def test_limit_reached_from_full_usage_without_header(self, tmp_path, monkeypatch):
        from src.llm.account_key import opaque_account_key

        bot, _ = _make_bot(tmp_path, accounts=1)
        pool = bot.llm_gateway.codex_client.auth
        monkeypatch.setattr("src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "account-key")
        pool.quota.record_headers(opaque_account_key("0"), {
            "x-codex-primary-used-percent": "100.1",
            "x-codex-primary-window-minutes": "300",
        })
        async with TestClient(TestServer(_app(bot))) as c:
            account = (await (await c.get("/api/codex/status")).json())["accounts"][0]
        assert account["quota"]["limit_reached_type"] is None
        assert account["limit_reached"] is True

    @pytest.mark.asyncio
    async def test_status_limit_signal_without_percentages(self, tmp_path, monkeypatch):
        from src.llm.account_key import opaque_account_key

        bot, _ = _make_bot(tmp_path, accounts=1)
        pool = bot.llm_gateway.codex_client.auth
        monkeypatch.setattr("src.llm.account_key.DEFAULT_KEY_PATH", tmp_path / "account-key")
        pool.quota.record_headers(opaque_account_key("0"), {
            "x-codex-rate-limit-reached-type": "primary",
        })
        async with TestClient(TestServer(_app(bot))) as c:
            account = (await (await c.get("/api/codex/status")).json())["accounts"][0]
        assert account["quota"]["limit_reached_type"] == "primary"
        assert account["limit_reached"] is True

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


def _bot_raw(tmp_path, content):
    """Bot with an arbitrary creds-file content and no pool (codex_client=None),
    isolating the file-manipulation branches of set_label / delete_account."""
    creds_path = tmp_path / "codex.json"
    creds_path.write_text(content)
    bot = MagicMock()
    bot.config.openai_codex.credentials_path = str(creds_path)
    bot.llm_gateway.codex_client = None
    return bot, creds_path


class TestAccountOpsEdges:
    @pytest.mark.asyncio
    async def test_set_label_dict_file(self, tmp_path):
        bot, path = _bot_raw(tmp_path, json.dumps(_creds(email="d@x.co")))   # single dict
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.put("/api/codex/account/0/label", json={"label": "solo"})
            assert r.status == 200 and json.loads(path.read_text())["label"] == "solo"
            assert (await c.put("/api/codex/account/1/label",
                                json={"label": "x"})).status == 400          # invalid dict index

    @pytest.mark.asyncio
    async def test_set_label_unreadable_file(self, tmp_path):
        bot, _ = _bot_raw(tmp_path, "{ not valid json")
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.put("/api/codex/account/0/label",
                                json={"label": "x"})).status == 500          # read fails

    @pytest.mark.asyncio
    async def test_delete_dict_file(self, tmp_path):
        bot, path = _bot_raw(tmp_path, json.dumps(_creds(email="d@x.co")))
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.delete("/api/codex/account/0")).status == 200     # dict-index-0
            assert json.loads(path.read_text()) == []                        # cleared to []
            path.write_text(json.dumps(_creds()))                            # reset to a dict
            assert (await c.delete("/api/codex/account/1")).status == 400     # invalid dict index

    @pytest.mark.asyncio
    async def test_delete_unreadable_file(self, tmp_path):
        bot, _ = _bot_raw(tmp_path, "{ broken")
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.delete("/api/codex/account/0")).status == 500     # read fails

    @pytest.mark.asyncio
    async def test_refresh_raises_500(self, tmp_path, monkeypatch):
        bot, _ = _make_bot(tmp_path, accounts=1)
        monkeypatch.setattr(ca.CodexAuth, "_refresh",
                            AsyncMock(side_effect=RuntimeError("boom")))
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/codex/account/0/refresh")).status == 500

    @pytest.mark.asyncio
    async def test_activate_unconfigured_503(self, tmp_path):
        bot, _ = _make_bot(tmp_path, configured=False)
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/codex/account/0/activate")).status == 503


class TestDevicePollMerge:
    @pytest.mark.asyncio
    async def test_out_of_range_save_index_appends(self, tmp_path, monkeypatch):
        bot, path = _make_bot(tmp_path, accounts=1)
        bot.llm_gateway.reload_codex = AsyncMock(return_value={"configured": True})
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth",
                            AsyncMock(return_value=_creds(access="oor", account_id="9")))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB", "save_index": 5})
            assert r.status == 200
        data = json.loads(path.read_text())
        assert len(data) == 2 and data[1]["access_token"] == "oor"       # appended, not replaced

    @pytest.mark.asyncio
    async def test_dict_file_with_save_index_promotes(self, tmp_path, monkeypatch):
        bot, path = _bot_raw(tmp_path, json.dumps(_creds(email="orig@x.co")))  # dict file
        bot.llm_gateway.reload_codex = AsyncMock(return_value={"configured": True})
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth",
                            AsyncMock(return_value=_creds(access="promoted")))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB", "save_index": 0})
            assert r.status == 200
        data = json.loads(path.read_text())
        assert isinstance(data, list) and len(data) == 2                 # [orig, new]

    @pytest.mark.asyncio
    async def test_no_file_writes_fresh(self, tmp_path, monkeypatch):
        bot, path = _bot_raw(tmp_path, "")
        path.unlink()                                                    # no creds file
        bot.llm_gateway.reload_codex = AsyncMock(return_value={"configured": True})
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth",
                            AsyncMock(return_value=_creds(access="fresh")))
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/codex/device-poll",
                             json={"device_auth_id": "d", "user_code": "AB"})
            assert r.status == 200
        assert json.loads(path.read_text())[0]["access_token"] == "fresh"
