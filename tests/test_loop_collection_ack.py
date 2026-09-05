"""Collection acknowledges only terminal snapshots actually delivered."""
import asyncio
from unittest.mock import AsyncMock

import pytest

from src.agents.loop_bridge import LoopAgentBridge, LoopAgentRecord
from src.agents.manager import AgentManager, AgentState, waiting_agent
from tests.test_agent_cascade_retention import agent


def bridge():
    manager = AgentManager()
    manager._agents = {aid: agent(aid) for aid in ("done", "pending")}
    manager._agents["done"].transition(AgentState.COMPLETED)
    manager._agents["done"].result = "final"
    b = LoopAgentBridge(manager)
    b._loop_agents["loop"] = [LoopAgentRecord(aid, "loop", 1, aid)
                              for aid in ("done", "pending", "missing")]
    return b, manager


@pytest.mark.parametrize("interrupted", [False, True])
async def test_mixed_timeout_interruption_then_eventual_collection(interrupted):
    b, manager = bridge()
    parent = agent("parent")
    parent._inbox_event.set()
    token = waiting_agent.set(parent if interrupted else None)
    try:
        result = await b.wait_and_collect("loop", timeout=0)
    finally:
        waiting_agent.reset(token)
    assert set(result) == {"done", "pending", "missing"}
    records = b._loop_agents["loop"]
    assert [r.collected for r in records] == [True, False, False]
    assert result["missing"]["status"] == "not_found"
    assert "missing" in {r["agent_id"] for r in b.get_active_loop_agents("loop")}
    manager._agents["pending"].transition(AgentState.COMPLETED)
    manager._agents["pending"].result = "eventual"
    second = await b.wait_and_collect("loop", timeout=0)
    assert "done" not in second
    assert second["pending"]["result"] == "eventual"
    assert (await b.wait_and_collect("loop", ["done"], timeout=0))["done"]["result"] == "final"


async def test_omitted_and_cancelled_are_not_acknowledged():
    b, manager = bridge()
    manager.wait_for_agents = AsyncMock(return_value={})
    result = await b.wait_and_collect("loop", timeout=0)
    assert set(result) == {"done", "pending", "missing"}
    assert all(r["status"] == "not_found" for r in result.values())
    assert not any(r.collected for r in b._loop_agents["loop"])
    manager.wait_for_agents.side_effect = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        await b.wait_and_collect("loop", timeout=0)
    assert not any(r.collected for r in b._loop_agents["loop"])


async def test_concurrent_implicit_collectors_deliver_terminal_once():
    b, manager = bridge()
    entered, release = asyncio.Event(), asyncio.Event()
    real_wait = manager.wait_for_agents

    async def held_wait(*args, **kwargs):
        entered.set()
        await release.wait()
        return await real_wait(*args, **kwargs)

    manager.wait_for_agents = held_wait
    first = asyncio.create_task(b.wait_and_collect("loop", timeout=0))
    await entered.wait()
    second = asyncio.create_task(b.wait_and_collect("loop", timeout=0))
    await asyncio.sleep(0)
    release.set()
    results = await asyncio.gather(first, second)
    assert sum("done" in r for r in results) == 1
    assert all("pending" in r for r in results)
