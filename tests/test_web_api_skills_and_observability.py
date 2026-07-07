"""Route coverage for skills_api + observability (RFC-006 P4b).

Drives the skill-CRUD and observability routes through the real aiohttp
route layer over a REAL SkillManager and AuditLogger where practical.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.audit.logger import AuditLogger
from src.config.schema import Config
from src.tools.skill_manager import SkillManager
from src.web.api.observability import (
    register_audit_log,
    register_tools_meta,
)
from src.web.api.skills_api import register_skills


def _skill_code(name="demo"):
    defn = {"name": name, "description": "d",
            "input_schema": {"type": "object", "properties": {}}}
    return (f"SKILL_DEFINITION = {defn!r}\n\n"
            "async def execute(inp, context):\n    return 'ok'\n")


@pytest.fixture(autouse=True)
def _cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)


def _app(*registrars, bot):
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


class TestSkillsRoutes:
    def _bot(self, tmp_path):
        bot = MagicMock()
        bot.skill_manager = SkillManager(str(tmp_path / "skills"),
                                         tool_executor=MagicMock())
        bot.audit.count_by_tool = AsyncMock(return_value={})
        return bot

    @pytest.mark.asyncio
    async def test_list_create_get_delete(self, tmp_path):
        bot = self._bot(tmp_path)
        async with TestClient(TestServer(_app(register_skills, bot=bot))) as c:
            assert (await c.get("/api/skills")).status == 200
            r = await c.post("/api/skills",
                             json={"name": "demo", "code": _skill_code("demo")})
            assert r.status in (200, 201)
            assert bot.skill_manager.has_skill("demo")
            assert (await c.get("/api/skills/demo")).status == 200
            assert (await c.delete("/api/skills/demo")).status == 200

    @pytest.mark.asyncio
    async def test_enable_disable_and_config(self, tmp_path):
        bot = self._bot(tmp_path)
        bot.skill_manager.create_skill("demo", _skill_code("demo"))
        async with TestClient(TestServer(_app(register_skills, bot=bot))) as c:
            assert (await c.post("/api/skills/demo/disable")).status == 200
            assert (await c.post("/api/skills/demo/enable")).status == 200
            assert (await c.get("/api/skills/demo/config")).status == 200

    @pytest.mark.asyncio
    async def test_validate_route(self, tmp_path):
        bot = self._bot(tmp_path)
        async with TestClient(TestServer(_app(register_skills, bot=bot))) as c:
            r = await c.post("/api/skills/validate", json={"code": _skill_code("x")})
            assert r.status == 200
            assert (await r.json())["valid"] is True

    @pytest.mark.asyncio
    async def test_get_missing_skill(self, tmp_path):
        bot = self._bot(tmp_path)
        async with TestClient(TestServer(_app(register_skills, bot=bot))) as c:
            assert (await c.get("/api/skills/ghost")).status == 404


class TestObservabilityRoutes:
    def _bot(self, tmp_path, signed=True):
        bot = MagicMock()
        bot.config = Config(discord={"token": "fake"})
        key = "k" if signed else ""
        bot.audit = AuditLogger(path=str(tmp_path / "audit.jsonl"), hmac_key=key)
        bot.tool_catalog.merged_definitions.return_value = [
            {"name": "run_command", "description": "run"}]
        bot.config.tools.audit_log_path = str(tmp_path / "audit.jsonl")
        return bot

    @pytest.mark.asyncio
    async def test_tools_list_and_stats(self, tmp_path):
        bot = self._bot(tmp_path)
        bot.audit.count_by_tool = AsyncMock(return_value={})
        async with TestClient(TestServer(_app(register_tools_meta, bot=bot))) as c:
            body = await (await c.get("/api/tools")).json()
            assert isinstance(body, list) and any(t["name"] == "run_command" for t in body)

    @pytest.mark.asyncio
    async def test_audit_query_and_verify(self, tmp_path):
        bot = self._bot(tmp_path, signed=True)
        await bot.audit.log_execution(
            user_id="u", user_name="U", channel_id="c", tool_name="run_command",
            tool_input={}, approved=True, result_summary="ok", execution_time_ms=1)
        async with TestClient(TestServer(_app(register_audit_log, bot=bot))) as c:
            assert (await c.get("/api/audit")).status == 200
            r = await c.get("/api/audit/verify")
            assert r.status == 200 and (await r.json())["valid"] is True

    @pytest.mark.asyncio
    async def test_audit_verify_unsigned_409(self, tmp_path):
        bot = self._bot(tmp_path, signed=False)
        async with TestClient(TestServer(_app(register_audit_log, bot=bot))) as c:
            assert (await c.get("/api/audit/verify")).status == 409
