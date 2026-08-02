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
                max_iterations=120, model_override=None, reasoning_effort_override=None,
                last_provider="", last_model="", last_reasoning_effort=None, has_executed=False,
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


def _display_bot(agent, *, model="gpt-5.6-sol", effort="xhigh",
                 agent_model=None, agent_effort=None, provider="codex"):
    """Bot whose live config drives the display policy."""
    bot = MagicMock()
    bot.agent_manager._agents = {"A1": agent}
    bot.config = SimpleNamespace(
        openai_codex=SimpleNamespace(
            model=model, reasoning_effort=effort,
            agent_model=agent_model, agent_reasoning_effort=agent_effort),
        llm_provider=SimpleNamespace(active_provider=provider),
    )
    return bot


class TestAgentDisplayPolicy:
    """Model/effort shown for an agent must say WHICH truth it is: what
    executed, what the spawn requested, or what live config would give an
    inheriting agent. Never present config as execution history."""

    @pytest.mark.asyncio
    async def test_executed_provenance_wins(self):
        agent = _agent_info(has_executed=True, last_model="gpt-5.6-luna",
                            last_reasoning_effort="max",
                            last_provider="codex", model_override="gpt-5.5")
        bot = _display_bot(agent)
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "gpt-5.6-luna"
        assert row["display_reasoning_effort"] == "max"
        assert row["display_source"] == "last_execution"

    @pytest.mark.asyncio
    async def test_override_before_execution_is_pending(self):
        agent = _agent_info(model_override="gpt-5.6-terra", reasoning_effort_override="high")
        bot = _display_bot(agent)
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "gpt-5.6-terra"
        assert row["display_reasoning_effort"] == "high"
        assert row["display_source"] == "spawn_override_pending"

    @pytest.mark.asyncio
    async def test_inheritance_reports_live_config(self):
        bot = _display_bot(_agent_info(), model="gpt-5.6-sol", effort="xhigh")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "gpt-5.6-sol"
        assert row["display_reasoning_effort"] == "xhigh"
        assert row["display_source"] == "current_inheritance"

    @pytest.mark.asyncio
    async def test_auto_axes_resolve_to_main_settings(self):
        bot = _display_bot(_agent_info(), agent_model="auto", agent_effort="auto")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        # "auto" is spawn-time policy, never a displayable model/effort value
        assert row["display_model"] == "gpt-5.6-sol"
        assert row["display_reasoning_effort"] == "xhigh"

    @pytest.mark.asyncio
    async def test_fixed_agent_axes_win_over_main(self):
        bot = _display_bot(_agent_info(), agent_model="gpt-5.6-luna", agent_effort="low")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "gpt-5.6-luna"
        assert row["display_reasoning_effort"] == "low"

    @pytest.mark.asyncio
    async def test_non_codex_provider_reports_na_effort(self):
        bot = _display_bot(_agent_info(), provider="ollama")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        # N/A, never "unknown": the provider has no effort semantics at all
        assert row["display_reasoning_effort"] == "N/A"

    @pytest.mark.asyncio
    async def test_executed_without_effort_reports_na(self):
        agent = _agent_info(has_executed=True, last_model="qwen3:14b",
                            last_reasoning_effort=None, last_provider="ollama")
        bot = _display_bot(agent, provider="ollama")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "qwen3:14b"
        assert row["display_reasoning_effort"] == "N/A"
        assert row["display_source"] == "last_execution"


class TestAgentListCorrections:
    @pytest.mark.asyncio
    async def test_tool_count_is_full_not_preview_slice(self):
        # tools_used is previewed as the last 10; the COUNT must be the total
        # (the old UI reported the slice length and understated every agent
        # past ten tools).
        agent = _agent_info(tools_used=[f"t{i}" for i in range(25)])
        bot = _display_bot(agent)
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["tools_used_count"] == 25
        assert len(row["tools_used"]) == 10

    @pytest.mark.asyncio
    async def test_max_iterations_exposed_for_honest_progress(self):
        bot = _display_bot(_agent_info(max_iterations=180))
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["max_iterations"] == 180


class TestAgentDetail:
    @pytest.mark.asyncio
    async def test_detail_returns_untruncated_fields(self):
        long_goal = "g" * 900
        long_result = "r" * 900
        agent = _agent_info(goal=long_goal, result=long_result, status="completed",
                            tools_used=[f"t{i}" for i in range(14)])
        bot = _display_bot(agent)
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            r = await c.get("/api/agents/A1")
            assert r.status == 200
            body = await r.json()
        # the whole point: the list truncates at 200, the detail does not
        assert body["goal"] == long_goal
        assert body["result"] == long_result
        assert len(body["tools_used"]) == 14
        assert body["tools_used_count"] == 14
        assert body["display_source"] in {
            "last_execution", "current_inheritance", "spawn_override_pending", "unknown"}

    @pytest.mark.asyncio
    async def test_detail_list_truncation_still_applies(self):
        agent = _agent_info(goal="g" * 900, result="r" * 900, status="completed")
        bot = _display_bot(agent)
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert len(row["goal"]) == 200 and len(row["result"]) == 200

    @pytest.mark.asyncio
    async def test_detail_carries_overrides_separately_from_execution(self):
        agent = _agent_info(model_override="gpt-5.5", reasoning_effort_override="low",
                            has_executed=True, last_model="gpt-5.5",
                            last_reasoning_effort="low")
        bot = _display_bot(agent)
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            body = await (await c.get("/api/agents/A1")).json()
        assert body["model_override"] == "gpt-5.5"
        assert body["reasoning_effort_override"] == "low"
        assert body["display_source"] == "last_execution"

    @pytest.mark.asyncio
    async def test_detail_unknown_agent_404(self):
        bot = _display_bot(_agent_info())
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            assert (await c.get("/api/agents/nope")).status == 404

    @pytest.mark.asyncio
    async def test_detail_no_manager_404(self):
        bot = MagicMock()
        bot.agent_manager._agents = "not-a-dict"
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            assert (await c.get("/api/agents/A1")).status == 404


class TestDisplayPolicyProviderAwareness:
    """PR #247 round 1: the policy assumed Codex config regardless of the
    ACTIVE provider, so a pending Ollama/Kimi agent advertised a Codex model
    (and Codex overrides) that execution would never use."""

    @pytest.mark.asyncio
    async def test_pending_ollama_reports_ollama_model(self):
        bot = _display_bot(_agent_info(), provider="ollama")
        bot.config.ollama = SimpleNamespace(model="qwen3:14b")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "qwen3:14b"
        assert row["display_reasoning_effort"] == "N/A"
        assert row["display_source"] == "current_inheritance"

    @pytest.mark.asyncio
    async def test_pending_kimi_reports_kimi_model(self):
        bot = _display_bot(_agent_info(), provider="kimi")
        bot.config.kimi = SimpleNamespace(model="kimi-k3")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "kimi-k3"

    @pytest.mark.asyncio
    async def test_codex_overrides_inert_under_non_codex_provider(self):
        # The overrides exist but execution ignores them — showing them would
        # advertise a policy that will not happen.
        agent = _agent_info(model_override="gpt-5.6-luna", reasoning_effort_override="max")
        bot = _display_bot(agent, provider="ollama")
        bot.config.ollama = SimpleNamespace(model="qwen3:14b")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "qwen3:14b"
        assert row["display_source"] == "current_inheritance"


class TestDisplayPolicyPerAxisSources:
    """Each axis reports its OWN source: pinning one axis must not make the
    other's inherited value look pinned."""

    @pytest.mark.asyncio
    async def test_model_only_override_leaves_effort_inherited(self):
        agent = _agent_info(model_override="gpt-5.6-terra")
        bot = _display_bot(agent, effort="xhigh")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_model"] == "gpt-5.6-terra"
        assert row["display_model_source"] == "spawn_override_pending"
        assert row["display_reasoning_effort"] == "xhigh"
        assert row["display_reasoning_effort_source"] == "current_inheritance"

    @pytest.mark.asyncio
    async def test_effort_only_override_leaves_model_inherited(self):
        agent = _agent_info(reasoning_effort_override="low")
        bot = _display_bot(agent, model="gpt-5.6-sol")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_reasoning_effort_source"] == "spawn_override_pending"
        assert row["display_model"] == "gpt-5.6-sol"
        assert row["display_model_source"] == "current_inheritance"


class TestDisplayPolicyExecutionTruth:
    """An executed agent reports execution — including what the provider did
    NOT tell us. Missing provenance is unknown, never live config, and never
    N/A (which would claim the concept does not apply)."""

    @pytest.mark.asyncio
    async def test_executed_without_provenance_is_unknown_not_config(self):
        agent = _agent_info(has_executed=True, last_model="", last_provider="",
                            last_reasoning_effort=None)
        bot = _display_bot(agent, model="gpt-5.6-sol", effort="xhigh")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_source"] == "last_execution"
        assert row["display_model"] == ""          # unknown, NOT gpt-5.6-sol
        assert row["display_reasoning_effort"] == ""   # unknown, NOT "N/A"

    @pytest.mark.asyncio
    async def test_executed_codex_without_effort_is_unknown(self):
        agent = _agent_info(has_executed=True, last_model="gpt-5.6-sol",
                            last_provider="codex", last_reasoning_effort=None)
        bot = _display_bot(agent)
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_reasoning_effort"] == ""

    @pytest.mark.asyncio
    async def test_executed_effortless_provider_is_na(self):
        agent = _agent_info(has_executed=True, last_model="qwen3:14b",
                            last_provider="ollama", last_reasoning_effort=None)
        bot = _display_bot(agent, provider="ollama")
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_reasoning_effort"] == "N/A"

    @pytest.mark.asyncio
    async def test_not_executed_never_claims_execution(self):
        bot = _display_bot(_agent_info(has_executed=False))
        async with TestClient(TestServer(_app(register_agents, bot=bot))) as c:
            row = (await (await c.get("/api/agents")).json())[0]
        assert row["display_source"] != "last_execution"
