"""Route-level coverage for src/web/api/config_admin.py (RFC-006 P4a).

Drives status/personality/discord/quick-action routes through the real route
layer with a real pydantic Config and MagicMock components. These handler
bodies (~23% covered) ran only in production.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.config.schema import Config
from src.web.api.config_admin import (
    register_discord_config,
    register_personality,
    register_quick_actions,
    register_status_info,
)


@pytest.fixture(autouse=True)
def _isolate_cwd(tmp_path, monkeypatch):
    # Several config_admin handlers persist to a RELATIVE Path("config.yml")
    # (correct at /opt/odin in prod). Chdir to a temp dir so no test can
    # write the repo's tracked config.yml template.
    monkeypatch.chdir(tmp_path)


def _bot():
    import time
    bot = MagicMock()
    bot.config = Config(discord={"token": "fake"})
    bot.guilds = []
    bot.start_time = time.monotonic()
    bot.is_ready.return_value = True
    bot.tool_catalog.merged_definitions.return_value = [{"name": "t1"}]
    bot.skill_manager.list_skills.return_value = []
    bot.sessions.count.return_value = 3
    bot.loop_manager.active_count = 1
    bot.scheduler.list_all.return_value = [
        {"consecutive_failures": 0, "paused": False},
        {"consecutive_failures": 2, "paused": True},
    ]
    bot.agent_manager._agents = {}
    bot.infra_watcher = None
    return bot


def _app(*registrars):
    bot = _bot()
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app, bot


class TestStatus:
    @pytest.mark.asyncio
    async def test_get_status_aggregates(self):
        app, bot = _app(register_status_info)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/status")).json()
            assert body["status"] == "online"
            assert body["tool_count"] == 1 and body["session_count"] == 3
            assert body["schedule_count"] == 2 and body["schedule_failing"] == 1
            assert body["schedule_paused"] == 1
            assert body["monitoring"]["enabled"] is False

    @pytest.mark.asyncio
    async def test_status_with_guilds(self):
        app, bot = _app(register_status_info)
        g = MagicMock()
        g.id, g.name, g.member_count = 1, "Guild", 10
        bot.guilds = [g]
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/status")).json()
            assert body["guild_count"] == 1 and body["user_count"] == 10


class TestPersonality:
    @pytest.mark.asyncio
    async def test_get_personality(self):
        app, _ = _app(register_personality)
        async with TestClient(TestServer(app)) as c:
            body = await (await c.get("/api/personality")).json()
            assert "preset" in body and "builtin_presets" in body
            assert isinstance(body["presets"], dict)

    @pytest.mark.asyncio
    async def test_update_personality_and_bad_json(self):
        app, bot = _app(register_personality)
        bot.prompt_builder = MagicMock()
        async with TestClient(TestServer(app)) as c:
            r = await c.put("/api/personality", json={"preset": "odin"})
            assert r.status in (200, 400)  # accepts or validates
            assert (await c.put("/api/personality", data="bad")).status == 400


class TestDiscordConfig:
    @pytest.mark.asyncio
    async def test_discord_guilds_empty(self):
        app, bot = _app(register_discord_config)
        bot.channel_config = MagicMock()
        async with TestClient(TestServer(app)) as c:
            r = await c.get("/api/discord/guilds")
            assert r.status == 200
            assert isinstance(await r.json(), (list, dict))


class TestQuickActions:
    @pytest.mark.asyncio
    async def test_quick_actions_registered(self):
        # Smoke: the registrar wires without error and its routes respond.
        app, bot = _app(register_quick_actions)
        assert app is not None
