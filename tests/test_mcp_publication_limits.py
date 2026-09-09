"""Checkpoint for configurable MCP caps: schema, live wiring, publication and HTTP.

The HTTP fixture uses HealthServer's actual authentication/authorization stack,
the real management handlers, the shared disk writer and a real MCP manager.
Only remote discovery is synthetic in the high-cardinality publication cases.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import yaml
from aiohttp.test_utils import TestClient, TestServer
from pydantic import ValidationError

import src.config.persistence as persistence
from src.config.apply_registry import build_field_record
from src.config.schema import ApiTokenIdentity, Config, MCPConfig, WebConfig
from src.health.server import HealthServer
from src.tools.mcp.client import DiscoveryResult, ToolRecord
from src.tools.mcp.manager import MCPManager
from src.web.api.integrations import register_mcp_servers

PER_SERVER = "max_published_tools_per_server"
GLOBAL = "max_published_tools_global"
FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")


def server_config(**extra):
    return {
        "transport": "stdio", "command": sys.executable,
        "args": [FAKE, "legacy"], "timeout_seconds": 30, **extra,
    }


@pytest.mark.parametrize("field,maximum", [(PER_SERVER, 128), (GLOBAL, 256)])
def test_schema_defaults_bounds_and_serialization(field, maximum):
    assert getattr(MCPConfig(), field) == 40
    assert getattr(Config(discord={"token": "test"}).mcp, field) == 40
    for value in (1, maximum):
        config = MCPConfig(**{field: value})
        assert config.model_dump()[field] == value
        assert getattr(MCPConfig.model_validate_json(config.model_dump_json()), field) == value
    for value in (0, -1, maximum + 1, True, False, 2.0, "2", 1.5, None):
        with pytest.raises(ValidationError):
            MCPConfig(**{field: value})


@pytest.mark.parametrize("field,maximum", [(PER_SERVER, 128), (GLOBAL, 256)])
def test_apply_registry_classifies_live_limits_not_server_container(field, maximum):
    record = build_field_record(f"mcp.{field}", maximum, boot_value=40, has_boot=True)
    assert record["owner"] == "mcp"
    assert record["apply_mode"] == "live_read"
    assert record["apply_handler"] == "POST /api/mcp/limits"
    assert record["type"] == "integer"
    assert record["constraints"] == {"minimum": 1, "maximum": maximum}
    assert record["default"] == 40
    assert record["unit"] == "tools"
    assert record["structured_container"] is False
    assert record["structured_container_child"] is False
    assert record["pending_restart"] is False
    assert "saving does not evict existing tools" in record["description"]


def test_production_manager_providers_follow_whole_config_rebind(tmp_path, monkeypatch):
    """Mirror agent-admission liveness tests, including detached boot config."""
    from tests.fakes import make_bot

    monkeypatch.chdir(tmp_path)
    bot = make_bot()
    manager = bot.mcp_manager
    boot = bot.config
    assert manager.get_publication_limits() == {PER_SERVER: 40, GLOBAL: 40}
    updated = boot.model_copy(deep=True)
    updated.mcp.max_published_tools_per_server = 91
    updated.mcp.max_published_tools_global = 203
    bot.config = updated
    assert manager.get_publication_limits() == {PER_SERVER: 91, GLOBAL: 203}
    assert manager.get_status()[PER_SERVER] == 91
    assert manager.get_status()[GLOBAL] == 203
    assert boot.mcp.max_published_tools_per_server == 40
    assert boot.mcp.max_published_tools_global == 40


async def test_production_wiring_rebind_changes_actual_publication(tmp_path, monkeypatch):
    from tests.fakes import make_bot

    monkeypatch.chdir(tmp_path)
    bot = make_bot()
    manager = bot.mcp_manager
    await manager.load_desired_state(enabled=True, servers={"fake": server_config()})
    await manager.start()
    try:
        original = manager.get_tool_definitions()
        assert len(original) > 1
        for field in (PER_SERVER, GLOBAL):
            updated = bot.config.model_copy(deep=True)
            setattr(updated.mcp, field, 1)
            bot.config = updated
            assert manager.get_tool_definitions() == original
            await manager.refresh_server_tools("fake")
            assert manager.get_tool_definitions() == []
            assert manager.get_status()["servers"][0]["state"] == "blocked"
            updated = bot.config.model_copy(deep=True)
            setattr(updated.mcp, field, 40)
            bot.config = updated
            await manager.refresh_server_tools("fake")
            assert manager.get_tool_definitions() == original
    finally:
        await manager.shutdown()


@pytest.fixture
async def live_manager():
    limits = {PER_SERVER: 128, GLOBAL: 256}
    changed = []
    manager = MCPManager(
        max_published_tools_per_server_provider=lambda: limits[PER_SERVER],
        max_published_tools_global_provider=lambda: limits[GLOBAL],
        on_catalog_changed=lambda: changed.append(True),
    )
    await manager.load_desired_state(
        enabled=True, servers={name: server_config() for name in ("a", "b")}
    )
    await manager.start()
    try:
        yield manager, limits, changed
    finally:
        await manager.shutdown()


async def publish(manager, name, count, *, excluded=0):
    runtime = manager._servers[name]
    records = [ToolRecord(name=f"t{i}", description="test", input_schema={}) for i in range(count)]
    records += [
        ToolRecord(name=f"excluded{i}", description="test", input_schema={}, excluded=True)
        for i in range(excluded)
    ]
    assert await manager._publish(
        name, runtime.generation, runtime.connection, DiscoveryResult(tools=records)
    )
    return runtime


@pytest.mark.parametrize("limit", [1, 40, 128])
async def test_per_server_boundary_is_all_or_nothing_and_live(live_manager, limit):
    manager, limits, changed = live_manager
    limits[PER_SERVER] = limit
    runtime = await publish(manager, "a", limit, excluded=3)
    connection, generation = runtime.connection, runtime.generation
    assert runtime.state == "connected"
    assert len(runtime.published) == limit
    changed.clear()
    await publish(manager, "a", limit + 1)
    assert runtime.state == "blocked"
    assert not runtime.published
    assert f"limit of {limit}" in runtime.blocked_reason
    assert len(runtime.discovered) == limit + 1
    assert not manager.has_tool("mcp_a_t0")
    assert changed
    # A block is not a transport failure and must not lose diagnostic discovery.
    assert runtime.connection is connection and connection.connected
    assert runtime.generation == generation
    runtime.config["tool_allowlist"] = ["t0"]
    await publish(manager, "a", limit + 1)
    assert set(runtime.published) == {"mcp_a_t0"}
    assert runtime.blocked_reason == runtime.last_error == ""


async def test_global_boundary_256_republish_excludes_own_snapshot(live_manager):
    manager, limits, _ = live_manager
    await publish(manager, "a", 128)
    b = await publish(manager, "b", 128)
    assert manager.get_status()["published_tool_count"] == 256
    await publish(manager, "b", 128)
    assert b.state == "connected", "refresh must not double-count its previous snapshot"
    limits[GLOBAL] = 255
    # Saving a lower cap does not evict. The next publication enforces it.
    assert manager.get_status()["published_tool_count"] == 256
    await publish(manager, "b", 128)
    assert b.state == "blocked" and not b.published
    assert "global MCP limit of 255" in b.blocked_reason
    assert "128 already published" in b.blocked_reason
    assert manager.get_status()["published_tool_count"] == 128
    assert manager.has_tool("mcp_a_t0")
    limits[GLOBAL] = 256
    await publish(manager, "b", 128)
    assert manager.get_status()["published_tool_count"] == 256


async def test_blocked_and_disabled_servers_do_not_consume_global_budget(live_manager):
    manager, limits, _ = live_manager
    limits[PER_SERVER] = limits[GLOBAL] = 1
    await publish(manager, "b", 2)
    a = await publish(manager, "a", 1)
    assert a.state == "connected"
    await manager.update_server("a", server_config(enabled=False))
    b = await publish(manager, "b", 1)
    assert b.state == "connected"
    assert manager.get_status()["published_tool_count"] == 1


@pytest.fixture
async def limits_api(tmp_path, monkeypatch):
    config_path = tmp_path / "config.yml"
    seed = {
        "discord": {"token": "test"}, "timezone": "UTC",
        "mcp": {"enabled": True, PER_SERVER: 40, GLOBAL: 40, "servers": {}},
    }
    config_path.write_text(yaml.safe_dump(seed), encoding="utf-8")
    monkeypatch.setattr(persistence, "active_config_path", lambda: config_path)
    bot = SimpleNamespace(config=Config(**seed))
    manager = MCPManager(
        max_published_tools_per_server_provider=lambda: getattr(bot.config.mcp, PER_SERVER),
        max_published_tools_global_provider=lambda: getattr(bot.config.mcp, GLOBAL),
    )
    bot.mcp_manager = manager
    await manager.load_desired_state(enabled=True, servers={})
    await manager.start()
    web_config = WebConfig(enabled=True, api_tokens=[
        ApiTokenIdentity(token=f"checkpoint-{tier}", user_id=tier, tier=tier)
        for tier in ("admin", "user", "guest")
    ])
    # Actual production middleware, not a stubbed _require_admin or identity.
    server = HealthServer(port=0, web_config=web_config)
    from aiohttp import web

    routes = web.RouteTableDef()
    register_mcp_servers(routes, bot)
    server._app.add_routes(routes)
    async with TestClient(TestServer(server._app)) as client:
        try:
            yield client, bot, config_path
        finally:
            await manager.shutdown()


def auth(tier="admin"):
    return {"Authorization": f"Bearer checkpoint-{tier}"}


def limits_handler(client):
    """Return the registered production limits handler, without HTTP transport races."""
    return next(
        route.handler
        for route in client.server.app.router.routes()
        if route.method == "POST"
        and getattr(route.resource, "canonical", None) == "/api/mcp/limits"
    )


@pytest.mark.parametrize("enabled", [False, True])
async def test_status_always_reports_defaults_even_disabled(limits_api, enabled):
    client, bot, _ = limits_api
    await bot.mcp_manager.set_global_enabled(enabled)
    response = await client.get("/api/mcp/status", headers=auth())
    assert response.status == 200
    body = await response.json()
    assert body[PER_SERVER] == body[GLOBAL] == 40
    assert body["enabled"] is enabled


@pytest.mark.parametrize("payload", [{PER_SERVER: 128}, {GLOBAL: 256}, {PER_SERVER: 1, GLOBAL: 1}])
async def test_save_success_partial_preserves_disk_and_runtime(limits_api, payload):
    client, bot, path = limits_api
    response = await client.post("/api/mcp/limits", json=payload, headers=auth())
    assert response.status == 200
    body = await response.json()
    assert body["saved"] is True
    expected = {PER_SERVER: 40, GLOBAL: 40} | payload
    assert {key: body[key] for key in expected} == expected
    assert bot.mcp_manager.get_publication_limits() == expected
    disk = yaml.safe_load(path.read_text())
    assert {key: disk["mcp"][key] for key in expected} == expected
    assert disk["timezone"] == "UTC"
    assert disk["mcp"]["servers"] == {}
    assert disk["mcp"]["enabled"] is True


@pytest.mark.parametrize("payload", [
    {}, [], None, "40", {"enabled": False}, {PER_SERVER: 3, "surprise": 1},
    *({field: value} for field, maximum in ((PER_SERVER, 128), (GLOBAL, 256))
      for value in (0, -1, maximum + 1, True, False, "12", 1.5, 2.0, None)),
    {PER_SERVER: 12, GLOBAL: 257},
])
async def test_validation_rejects_entire_patch_without_mutation(limits_api, payload):
    import json

    client, bot, path = limits_api
    before = path.read_bytes()
    response = await client.post(
        "/api/mcp/limits", data=json.dumps(payload),
        headers={**auth(), "Content-Type": "application/json"},
    )
    assert response.status == 400, await response.text()
    assert "error" in await response.json()
    assert path.read_bytes() == before
    assert bot.mcp_manager.get_publication_limits() == {PER_SERVER: 40, GLOBAL: 40}


async def test_malformed_json_rejected(limits_api):
    client, _, path = limits_api
    before = path.read_bytes()
    response = await client.post("/api/mcp/limits", data="{", headers=auth())
    assert response.status == 400
    assert path.read_bytes() == before


@pytest.mark.parametrize(
    "tier,expected", [(None, 401), ("invalid", 401), ("guest", 403), ("user", 403)],
)
@pytest.mark.parametrize("method,route", [("GET", "/api/mcp/status"), ("POST", "/api/mcp/limits")])
async def test_actual_route_auth_rejects_non_admin(limits_api, tier, expected, method, route):
    client, bot, path = limits_api
    before = path.read_bytes()
    response = await client.request(
        method, route, json={PER_SERVER: 12}, headers=auth(tier) if tier else {},
    )
    assert response.status == expected, await response.text()
    assert path.read_bytes() == before
    assert bot.mcp_manager.get_publication_limits() == {PER_SERVER: 40, GLOBAL: 40}


async def test_transaction_failure_keeps_config_disk_and_publication(limits_api, monkeypatch):
    client, bot, path = limits_api
    await bot.mcp_manager.add_server("fake", server_config())
    definitions = bot.mcp_manager.get_tool_definitions()
    assert definitions
    before = path.read_bytes()
    config = bot.config
    writer = AsyncMock(return_value=(persistence.ConfigPersistError("disk full"), False))
    monkeypatch.setattr(persistence, "persist_config_paths_locked", writer)
    response = await client.post(
        "/api/mcp/limits", json={PER_SERVER: 1, GLOBAL: 2}, headers=auth(),
    )
    assert response.status == 500
    writer.assert_awaited_once()
    assert path.read_bytes() == before
    assert bot.config is config
    assert bot.mcp_manager.get_publication_limits() == {PER_SERVER: 40, GLOBAL: 40}
    assert bot.mcp_manager.get_tool_definitions() == definitions


async def test_save_does_not_reconnect_then_refresh_uses_live_caps(limits_api):
    client, bot, _ = limits_api
    response = await client.post(
        "/api/mcp/servers", json={"name": "fake", **server_config()}, headers=auth(),
    )
    assert response.status == 201
    manager = bot.mcp_manager
    runtime = manager._servers["fake"]
    connection, generation = runtime.connection, runtime.generation
    original = manager.get_tool_definitions()
    assert len(original) > 1
    for limit, state in [(1, "blocked"), (40, "connected")]:
        response = await client.post("/api/mcp/limits", json={PER_SERVER: limit}, headers=auth())
        assert response.status == 200
        assert runtime.state != state, "save alone must not republish"
        response = await client.post("/api/mcp/servers/fake/refresh-tools", headers=auth())
        assert response.status == 201
        assert runtime.state == state
        assert runtime.connection is connection and connection.connected
        assert runtime.generation == generation
        assert manager.get_tool_definitions() == ([] if limit == 1 else original)


async def test_concurrent_partial_saves_merge_transaction_current_config(limits_api):
    client, bot, path = limits_api
    responses = await asyncio.gather(*(
        client.post("/api/mcp/limits", json=payload, headers=auth())
        for payload in ({PER_SERVER: 72}, {GLOBAL: 144})
    ))
    assert [response.status for response in responses] == [200, 200]
    assert bot.mcp_manager.get_publication_limits() == {PER_SERVER: 72, GLOBAL: 144}
    disk = yaml.safe_load(path.read_text())["mcp"]
    assert disk[PER_SERVER] == 72 and disk[GLOBAL] == 144


async def test_save_preserves_raw_placeholders_and_unrelated_runtime(limits_api):
    client, bot, path = limits_api
    disk = yaml.safe_load(path.read_text())
    disk["mcp"]["servers"] = {
        "off": server_config(enabled=False, env={"API_KEY": "${CHECKPOINT_MCP_KEY}"}),
    }
    path.write_text(yaml.safe_dump(disk), encoding="utf-8")
    bot.config.mcp.servers = {
        "off": server_config(enabled=False, env={"API_KEY": "resolved-checkpoint-value"}),
    }
    await bot.mcp_manager.load_desired_state(enabled=True, servers=bot.config.mcp.servers)
    runtime = bot.mcp_manager._servers["off"]
    response = await client.post("/api/mcp/limits", json={GLOBAL: 100}, headers=auth())
    assert response.status == 200
    assert "resolved-checkpoint-value" not in await response.text()
    after = yaml.safe_load(path.read_text())
    assert after["mcp"]["servers"] == disk["mcp"]["servers"]
    assert bot.config.mcp.servers["off"]["env"]["API_KEY"] == "resolved-checkpoint-value"
    assert bot.mcp_manager._servers["off"] is runtime


async def test_save_adopts_into_rebound_root_after_writer(limits_api, monkeypatch):
    client, bot, path = limits_api
    original_writer = persistence.persist_config_paths_locked
    old = bot.config
    replacement = old.model_copy(deep=True)
    replacement.timezone = "Europe/London"

    async def writer(changes):
        result = await original_writer(changes)
        bot.config = replacement
        return result

    monkeypatch.setattr(persistence, "persist_config_paths_locked", writer)
    response = await client.post("/api/mcp/limits", json={PER_SERVER: 77}, headers=auth())
    assert response.status == 200
    assert bot.config is replacement
    assert bot.config.timezone == "Europe/London"
    assert getattr(old.mcp, PER_SERVER) == 40
    assert bot.mcp_manager.get_publication_limits() == {PER_SERVER: 77, GLOBAL: 40}
    assert yaml.safe_load(path.read_text())["mcp"][PER_SERVER] == 77


@pytest.mark.parametrize("cancellation", ["writer", "request"])
async def test_limits_handler_cancellation_after_durable_commit_adopts_once(
    limits_api, monkeypatch, cancellation
):
    """A committed limits change survives either cancellation signal path.

    ``writer`` exercises the route's explicit ``writer_cancelled`` raise;
    ``request`` cancels the actual handler while its committed child task is
    still draining. Both must expose cancellation only after the one durable
    write and live adoption have completed.
    """
    client, bot, path = limits_api
    original_writer = persistence.persist_config_paths_locked
    persisted = asyncio.Event()
    release = asyncio.Event()
    calls = 0
    payload = {PER_SERVER: 71, GLOBAL: 143}

    async def committed_writer(changes):
        nonlocal calls
        calls += 1
        error, _ = await original_writer(changes)
        persisted.set()
        if cancellation == "request":
            await release.wait()
        return error, cancellation == "writer"

    monkeypatch.setattr(persistence, "persist_config_paths_locked", committed_writer)
    request = SimpleNamespace(json=AsyncMock(return_value=payload))
    task = asyncio.create_task(limits_handler(client)(request))
    await asyncio.wait_for(persisted.wait(), timeout=1)
    if cancellation == "request":
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done(), "post-commit cancellation must drain the handler"
        release.set()
    with pytest.raises(asyncio.CancelledError):
        await task

    # Disk and the live provider agree despite no successful response.
    assert calls == 1
    assert bot.mcp_manager.get_publication_limits() == payload
    assert {field: getattr(bot.config.mcp, field) for field in payload} == payload
    disk = yaml.safe_load(path.read_text())["mcp"]
    assert {field: disk[field] for field in payload} == payload


async def test_unchanged_save_is_idempotent_and_writes_no_paths(limits_api, monkeypatch):
    client, _, path = limits_api
    before = path.read_bytes()
    writer = AsyncMock(wraps=persistence.persist_config_paths_locked)
    monkeypatch.setattr(persistence, "persist_config_paths_locked", writer)
    response = await client.post(
        "/api/mcp/limits", json={PER_SERVER: 40, GLOBAL: 40}, headers=auth(),
    )
    assert response.status == 200
    assert (await response.json())["saved"] is True
    writer.assert_awaited_once_with([])
    assert path.read_bytes() == before
