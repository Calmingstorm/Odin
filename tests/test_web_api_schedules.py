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


class TestCronPreviewClock:
    """The preview must be computed on the SAME clock the scheduler fires on.

    next_runs used to come from a naive datetime.now() (server-local),
    serialized without an offset, while the real next_run comes from
    _cron_next_run in UTC. The browser then parsed the offset-less string as
    LOCAL time, so the preview an operator trusts before clicking Create was
    wrong by the server/browser offset.
    """

    async def test_next_runs_carry_an_explicit_utc_offset(self):
        from datetime import datetime

        app = _app()
        async with TestClient(TestServer(app)) as c:
            r = await c.post("/api/schedules/validate-cron", json={"expression": "0 9 * * *"})
            assert r.status == 200
            body = await r.json()

        assert body["valid"] is True
        assert body["next_runs"], "no preview times returned"
        for value in body["next_runs"]:
            parsed = datetime.fromisoformat(value)
            assert parsed.tzinfo is not None, f"offset-less timestamp: {value}"
            assert parsed.utcoffset().total_seconds() == 0, f"not UTC: {value}"

    async def test_preview_agrees_with_the_schedulers_own_computation(self):
        """Same expression, same clock: the preview's first entry must match
        what the scheduler would store as next_run."""
        from datetime import datetime

        from src.scheduler.scheduler import _cron_next_run

        app = _app()
        async with TestClient(TestServer(app)) as c:
            r = await c.post("/api/schedules/validate-cron", json={"expression": "*/30 * * * *"})
            body = await r.json()

        preview_first = datetime.fromisoformat(body["next_runs"][0])
        scheduler_next = datetime.fromisoformat(_cron_next_run("*/30 * * * *"))
        # Both anchor on "now", so allow a small window for clock movement
        # between the calls; the offset bug produced hours of skew.
        assert abs((preview_first - scheduler_next).total_seconds()) < 120


class TestCronTimezoneApiParity:
    @staticmethod
    def _real_app(tmp_path):
        from src.scheduler.scheduler import Scheduler

        bot = MagicMock()
        bot.scheduler = Scheduler(str(tmp_path / "schedules.json"))
        return _app(bot), bot.scheduler

    async def test_create_update_and_readback(self, tmp_path):
        app, scheduler = self._real_app(tmp_path)
        async with TestClient(TestServer(app)) as c:
            created = await c.post(
                "/api/schedules",
                json={
                    "description": "local morning",
                    "action": "reminder",
                    "channel_id": "1",
                    "cron": "0 9 * * *",
                    "cron_timezone": "America/New_York",
                    "message": "hello",
                },
            )
            assert created.status == 201
            schedule = await created.json()
            assert schedule["timezone"] == "America/New_York"

            listed = await (await c.get("/api/schedules")).json()
            assert listed[0]["timezone"] == "America/New_York"

            updated = await c.put(
                f"/api/schedules/{schedule['id']}",
                json={"cron_timezone": "Europe/London"},
            )
            assert updated.status == 200
            assert (await updated.json())["timezone"] == "Europe/London"

            reread = await (await c.get("/api/schedules")).json()
            assert reread[0]["timezone"] == "Europe/London"
            assert scheduler.list_all()[0]["timezone"] == "Europe/London"

    async def test_invalid_timezone_is_a_400_on_create_and_update(self, tmp_path):
        app, _scheduler = self._real_app(tmp_path)
        async with TestClient(TestServer(app)) as c:
            invalid_create = await c.post(
                "/api/schedules",
                json={
                    "description": "bad zone",
                    "action": "reminder",
                    "channel_id": "1",
                    "cron": "0 9 * * *",
                    "cron_timezone": "Not/A_Timezone",
                },
            )
            assert invalid_create.status == 400

            created = await c.post(
                "/api/schedules",
                json={
                    "description": "valid zone",
                    "action": "reminder",
                    "channel_id": "1",
                    "cron": "0 9 * * *",
                    "cron_timezone": "UTC",
                },
            )
            schedule_id = (await created.json())["id"]
            invalid_update = await c.put(
                f"/api/schedules/{schedule_id}",
                json={"cron_timezone": "Still/Not_A_Timezone"},
            )
            assert invalid_update.status == 400


class TestReportFormatApiParity:
    @staticmethod
    def _real_bot(tmp_path):
        from src.scheduler.scheduler import Scheduler

        bot = MagicMock()
        bot.scheduler = Scheduler(str(tmp_path / "schedules.json"))
        bot.scheduler.set_known_report_formats_provider(
            lambda: ("paginated_embed_v1",)
        )
        return bot

    async def test_create_update_and_readback(self, tmp_path):
        bot = self._real_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            created = await c.post("/api/schedules", json={
                "description": "structured", "action": "check", "channel_id": "1",
                "cron": "0 * * * *", "tool_name": "run_command",
                "tool_input": {"command": "status"},
                "report_format": "paginated_embed_v1",
            })
            assert created.status == 201
            schedule = await created.json()
            assert schedule["report_format"] == "paginated_embed_v1"
            listed = await (await c.get("/api/schedules")).json()
            assert listed[0]["report_format"] == "paginated_embed_v1"
            cleared = await c.put(
                f"/api/schedules/{schedule['id']}", json={"report_format": ""})
            assert cleared.status == 200
            assert "report_format" not in await cleared.json()

    async def test_invalid_type_and_non_check_use_return_400(self, tmp_path):
        bot = self._real_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            invalid_type = await c.post("/api/schedules", json={
                "description": "structured", "action": "check", "channel_id": "1",
                "cron": "0 * * * *", "tool_name": "run_command",
                "report_format": {"junk": True},
            })
            assert invalid_type.status == 400
            invalid_action = await c.post("/api/schedules", json={
                "description": "reminder", "action": "reminder", "channel_id": "1",
                "cron": "0 * * * *", "report_format": "paginated_embed_v1",
            })
            assert invalid_action.status == 400

    async def test_unknown_format_is_400_on_create_and_update(self, tmp_path):
        bot = self._real_bot(tmp_path)
        async with TestClient(TestServer(_app(bot))) as c:
            unknown_create = await c.post("/api/schedules", json={
                "description": "structured", "action": "check", "channel_id": "1",
                "cron": "0 * * * *", "tool_name": "run_command",
                "tool_input": {"command": "status"},
                "report_format": "paginated_embed_v2",
            })
            assert unknown_create.status == 400
            assert "Unsupported scheduled report format" in (
                await unknown_create.json()
            )["error"]

            created = await c.post("/api/schedules", json={
                "description": "plain", "action": "check", "channel_id": "1",
                "cron": "0 * * * *", "tool_name": "run_command",
                "tool_input": {"command": "status"},
            })
            schedule_id = (await created.json())["id"]
            unknown_update = await c.put(
                f"/api/schedules/{schedule_id}",
                json={"report_format": "paginated_embed_v2"},
            )
            assert unknown_update.status == 400
            assert "Unsupported scheduled report format" in (
                await unknown_update.json()
            )["error"]
            assert "report_format" not in bot.scheduler.list_all()[0]
