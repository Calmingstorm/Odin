"""Control-plane pins: the four-state publication predicate, blocked-not-
truncated limits, generation fencing, synchronous catalog invalidation,
first-server bootstrap, typed dispatch — real stdio fakes for the
end-to-end paths, synthetic records for the publication-logic edges."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest
from aiohttp.test_utils import TestServer

from src.tools.mcp import manager as manager_mod
from src.tools.mcp.client import DiscoveryResult, MCPServerConnection, ToolRecord
from src.tools.mcp.errors import MCPConfigError, MCPError, MCPProtocolError
from src.tools.mcp.manager import (
    STATE_BLOCKED,
    STATE_CONNECTED,
    STATE_DISABLED,
    STATE_STALE,
    MCPManager,
)
from tests.fakes.mcp_http import make_app

FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")


def _stdio_config(mode: str = "legacy", **extra) -> dict:
    return {
        "transport": "stdio",
        "command": sys.executable,
        "args": [FAKE, mode],
        "timeout_seconds": 30,
        **extra,
    }


def _record(name: str, description: str = "d") -> ToolRecord:
    return ToolRecord(
        name=name,
        description=description,
        input_schema={"type": "object", "properties": {}},
    )


class TestControlPlaneAlwaysPresent:
    async def test_constructible_and_inspectable_while_disabled(self):
        manager = MCPManager()
        assert manager.global_enabled is False
        assert manager.get_tool_definitions() == []
        status = manager.get_status()
        assert status["enabled"] is False and status["servers"] == []

    async def test_first_server_bootstrap_while_disabled(self):
        # The plan's first-server rule: an enabled-but-empty (or disabled)
        # install must accept its first server through the control plane.
        manager = MCPManager()
        await manager.add_server("first", _stdio_config())
        status = manager.get_status()
        assert status["server_count"] == 1
        assert status["servers"][0]["state"] == STATE_DISABLED
        assert manager.get_tool_definitions() == []
        await manager.shutdown()

    async def test_execute_unknown_tool_is_typed_failure(self):
        manager = MCPManager()
        outcome = await manager.execute("mcp_ghost_tool", {})
        assert outcome.status == "failed"
        assert "not currently published" in outcome.text


class TestEndToEndPublication:
    async def test_connect_publish_execute(self):
        changes: list[int] = []
        manager = MCPManager(on_catalog_changed=lambda: changes.append(1))
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        try:
            status = manager.get_status()
            server = status["servers"][0]
            assert server["state"] == STATE_CONNECTED
            assert server["era"] == "legacy"
            assert server["published_count"] > 0
            defs = manager.get_tool_definitions()
            names = {d["name"] for d in defs}
            assert "mcp_fake_echo" in names
            echo_def = next(d for d in defs if d["name"] == "mcp_fake_echo")
            assert echo_def["description"].startswith("[MCP:fake]")
            assert manager.has_tool("mcp_fake_echo")
            assert changes, "publication must invalidate the catalog"
            outcome = await manager.execute("mcp_fake_echo", {"text": "hello"})
            assert outcome.ok and "echo: hello" in outcome.text
            assert outcome.generation == server["generation"]
        finally:
            await manager.shutdown()
        assert manager.get_tool_definitions() == []

    async def test_per_server_disabled_never_connects(self):
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=True, servers={"off": _stdio_config(enabled=False)}
        )
        await manager.start()
        try:
            assert manager.get_status()["servers"][0]["state"] == STATE_DISABLED
            assert manager.get_tool_definitions() == []
        finally:
            await manager.shutdown()

    async def test_allowlist_narrows_publication(self):
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=True,
            servers={"fake": _stdio_config(tool_allowlist=["echo"])},
        )
        await manager.start()
        try:
            defs = manager.get_tool_definitions()
            assert {d["name"] for d in defs} == {"mcp_fake_echo"}
            server = manager.get_status()["servers"][0]
            assert server["discovered_count"] > 1  # the rest stayed visible
        finally:
            await manager.shutdown()

    async def test_global_disable_unpublishes_synchronously(self):
        changes: list[int] = []
        manager = MCPManager(on_catalog_changed=lambda: changes.append(1))
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        assert manager.get_tool_definitions()
        await manager.set_global_enabled(False)
        # By the time the call returns, publication is gone and the catalog
        # was invalidated — no later model request can carry these tools.
        assert manager.get_tool_definitions() == []
        assert manager.get_status()["servers"][0]["state"] == STATE_DISABLED
        assert changes
        await manager.shutdown()

    async def test_remove_server_unpublishes(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        assert manager.has_tool("mcp_fake_echo")
        await manager.remove_server("fake")
        assert not manager.has_tool("mcp_fake_echo")
        assert manager.get_status()["server_count"] == 0
        await manager.shutdown()

    async def test_reconnect_server_round_trip(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        try:
            await manager.reconnect_server("fake")
            assert manager.get_status()["servers"][0]["state"] == STATE_CONNECTED
            outcome = await manager.execute("mcp_fake_echo", {"text": "again"})
            assert outcome.ok
        finally:
            await manager.shutdown()

    async def test_refresh_failure_unpublishes_to_stale(self):
        changes: list[int] = []
        manager = MCPManager(on_catalog_changed=lambda: changes.append(1))
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        try:
            runtime = manager._servers["fake"]  # noqa: SLF001
            assert runtime.connection is not None

            async def broken_discovery():
                raise MCPError("listing exploded")

            runtime.connection.discover_tools = broken_discovery  # type: ignore[method-assign]
            changes.clear()
            await manager.refresh_server_tools("fake")
            server = manager.get_status()["servers"][0]
            assert server["state"] == STATE_STALE
            assert server["published_count"] == 0
            # Stale diagnostics remain visible; the catalog does not.
            assert server["discovered_count"] > 0
            assert manager.get_tool_definitions() == []
            assert changes, "unpublish must invalidate the catalog"
        finally:
            await manager.shutdown()


class TestRefreshFailureRetirement:
    @pytest.mark.parametrize(
        "failure",
        [
            MCPProtocolError("invalid listing"),
            TimeoutError("listing stalled"),
            RuntimeError("adapter defect"),
        ],
        ids=["protocol", "timeout", "unexpected"],
    )
    async def test_failed_refresh_unpublishes_closes_and_reconnects(self, monkeypatch, failure):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        runtime = manager._servers["fake"]  # noqa: SLF001
        original = runtime.connection
        assert original is not None and manager.has_tool("mcp_fake_echo")
        original_discover = original.discover_tools
        failed = False

        async def fail_once():
            nonlocal failed
            if not failed:
                failed = True
                raise failure
            return await original_discover()

        monkeypatch.setattr(original, "discover_tools", fail_once)
        try:
            await manager.refresh_server_tools("fake")
            assert runtime.connection is None
            assert runtime.state == STATE_STALE
            assert not original.connected
            assert original._stdio is None  # noqa: SLF001
            assert manager.get_tool_definitions() == []
            async with asyncio.timeout(5):
                while runtime.connection is None or runtime.connection is original:
                    await asyncio.sleep(0.01)
            assert runtime.state == STATE_CONNECTED
            assert manager.has_tool("mcp_fake_echo")
        finally:
            await manager.shutdown()


class TestPublicationLimits:
    async def _manager_with_connection(self) -> tuple[MCPManager, object, int]:
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        runtime = manager._servers["fake"]  # noqa: SLF001
        return manager, runtime.connection, runtime.generation

    async def test_over_per_server_limit_blocks_never_truncates(self):
        manager, connection, generation = await self._manager_with_connection()
        try:
            many = DiscoveryResult(tools=[_record(f"tool_{i}") for i in range(41)])
            await manager._publish("fake", generation, connection, many)  # noqa: SLF001
            server = manager.get_status()["servers"][0]
            assert server["state"] == STATE_BLOCKED
            assert server["published_count"] == 0
            assert "tool_allowlist" in server["blocked_reason"]
            assert manager.get_tool_definitions() == []
        finally:
            await manager.shutdown()

    async def test_allowlist_resolves_a_block(self):
        manager, connection, generation = await self._manager_with_connection()
        try:
            runtime = manager._servers["fake"]  # noqa: SLF001
            runtime.config["tool_allowlist"] = ["tool_1", "tool_2"]
            many = DiscoveryResult(tools=[_record(f"tool_{i}") for i in range(41)])
            await manager._publish("fake", generation, connection, many)  # noqa: SLF001
            server = manager.get_status()["servers"][0]
            assert server["state"] == STATE_CONNECTED
            assert server["published_count"] == 2
        finally:
            await manager.shutdown()

    async def test_stale_generation_never_republishes(self):
        manager, connection, generation = await self._manager_with_connection()
        try:
            before = manager.get_tool_definitions()
            stale = DiscoveryResult(tools=[_record("late_arrival")])
            published = await manager._publish(  # noqa: SLF001
                "fake", generation - 1, connection, stale
            )
            assert published is False
            assert manager.get_tool_definitions() == before
            assert not manager.has_tool("mcp_fake_late_arrival")
        finally:
            await manager.shutdown()

    async def test_name_collision_blocks(self, monkeypatch):
        manager, connection, generation = await self._manager_with_connection()
        try:
            monkeypatch.setattr(manager_mod, "make_published_name", lambda s, t: "mcp_fake_same")
            two = DiscoveryResult(tools=[_record("a"), _record("b")])
            await manager._publish("fake", generation, connection, two)  # noqa: SLF001
            server = manager.get_status()["servers"][0]
            assert server["state"] == STATE_BLOCKED
            assert "collision" in server["blocked_reason"]
            assert manager.get_tool_definitions() == []
        finally:
            await manager.shutdown()


class TestConfigValidation:
    @pytest.mark.parametrize(
        "name,config,match",
        [
            ("bad name", {"transport": "stdio", "command": "x"}, "invalid server name"),
            ("s" * 129, {"transport": "stdio", "command": "x"}, "invalid server name"),
            ("ok", {"transport": "carrier-pigeon"}, "transport"),
            ("ok", {"transport": "stdio"}, "command"),
            ("ok", {"transport": "http", "url": "ftp://x"}, "http"),
            (
                "ok",
                {"transport": "stdio", "command": "x", "headers": {"bad\nkey": "v"}},
                "illegal",
            ),
            (
                "ok",
                {"transport": "stdio", "command": "x", "tool_allowlist": [1]},
                "allowlist",
            ),
            (
                "ok",
                {"transport": "stdio", "command": "x", "timeout_seconds": 0},
                "timeout",
            ),
        ],
    )
    async def test_structural_validation(self, name, config, match):
        manager = MCPManager()
        with pytest.raises(MCPConfigError, match=match):
            await manager.add_server(name, config)

    async def test_duplicate_name_rejected(self):
        manager = MCPManager()
        await manager.add_server("dup", _stdio_config())
        with pytest.raises(MCPConfigError, match="exists"):
            await manager.add_server("dup", _stdio_config())
        await manager.shutdown()

    async def test_invalid_desired_state_recorded_not_discarded(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"broken": {"transport": "stdio"}})
        await manager.start()
        server = manager.get_status()["servers"][0]
        assert server["state"] == "error"
        assert "command" in server["last_error"]
        await manager.shutdown()


class TestShutdownBounds:
    async def test_shutdown_wall_time_bounded(self):
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=True,
            servers={"a": _stdio_config(), "b": _stdio_config()},
        )
        await manager.start()
        assert manager.get_status()["connected_count"] == 2
        start = asyncio.get_running_loop().time()
        await manager.shutdown()
        assert asyncio.get_running_loop().time() - start < 15
        assert manager.get_tool_definitions() == []


class TestShutdownCancellationSafety:
    async def test_cancelling_shutdown_still_drains_owned_runtime(self, monkeypatch):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        runtime = manager._servers["fake"]  # noqa: SLF001
        connection = runtime.connection
        assert connection is not None
        entered = asyncio.Event()
        release = asyncio.Event()
        original_disconnect = connection.disconnect

        async def delayed_disconnect():
            entered.set()
            await release.wait()
            await original_disconnect()

        monkeypatch.setattr(connection, "disconnect", delayed_disconnect)
        shutdown = asyncio.create_task(manager.shutdown())
        await asyncio.wait_for(entered.wait(), timeout=1)
        shutdown.cancel()
        await asyncio.sleep(0)
        assert not shutdown.done(), "shutdown must drain teardown after cancellation"
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await shutdown
        assert runtime.supervisor is None
        assert runtime.connection is None
        assert not connection.connected
        assert connection._stdio is None  # noqa: SLF001
        assert manager.get_tool_definitions() == []


class TestDesiredStateReloadRetirement:
    async def test_reload_retires_removed_and_replaced_runtimes(self):
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=True,
            servers={"a": _stdio_config(), "b": _stdio_config()},
        )
        await manager.start()
        old_a = manager._servers["a"]  # noqa: SLF001
        old_b = manager._servers["b"]  # noqa: SLF001
        old_a_conn = old_a.connection
        old_b_conn = old_b.connection
        assert old_a_conn is not None and old_b_conn is not None
        await manager.load_desired_state(
            enabled=True,
            servers={"a": _stdio_config(tool_allowlist=["echo"])},
        )
        try:
            assert manager.server_names == ["a"]
            assert manager._servers["a"] is not old_a  # noqa: SLF001
            assert not old_a_conn.connected and not old_b_conn.connected
            assert old_a.supervisor is None and old_b.supervisor is None
            assert {d["name"] for d in manager.get_tool_definitions()} == {"mcp_a_echo"}
        finally:
            await manager.shutdown()

    async def test_unchanged_reload_reuses_live_runtime(self):
        config = _stdio_config()
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"a": config})
        await manager.start()
        runtime = manager._servers["a"]  # noqa: SLF001
        connection = runtime.connection
        try:
            await manager.load_desired_state(enabled=True, servers={"a": config})
            assert manager._servers["a"] is runtime  # noqa: SLF001
            assert manager._servers["a"].connection is connection  # noqa: SLF001
        finally:
            await manager.shutdown()


class TestSynchronousLossFence:
    async def test_loss_callback_unpublishes_before_return(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        runtime = manager._servers["fake"]  # noqa: SLF001
        connection = runtime.connection
        assert connection is not None and manager.has_tool("mcp_fake_echo")
        manager._on_lost(  # noqa: SLF001
            "fake", runtime.generation, connection, "synthetic transport loss"
        )
        try:
            assert not manager.has_tool("mcp_fake_echo")
            assert manager.get_tool_definitions() == []
            assert runtime.state == "error"
            assert runtime.connection is None
        finally:
            await connection.disconnect()
            await manager.shutdown()


class TestManagerSessionRefreshRecovery:
    async def test_manual_refresh_recovers_expired_legacy_session(self):
        app, state = make_app("legacy-session")
        server = TestServer(app)
        await server.start_server()
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=True,
            servers={
                "http": {
                    "transport": "http",
                    "url": str(server.make_url("/mcp")),
                    "timeout_seconds": 30,
                }
            },
        )
        await manager.start()
        try:
            assert manager.has_tool("mcp_http_echo")
            before_initialize = state["calls"]["initialize"]
            state["expire_once"] = True
            await manager.refresh_server_tools("http")
            status = manager.get_status()["servers"][0]
            assert status["state"] == STATE_CONNECTED
            assert manager.has_tool("mcp_http_echo")
            assert state["calls"]["initialize"] == before_initialize + 1
        finally:
            await manager.shutdown()
            await server.close()

    async def test_reload_global_disable_retires_unchanged_runtime(self):
        config = _stdio_config()
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"a": config})
        await manager.start()
        runtime = manager._servers["a"]  # noqa: SLF001
        connection = runtime.connection
        assert connection is not None
        await manager.load_desired_state(enabled=False, servers={"a": config})
        try:
            replacement = manager._servers["a"]  # noqa: SLF001
            assert replacement is not runtime
            assert replacement.state == STATE_DISABLED
            assert runtime.connection is None
            assert not connection.connected
            assert manager.get_tool_definitions() == []
        finally:
            await manager.shutdown()


class TestConfigSnapshotIsolation:
    async def test_nested_caller_mutation_cannot_bypass_reload_fence(self):
        config = _stdio_config(tool_allowlist=["echo"])
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"a": config})
        await manager.start()
        old = manager._servers["a"]  # noqa: SLF001
        config["tool_allowlist"].append("fail")
        assert old.config["tool_allowlist"] == ["echo"]
        try:
            await manager.load_desired_state(enabled=True, servers={"a": config})
            assert manager._servers["a"] is not old  # noqa: SLF001
            assert set(manager._servers["a"].config["tool_allowlist"]) == {  # noqa: SLF001
                "echo",
                "fail",
            }
        finally:
            await manager.shutdown()


class TestInFlightRetirementCleanup:
    async def test_reload_cancels_inflight_discovery_and_closes_local_connection(self, monkeypatch):
        entered = asyncio.Event()
        release = asyncio.Event()
        created = []
        original_connect = MCPServerConnection.connect

        async def connect(self):
            await original_connect(self)
            created.append(self)

        async def blocked_discover(self):
            entered.set()
            await release.wait()
            raise AssertionError("retired discovery resumed")

        monkeypatch.setattr(MCPServerConnection, "connect", connect)
        monkeypatch.setattr(MCPServerConnection, "discover_tools", blocked_discover)
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"a": _stdio_config()})
        manager._started = True  # noqa: SLF001
        start = asyncio.create_task(manager._reconcile_server("a"))  # noqa: SLF001
        await asyncio.wait_for(entered.wait(), timeout=5)
        await manager.load_desired_state(enabled=True, servers={})
        await start
        assert len(created) == 1
        assert not created[0].connected
        assert created[0]._stdio is None  # noqa: SLF001
        await manager.shutdown()


class TestTerminalShutdownPublicationFence:
    async def test_shutdown_unpublishes_and_rejects_execute_before_parked_lock(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        assert manager.has_tool("mcp_fake_echo")

        await manager._lifecycle_lock.acquire()  # noqa: SLF001
        shutdown = asyncio.create_task(manager.shutdown())
        try:
            for _ in range(100):
                if manager._closed:  # noqa: SLF001
                    break
                await asyncio.sleep(0)
            assert manager._closed is True  # noqa: SLF001
            assert manager.get_tool_definitions() == []
            assert not manager.has_tool("mcp_fake_echo")
            outcome = await manager.execute("mcp_fake_echo", {"text": "must not run"})
            assert outcome.status == "failed"
            assert "shutting down" in outcome.text
            assert not shutdown.done()
        finally:
            manager._lifecycle_lock.release()  # noqa: SLF001
            await shutdown


class TestOwnedLostConnectionRetirement:
    async def test_shutdown_drains_parked_lost_connection_teardown(self, monkeypatch):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={"fake": _stdio_config()})
        await manager.start()
        runtime = manager._servers["fake"]  # noqa: SLF001
        connection = runtime.connection
        assert connection is not None and manager.has_tool("mcp_fake_echo")

        entered = asyncio.Event()
        release = asyncio.Event()
        original = manager._disconnect_lost_connection  # noqa: SLF001

        async def parked(target):
            entered.set()
            await release.wait()
            await original(target)

        monkeypatch.setattr(manager, "_disconnect_lost_connection", parked)
        manager._on_lost(  # noqa: SLF001
            "fake", runtime.generation, connection, "synthetic loss"
        )
        await asyncio.wait_for(entered.wait(), timeout=1)
        assert manager._loss_retirements  # noqa: SLF001
        shutdown = asyncio.create_task(manager.shutdown())
        for _ in range(100):
            if manager._closed:  # noqa: SLF001
                break
            await asyncio.sleep(0)
        assert manager._closed is True  # noqa: SLF001
        assert not shutdown.done()
        release.set()
        await shutdown
        assert not manager._loss_retirements  # noqa: SLF001
        assert not connection.connected
