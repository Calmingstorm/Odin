from types import SimpleNamespace

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.llm.context_compressor import CompressionStats, PrefixTracker
from src.web.api.observability import register_compression_stats


@pytest.mark.asyncio
async def test_compression_api_distinguishes_unmeasured_local_and_upstream_cache():
    stats = CompressionStats()
    routes = web.RouteTableDef()
    register_compression_stats(routes, SimpleNamespace(compression_stats=stats))
    app = web.Application()
    app.router.add_routes(routes)
    async with TestClient(TestServer(app)) as client:
        data = await (await client.get("/api/compression/stats")).json()
        assert data["prefix_hit_rate"] is None
        assert data["prefix_measurement"] == "unmeasured"
        assert data["upstream_cache_measured"] is False
        tracker = PrefixTracker(stats)
        assert not tracker.check("system", [])
        assert tracker.check("system", [])
        data = await (await client.get("/api/compression/stats")).json()
        assert data["prefix_measurement"] == "local_prefix_equality"
        assert data["prefix_hit_rate"] == 0.5
        assert data["upstream_cache_measured"] is False
