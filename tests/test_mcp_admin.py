"""P4 management-contract round-trips: durable persistence through the
shared writer, live reconciliation, secret patch ops, and the saved-vs-
connected honesty split — real manager, real fake server, real tmp config
file on disk."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

import src.config.persistence as persistence_mod
from src.config.schema import MCPConfig
from src.tools.mcp import MCPManager
from src.web.api.integrations import register_mcp_servers

FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")

SEED_CONFIG = """\
discord:
  token: test-token
mcp:
  enabled: true
  servers: {}
"""


@pytest.fixture
async def harness(tmp_path, monkeypatch):
    config_path = tmp_path / "config.yml"
    config_path.write_text(SEED_CONFIG, encoding="utf-8")
    monkeypatch.setattr(persistence_mod, "active_config_path", lambda: config_path)

    manager = MCPManager()
    await manager.load_desired_state(enabled=True, servers={})
    await manager.start()

    bot = SimpleNamespace(mcp_manager=manager, config=SimpleNamespace(mcp=MCPConfig(enabled=True)))
    routes = web.RouteTableDef()
    register_mcp_servers(routes, bot)
    app = web.Application()
    app.add_routes(routes)
    client = TestClient(TestServer(app))
    await client.start_server()
    try:
        yield client, bot, config_path
    finally:
        await client.close()
        await manager.shutdown()


def _disk(config_path: Path) -> dict:
    return yaml.safe_load(config_path.read_text(encoding="utf-8"))


def _server_body(**overrides) -> dict:
    body = {
        "name": "fake",
        "transport": "stdio",
        "command": sys.executable,
        "args": [FAKE, "legacy"],
        "timeout_seconds": 30,
    }
    body.update(overrides)
    return body


class TestAddPersistsAndConnects:
    async def test_add_round_trip(self, harness):
        client, bot, config_path = harness
        response = await client.post("/api/mcp/servers", json=_server_body())
        body = await response.json()
        assert response.status == 201, body
        assert body["saved"] is True and body["connected"] is True
        # Disk truth: the server landed in the yaml through the shared writer.
        disk = _disk(config_path)
        assert disk["mcp"]["servers"]["fake"]["command"] == sys.executable
        # Runtime truth: published and visible.
        assert bot.mcp_manager.has_tool("mcp_fake_echo")
        # Rebound live config agrees with disk.
        assert "fake" in bot.config.mcp.servers

    async def test_duplicate_add_409_and_disk_untouched(self, harness):
        client, bot, config_path = harness
        assert (await client.post("/api/mcp/servers", json=_server_body())).status == 201
        before = _disk(config_path)
        assert (await client.post("/api/mcp/servers", json=_server_body())).status == 409
        assert _disk(config_path) == before

    async def test_dead_server_saved_true_connected_false(self, harness):
        client, bot, config_path = harness
        response = await client.post(
            "/api/mcp/servers",
            json=_server_body(name="dead", command="/nonexistent/mcp-binary", args=[]),
        )
        body = await response.json()
        # Reachability is NOT a save precondition: durable config stands in
        # error state, retryable via reconnect — never rolled back.
        assert body["saved"] is True
        assert body["connected"] is False
        assert "dead" in _disk(config_path)["mcp"]["servers"]


class TestUpdateAndSecretPatches:
    async def test_put_applies_patch_ops_and_persists(self, harness):
        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body())
        response = await client.put(
            "/api/mcp/servers/fake",
            json={
                "tool_allowlist": ["echo"],
                "env_set": {"API_KEY": "opaque-secret", "REGION": "eu"},
            },
        )
        assert response.status == 201
        disk = _disk(config_path)["mcp"]["servers"]["fake"]
        assert disk["tool_allowlist"] == ["echo"]
        assert disk["env"]["API_KEY"] == "opaque-secret"
        # Runtime narrowed to the allowlist.
        assert bot.mcp_manager.has_tool("mcp_fake_echo")
        assert not bot.mcp_manager.has_tool("mcp_fake_fail")

        response = await client.put("/api/mcp/servers/fake", json={"env_remove": ["API_KEY"]})
        assert response.status == 201
        disk = _disk(config_path)["mcp"]["servers"]["fake"]
        assert "API_KEY" not in disk["env"]
        assert disk["env"]["REGION"] == "eu"

    async def test_secret_values_never_appear_in_reads(self, harness):
        client, bot, config_path = harness
        await client.post(
            "/api/mcp/servers",
            json=_server_body(env_set={"TOKEN": "super-opaque-credential"}),
        )
        for route in ("/api/mcp/status", "/api/mcp/servers"):
            text = await (await client.get(route)).text()
            assert "super-opaque-credential" not in text
            assert "TOKEN" in text  # key NAMES are visible

    async def test_mask_value_rejected_without_persisting(self, harness):
        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body())
        before = _disk(config_path)
        response = await client.put(
            "/api/mcp/servers/fake", json={"headers_set": {"Authorization": "•" * 8}}
        )
        assert response.status == 400
        assert _disk(config_path) == before


class TestRemoveAndGlobalSwitch:
    async def test_delete_persists_and_unpublishes(self, harness):
        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body())
        assert bot.mcp_manager.has_tool("mcp_fake_echo")
        response = await client.delete("/api/mcp/servers/fake")
        assert response.status == 200
        assert _disk(config_path)["mcp"]["servers"] == {}
        assert not bot.mcp_manager.has_tool("mcp_fake_echo")

    async def test_global_switch_persists_and_tears_down(self, harness):
        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body())
        response = await client.post("/api/mcp/enabled", json={"enabled": False})
        assert response.status == 200
        assert _disk(config_path)["mcp"]["enabled"] is False
        assert bot.mcp_manager.get_tool_definitions() == []
        assert bot.config.mcp.enabled is False

        response = await client.post("/api/mcp/enabled", json={"enabled": True})
        assert (await response.json())["enabled"] is True
        assert _disk(config_path)["mcp"]["enabled"] is True
        assert bot.mcp_manager.has_tool("mcp_fake_echo")


class TestOperationalRoutes:
    async def test_reconnect_and_refresh(self, harness):
        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body())
        assert (await client.post("/api/mcp/servers/fake/reconnect")).status == 201
        assert bot.mcp_manager.has_tool("mcp_fake_echo")
        assert (await client.post("/api/mcp/servers/fake/refresh-tools")).status == 201

    async def test_tools_route_reports_publication_truth(self, harness):
        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body(tool_allowlist=["echo"]))
        body = await (await client.get("/api/mcp/servers/fake/tools")).json()
        by_name = {t["original_name"]: t for t in body["tools"]}
        assert by_name["echo"]["published"] is True
        assert by_name["echo"]["published_name"] == "mcp_fake_echo"
        assert by_name["fail"]["published"] is False


class TestPersistFailureHonesty:
    async def test_unwritable_config_fails_loudly_without_runtime_change(
        self, harness, monkeypatch
    ):
        client, bot, config_path = harness

        async def broken(*args, **kwargs):
            return persistence_mod.ConfigPersistError("disk full"), False

        monkeypatch.setattr(persistence_mod, "persist_config_paths_locked", broken)
        before = _disk(config_path)
        response = await client.post("/api/mcp/servers", json=_server_body())
        assert response.status == 500
        # Nothing changed anywhere: no runtime adoption, no disk write, no
        # live-config rebind — a failed save is a failed save.
        assert not bot.mcp_manager.has_tool("mcp_fake_echo")
        assert bot.mcp_manager.get_status()["server_count"] == 0
        assert _disk(config_path) == before
        assert "fake" not in (bot.config.mcp.servers or {})


class TestErrorArms:
    async def test_invalid_json_rejected_on_all_mutation_routes(self, harness):
        client, bot, config_path = harness
        for method, route in (
            ("post", "/api/mcp/servers"),
            ("put", "/api/mcp/servers/fake"),
            ("post", "/api/mcp/enabled"),
        ):
            response = await getattr(client, method)(
                route, data="not json", headers={"Content-Type": "application/json"}
            )
            assert response.status == 400, route

    async def test_patch_op_type_violations_rejected(self, harness):
        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body())
        response = await client.put(
            "/api/mcp/servers/fake", json={"headers_set": ["not", "a", "dict"]}
        )
        assert response.status == 400
        response = await client.put(
            "/api/mcp/servers/fake", json={"env_remove": {"not": "a list"}}
        )
        assert response.status == 400

    async def test_add_adoption_failure_reports_saved_true_connected_false(
        self, harness, monkeypatch
    ):
        from src.tools.mcp import MCPConfigError

        client, bot, config_path = harness

        async def refuse(name, config):
            raise MCPConfigError("runtime refused adoption")

        monkeypatch.setattr(bot.mcp_manager, "add_server", refuse)
        response = await client.post("/api/mcp/servers", json=_server_body())
        body = await response.json()
        assert response.status == 500
        assert body["saved"] is True and body["connected"] is False
        # Durable truth stands on disk despite the runtime refusal.
        assert "fake" in _disk(config_path)["mcp"]["servers"]

    async def test_update_adoption_failure_reports_saved_true_connected_false(
        self, harness, monkeypatch
    ):
        from src.tools.mcp import MCPConfigError

        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body())

        async def refuse(name, config):
            raise MCPConfigError("runtime refused update")

        monkeypatch.setattr(bot.mcp_manager, "update_server", refuse)
        response = await client.put("/api/mcp/servers/fake", json={"timeout_seconds": 60})
        body = await response.json()
        assert response.status == 500
        assert body["saved"] is True and body["connected"] is False

    async def test_delete_config_only_server_succeeds(self, harness):
        # Config drift: the file knows a server the runtime never adopted.
        from src.config.schema import MCPServerConfig

        client, bot, config_path = harness
        bot.config.mcp.servers = {
            "ghostly": MCPServerConfig(transport="stdio", command="/bin/true")
        }
        response = await client.delete("/api/mcp/servers/ghostly")
        assert response.status == 200
        assert _disk(config_path)["mcp"]["servers"] == {}

    async def test_cancelled_persist_propagates_cancellation(self, harness, monkeypatch):
        import aiohttp

        client, bot, config_path = harness

        async def cancelled(*args, **kwargs):
            return None, True

        monkeypatch.setattr(persistence_mod, "persist_config_paths_locked", cancelled)
        try:
            response = await client.post("/api/mcp/servers", json=_server_body())
            # A cancelled handler surfaces as a 500-class server error.
            assert response.status >= 500
        except (aiohttp.ServerDisconnectedError, aiohttp.ClientOSError):
            pass  # the cancellation tore the connection down — equally honest
        assert not bot.mcp_manager.has_tool("mcp_fake_echo")
        assert "fake" not in _disk(config_path)["mcp"]["servers"]

    async def test_mutation_response_survives_row_vanishing_race(
        self, harness, monkeypatch
    ):
        client, bot, config_path = harness
        await client.post("/api/mcp/servers", json=_server_body())
        real_status = bot.mcp_manager.get_status
        monkeypatch.setattr(
            bot.mcp_manager,
            "get_status",
            lambda: {**real_status(), "servers": []},
        )
        response = await client.post("/api/mcp/servers/fake/reconnect")
        body = await response.json()
        assert response.status == 201
        assert body["state"] == "unknown"
