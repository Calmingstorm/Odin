"""Cold-start authorization regressions with synthetic accounts only."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp import web

from scripts.codex_login import _save_creds
from src.llm import codex_auth as ca
from src.web.api.codex_admin import register_codex_oauth


@pytest.mark.parametrize("publication", ["manual", "device_merge", "device_index"])
@pytest.mark.parametrize("new_expiry", [5000, 9999999999])
async def test_cold_restart_keeps_explicit_reauth_over_older_shadow(
    tmp_path, monkeypatch, publication, new_expiry,
):
    path = tmp_path / "canonical.json"
    old = {"account_id": "fixture-A", "access_token": "fixture-old",
           "refresh_token": "fixture-old-refresh", "expires_at": 9999999999}
    new = {**old, "access_token": "fixture-new", "refresh_token": "fixture-new-refresh",
           "expires_at": new_expiry}
    path.write_text(json.dumps([old]))
    ca.CodexAuthPool(str(path))  # Leave the prior login's shadow on disk.
    if publication == "manual":
        _save_creds(new, path)
    else:
        gateway = SimpleNamespace(reload_codex=AsyncMock())
        bot = SimpleNamespace(llm_gateway=gateway, config=SimpleNamespace(
            openai_codex=SimpleNamespace(credentials_path=str(path))))
        routes = web.RouteTableDef()
        register_codex_oauth(routes, bot)
        handler = next(route.handler for route in routes if route.path == "/api/codex/device-poll")
        body = {"device_auth_id": "fixture", "user_code": "fixture"}
        if publication == "device_index":
            body["save_index"] = 0
        monkeypatch.setattr(ca.CodexAuth, "poll_device_auth", AsyncMock(return_value=new))
        response = await handler(SimpleNamespace(json=AsyncMock(return_value=body)))
        assert response.status == 200
    assert json.loads(path.read_text())[0]["access_token"] == new["access_token"]
    restarted = ca.CodexAuthPool(str(path))
    assert restarted._accounts[0]._load()["access_token"] == new["access_token"]
    assert json.loads(path.read_text())[0]["refresh_token"] == new["refresh_token"]


async def test_authorization_revision_survives_refresh_and_shadow_recovery(tmp_path, monkeypatch):
    path = tmp_path / "canonical.json"
    initial = {"account_id": "fixture-A", "access_token": "fixture-old",
               "refresh_token": "fixture-old-refresh", "expires_at": 5000}
    _save_creds(initial, path)
    pool = ca.CodexAuthPool(str(path))
    before = path.read_text()
    revision = json.loads(before)[0]["_authorization_revision"]

    class Response:
        status = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def read(self):
            return json.dumps({"access_token": "fixture-rotated",
                               "refresh_token": "fixture-next", "expires_in": 3600}).encode()

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        def post(self, *args, **kwargs):
            return Response()

    monkeypatch.setattr(ca.aiohttp, "ClientSession", lambda **kwargs: Session())
    assert await pool.force_refresh(0, "fixture-old")
    assert json.loads(path.read_text())[0]["_authorization_revision"] == revision
    # Simulate a canonical propagation failure after a successful shadow write.
    path.write_text(before)
    recovered = ca.CodexAuthPool(str(path))
    assert recovered._accounts[0]._load()["refresh_token"] == "fixture-next"
    assert json.loads(path.read_text())[0]["_authorization_revision"] == revision
