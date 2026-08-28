"""Control-plane pins: the four-state publication predicate, blocked-not-
truncated limits, generation fencing, synchronous catalog invalidation,
first-server bootstrap, typed dispatch — real stdio fakes for the
end-to-end paths, synthetic records for the publication-logic edges."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

from src.tools.mcp import manager as manager_mod
from src.tools.mcp.client import DiscoveryResult, ToolRecord
from src.tools.mcp.errors import MCPConfigError, MCPError
from src.tools.mcp.manager import (
    STATE_BLOCKED,
    STATE_CONNECTED,
    STATE_DISABLED,
    STATE_STALE,
    MCPManager,
)

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
