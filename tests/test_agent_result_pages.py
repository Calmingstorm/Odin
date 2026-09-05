"""Production native dispatch, worker persistence, cleanup and UTF-8 paging."""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agents.manager import AgentManager
from src.agents.results import result_page
from src.agents.trajectory import AgentTrajectorySaver
from src.discord.native_tools.registry import NativeToolDispatcher, register_native_handlers
from src.permissions.manager import PermissionManager
from tests.test_native_agents_tasks import _message, _tools


def dispatcher(tmp_path, manager, saver):
    permissions = PermissionManager({}, default_tier="user", overrides_path=str(tmp_path / "rbac"))
    permissions.set_tier("admin", "admin")
    executor = MagicMock()
    executor._permission_manager = permissions
    tools = _tools(agent_manager=manager, agent_trajectory_saver=saver, tool_executor=executor)
    owners = {k: MagicMock() for k in ("channel_ops", "media", "scheduling", "knowledge")}
    owners["agents"] = tools
    d = NativeToolDispatcher(owners=owners, skill_manager=MagicMock(), tool_catalog=MagicMock(),
                             prompt_builder=MagicMock(), channel_state=tools._channel_state)
    register_native_handlers(d)

    async def call(name, inp, uid="7", cid=42):
        out, _ = await d.dispatch(name, inp, message=_message(cid), user_id=uid,
                                  skill_file_delivery="stage")
        return out
    return call


async def finish(manager, saver, text):
    aid = manager.spawn(label="worker", goal="test", channel_id="42", requester_id="7",
                        requester_name="user", trajectory_saver=saver,
                        iteration_callback=AsyncMock(return_value={
                            "text": text, "tool_calls": [], "stop_reason": "end_turn"}),
                        tool_executor_callback=AsyncMock())
    await manager._agents[aid]._task
    await asyncio.sleep(0)
    cleanup = manager._cleanup_tasks.pop(aid)
    cleanup.cancel()
    await asyncio.gather(cleanup, return_exceptions=True)
    return aid


async def test_byte_complete_dispatch_pages_after_eviction_and_restart(tmp_path):
    manager = AgentManager()
    saver = AgentTrajectorySaver(str(tmp_path / "trajectories"))
    text = "é水🌍\n" * 2500 + "unique-tail"
    aid = await finish(manager, saver, text)
    call = dispatcher(tmp_path, manager, saver)
    initial = json.loads(await call("get_agent_results", {"agent_id": aid, "limit": 17}))
    invalid = await call("get_agent_results", {"agent_id": aid, "cursor": "invalid"})
    assert invalid == "Invalid or stale result cursor"
    assert initial["original_bytes"] == len(text.encode())
    assert initial["truncated"] is True
    assert manager._remove_agent(aid)
    # New manager and saver: not a live-object/cache fallback.
    call = dispatcher(tmp_path, AgentManager(), AgentTrajectorySaver(str(saver.directory)))
    pages, cursor = [], ""
    while True:
        page = json.loads(await call("get_agent_results", {
            "agent_id": aid, "cursor": cursor, "limit": 997}))
        assert len(page["preview"].encode()) <= 997
        pages.append(page["preview"])
        cursor = page["cursor"]
        if cursor is None:
            break
    assert "".join(pages).encode() == text.encode()
    for uid, cid in [("other", 42), ("7", 43), ("", 42)]:
        denied = await call("get_agent_results", {"agent_id": aid}, uid, cid)
        missing = await call("get_agent_results", {"agent_id": "missing"}, uid, cid)
        assert denied.replace(aid, "missing") == missing
        wait = await call("wait_for_agents", {"agent_ids": [aid], "timeout": 0}, uid, cid)
        assert "not_found" in wait and "unique-tail" not in wait
    assert json.loads(await call("get_agent_results", {"agent_id": aid}, "admin", 43))
    wait = await call("wait_for_agents", {"agent_ids": [aid], "timeout": 0})
    assert "completed" in wait and "original_bytes=" in wait and "cursor=" in wait
    assert len(wait.encode()) < 1400


async def test_failed_persistence_retains_live_result_for_retry(tmp_path, monkeypatch):
    manager = AgentManager()
    saver = AgentTrajectorySaver(str(tmp_path / "trajectories"))
    from src.agents import results

    original = results.publish_result
    monkeypatch.setattr(results, "publish_result", MagicMock(side_effect=OSError("disk full")))
    aid = await finish(manager, saver, "retained answer")
    assert manager._remove_agent(aid) is False
    assert manager.get_results(aid)["result"] == "retained answer"
    monkeypatch.setattr(results, "publish_result", original)
    assert manager._remove_agent(aid) is True
    call = dispatcher(tmp_path, AgentManager(), saver)
    page = json.loads(await call("get_agent_results", {"agent_id": aid}))
    assert page["preview"] == "retained answer"


def test_cursor_and_separate_error_lengths():
    snapshot = {"id": "a", "status": "failed", "result": "水", "error": "é" * 20}
    page = result_page(snapshot, limit=4)
    assert page["result_bytes"] == 3 and page["error_bytes"] == 40
    assert page["preview"] == "水"
    assert result_page(snapshot, page["cursor"], limit=4)["preview"] == "éé"
    with pytest.raises(ValueError):
        result_page(snapshot, "bad:1")
    with pytest.raises(ValueError):
        result_page(snapshot, page["cursor"].split(":")[0] + ":1")
    with pytest.raises(ValueError):
        result_page(snapshot, limit=9000)
