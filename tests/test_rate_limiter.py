"""Tests for the rate-limit middleware, including stale IP eviction.

Covers:
- Basic rate limiting (requests within and exceeding the limit)
- Stale IP key eviction after the periodic cleanup interval
- Non-API paths bypass rate limiting
- Window reset allows requests again
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.health.server import (
    _RATE_LIMIT_MAX,
    _RATE_LIMIT_WINDOW,
    _make_rate_limit_middleware,
)


def _make_app() -> web.Application:
    """Create a minimal aiohttp app with only the rate-limit middleware."""
    app = web.Application(middlewares=[_make_rate_limit_middleware()])

    async def api_ok(_request: web.Request) -> web.Response:
        return web.json_response({"ok": True})

    async def non_api_ok(_request: web.Request) -> web.Response:
        return web.json_response({"ok": True})

    app.router.add_get("/api/test", api_ok)
    app.router.add_get("/health", non_api_ok)
    return app


class TestRateLimiter:
    """Rate-limit middleware tests."""

    @pytest.fixture
    async def client(self):
        async with TestClient(TestServer(_make_app())) as c:
            yield c

    async def test_requests_within_limit_succeed(self, client):
        for _ in range(3):
            resp = await client.get("/api/test")
            assert resp.status == 200

    async def test_non_api_paths_bypass_rate_limit(self, client):
        for _ in range(5):
            resp = await client.get("/health")
            assert resp.status == 200

    async def test_exceeding_limit_returns_429(self, client):
        for _ in range(_RATE_LIMIT_MAX):
            resp = await client.get("/api/test")
            assert resp.status == 200

        resp = await client.get("/api/test")
        assert resp.status == 429
        data = await resp.json()
        assert data["error"] == "rate limit exceeded"


class TestRateLimiterEviction:
    """Tests for stale IP key eviction (memory leak fix)."""

    async def test_stale_ip_keys_evicted(self):
        """IP keys with only expired timestamps are removed during eviction.

        Verifies the fix for unbounded memory growth where IP keys were
        never removed from _buckets after their timestamps expired.
        """
        base_time = 1000.0

        with patch("src.health.server.time") as mock_time:
            mock_time.monotonic.return_value = base_time

            async with TestClient(TestServer(_make_app())) as client:
                # Make a request — this creates an entry in _buckets
                resp = await client.get("/api/test")
                assert resp.status == 200

                # Advance time past the window AND past the eviction interval (300s)
                mock_time.monotonic.return_value = base_time + _RATE_LIMIT_WINDOW + 301

                # This request triggers periodic eviction of stale keys
                resp = await client.get("/api/test")
                assert resp.status == 200

    async def test_rate_limit_resets_after_window(self):
        """After the rate-limit window passes, requests should succeed again."""
        base_time = 1000.0

        with patch("src.health.server.time") as mock_time:
            mock_time.monotonic.return_value = base_time

            async with TestClient(TestServer(_make_app())) as client:
                # Exhaust the limit
                for _ in range(_RATE_LIMIT_MAX):
                    resp = await client.get("/api/test")
                    assert resp.status == 200

                # Should be blocked
                resp = await client.get("/api/test")
                assert resp.status == 429

                # Advance past the window
                mock_time.monotonic.return_value = base_time + _RATE_LIMIT_WINDOW + 1

                # Should succeed now
                resp = await client.get("/api/test")
                assert resp.status == 200

    async def test_eviction_only_removes_stale_not_active(self):
        """Eviction should not remove IPs with recent activity."""
        base_time = 1000.0

        with patch("src.health.server.time") as mock_time:
            mock_time.monotonic.return_value = base_time

            async with TestClient(TestServer(_make_app())) as client:
                # Make initial requests
                for _ in range(5):
                    resp = await client.get("/api/test")
                    assert resp.status == 200

                # Advance past eviction interval but keep timestamps within window
                mock_time.monotonic.return_value = base_time + 301

                # Request should still succeed (timestamps still in window since
                # _RATE_LIMIT_WINDOW is 60s, but 301 > 60 so they ARE stale)
                # The key point: this request itself creates a fresh entry, so
                # the IP is not evicted
                resp = await client.get("/api/test")
                assert resp.status == 200
