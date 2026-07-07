"""Route coverage for web/api/agents_loops.py (RFC-006 P4-continuation, CONT-1).

Drives the loop / agent / process admin routes through the real aiohttp route
layer. Runtime boundaries (loop_manager.start_loop, agent_manager.kill,
process_registry.kill) are faked — per review, we validate request parsing,
delegation, and response shaping, not real loop/process startup.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web.api.agents_loops import register_agents, register_loops, register_processes


def _app(*registrars, bot):
    routes = web.RouteTableDef()
    for reg in registrars:
        reg(routes, bot)
    app = web.Application()
    app.router.add_routes(routes)
    return app


def _bare_bot():
    """A bot with no agent/process managers — exercises the defensive fallbacks."""
    return type("B", (), {})()


def _loop_info(**kw):
    base = dict(goal="watch X", mode="notify", interval_seconds=60,
                stop_condition=None, max_iterations=50, channel_id="c1",
                requester_id="web-api", requester_name="Web API",
                iteration_count=2, last_trigger=1.0, created_at=1.0,
                status="running", _iteration_history=[{"n": 1}, {"n": 2}])
    base.update(kw)
    return SimpleNamespace(**base)


def _agent_info(**kw):
    base = dict(label="worker", goal="do it", status="running",
                state=SimpleNamespace(value="running"), channel_id="c1",
                requester_name="U", iteration_count=1, tools_used=["grep"],
                created_at=1.0, ended_at=None, result="", error="",
                recovery_attempts=0, depth=0, parent_id=None, children_ids=[],
                _sm=SimpleNamespace(history_as_dicts=lambda: []))
    base.update(kw)
    return SimpleNamespace(**base)


class TestLoops:
    @pytest.mark.asyncio
    async def test_list_loops(self):
        bot = MagicMock()
        bot.loop_manager._loops = {"L1": _loop_info()}
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            body = await (await c.get("/api/loops")).json()
            assert body[0]["id"] == "L1" and body[0]["goal"] == "watch X"
            assert len(body[0]["iteration_history"]) == 2

    @pytest.mark.asyncio
    async def test_start_loop_validation(self):
        bot = MagicMock()
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            assert (await c.post("/api/loops", json={})).status == 400  # no goal
            assert (await c.post("/api/loops",
                                 json={"goal": "g"})).status == 400  # no channel_id

    @pytest.mark.asyncio
    async def test_start_loop_channel_not_found(self):
        bot = MagicMock()
        bot.get_channel.return_value = None
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            r = await c.post("/api/loops", json={"goal": "g", "channel_id": "999"})
            assert r.status == 404

    @pytest.mark.asyncio
    async def test_start_loop_goal_too_long(self):
        bot = MagicMock()
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            r = await c.post("/api/loops", json={"goal": "g" * 5000, "channel_id": "1"})
            assert r.status == 400

    @pytest.mark.asyncio
    async def test_start_loop_non_numeric_channel(self):
        bot = MagicMock()
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            # int("abc") raises → channel resolves to None → 404
            r = await c.post("/api/loops", json={"goal": "g", "channel_id": "abc"})
            assert r.status == 404

    @pytest.mark.asyncio
    async def test_start_loop_success(self):
        bot = MagicMock()
        bot.get_channel.return_value = MagicMock()
        bot.loop_manager.start_loop.return_value = "loop-123"
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            r = await c.post("/api/loops", json={"goal": "watch", "channel_id": "1"})
            assert r.status == 201 and (await r.json())["loop_id"] == "loop-123"

    @pytest.mark.asyncio
    async def test_start_loop_manager_error(self):
        bot = MagicMock()
        bot.get_channel.return_value = MagicMock()
        bot.loop_manager.start_loop.return_value = "Error: too many loops"
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            assert (await c.post("/api/loops",
                                 json={"goal": "g", "channel_id": "1"})).status == 400

    @pytest.mark.asyncio
    async def test_stop_loop_found_and_missing(self):
        bot = MagicMock()
        bot.loop_manager.stop_loop.side_effect = ["Stopped loop.", "Loop not found."]
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            assert (await c.delete("/api/loops/L1")).status == 200
            assert (await c.delete("/api/loops/L1")).status == 404

    @pytest.mark.asyncio
    async def test_restart_missing_loop(self):
        bot = MagicMock()
        bot.loop_manager._loops = {}
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            assert (await c.post("/api/loops/ghost/restart")).status == 404

    @pytest.mark.asyncio
    async def test_restart_success(self):
        bot = MagicMock()
        bot.loop_manager._loops = {"L1": _loop_info(status="running", channel_id="123")}
        bot.get_channel.return_value = MagicMock()
        bot.loop_manager.start_loop.return_value = "loop-new"
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            r = await c.post("/api/loops/L1/restart")
            assert r.status == 201
            body = await r.json()
            assert body["old_id"] == "L1" and body["new_id"] == "loop-new"
            bot.loop_manager.stop_loop.assert_called_once_with("L1")  # stopped first

    @pytest.mark.asyncio
    async def test_restart_channel_gone(self):
        bot = MagicMock()
        bot.loop_manager._loops = {"L1": _loop_info(status="stopped")}
        bot.get_channel.return_value = None
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            assert (await c.post("/api/loops/L1/restart")).status == 404

    @pytest.mark.asyncio
    async def test_restart_manager_error(self):
        bot = MagicMock()
        bot.loop_manager._loops = {"L1": _loop_info(status="running", channel_id="123")}
        bot.get_channel.return_value = MagicMock()
        bot.loop_manager.start_loop.return_value = "Error: too many loops"
        async with TestClient(TestServer(_app(register_loops, bot=bot))) as c:
            assert (await c.post("/api/loops/L1/restart")).status == 400


class TestAgents:
    @pytest.mark.asyncio
    async def test_list_agents(self):
        bot = MagicMock()
        bot.agent_manager._agents = {"A1": _agent_info()}
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            body = await (await c.get("/api/agents")).json()
            assert body[0]["id"] == "A1" and body[0]["label"] == "worker"
            assert body[0]["state"] == "running"

    @pytest.mark.asyncio
    async def test_list_agents_no_manager(self):
        bot = MagicMock()
        bot.agent_manager._agents = "not-a-dict"
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            assert await (await c.get("/api/agents")).json() == []

    @pytest.mark.asyncio
    async def test_kill_agent_found_and_missing(self):
        bot = MagicMock()
        bot.agent_manager._agents = {"A1": _agent_info()}
        bot.agent_manager.kill.side_effect = ["Killed agent.", "Agent not found."]
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            assert (await c.delete("/api/agents/A1")).status == 200
            assert (await c.delete("/api/agents/A1")).status == 404

    @pytest.mark.asyncio
    async def test_children_lineage_descendants(self):
        bot = MagicMock()
        bot.agent_manager.get_children.return_value = [{"id": "c"}]
        bot.agent_manager.get_lineage.return_value = ["root", "A1"]
        bot.agent_manager.get_descendants.return_value = ["A2"]
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            children = await (await c.get("/api/agents/A1/children")).json()
            lineage = await (await c.get("/api/agents/A1/lineage")).json()
            descendants = await (await c.get("/api/agents/A1/descendants")).json()
            assert children[0]["id"] == "c"
            assert lineage["lineage"] == ["root", "A1"]
            assert descendants["descendants"] == ["A2"]

    @pytest.mark.asyncio
    async def test_kill_agent_non_dict_registry(self):
        bot = MagicMock()
        bot.agent_manager._agents = "not-a-dict"  # raise-AttributeError guard → 404
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            assert (await c.delete("/api/agents/A1")).status == 404

    @pytest.mark.asyncio
    async def test_no_agent_manager_fallbacks(self):
        # A bot with no agent_manager attribute at all exercises the defensive
        # AttributeError guards: list → [], kill → 404, tree routes → 503.
        async with TestClient(TestServer(_app(register_agents, bot=_bare_bot()))) as c:
            assert await (await c.get("/api/agents")).json() == []
            assert (await c.delete("/api/agents/A1")).status == 404
            assert (await c.get("/api/agents/A1/children")).status == 503
            assert (await c.get("/api/agents/A1/lineage")).status == 503
            assert (await c.get("/api/agents/A1/descendants")).status == 503


class TestProcesses:
    def _proc(self, **kw):
        base = dict(command="tail -f log", host="localhost", status="running",
                    exit_code=None, start_time=1.0,
                    output_buffer=["line1\n", "line2\n", "line3\n", "line4\n"])
        base.update(kw)
        return SimpleNamespace(**base)

    @pytest.mark.asyncio
    async def test_list_processes(self):
        bot = MagicMock()
        bot.tool_executor._process_registry._processes = {1: self._proc()}
        async with TestClient(TestServer(_app(register_processes, bot=bot))) as c:
            body = await (await c.get("/api/processes")).json()
            assert body[0]["pid"] == 1 and body[0]["command"] == "tail -f log"
            assert body[0]["output_preview"] == ["line2", "line3", "line4"]

    @pytest.mark.asyncio
    async def test_list_processes_no_registry(self):
        bot = MagicMock()
        bot.tool_executor._process_registry = None
        async with TestClient(TestServer(_app(register_processes, bot=bot))) as c:
            assert await (await c.get("/api/processes")).json() == []

    @pytest.mark.asyncio
    async def test_kill_process(self):
        bot = MagicMock()
        reg = MagicMock()
        reg.kill = AsyncMock(return_value="Killed process 5.")
        bot.tool_executor._process_registry = reg
        async with TestClient(TestServer(_app(register_processes, bot=bot))) as c:
            assert (await c.delete("/api/processes/5")).status == 200
            assert (await c.delete("/api/processes/notanint")).status == 400

    @pytest.mark.asyncio
    async def test_kill_process_no_registry(self):
        bot = MagicMock()
        bot.tool_executor._process_registry = None
        async with TestClient(TestServer(_app(register_processes, bot=bot))) as c:
            assert (await c.delete("/api/processes/5")).status == 404
