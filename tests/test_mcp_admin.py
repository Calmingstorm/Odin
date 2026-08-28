"""P4 management-contract round-trips: durable persistence through the
shared writer, live reconciliation, secret patch ops, and the saved-vs-
connected honesty split — real manager, real fake server, real tmp config
file on disk."""

from __future__ import annotations

import asyncio
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
from src.web.api.integrations import _drain_mcp_management, register_mcp_servers

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


class TestPrePersistValidation:
    @pytest.mark.parametrize(
        "body",
        [
            _server_body(name="bad name"),
            _server_body(name="s" * 129),
            {"name": "missing_command", "transport": "stdio"},
            {"name": "bad_http", "transport": "http", "url": "ftp://example.test"},
            _server_body(name="bad_header", headers_set={"bad\nkey": "value"}),
            _server_body(name="bad_env", env_set={"bad\nkey": "value"}),
            _server_body(name="bad_allowlist", tool_allowlist=[1]),
            _server_body(name="bad_timeout", timeout_seconds=0),
            _server_body(name="bad_cwd", cwd="relative/path"),
        ],
    )
    async def test_every_invalid_shape_leaves_all_truths_untouched(self, harness, body):
        client, bot, config_path = harness
        before_bytes = config_path.read_bytes()
        response = await client.post("/api/mcp/servers", json=body)
        assert response.status == 400, await response.text()
        assert config_path.read_bytes() == before_bytes
        assert bot.config.mcp.servers == {}
        assert bot.mcp_manager.desired_servers() == {}


class TestLeafPersistence:
    async def test_unrelated_round_trips_preserve_header_and_env_placeholders(self, harness):
        client, bot, config_path = harness
        header_secret = "opaque-header-value-not-pattern-shaped"
        env_secret = "opaque-env-value-not-pattern-shaped"
        response = await client.post(
            "/api/mcp/servers",
            json=_server_body(
                headers_set={"Authorization": header_secret},
                env_set={"API_TOKEN": env_secret},
            ),
        )
        assert response.status == 201, await response.text()

        # Simulate the real startup shape: disk retains placeholders while the
        # live config/manager hold their resolved values.
        text = config_path.read_text(encoding="utf-8")
        text = text.replace(header_secret, "${MCP_HEADER_AUTH}")
        text = text.replace(env_secret, "${MCP_ENV_TOKEN}")
        config_path.write_text(text, encoding="utf-8")

        operations = [
            ("post", "/api/mcp/servers", _server_body(name="other")),
            ("put", "/api/mcp/servers/fake", {"timeout_seconds": 31}),
            ("delete", "/api/mcp/servers/other", None),
            ("post", "/api/mcp/enabled", {"enabled": False}),
            ("post", "/api/mcp/enabled", {"enabled": True}),
        ]
        for method, route, body in operations:
            kwargs = {"json": body} if body is not None else {}
            response = await getattr(client, method)(route, **kwargs)
            assert response.status < 300, (route, await response.text())
            raw = config_path.read_text(encoding="utf-8")
            assert "${MCP_HEADER_AUTH}" in raw
            assert "${MCP_ENV_TOKEN}" in raw
            assert header_secret not in raw
            assert env_secret not in raw

    async def test_leaf_deletes_do_not_replace_the_server_map(self, harness):
        client, bot, config_path = harness
        await client.post(
            "/api/mcp/servers",
            json=_server_body(
                env_set={"DELETE_ME": "gone", "KEEP_ME": "stay"},
            ),
        )
        response = await client.put("/api/mcp/servers/fake", json={"env_remove": ["DELETE_ME"]})
        assert response.status == 201, await response.text()
        disk = _disk(config_path)["mcp"]["servers"]["fake"]
        assert disk["env"] == {"KEEP_ME": "stay"}


class TestOperatorTextScrubbing:
    async def test_status_and_list_scrub_exact_configured_values(self, harness):
        client, bot, config_path = harness
        opaque = "violet-bridge-seven-copper"
        response = await client.post(
            "/api/mcp/servers",
            json=_server_body(
                args=[FAKE, "stderr-secret"],
                env_set={"API_TOKEN": opaque},
            ),
        )
        assert response.status == 201, await response.text()

        # stderr is drained asynchronously; wait for the fake's startup line.
        for _ in range(100):
            if bot.mcp_manager.get_status()["servers"][0]["stderr_tail"]:
                break
            await asyncio.sleep(0.01)

        for route in ("/api/mcp/status", "/api/mcp/servers"):
            text = await (await client.get(route)).text()
            assert opaque not in text
            assert "[REDACTED]" in text
            assert len(text) < 20_000

    async def test_connect_failure_reason_is_scrubbed_before_status_and_log(self, harness, caplog):
        client, bot, config_path = harness
        opaque = "marble-signal-six-cedar"
        manager = bot.mcp_manager
        await manager.load_desired_state(
            enabled=True,
            servers={
                "secret_failure": _server_body(name="secret_failure", env_set={"API_TOKEN": opaque})
                | {"env": {"API_TOKEN": opaque}},
            },
        )
        runtime = manager._servers["secret_failure"]  # noqa: SLF001
        with caplog.at_level("WARNING"):
            await manager._record_connect_failure(  # noqa: SLF001
                "secret_failure", runtime.generation, f"upstream echoed {opaque}"
            )
        assert opaque not in manager.get_status()["servers"][0]["last_error"]
        assert opaque not in caplog.text
        assert "[REDACTED]" in caplog.text


class TestManagementCancellationDrain:
    async def test_precommit_cancellation_aborts_queued_operation(self):
        commit_started = asyncio.Event()
        entered = asyncio.Event()
        operation_cancelled = asyncio.Event()

        async def operation():
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                operation_cancelled.set()

        task = asyncio.create_task(
            _drain_mcp_management(operation(), commit_started=commit_started)
        )
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert operation_cancelled.is_set()

    async def test_postcommit_cancellation_drains_then_restores(self):
        commit_started = asyncio.Event()
        entered = asyncio.Event()
        release = asyncio.Event()
        settled = asyncio.Event()

        async def operation():
            commit_started.set()
            entered.set()
            await release.wait()
            settled.set()
            return "coherent"

        task = asyncio.create_task(
            _drain_mcp_management(operation(), commit_started=commit_started)
        )
        await entered.wait()
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert settled.is_set()


class TestMutationSerialization:
    async def _park_first_finish(self, bot, monkeypatch):
        real = bot.mcp_manager.finish_desired_state
        entered = asyncio.Event()
        release = asyncio.Event()
        calls = 0

        async def parked(transition):
            nonlocal calls
            calls += 1
            if calls == 1:
                entered.set()
                await release.wait()
            await real(transition)

        monkeypatch.setattr(bot.mcp_manager, "finish_desired_state", parked)
        return entered, release

    async def test_overlapping_add_add_keeps_every_truth(self, harness, monkeypatch):
        client, bot, config_path = harness
        entered, release = await self._park_first_finish(bot, monkeypatch)
        one = asyncio.create_task(client.post("/api/mcp/servers", json=_server_body(name="one")))
        await entered.wait()
        two = asyncio.create_task(client.post("/api/mcp/servers", json=_server_body(name="two")))
        await asyncio.sleep(0.05)
        assert not two.done(), "second mutation must wait for first reconcile"
        assert set(_disk(config_path)["mcp"]["servers"]) == {"one"}
        assert set(bot.config.mcp.servers) == {"one"}
        assert set(bot.mcp_manager.desired_servers()) == {"one"}
        release.set()
        responses = await asyncio.gather(one, two)
        assert [response.status for response in responses] == [201, 201]
        expected = {"one", "two"}
        assert set(_disk(config_path)["mcp"]["servers"]) == expected
        assert set(bot.config.mcp.servers) == expected
        assert set(bot.mcp_manager.desired_servers()) == expected

    async def test_overlapping_update_update_merges_transaction_current_state(
        self, harness, monkeypatch
    ):
        client, bot, config_path = harness
        assert (await client.post("/api/mcp/servers", json=_server_body())).status == 201
        entered, release = await self._park_first_finish(bot, monkeypatch)
        first = asyncio.create_task(
            client.put("/api/mcp/servers/fake", json={"timeout_seconds": 31})
        )
        await entered.wait()
        second = asyncio.create_task(
            client.put("/api/mcp/servers/fake", json={"tool_allowlist": ["echo"]})
        )
        await asyncio.sleep(0.05)
        assert not second.done()
        assert _disk(config_path)["mcp"]["servers"]["fake"]["timeout_seconds"] == 31
        assert _disk(config_path)["mcp"]["servers"]["fake"]["tool_allowlist"] == []
        release.set()
        responses = await asyncio.gather(first, second)
        assert [response.status for response in responses] == [201, 201]
        disk = _disk(config_path)["mcp"]["servers"]["fake"]
        live = bot.config.mcp.servers["fake"]
        desired = bot.mcp_manager.desired_servers()["fake"]
        assert disk["timeout_seconds"] == live.timeout_seconds == desired["timeout_seconds"] == 31
        assert (
            disk["tool_allowlist"] == live.tool_allowlist == desired["tool_allowlist"] == ["echo"]
        )

    async def test_overlapping_delete_update_cannot_resurrect(self, harness, monkeypatch):
        client, bot, config_path = harness
        assert (await client.post("/api/mcp/servers", json=_server_body())).status == 201
        entered, release = await self._park_first_finish(bot, monkeypatch)
        delete = asyncio.create_task(client.delete("/api/mcp/servers/fake"))
        await entered.wait()
        update = asyncio.create_task(
            client.put("/api/mcp/servers/fake", json={"timeout_seconds": 31})
        )
        await asyncio.sleep(0.05)
        assert not update.done()
        assert _disk(config_path)["mcp"]["servers"] == {}
        release.set()
        delete_response, update_response = await asyncio.gather(delete, update)
        assert delete_response.status == 200
        assert update_response.status == 404
        assert _disk(config_path)["mcp"]["servers"] == {}
        assert bot.config.mcp.servers == {}
        assert bot.mcp_manager.desired_servers() == {}

    async def test_global_switch_and_crud_share_one_management_order(self, harness, monkeypatch):
        client, bot, config_path = harness
        entered, release = await self._park_first_finish(bot, monkeypatch)
        disable = asyncio.create_task(client.post("/api/mcp/enabled", json={"enabled": False}))
        await entered.wait()
        add = asyncio.create_task(
            client.post("/api/mcp/servers", json=_server_body(name="after_off"))
        )
        await asyncio.sleep(0.05)
        assert not add.done()
        assert _disk(config_path)["mcp"]["servers"] == {}
        assert _disk(config_path)["mcp"]["enabled"] is False
        release.set()
        disable_response, add_response = await asyncio.gather(disable, add)
        assert disable_response.status == 200
        assert add_response.status == 201
        assert _disk(config_path)["mcp"]["enabled"] is False
        assert bot.config.mcp.enabled is False
        assert bot.mcp_manager.global_enabled is False
        assert not bot.mcp_manager.has_tool("mcp_after_off_echo")


class TestPostCommitCancellation:
    @pytest.mark.parametrize("operation", ["add", "update", "delete", "global"])
    async def test_real_committed_write_rebinds_every_truth_before_cancellation(
        self, harness, monkeypatch, operation
    ):
        import aiohttp

        client, bot, config_path = harness
        if operation in {"update", "delete"}:
            assert (await client.post("/api/mcp/servers", json=_server_body())).status == 201

        real = persistence_mod.persist_config_paths_locked

        async def committed_then_cancelled(changes, **kwargs):
            exc, _cancelled = await real(changes, **kwargs)
            return exc, True

        monkeypatch.setattr(
            persistence_mod, "persist_config_paths_locked", committed_then_cancelled
        )
        request = {
            "add": lambda: client.post("/api/mcp/servers", json=_server_body(name="cancelled_add")),
            "update": lambda: client.put("/api/mcp/servers/fake", json={"timeout_seconds": 77}),
            "delete": lambda: client.delete("/api/mcp/servers/fake"),
            "global": lambda: client.post("/api/mcp/enabled", json={"enabled": False}),
        }[operation]
        try:
            response = await request()
            assert response.status >= 500
        except (aiohttp.ServerDisconnectedError, aiohttp.ClientOSError):
            pass

        disk = _disk(config_path)
        if operation == "add":
            assert "cancelled_add" in disk["mcp"]["servers"]
            assert "cancelled_add" in bot.config.mcp.servers
            assert "cancelled_add" in bot.mcp_manager.desired_servers()
        elif operation == "update":
            assert disk["mcp"]["servers"]["fake"]["timeout_seconds"] == 77
            assert bot.config.mcp.servers["fake"].timeout_seconds == 77
            assert bot.mcp_manager.desired_servers()["fake"]["timeout_seconds"] == 77
        elif operation == "delete":
            assert "fake" not in disk["mcp"]["servers"]
            assert "fake" not in bot.config.mcp.servers
            assert "fake" not in bot.mcp_manager.desired_servers()
            assert not bot.mcp_manager.has_tool("mcp_fake_echo")
        else:
            assert disk["mcp"]["enabled"] is False
            assert bot.config.mcp.enabled is False
            assert bot.mcp_manager.global_enabled is False


class TestPostCommitPublicationFence:
    @pytest.mark.parametrize("operation", ["update", "disable", "remove", "global_off"])
    async def test_superseded_tools_are_absent_before_reconcile(
        self, harness, monkeypatch, operation
    ):
        client, bot, config_path = harness
        assert (
            await client.post("/api/mcp/servers", json=_server_body(tool_allowlist=["echo"]))
        ).status == 201
        assert bot.mcp_manager.has_tool("mcp_fake_echo")

        entered_finish = asyncio.Event()
        release_finish = asyncio.Event()
        real_finish = bot.mcp_manager.finish_desired_state

        async def parked_finish(transition):
            entered_finish.set()
            await release_finish.wait()
            await real_finish(transition)

        monkeypatch.setattr(bot.mcp_manager, "finish_desired_state", parked_finish)
        request = {
            "update": lambda: client.put(
                "/api/mcp/servers/fake", json={"tool_allowlist": ["fail"]}
            ),
            "disable": lambda: client.put("/api/mcp/servers/fake", json={"enabled": False}),
            "remove": lambda: client.delete("/api/mcp/servers/fake"),
            "global_off": lambda: client.post("/api/mcp/enabled", json={"enabled": False}),
        }[operation]
        task = asyncio.create_task(request())
        await entered_finish.wait()

        # Disk has committed, but network retirement/reconcile is parked.
        # The old catalog entry must already be gone at this exact boundary.
        assert not bot.mcp_manager.has_tool("mcp_fake_echo")
        if operation == "remove":
            assert "fake" not in _disk(config_path)["mcp"]["servers"]
        elif operation == "global_off":
            assert _disk(config_path)["mcp"]["enabled"] is False
        else:
            disk = _disk(config_path)["mcp"]["servers"]["fake"]
            expected = ["fail"] if operation == "update" else False
            field = "tool_allowlist" if operation == "update" else "enabled"
            assert disk[field] == expected

        release_finish.set()
        response = await task
        assert response.status < 300, await response.text()


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
        response = await client.put("/api/mcp/servers/fake", json={"env_remove": {"not": "a list"}})
        assert response.status == 400
        # Falsey wrong types must not be treated as omitted patch operations.
        for patch in ({"headers_set": []}, {"env_remove": {}}):
            response = await client.put("/api/mcp/servers/fake", json=patch)
            assert response.status == 400

        # Schema accepts this string shape; canonical security validation
        # rejects it before persistence on the update route too.
        response = await client.put("/api/mcp/servers/fake", json={"cwd": "relative/path"})
        assert response.status == 400

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

    async def test_mutation_response_survives_row_vanishing_race(self, harness, monkeypatch):
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
