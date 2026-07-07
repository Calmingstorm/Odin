"""Coverage for src/web/api/schedules_api.py (RFC-006 P7).

Schedule CRUD + history + cron validation through the real aiohttp route layer
with a faked bot.scheduler. croniter is real (validate-cron is pure + fast).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api.schedules_api import register_schedules


def _bot():
    bot = MagicMock()
    sch = bot.scheduler
    sch.list_all.return_value = [{"id": "S1"}]
    sch.add = AsyncMock(return_value={"id": "S1", "description": "d"})
    sch.update = AsyncMock(return_value={"id": "S1"})
    sch.delete = AsyncMock(return_value=True)
    sch.run_now = AsyncMock(return_value={"status": "ran"})
    sch.reset_failures = AsyncMock(return_value={"id": "S1", "failures": 0})
    sch.history.query = AsyncMock(return_value=[{"run": 1}])
    sch.history.stats = AsyncMock(return_value={"total": 5})
    return bot


def _app(bot=None):
    routes = web.RouteTableDef()
    register_schedules(routes, bot or _bot())
    app = web.Application()
    app.router.add_routes(routes)
    return app


class TestListCreate:
    async def test_list(self):
        async with TestClient(TestServer(_app())) as c:
            assert (await (await c.get("/api/schedules")).json())[0]["id"] == "S1"

    async def test_create_validation(self):
        async with TestClient(TestServer(_app())) as c:
            assert (await c.post("/api/schedules", json={})).status == 400  # no desc/channel
            assert (await c.post("/api/schedules",
                                 json={"description": "x" * 6000, "channel_id": "1"})).status == 400

    async def test_create_success_and_error(self):
        bot = _bot()
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.post("/api/schedules", json={"description": "job", "channel_id": "1"})
            assert r.status == 201 and (await r.json())["id"] == "S1"
            bot.scheduler.add = AsyncMock(side_effect=ValueError("bad cron"))
            assert (await c.post("/api/schedules",
                                 json={"description": "j", "channel_id": "1"})).status == 400


class TestUpdate:
    async def test_validation(self):
        async with TestClient(TestServer(_app())) as c:
            assert (await c.put("/api/schedules/S1", data="bad")).status == 400
            assert (await c.put("/api/schedules/S1", json={})).status == 400  # empty
            assert (await c.put("/api/schedules/S1",
                                json={"description": "x" * 6000})).status == 400
            assert (await c.put("/api/schedules/S1",
                                json={"paused": "yes"})).status == 400  # not bool

    async def test_not_found_error_and_success(self):
        bot = _bot()
        async with TestClient(TestServer(_app(bot))) as c:
            r = await c.put("/api/schedules/S1", json={"description": "new"})
            assert r.status == 200
            bot.scheduler.update = AsyncMock(return_value=None)
            assert (await c.put("/api/schedules/S1", json={"paused": True})).status == 404
            bot.scheduler.update = AsyncMock(side_effect=TypeError("bad field"))
            assert (await c.put("/api/schedules/S1", json={"cron": "x"})).status == 400


class TestDeleteRunReset:
    async def test_delete(self):
        bot = _bot()
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.delete("/api/schedules/S1")).status == 200
            bot.scheduler.delete = AsyncMock(return_value=False)
            assert (await c.delete("/api/schedules/S1")).status == 404

    async def test_run_now(self):
        bot = _bot()
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/schedules/S1/run")).status == 200
            bot.scheduler.run_now = AsyncMock(side_effect=ValueError("schedule not found"))
            assert (await c.post("/api/schedules/S1/run")).status == 404
            bot.scheduler.run_now = AsyncMock(side_effect=ValueError("scheduler disabled"))
            assert (await c.post("/api/schedules/S1/run")).status == 503
            bot.scheduler.run_now = AsyncMock(side_effect=RuntimeError("boom"))
            assert (await c.post("/api/schedules/S1/run")).status == 500

    async def test_reset_failures(self):
        bot = _bot()
        async with TestClient(TestServer(_app(bot))) as c:
            assert (await c.post("/api/schedules/S1/reset-failures")).status == 200
            bot.scheduler.reset_failures = AsyncMock(return_value=None)
            assert (await c.post("/api/schedules/S1/reset-failures")).status == 404


class TestHistoryStats:
    async def test_history_and_stats(self):
        async with TestClient(TestServer(_app())) as c:
            assert (await (await c.get("/api/schedules/history?limit=10")).json())[0]["run"] == 1
            assert (await (await c.get(
                "/api/schedules/S1/history?status=ok")).json())[0]["run"] == 1
            assert (await (await c.get("/api/schedules/S1/stats")).json())["total"] == 5


class TestValidateCron:
    async def test_validate_cron(self):
        async with TestClient(TestServer(_app())) as c:
            assert (await c.post("/api/schedules/validate-cron", data="bad")).status == 400
            assert (await c.post("/api/schedules/validate-cron", json={})).status == 400  # no expr
            invalid = await (await c.post("/api/schedules/validate-cron",
                                          json={"expression": "not a cron"})).json()
            assert invalid["valid"] is False
            valid = await (await c.post("/api/schedules/validate-cron",
                                        json={"expression": "0 9 * * *"})).json()
            assert valid["valid"] is True and len(valid["next_runs"]) == 5
