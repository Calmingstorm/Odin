"""wait_for_agents: return_when='any' and previews that fill the wait budget (#746)."""
from __future__ import annotations

import asyncio
import re
import time
from unittest.mock import AsyncMock, patch

import pytest

from src.agents.execution_context import waiting_agent
from src.agents.manager import AgentInfo, AgentManager, AgentState
from src.agents.results import result_page
from src.agents.wait_results import (
    WAIT_PREVIEW_MAX_BYTES,
    _row,
    _wait_page,
    render_wait_results,
)
from src.discord.response_guards import wait_iteration_fingerprint
from tests.test_native_agents_tasks import _tools


def _agent(agent_id: str, *, result: str | None = None) -> AgentInfo:
    agent = AgentInfo(
        id=agent_id, label=agent_id, goal="g",
        channel_id="c1", requester_id="u1", requester_name="user",
    )
    agent.transition(AgentState.READY)
    if result is not None:
        agent.result = result
        agent.transition(AgentState.COMPLETED)
    return agent


class TestManagerReturnWhen:
    async def test_any_returns_at_the_first_completion_and_cancels_nothing(self):
        mgr = AgentManager()
        first, second = _agent("first"), _agent("second")
        mgr._agents.update({"first": first, "second": second})

        async def finish_first():
            await asyncio.sleep(0.05)
            first.result = "first report"
            first.transition(AgentState.COMPLETED)

        finisher = asyncio.create_task(finish_first())
        results = await asyncio.wait_for(mgr.wait_for_agents(
            ["first", "second"], timeout=60, poll_interval=60, return_when="any"), 5)
        await finisher
        assert results["first"]["status"] == "completed"
        assert results["first"]["result"] == "first report"
        assert results["second"]["status"] == "running"
        assert second._sm.is_active

    async def test_any_counts_an_agent_that_had_already_finished(self):
        mgr = AgentManager()
        mgr._agents.update({"done": _agent("done", result="r"), "busy": _agent("busy")})
        started = time.monotonic()
        results = await mgr.wait_for_agents(
            ["done", "busy"], timeout=60, poll_interval=60, return_when="any")
        assert time.monotonic() - started < 2
        assert results["done"]["status"] == "completed"
        assert results["busy"]["status"] == "running"

    async def test_all_is_unchanged_and_waits_for_the_deadline(self):
        mgr = AgentManager()
        mgr._agents.update({"done": _agent("done", result="r"), "busy": _agent("busy")})
        started = time.monotonic()
        results = await mgr.wait_for_agents(
            ["done", "busy"], timeout=0.3, poll_interval=0.05, known_terminal=["done"])
        assert time.monotonic() - started >= 0.3
        assert results["busy"]["status"] == "running"

    async def test_known_terminal_satisfies_any_for_an_agent_cleanup_removed(self):
        mgr = AgentManager()
        mgr._agents["busy"] = _agent("busy")
        results = await asyncio.wait_for(mgr.wait_for_agents(
            ["gone", "busy"], timeout=60, poll_interval=60,
            return_when="any", known_terminal=["gone"]), 2)
        assert results["busy"]["status"] == "running"
        # The caller holds the durable result; the registry no longer does.
        assert results["gone"]["status"] == "not_found"

    async def test_known_terminal_outside_the_roster_does_not_satisfy_any(self):
        mgr = AgentManager()
        mgr._agents["busy"] = _agent("busy")
        results = await mgr.wait_for_agents(
            ["busy"], timeout=0.2, poll_interval=0.05,
            return_when="any", known_terminal=["someone-else"])
        assert results["busy"]["status"] == "running"

    async def test_a_parent_message_keeps_precedence_over_any(self):
        mgr = AgentManager()
        mgr._agents["done"] = _agent("done", result="r")
        parent = _agent("parent")
        parent._inbox_event.set()
        token = waiting_agent.set(parent)
        try:
            results = await mgr.wait_for_agents(["done"], timeout=5, return_when="any")
        finally:
            waiting_agent.reset(token)
        assert results["done"]["wait_interrupted"] == "parent_message"

    async def test_only_a_real_deadline_logs_a_timeout(self):
        mgr = AgentManager()
        mgr._agents.update({"done": _agent("done", result="r"), "busy": _agent("busy")})
        with patch("src.agents.manager.log") as log:
            await mgr.wait_for_agents(["done", "busy"], timeout=60, return_when="any")
            log.warning.assert_not_called()
            await mgr.wait_for_agents(["busy"], timeout=0.05, poll_interval=0.01)
            assert "timed out" in log.warning.call_args.args[0]

    async def test_an_unknown_mode_is_refused(self):
        with pytest.raises(ValueError, match="'all' or 'any'"):
            await AgentManager().wait_for_agents(["x"], return_when="first")


def _record(agent_id: str, status: str, result: str = "") -> dict:
    return {"id": agent_id, "status": status, "label": agent_id, "iteration_count": 1,
            "result": result, "requester_id": "u1", "channel_id": "c1"}


class TestHandlerReturnWhen:
    @pytest.mark.parametrize("value", [None, ""])
    async def test_a_blank_mode_is_all_and_the_manager_call_is_unchanged(self, value):
        tools = _tools()
        record = _record("a", "running")
        tools._load_agent_result = AsyncMock(return_value=record)
        tools._can_read_agent_result = lambda *_: True
        tools._agent_manager.wait_for_agents = AsyncMock(return_value={"a": record})
        await tools._handle_wait_for_agents(
            {"agent_ids": ["a"], "timeout": 7, "return_when": value})
        tools._agent_manager.wait_for_agents.assert_awaited_once_with(["a"], timeout=7.0)

    async def test_an_unknown_mode_is_refused_before_waiting(self):
        tools = _tools()
        tools._agent_manager.wait_for_agents = AsyncMock()
        out = await tools._handle_wait_for_agents({"agent_ids": ["a"], "return_when": "first"})
        assert "'all' or 'any'" in str(out)
        tools._agent_manager.wait_for_agents.assert_not_awaited()

    async def test_any_hands_the_manager_the_terminal_results_it_holds(self):
        tools = _tools()
        saved = {"done": _record("done", "completed", "kept on disk"),
                 "busy": _record("busy", "running")}
        tools._load_agent_result = AsyncMock(side_effect=lambda aid: saved[aid])
        tools._can_read_agent_result = lambda *_: True
        tools._agent_manager.wait_for_agents = AsyncMock(return_value={
            "done": {"status": "not_found"}, "busy": saved["busy"]})
        out = await tools._handle_wait_for_agents(
            {"agent_ids": ["done", "busy"], "timeout": 9, "return_when": "any"})
        tools._agent_manager.wait_for_agents.assert_awaited_once_with(
            ["done", "busy"], timeout=9.0, return_when="any", known_terminal=["done"])
        assert "kept on disk" in out and "(`busy`): running" in out

    @pytest.mark.parametrize("status", ["completed", "failed", "timeout", "killed"])
    async def test_every_terminal_status_satisfies_any(self, status):
        tools = _tools()
        manager = AgentManager()
        manager._agents["busy"] = _agent("busy")
        tools._agent_manager = manager
        disk = _record("gone", status, "saved result")

        async def load(aid):
            return manager.get_results(aid) or (disk if aid == "gone" else None)

        tools._load_agent_result = load
        tools._can_read_agent_result = lambda *_: True
        out = await asyncio.wait_for(tools._handle_wait_for_agents(
            {"agent_ids": ["gone", "busy"], "timeout": 60, "return_when": "any"}), 3)
        assert f"(`gone`): {status}" in out and "(`busy`): running" in out

    async def test_an_unauthorized_terminal_result_does_not_satisfy_any(self):
        tools = _tools()
        hidden = _record("hidden", "completed", "not yours")
        busy = _record("busy", "running")
        tools._load_agent_result = AsyncMock(side_effect=lambda aid: {
            "hidden": hidden, "busy": busy}[aid])
        tools._can_read_agent_result = lambda result, *_: result["id"] != "hidden"
        tools._agent_manager.wait_for_agents = AsyncMock(return_value={"busy": busy})
        out = await tools._handle_wait_for_agents(
            {"agent_ids": ["hidden", "busy"], "return_when": "any"})
        tools._agent_manager.wait_for_agents.assert_awaited_once_with(
            ["busy"], timeout=300.0, return_when="any", known_terminal=[])
        assert "not yours" not in out and "not_found" in out


def _snapshot(agent_id: str, result: str) -> dict:
    return {"id": agent_id, "status": "completed", "label": agent_id,
            "iteration_count": 2, "result": result}


def _largest_fitting(ids: list[str], snapshots: dict, budget: int) -> str:
    """Brute force: the largest equal ceiling, counting down, whose render fits."""
    pages = {aid: _wait_page({"id": aid, **snapshots[aid]}) for aid in ids}
    for allowance in range(WAIT_PREVIEW_MAX_BYTES, -1, -1):
        rendered = "\n\n".join(_row(aid, snapshots[aid], pages[aid], allowance) for aid in ids)
        if len(rendered) <= budget:
            return rendered
    raise AssertionError("the mandatory roster does not fit")


ROSTERS = [
    ({"a": "a short report"}, 12000),
    ({"a": "y" * 9000}, 12000),
    ({"a": "", "b": "z" * 20000}, 3000),
    ({"a": "short", "b": "é" * 5000, "c": "🌍water\n" * 900}, 12000),
    ({"a": "w" * 799, "b": "w" * 800, "c": "w" * 801, "d": "w" * 2400, "e": "w" * 7999}, 12000),
    ({"a": "🌍" * 3000, "b": "q" * 10}, 1500),
    ({"a": "🌍" + "x" * 50, "b": "y" * 6000, "c": "z" * 6000}, 2500),
]


@pytest.mark.parametrize("results,budget", ROSTERS)
def test_previews_take_the_largest_equal_ceiling_that_fits(results, budget):
    ids = list(results)
    snapshots = {aid: _snapshot(aid, text) for aid, text in results.items()}
    rendered = render_wait_results(ids, snapshots, budget)
    assert len(rendered) <= budget
    assert rendered == _largest_fitting(ids, snapshots, budget)


def test_a_result_that_fits_is_whole_and_a_longer_one_stops_at_the_ceiling():
    snapshots = {"a": _snapshot("a", "r" * 3000), "b": _snapshot("b", "s" * 9500)}
    rendered = render_wait_results(["a", "b"], snapshots, 12000)
    first, second = re.split(r"\n\n(?=\*\*b\*\*)", rendered)
    assert "r" * 3000 in first and "truncated" not in first
    assert "s" * 8000 in second and "s" * 8001 not in second
    assert "original_bytes=9500" in second


def test_the_cursor_continues_exactly_after_a_fuller_preview():
    result = "".join(f"line {i:05d} with ünïcödé and 🌍\n" for i in range(600))
    snapshots = {"a": _snapshot("a", result)}
    rendered = render_wait_results(["a"], snapshots, 12000)
    preview = rendered.split("\n", 1)[1].split("\n... [truncated;", 1)[0]
    cursor = re.search(r"cursor=([^\]]+)", rendered).group(1)
    assert 0 < len(preview.encode("utf-8")) <= WAIT_PREVIEW_MAX_BYTES
    rest = result_page({"id": "a", **snapshots["a"]}, cursor, 8000)
    assert rest["offset"] == len(preview.encode("utf-8"))
    assert result.startswith(preview + rest["preview"])


def test_a_secret_across_the_preview_edge_is_masked_on_both_sides():
    token = "ghp_" + "Ab3dE6gH9jKm2nPq5sTv8wXz1cF4hJ7lN0rU"
    result = "x" * (WAIT_PREVIEW_MAX_BYTES - 10) + token + " tail"
    snapshots = {"a": _snapshot("a", result)}
    rendered = render_wait_results(["a"], snapshots, 12000)
    assert token not in rendered and token[:14] not in rendered
    cursor = re.search(r"cursor=([^\]]+)", rendered)
    if cursor:
        rest = result_page({"id": "a", **snapshots["a"]}, cursor.group(1), 8000)
        assert token[4:] not in rest["preview"]


def test_unchanged_any_results_keep_one_repetition_fingerprint():
    snapshots = {"done": _snapshot("done", "r" * 3000),
                 "busy": {**_snapshot("busy", ""), "status": "running", "iteration_count": 4}}
    args = {"agent_ids": ["done", "busy"], "return_when": "any"}
    first = render_wait_results(["done", "busy"], snapshots, 12000)
    second = render_wait_results(["done", "busy"], snapshots, 12000)
    assert (wait_iteration_fingerprint("wait_for_agents", args, first)
            == wait_iteration_fingerprint("wait_for_agents", args, second))


class TestCancellationPrecedence:
    @pytest.mark.parametrize("held", [False, True])
    async def test_a_cancelled_parent_stops_an_any_wait_that_would_return(self, held):
        mgr = AgentManager()
        mgr._agents["busy"] = _agent("busy")
        if not held:
            mgr._agents["done"] = _agent("done", result="r")
        parent = _agent("parent")
        parent._cancel_event.set()
        token = waiting_agent.set(parent)
        try:
            with pytest.raises(asyncio.CancelledError):
                await mgr.wait_for_agents(
                    ["done", "busy"], timeout=60, poll_interval=60, return_when="any",
                    known_terminal=["done"] if held else ())
        finally:
            waiting_agent.reset(token)
