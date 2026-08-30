"""Pins for the shutdown-hang fix (found 2026-07-16).

An open ``/api/ws`` WebSocket held ``AppRunner.cleanup()`` (60s default
handler grace) past systemd's stop window (Mint's
``DefaultTimeoutStopSec=10s``), so every ``systemctl stop`` with a WebUI
tab open was SIGKILLed after "shutdown complete" — bypassing the
``__main__`` loop-drain — and the self-update re-exec path could wedge the
same way with no watchdog at all.

Three surfaces:
- ``WebSocketManager.close_all()``: concurrent, per-client-bounded closes;
  subscriber sets cleared in guaranteed cleanup.
- ``setup_websocket``: registers ``close_all`` as an ``app.on_shutdown``
  hook so cleanup closes sockets after the listener stops accepting (no
  reconnect race).
- ``HealthServer``: bounded runner shutdown; ``stop()`` quiesces the HTTP
  server independently of the Slack notifier.

Plus the integration artifact: a real server with a live WebSocket stops
promptly and the client sees the close.
"""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import aiohttp
import pytest
from aiohttp import WSCloseCode

from src.config.schema import WebhookConfig
from src.health.server import HealthServer
from src.web.websocket import WebSocketManager, setup_websocket

# ---------------------------------------------------------------------------
# close_all
# ---------------------------------------------------------------------------


class _FakeWS:
    def __init__(self, *, close_exc=None, hang=False):
        self.closed_with = None
        self._close_exc = close_exc
        self._hang = hang

    async def close(self, *, code=None, message=b""):
        if self._hang:
            await asyncio.sleep(30)
        if self._close_exc is not None:
            raise self._close_exc
        self.closed_with = code
        return True


def _manager_with(clients):
    manager = WebSocketManager(SimpleNamespace())
    for ws in clients:
        manager._clients.add(ws)
        manager._log_subscribers.add(ws)
        manager._event_subscribers.add(ws)
    return manager


class TestCloseAll:
    async def test_closes_every_client_going_away_and_clears_sets(self):
        clients = [_FakeWS(), _FakeWS(), _FakeWS()]
        manager = _manager_with(clients)
        closed = await manager.close_all()
        assert closed == 3
        assert all(ws.closed_with == WSCloseCode.GOING_AWAY for ws in clients)
        assert not manager._clients
        assert not manager._log_subscribers
        assert not manager._event_subscribers

    async def test_raising_close_does_not_stop_the_others(self):
        good = _FakeWS()
        bad = _FakeWS(close_exc=RuntimeError("peer gone"))
        manager = _manager_with([good, bad])
        closed = await manager.close_all()
        assert closed == 2
        assert good.closed_with == WSCloseCode.GOING_AWAY
        assert not manager._clients

    async def test_hanging_close_is_bounded_and_concurrent(self):
        # Two hung peer handshakes: serial unbounded closes would take
        # 60s (2 x ws.close()'s own 10s default, or worse); concurrent
        # 1s-bounded closes finish together well under 2s.
        manager = _manager_with([_FakeWS(hang=True), _FakeWS(hang=True)])
        start = time.monotonic()
        closed = await manager.close_all()
        elapsed = time.monotonic() - start
        assert closed == 2
        assert elapsed < 2.0
        assert not manager._clients

    async def test_sets_cleared_even_when_every_close_fails(self):
        manager = _manager_with([_FakeWS(close_exc=OSError("boom"))])
        await manager.close_all()
        assert not manager._clients
        assert not manager._log_subscribers
        assert not manager._event_subscribers

    async def test_no_clients_is_a_quiet_noop(self):
        manager = _manager_with([])
        assert await manager.close_all() == 0

    async def test_session_expiry_watchers_are_cancelled_and_awaited(self):
        manager = _manager_with([])
        started = asyncio.Event()
        retired = asyncio.Event()

        async def watcher():
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                retired.set()

        task = asyncio.create_task(watcher())
        await started.wait()
        manager._session_expiry_tasks["sid"] = task
        assert await manager.close_all() == 0
        assert retired.is_set()
        assert task.done()
        assert manager._session_expiry_tasks == {}

    async def test_outer_cancellation_propagates_and_still_clears(self):
        manager = _manager_with([_FakeWS(hang=True)])
        task = asyncio.create_task(manager.close_all())
        await asyncio.sleep(0.05)  # let it reach the close await
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not manager._clients
        assert not manager._log_subscribers


# ---------------------------------------------------------------------------
# setup_websocket registers the shutdown hook
# ---------------------------------------------------------------------------


class TestShutdownHookRegistration:
    async def test_on_shutdown_hook_closes_clients(self):
        app = aiohttp.web.Application()
        manager = setup_websocket(app, SimpleNamespace())
        ws = _FakeWS()
        manager._clients.add(ws)
        assert len(app.on_shutdown) == 1
        await app.on_shutdown[0](app)
        assert ws.closed_with == WSCloseCode.GOING_AWAY
        assert not manager._clients


# ---------------------------------------------------------------------------
# HealthServer.stop() isolation
# ---------------------------------------------------------------------------


def _bare_server():
    return HealthServer(port=0, webhook_config=WebhookConfig(enabled=False))


class _Recorder:
    def __init__(self, exc=None):
        self.called = False
        self._exc = exc

    async def __call__(self):
        self.called = True
        if self._exc is not None:
            raise self._exc


class TestStopIsolation:
    async def test_slack_close_failure_cannot_skip_runner_cleanup(self):
        server = _bare_server()
        cleanup = _Recorder()
        slack_close = _Recorder(exc=RuntimeError("slack down"))
        server._runner = SimpleNamespace(cleanup=cleanup)
        server._slack_notifier = SimpleNamespace(close=slack_close)
        await server.stop()  # must not raise
        assert cleanup.called
        assert slack_close.called

    async def test_runner_cleanup_failure_still_closes_slack(self):
        server = _bare_server()
        cleanup = _Recorder(exc=RuntimeError("cleanup boom"))
        slack_close = _Recorder()
        server._runner = SimpleNamespace(cleanup=cleanup)
        server._slack_notifier = SimpleNamespace(close=slack_close)
        with pytest.raises(RuntimeError, match="cleanup boom"):
            await server.stop()
        assert slack_close.called

    async def test_runner_gets_bounded_shutdown_timeout(self):
        server = _bare_server()
        await server.start()
        try:
            assert server._runner is not None
            # aiohttp keeps the ctor arg private; this pins that start()
            # actually passes the bound (the integration test below proves
            # the resulting behavior).
            assert server._runner._shutdown_timeout == 3.0
        finally:
            await server.stop()


# ---------------------------------------------------------------------------
# The integration artifact: a live WebSocket cannot hold stop() hostage
# ---------------------------------------------------------------------------


class TestLiveShutdown:
    async def test_stop_closes_live_websocket_and_completes_promptly(self):
        server = _bare_server()
        setup_websocket(server._app, SimpleNamespace(), api_token="")
        await server.start()
        assert server._runner is not None
        port = next(
            addr[1] for addr in server._runner.addresses if isinstance(addr, tuple)
        )
        session = aiohttp.ClientSession()
        try:
            ws = await session.ws_connect(f"http://127.0.0.1:{port}/api/ws")
            start = time.monotonic()
            stop_task = asyncio.create_task(server.stop())
            msg = await ws.receive(timeout=5)
            await asyncio.wait_for(stop_task, timeout=5)
            elapsed = time.monotonic() - start
            assert msg.type in (
                aiohttp.WSMsgType.CLOSE,
                aiohttp.WSMsgType.CLOSING,
                aiohttp.WSMsgType.CLOSED,
            )
            if msg.type == aiohttp.WSMsgType.CLOSE:
                assert ws.close_code == WSCloseCode.GOING_AWAY
            assert elapsed < 5.0
            await ws.close()
        finally:
            await session.close()
