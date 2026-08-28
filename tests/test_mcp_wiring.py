"""P2 pins: always-on control plane wiring, boot adoption, bounded shutdown,
health component, and the manager-lock atomicity guard."""

from __future__ import annotations

import ast
import sys
from pathlib import Path
from types import SimpleNamespace

from src.config.schema import MCPConfig, MCPServerConfig
from src.discord.wiring import shutdown_services, start_mcp
from src.health.checker import check_mcp
from src.tools.mcp.manager import (
    STATE_CONNECTED,
    STATE_DISABLED,
    STATE_ERROR,
    MCPManager,
)

FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")


def _fake_server_config() -> MCPServerConfig:
    return MCPServerConfig(
        transport="stdio",
        command=sys.executable,
        args=[FAKE, "legacy"],
        timeout_seconds=30,
    )


def _bot(mcp_config: MCPConfig | None, manager: MCPManager) -> SimpleNamespace:
    config = SimpleNamespace(mcp=mcp_config) if mcp_config is not None else SimpleNamespace()
    return SimpleNamespace(config=config, mcp_manager=manager)


class TestStartMcp:
    async def test_enabled_config_connects_and_publishes(self):
        manager = MCPManager()
        bot = _bot(
            MCPConfig(enabled=True, servers={"fake": _fake_server_config()}),
            manager,
        )
        try:
            await start_mcp(bot)
            status = manager.get_status()
            assert status["enabled"] is True
            assert status["servers"][0]["state"] == STATE_CONNECTED
            assert manager.has_tool("mcp_fake_echo")
        finally:
            await manager.shutdown()

    async def test_disabled_config_runs_zero_processes(self):
        manager = MCPManager()
        bot = _bot(
            MCPConfig(enabled=False, servers={"fake": _fake_server_config()}),
            manager,
        )
        await start_mcp(bot)
        status = manager.get_status()
        assert status["enabled"] is False
        assert status["servers"][0]["state"] == STATE_DISABLED
        assert status["servers"][0]["era"] is None  # no connection object at all
        assert manager.get_tool_definitions() == []
        await manager.shutdown()

    async def test_missing_mcp_config_is_noop(self):
        manager = MCPManager()
        bot = _bot(None, manager)
        await start_mcp(bot)  # must not raise
        assert manager.get_status()["server_count"] == 0

    async def test_broken_server_records_error_never_raises(self):
        manager = MCPManager()
        bot = _bot(
            MCPConfig(
                enabled=True,
                servers={
                    "dead": MCPServerConfig(transport="stdio", command="/nonexistent/mcp-binary")
                },
            ),
            manager,
        )
        await start_mcp(bot)  # boot must survive
        server = manager.get_status()["servers"][0]
        assert server["state"] == STATE_ERROR
        assert manager.get_tool_definitions() == []
        await manager.shutdown()


class TestShutdownServices:
    async def test_shutdown_services_tears_down_the_manager(self):
        manager = MCPManager()
        bot = _bot(
            MCPConfig(enabled=True, servers={"fake": _fake_server_config()}),
            manager,
        )
        await start_mcp(bot)
        assert manager.has_tool("mcp_fake_echo")
        await shutdown_services(bot)
        assert manager.get_tool_definitions() == []
        assert manager.get_status()["connected_count"] == 0

    async def test_shutdown_services_survives_absent_manager(self):
        await shutdown_services(SimpleNamespace())  # every handle getattr-guarded


class TestCatalogCallbackWiring:
    async def test_late_bound_callback_fires_on_publication(self):
        hits: list[int] = []
        manager = MCPManager()
        manager.set_on_catalog_changed(lambda: hits.append(1))
        bot = _bot(
            MCPConfig(enabled=True, servers={"fake": _fake_server_config()}),
            manager,
        )
        try:
            await start_mcp(bot)
            assert hits, "publication must fire the late-bound invalidation hook"
        finally:
            await manager.shutdown()


class TestCheckMcp:
    def test_absent_manager_unconfigured(self):
        status = check_mcp(SimpleNamespace())
        assert status.status == "unconfigured" and status.healthy

    def test_disabled_manager_unconfigured(self):
        status = check_mcp(SimpleNamespace(mcp_manager=MCPManager()))
        assert status.status == "unconfigured" and status.healthy
        assert status.metadata["enabled"] is False

    async def test_enabled_empty_is_ok(self):
        manager = MCPManager()
        await manager.load_desired_state(enabled=True, servers={})
        status = check_mcp(SimpleNamespace(mcp_manager=manager))
        assert status.status == "ok"

    async def test_all_connected_is_ok(self):
        manager = MCPManager()
        bot = _bot(
            MCPConfig(enabled=True, servers={"fake": _fake_server_config()}),
            manager,
        )
        try:
            await start_mcp(bot)
            status = check_mcp(bot)
            assert status.status == "ok"
            assert status.metadata["connected"] == 1
            assert status.metadata["published_tools"] > 0
        finally:
            await manager.shutdown()

    async def test_failed_server_degrades_never_unhealthy(self):
        manager = MCPManager()
        bot = _bot(
            MCPConfig(
                enabled=True,
                servers={
                    "dead": MCPServerConfig(transport="stdio", command="/nonexistent/mcp-binary")
                },
            ),
            manager,
        )
        try:
            await start_mcp(bot)
            status = check_mcp(bot)
            assert status.status == "degraded"
            assert status.healthy  # optional subsystem: degrade, never down
        finally:
            await manager.shutdown()


class TestManagerLockAtomicity:
    def test_locked_critical_sections_are_await_free(self):
        """The synchronous loss fence (_on_lost → _unpublish_locked without
        the manager lock) is sound ONLY because every locked critical
        section is await-free: on a single event loop an await-free block
        runs atomically, so the unlocked synchronous mutation can never
        interleave inside one. An ``await`` added under ``self._lock`` would
        silently break that fence — this guard makes it loud."""
        source = Path("src/tools/mcp/manager.py").read_text(encoding="utf-8")
        tree = ast.parse(source)
        violations: list[str] = []

        class Checker(ast.NodeVisitor):
            def visit_AsyncWith(self, node: ast.AsyncWith) -> None:
                if any("self._lock" in ast.unparse(item.context_expr) for item in node.items):
                    for stmt in node.body:
                        for sub in ast.walk(stmt):
                            if isinstance(sub, (ast.Await, ast.AsyncFor, ast.AsyncWith)):
                                violations.append(f"line {sub.lineno}: {ast.unparse(sub)[:80]}")
                self.generic_visit(node)

        Checker().visit(tree)
        assert not violations, (
            "await inside a manager._lock critical section breaks the "
            f"synchronous loss fence: {violations}"
        )
