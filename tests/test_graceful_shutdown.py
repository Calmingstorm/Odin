"""Tests for graceful shutdown behaviour.

Validates that OdinBot.close() shuts down all attached components in order,
that KnowledgeStore.close() cleans up SQLite, and that
ProcessRegistry.shutdown() terminates running processes.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import src.tools.process_manager as pm
from src.config.schema import Config
from src.discord.client import OdinBot
from src.knowledge.store import KnowledgeStore
from src.tools.process_manager import ProcessInfo, ProcessRegistry

# ── OdinBot.close() ──────────────────────────────────────────────────


def _make_bot() -> OdinBot:
    """Create an OdinBot with the executor-shape pydantic Config."""
    config = Config(discord={"token": "test-token"})
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
        # close() now uses shutdown() (cancels AND awaits loop tasks) rather
        # than stop_loop("all"), which only set cancel events and left tasks
        # pending at process exit.
        bot.loop_manager.shutdown = AsyncMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.loop_manager.shutdown.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_stops_scheduler(self):
        bot = _make_bot()
        bot.scheduler = AsyncMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.scheduler.stop.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_stops_health_server(self):
        bot = _make_bot()
        bot.health_server = AsyncMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.health_server.stop.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_shuts_down_process_registry(self):
        # The registry is created lazily ON the executor
        # (ToolExecutor._ensure_process_registry) — teardown must read that
        # seam. The old `bot.process_registry` attribute never existed
        # anywhere, so manage_process children leaked past shutdown (and an
        # in-place restart would carry them into the new image).
        bot = _make_bot()
        bot.tool_executor._process_registry = AsyncMock()
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        bot.tool_executor._process_registry.shutdown.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_close_does_not_create_unused_process_registry(self):
        # Reading the lazy seam must never instantiate a registry that no
        # tool ever used.
        bot = _make_bot()
        assert not hasattr(bot.tool_executor, "_process_registry")
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()
        assert not hasattr(bot.tool_executor, "_process_registry")

    @pytest.mark.asyncio
    async def test_close_tolerates_missing_tool_executor(self):
        bot = _make_bot()
        bot.tool_executor = None
        with patch.object(type(bot).__bases__[0], "close", new_callable=AsyncMock):
            await bot.close()

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
        bot.loop_manager.shutdown = AsyncMock(side_effect=RuntimeError("boom"))
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
        bot.loop_manager.shutdown = AsyncMock(
            side_effect=lambda: call_order.append("loop_manager")
        )
        bot.scheduler = AsyncMock()
        bot.scheduler.stop = AsyncMock(
            side_effect=lambda: call_order.append("scheduler")
        )
        bot.health_server = AsyncMock()
        bot.health_server.stop = AsyncMock(
            side_effect=lambda: call_order.append("health_server")
        )
        bot.tool_executor._process_registry = AsyncMock()
        bot.tool_executor._process_registry.shutdown = AsyncMock(
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
        await registry.start("localhost", "echo hello && sleep 0.1")
        pid = next(iter(registry._processes))
        info = registry._processes[pid]
        # Let the reader task start
        await asyncio.sleep(0.2)

        await registry.shutdown()

        # Reader task should be done or cancelled
        if info._reader_task:
            assert info._reader_task.done() or info._reader_task.cancelled()

    @pytest.mark.asyncio
    async def test_shutdown_services_closes_image_backend(self):
        # shutdown_services must close the native image backend's own HTTP
        # session (separate transport from the codex chat client) and tolerate
        # its errors. Only `components` is set, so every other getattr-guarded
        # block short-circuits to None.
        from types import SimpleNamespace

        from src.discord.wiring import shutdown_services

        backend = SimpleNamespace(close=AsyncMock(side_effect=RuntimeError("boom")))
        bot = SimpleNamespace(
            components=SimpleNamespace(
                media_tools=SimpleNamespace(image_selector=SimpleNamespace(openai=backend))
            )
        )
        await shutdown_services(bot)  # must not raise despite close() erroring
        backend.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_shutdown_skips_already_finished(self):
        registry = ProcessRegistry()
        await registry.start("localhost", "echo done")
        next(iter(registry._processes))
        # Wait for it to finish naturally
        await asyncio.sleep(0.5)

        killed = await registry.shutdown()
        # Process already finished, so kill count should be 0
        assert killed == 0

    @pytest.mark.asyncio
    async def test_shutdown_skips_done_or_absent_reader_task(self):
        # A record whose reaper already finished (or was never started) is
        # simply skipped in the await-reapers pass — no error.
        registry = ProcessRegistry()

        done = asyncio.create_task(asyncio.sleep(0))
        await done
        info_done = ProcessInfo(
            pid=1, command="x", host="localhost", start_time=time.time(),
            status="completed",
        )
        info_done._reader_task = done
        info_none = ProcessInfo(
            pid=2, command="x", host="localhost", start_time=time.time(),
            status="completed",
        )
        info_none._reader_task = None
        registry._processes[1] = info_done
        registry._processes[2] = info_none

        assert await registry.shutdown() == 0  # nothing to do, no raise

    @pytest.mark.asyncio
    async def test_shutdown_cancels_wedged_reaper_after_timeout(self, monkeypatch):
        # A reaper that never finishes must not hang the in-place exec: after
        # SHUTDOWN_REAP_TIMEOUT it is cancelled so shutdown can return.
        monkeypatch.setattr(pm, "SHUTDOWN_REAP_TIMEOUT", 0.05)
        registry = ProcessRegistry()

        async def wedged():
            await asyncio.sleep(30)

        info = ProcessInfo(
            pid=3, command="x", host="localhost", start_time=time.time(),
            status="completed",
        )
        info._reader_task = asyncio.create_task(wedged())
        registry._processes[3] = info

        await registry.shutdown()

        with pytest.raises(asyncio.CancelledError):
            await info._reader_task

    @pytest.mark.asyncio
    async def test_shutdown_tolerates_reaper_that_raises(self):
        # A reaper that errors during shutdown is logged and swallowed — one
        # bad record must not abort cleanup of the rest or block re-exec.
        registry = ProcessRegistry()

        async def boom():
            raise RuntimeError("reaper blew up")

        info = ProcessInfo(
            pid=4, command="x", host="localhost", start_time=time.time(),
            status="completed",
        )
        info._reader_task = asyncio.create_task(boom())
        registry._processes[4] = info

        await registry.shutdown()  # must not propagate
