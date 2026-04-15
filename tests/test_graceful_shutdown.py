"""Tests for graceful shutdown behaviour.

Validates that OdinBot.close() shuts down all attached components in order,
that KnowledgeStore.close() cleans up SQLite, and that
ProcessRegistry.shutdown() terminates running processes.
"""

from __future__ import annotations

import asyncio
import sqlite3
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from src.discord.client import OdinBot
from src.config import OdinConfig
from src.knowledge.store import KnowledgeStore
from src.tools.process_manager import ProcessRegistry


# ── OdinBot.close() ──────────────────────────────────────────────────


def _make_bot() -> OdinBot:
    """Create an OdinBot with mocked super().close() and common components."""
    config = OdinConfig(token="test-token", prefix="!", log_level="DEBUG")
    bot = OdinBot(config)
    return bot


class TestOdinBotClose:
    """OdinBot.close() shuts down all attached components."""

    @pytest.mark.asyncio
    async def test_close_no_components(self):
        """close() works fine when no components are attached."""
        bot = _make_bot()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock) as super_close:
            await bot.close()
            super_close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_stops_loop_manager(self):
        bot = _make_bot()
        bot.loop_manager = MagicMock()
        bot.loop_manager.stop_loop = MagicMock(return_value="Stopped")
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.loop_manager.stop_loop.assert_called_once_with("all")

    @pytest.mark.asyncio
    async def test_close_stops_scheduler(self):
        bot = _make_bot()
        bot.scheduler = AsyncMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.scheduler.stop.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_stops_watcher(self):
        bot = _make_bot()
        bot.watcher = AsyncMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.watcher.stop.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_stops_health_server(self):
        bot = _make_bot()
        bot.health_server = AsyncMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.health_server.stop.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_shuts_down_process_registry(self):
        bot = _make_bot()
        bot.process_registry = AsyncMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.process_registry.shutdown.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_closes_knowledge_store(self):
        bot = _make_bot()
        bot.knowledge = MagicMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.knowledge.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_saves_sessions(self):
        bot = _make_bot()
        bot.sessions = MagicMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.sessions.save_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_continues_on_component_error(self):
        """If one component raises during shutdown, others still get cleaned up."""
        bot = _make_bot()
        bot.loop_manager = MagicMock()
        bot.loop_manager.stop_loop = MagicMock(side_effect=RuntimeError("boom"))
        bot.scheduler = AsyncMock()
        bot.scheduler.stop = AsyncMock(side_effect=RuntimeError("bang"))
        bot.sessions = MagicMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        # Despite errors in earlier components, sessions still saved
        bot.sessions.save_all.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_all_components(self):
        """Full integration: all components present and shut down in order."""
        bot = _make_bot()
        call_order = []

        bot.loop_manager = MagicMock()
        bot.loop_manager.stop_loop = MagicMock(
            side_effect=lambda x: call_order.append("loop_manager")
        )
        bot.scheduler = AsyncMock()
        bot.scheduler.stop = AsyncMock(
            side_effect=lambda: call_order.append("scheduler")
        )
        bot.watcher = AsyncMock()
        bot.watcher.stop = AsyncMock(
            side_effect=lambda: call_order.append("watcher")
        )
        bot.health_server = AsyncMock()
        bot.health_server.stop = AsyncMock(
            side_effect=lambda: call_order.append("health_server")
        )
        bot.process_registry = AsyncMock()
        bot.process_registry.shutdown = AsyncMock(
            side_effect=lambda: call_order.append("process_registry")
        )
        bot.knowledge = MagicMock()
        bot.knowledge.close = MagicMock(
            side_effect=lambda: call_order.append("knowledge")
        )
        bot.sessions = MagicMock()
        bot.sessions.save_all = MagicMock(
            side_effect=lambda: call_order.append("sessions")
        )

        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()

        assert call_order == [
            "loop_manager",
            "scheduler",
            "watcher",
            "health_server",
            "process_registry",
            "knowledge",
            "sessions",
        ]


# ── KnowledgeStore.close() ───────────────────────────────────────────


class TestKnowledgeStoreClose:
    def test_close_closes_connection(self, tmp_path):
        store = KnowledgeStore(str(tmp_path / "test.db"))
        assert store.available
        store.close()
        assert not store.available

    def test_close_idempotent(self, tmp_path):
        store = KnowledgeStore(str(tmp_path / "test.db"))
        store.close()
        store.close()  # second call should not raise
        assert not store.available

    def test_close_with_no_connection(self):
        """Store that failed to init (no connection) still handles close()."""
        store = KnowledgeStore.__new__(KnowledgeStore)
        store._conn = None
        store._has_vec = False
        store._fts = None
        store.close()  # should not raise


# ── ProcessRegistry.shutdown() ────────────────────────────────────────


class TestProcessRegistryShutdown:
    @pytest.mark.asyncio
    async def test_shutdown_empty(self):
        registry = ProcessRegistry()
        killed = await registry.shutdown()
        assert killed == 0

    @pytest.mark.asyncio
    async def test_shutdown_kills_running_process(self):
        registry = ProcessRegistry()
        # Start a long-running process
        result = await registry.start("localhost", "sleep 60")
        assert "PID" in result

        # Verify it's tracked
        assert len(registry._processes) == 1
        pid = next(iter(registry._processes))
        assert registry._processes[pid].status == "running"

        killed = await registry.shutdown()
        assert killed == 1
        assert registry._processes[pid].status == "failed"

    @pytest.mark.asyncio
    async def test_shutdown_cancels_reader_tasks(self):
        registry = ProcessRegistry()
        result = await registry.start("localhost", "echo hello && sleep 0.1")
        pid = next(iter(registry._processes))
        info = registry._processes[pid]
        # Let the reader task start
        await asyncio.sleep(0.2)

        await registry.shutdown()

        # Reader task should be done or cancelled
        if info._reader_task:
            assert info._reader_task.done() or info._reader_task.cancelled()

    @pytest.mark.asyncio
    async def test_shutdown_skips_already_finished(self):
        registry = ProcessRegistry()
        result = await registry.start("localhost", "echo done")
        pid = next(iter(registry._processes))
        # Wait for it to finish naturally
        await asyncio.sleep(0.5)

        killed = await registry.shutdown()
        # Process already finished, so kill count should be 0
        assert killed == 0
