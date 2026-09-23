"""Per-entry auth faults remain visible and are never silently discarded."""

import json
from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.permissions.manager import PermissionManager
from src.permissions.token_manager import ApiTokenManager, _hash_token
from src.web.api.security import register_api_tokens, register_permissions_rbac


@pytest.mark.asyncio
async def test_unknown_permission_tier_keeps_effective_policy_and_survives_unrelated_mutations(
    tmp_path, caplog
):
    path = tmp_path / "permissions.json"
    path.write_text(json.dumps({"alice": "mystery", "bob": "guest"}))
    manager = PermissionManager({}, "admin", str(path))
    assert manager.get_tier("alice") == "admin"
    assert manager.get_tier("bob") == "guest"
    assert manager.invalid_overrides == {"alice": "mystery"}
    assert "unrecognized tier" in caplog.text
    await manager.async_set_tier("charlie", "user")
    assert json.loads(path.read_text()) == {"alice": "mystery", "bob": "guest", "charlie": "user"}
    assert await manager.async_delete_tier("bob") is True
    assert json.loads(path.read_text())["alice"] == "mystery"
    assert await manager.async_delete_tier("alice") is True  # explicit operator repair
    assert "alice" not in json.loads(path.read_text())


@pytest.mark.asyncio
async def test_invalid_token_entries_survive_create_update_regenerate_delete(tmp_path, caplog):
    path = tmp_path / "api_tokens.json"
    original = [
        {
            "user_id": "owner",
            "token_hash": _hash_token("owner-secret"),
            "token_prefix": "owner-se",
            "tier": "admin",
        },
        {
            "user_id": "broken",
            "token_hash": "SENSITIVE-HASH",
            "token_prefix": "SENSITIVE-PREFIX",
            "tier": "wizard",
            "other": {"a": [1, None]},
        },
        ["arbitrary", {"nested": "record"}],
    ]
    path.write_text(json.dumps(original))
    manager = ApiTokenManager(str(path))
    assert manager.resolve("owner-secret").user_id == "owner"
    assert manager.resolve("broken-secret") is None
    assert manager.invalid_entries() == [
        {"index": 1, "reason": "invalid tier", "user_id": "broken"},
        {"index": 2, "reason": "entry is not an object"},
    ]
    assert "SENSITIVE-HASH" not in caplog.text and "SENSITIVE-PREFIX" not in caplog.text
    created = await manager.create_token("new")
    assert manager.resolve(created.token).user_id == "new"
    await manager.update_token("new", label="updated")
    await manager.regenerate_token("new")
    assert await manager.delete_token("new") is True
    rows = json.loads(path.read_text())
    assert rows[1:3] == original[1:3]
    assert manager.resolve("owner-secret").user_id == "owner"
    assert manager.invalid_entries() == [
        {"index": 1, "reason": "invalid tier", "user_id": "broken"},
        {"index": 2, "reason": "entry is not an object"},
    ]


@pytest.mark.asyncio
async def test_auth_diagnostics_exposed_on_admin_routes_without_token_material(tmp_path):
    (tmp_path / "permissions.json").write_text('{"alice":"unknown"}')
    (tmp_path / "api_tokens.json").write_text(
        json.dumps(
            [
                {"user_id": "valid", "token_hash": _hash_token("valid-secret"), "tier": "admin"},
                {"user_id": "invalid", "token_hash": "SECRET-HASH", "tier": "wrong"},
            ]
        )
    )
    bot = SimpleNamespace(
        permissions=PermissionManager({}, "admin", str(tmp_path / "permissions.json")),
        api_token_manager=ApiTokenManager(str(tmp_path / "api_tokens.json")),
        host_access_manager=None,
        config=SimpleNamespace(web=SimpleNamespace(api_tokens=[])),
    )
    routes = web.RouteTableDef()
    register_permissions_rbac(routes, bot)
    register_api_tokens(routes, bot)

    @web.middleware
    async def identity(request, handler):
        request.__dict__["_api_identity"] = SimpleNamespace(tier="admin", user_id="operator")
        return await handler(request)

    app = web.Application(middlewares=[identity])
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        permissions = await (await client.get("/api/permissions/tiers")).json()
        assert permissions["invalid_overrides"] == {"alice": "unknown"}
        assert permissions["overrides"] == {}
        tokens = await (await client.get("/api/tokens")).json()
        assert tokens["invalid_entries"] == [
            {"index": 1, "reason": "invalid tier", "user_id": "invalid"}
        ]
        assert tokens["store_status"] == "valid"
        assert "SECRET-HASH" not in json.dumps(tokens)
