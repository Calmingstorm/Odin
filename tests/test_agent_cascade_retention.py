"""Terminal/evicted ancestors still control surviving trees, not unrelated jobs."""
import asyncio

import pytest

from src.agents.manager import AgentInfo, AgentManager, AgentState


def agent(aid, parent=None):
    info = AgentInfo(id=aid, label=aid, goal="test", channel_id="c",
                     requester_id="u", requester_name="user", parent_id=parent)
    info.transition(AgentState.READY)
    info.transition(AgentState.EXECUTING)
    return info


@pytest.mark.parametrize("state", [AgentState.COMPLETED, AgentState.FAILED,
                                  AgentState.TIMEOUT, AgentState.KILLED])
@pytest.mark.parametrize("evict", [False, True])
async def test_terminal_root_cascade(state, evict):
    manager = AgentManager()
    root, middle = agent("root"), agent("mid", "root")
    leaf, other = agent("leaf", "mid"), agent("other")
    root.children_ids = [middle.id]
    middle.children_ids = [leaf.id]
    root.transition(state)
    middle.transition(AgentState.COMPLETED)
    manager._agents = {a.id: a for a in (root, middle, leaf, other)}
    if evict:
        manager._remove_agent(middle.id)
        manager._remove_agent(root.id)
    no_cascade = manager.kill(root.id, cascade=False)
    assert state.value in no_cascade
    assert not leaf._cancel_event.is_set()
    leaf._task = asyncio.create_task(asyncio.sleep(60))
    try:
        result = manager.kill(root.id)
        assert state.value in result
        assert "1 descendant" in result
        assert leaf._cancel_event.is_set()
        assert not other._cancel_event.is_set()
        await asyncio.gather(leaf._task, return_exceptions=True)
        assert leaf._task.cancelled()
        assert root.state == state
    finally:
        leaf._task.cancel()
        await asyncio.gather(leaf._task, return_exceptions=True)


def test_evicted_intermediate_and_lineage_pruning():
    manager = AgentManager()
    root, mid, leaf = agent("root"), agent("mid", "root"), agent("leaf", "mid")
    root.children_ids = [mid.id]
    mid.children_ids = [leaf.id]
    mid.transition(AgentState.COMPLETED)
    manager._agents = {a.id: a for a in (root, mid, leaf)}
    manager._remove_agent(mid.id)
    assert manager.get_lineage(leaf.id) == ["root", "mid", "leaf"]
    manager.kill(root.id)
    assert leaf._cancel_event.is_set()
    manager._remove_agent(leaf.id)
    manager._remove_agent(root.id)
    assert not manager._retired_lineage
