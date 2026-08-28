"""P2 pins: always-on control plane wiring, boot adoption, bounded shutdown,
health component, and the manager-lock atomicity guard."""

from __future__ import annotations

import ast
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import MCPConfig, MCPServerConfig
from src.discord.wiring import shutdown_services, start_mcp
from src.health.checker import check_mcp
from src.tools.mcp.client import MCPServerConnection
from src.tools.mcp.manager import (
    STATE_CONNECTED,
    STATE_DISABLED,
    STATE_ERROR,
    MCPManager,
)
from tests.fakes import make_bot

FAKE = str(Path(__file__).parent / "fakes" / "mcp_stdio_server.py")


async def _wait_until(predicate, *, timeout: float = 5.0) -> None:
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.01)


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
            await _wait_until(
                lambda: manager.get_status()["servers"][0]["state"] == STATE_CONNECTED
            )
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

    async def test_unexpected_startup_error_is_logged_and_nonfatal(self, caplog):
        manager = SimpleNamespace(load_desired_state=AsyncMock(side_effect=RuntimeError("boom")))
        bot = _bot(MCPConfig(enabled=True, servers={}), manager)
        await start_mcp(bot)
        assert "MCP startup failed" in caplog.text

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
        await _wait_until(lambda: manager.get_status()["servers"][0]["state"] == STATE_ERROR)
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
        await _wait_until(lambda: manager.has_tool("mcp_fake_echo"))
        await shutdown_services(bot)
        assert manager.get_tool_definitions() == []
        assert manager.get_status()["connected_count"] == 0

    async def test_shutdown_services_logs_manager_teardown_failure(self, caplog):
        manager = SimpleNamespace(shutdown=AsyncMock(side_effect=RuntimeError("teardown boom")))
        await shutdown_services(SimpleNamespace(mcp_manager=manager))
        assert "Error stopping mcp_manager" in caplog.text

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
            await _wait_until(lambda: bool(hits))
            assert hits, "publication must fire the late-bound invalidation hook"
        finally:
            await manager.shutdown()


class TestCheckMcp:
    def test_absent_manager_unconfigured(self):
        status = check_mcp(SimpleNamespace())
        assert status.status == "unconfigured" and status.healthy

    def test_manager_status_error_is_down(self):
        manager = SimpleNamespace(get_status=lambda: (_ for _ in ()).throw(RuntimeError("boom")))
        status = check_mcp(SimpleNamespace(mcp_manager=manager))
        assert status.status == "down"
        assert status.healthy is False
        assert "boom" in status.detail

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
            await _wait_until(
                lambda: manager.get_status()["servers"][0]["state"] == STATE_CONNECTED
            )
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
            await _wait_until(lambda: manager.get_status()["servers"][0]["state"] == STATE_ERROR)
            status = check_mcp(bot)
            assert status.status == "degraded"
            assert status.healthy  # optional subsystem: degrade, never down
        finally:
            await manager.shutdown()


class TestBootLifecycleRaces:
    async def test_stalled_probe_never_delays_gateway_setup(self, monkeypatch):
        entered = asyncio.Event()
        release = asyncio.Event()

        async def stalled_connect(_connection):
            entered.set()
            await release.wait()

        monkeypatch.setattr(MCPServerConnection, "connect", stalled_connect)
        manager = MCPManager()
        bot = _bot(
            MCPConfig(enabled=True, servers={"stall": _fake_server_config()}),
            manager,
        )
        try:
            async with asyncio.timeout(0.25):
                await start_mcp(bot)
            await asyncio.wait_for(entered.wait(), timeout=1)
            runtime = manager._servers["stall"]  # noqa: SLF001
            assert runtime.supervisor is not None and not runtime.supervisor.done()
            assert manager.get_tool_definitions() == []
        finally:
            release.set()
            await manager.shutdown()

    async def test_real_setup_hook_returns_while_probe_is_stalled(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        entered = asyncio.Event()
        release = asyncio.Event()

        async def stalled_connect(_connection):
            entered.set()
            await release.wait()

        monkeypatch.setattr(MCPServerConnection, "connect", stalled_connect)
        bot = make_bot(
            config_overrides={
                "mcp": {
                    "enabled": True,
                    "servers": {"stall": _fake_server_config().model_dump()},
                }
            }
        )
        bot.load_extension = AsyncMock()
        try:
            async with asyncio.timeout(0.5):
                await bot.setup_hook()
            await asyncio.wait_for(entered.wait(), timeout=1)
            assert bot.mcp_manager.get_tool_definitions() == []
        finally:
            release.set()
            await bot.mcp_manager.shutdown()

    async def test_shutdown_terminally_fences_paused_startup(self):
        manager = MCPManager()
        bot = _bot(
            MCPConfig(enabled=True, servers={"fake": _fake_server_config()}),
            manager,
        )
        loaded = asyncio.Event()
        release = asyncio.Event()
        original_load = manager.load_desired_state

        async def paused_load(**kwargs):
            await original_load(**kwargs)
            loaded.set()
            await release.wait()

        manager.load_desired_state = paused_load  # type: ignore[method-assign]
        startup = asyncio.create_task(start_mcp(bot))
        await asyncio.wait_for(loaded.wait(), timeout=1)
        await manager.shutdown()
        release.set()
        await startup
        runtime = manager._servers["fake"]  # noqa: SLF001
        assert manager._closed is True  # noqa: SLF001
        assert manager._started is False  # noqa: SLF001
        assert runtime.supervisor is None
        assert runtime.connection is None
        assert manager.get_tool_definitions() == []

    async def test_shutdown_fence_rejects_publish_from_inflight_start(self, monkeypatch):
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=True, servers={"fake": _fake_server_config().model_dump()}
        )
        entered = asyncio.Event()
        release = asyncio.Event()
        original_discover = MCPServerConnection.discover_tools

        async def paused_discover(connection):
            entered.set()
            await release.wait()
            return await original_discover(connection)

        monkeypatch.setattr(MCPServerConnection, "discover_tools", paused_discover)
        startup = asyncio.create_task(manager.start())
        await asyncio.wait_for(entered.wait(), timeout=2)
        shutdown = asyncio.create_task(manager.shutdown())
        await asyncio.sleep(0)
        assert manager._closed is True  # noqa: SLF001
        release.set()
        await asyncio.gather(startup, shutdown)
        runtime = manager._servers["fake"]  # noqa: SLF001
        assert runtime.state == STATE_DISABLED
        assert runtime.connection is None
        assert runtime.supervisor is None
        assert manager.get_tool_definitions() == []

    async def test_cancelled_enable_drains_to_supervised_state(self, monkeypatch):
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=False, servers={"fake": _fake_server_config().model_dump()}
        )
        await manager.start()
        entered = asyncio.Event()
        release = asyncio.Event()
        original_connect = MCPServerConnection.connect

        async def paused_connect(connection):
            entered.set()
            await release.wait()
            await original_connect(connection)

        monkeypatch.setattr(MCPServerConnection, "connect", paused_connect)
        enable = asyncio.create_task(manager.set_global_enabled(True))
        await asyncio.wait_for(entered.wait(), timeout=1)
        enable.cancel()
        await asyncio.sleep(0)
        assert not enable.done(), "committed enable transition must drain reconciliation"
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await enable
        runtime = manager._servers["fake"]  # noqa: SLF001
        assert manager.global_enabled is True
        assert runtime.state == STATE_CONNECTED
        assert runtime.supervisor is not None and not runtime.supervisor.done()
        assert manager.has_tool("mcp_fake_echo")
        await manager.shutdown()

    async def test_cancelled_reload_drains_replacement_reconciliation(self, monkeypatch):
        manager = MCPManager()
        old_config = _fake_server_config().model_dump()
        await manager.load_desired_state(enabled=True, servers={"fake": old_config})
        await manager.start()
        old_runtime = manager._servers["fake"]  # noqa: SLF001
        old_connection = old_runtime.connection
        assert old_connection is not None
        entered = asyncio.Event()
        release = asyncio.Event()
        original_retire = manager._retire_runtime  # noqa: SLF001

        async def paused_retire(runtime):
            if runtime is old_runtime:
                entered.set()
                await release.wait()
            await original_retire(runtime)

        monkeypatch.setattr(manager, "_retire_runtime", paused_retire)
        changed = dict(old_config, tool_allowlist=["echo"])
        reload_task = asyncio.create_task(
            manager.load_desired_state(enabled=True, servers={"fake": changed})
        )
        await asyncio.wait_for(entered.wait(), timeout=1)
        reload_task.cancel()
        await asyncio.sleep(0)
        assert not reload_task.done(), "committed reload must drain retirement/reconcile"
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await reload_task
        runtime = manager._servers["fake"]  # noqa: SLF001
        assert runtime is not old_runtime
        assert runtime.config["tool_allowlist"] == ["echo"]
        assert runtime.state == STATE_CONNECTED
        assert runtime.supervisor is not None and not runtime.supervisor.done()
        assert runtime.connection is not None
        assert not old_connection.connected
        assert {tool["name"] for tool in manager.get_tool_definitions()} == {"mcp_fake_echo"}
        await manager.shutdown()

    async def test_overlapping_disable_enable_finishes_supervised(self, monkeypatch):
        manager = MCPManager()
        await manager.load_desired_state(
            enabled=True, servers={"fake": _fake_server_config().model_dump()}
        )
        await manager.start()
        runtime = manager._servers["fake"]  # noqa: SLF001
        entered = asyncio.Event()
        release = asyncio.Event()
        original_retire = manager._retire_runtime  # noqa: SLF001

        async def delayed_retire(target):
            if target is runtime:
                entered.set()
                await release.wait()
            await original_retire(target)

        monkeypatch.setattr(manager, "_retire_runtime", delayed_retire)
        disable = asyncio.create_task(manager.set_global_enabled(False))
        await asyncio.wait_for(entered.wait(), timeout=1)
        enable = asyncio.create_task(manager.set_global_enabled(True))
        await asyncio.sleep(0)
        assert not enable.done(), "enable must serialize behind disable retirement"
        release.set()
        await asyncio.gather(disable, enable)
        current = manager._servers["fake"]  # noqa: SLF001
        assert manager.global_enabled is True
        assert current.supervisor is not None and not current.supervisor.done()
        assert current.state == STATE_CONNECTED
        await manager.shutdown()


class TestManagerLockAtomicity:
    def test_locked_critical_sections_are_await_free(self):
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
        assert not violations
