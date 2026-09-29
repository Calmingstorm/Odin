import asyncio
import json
from unittest.mock import AsyncMock

import pytest

from src.agents.manager import AgentManager
from src.agents.repetition import RepetitionGuard
from src.agents.results import read_result
from src.agents.tool_cycle import result_record
from src.agents.trajectory import AgentTrajectorySaver
from src.config.schema import Config
from src.tools import get_tool_definitions
from src.tools.agent_tool_policy import apply_agent_axis_policy
from src.tools.executor import ToolExecutor
from src.tools.media_result import BinaryAttachment
from src.tools.output_delivery import RankedOutput, deliver
from src.tools.output_retention import OutputStore
from src.tools.result_validator import ToolResult
from src.tools.runtime_delivery import deliver_runtime_result


def test_full_canonical_digest_ignores_fresh_retention_ids(tmp_path):
    store = OutputStore(tmp_path / "evidence.sqlite")
    guard = RepetitionGuard()
    call = {"id": "call", "name": "run_command", "input": {"command": "status"}}
    decisions, ids = [], []
    for _ in range(4):
        output = deliver("same evidence\n" * 4000, store=store, owner="user", tool=call["name"])
        ids.append(json.loads(output)["result_id"])
        record = result_record(call, output, "succeeded")
        decisions.append(guard.observe([call], [record]))
    assert len(set(ids)) == 4
    assert decisions == ["", "", "nudge", "stop"]


def test_same_preview_different_hidden_evidence_resets_guard(tmp_path):
    store = OutputStore(tmp_path / "evidence.sqlite")
    guard = RepetitionGuard()
    call = {"id": "call", "name": "run_command", "input": {}}
    for hidden in ("first", "second", "third", "fourth"):
        output = deliver("prefix\n" * 4000 + hidden + "\nsuffix" * 4000,
                         store=store, owner="user", tool=call["name"])
        record = result_record(call, output, "succeeded")
        assert guard.observe([call], [record]) == ""


def test_binary_retention_digest_compares_full_bytes_not_manifest_ids(tmp_path):
    executor = ToolExecutor()
    executor._output_store = OutputStore(tmp_path / "binary.sqlite")
    call = {"id": "call", "name": "fetch_url", "input": {}}
    guard = RepetitionGuard()
    def capture(data):
        return deliver_runtime_result(executor, ToolResult(
            output="attachment", attachments=(BinaryAttachment(1, "audio", "audio/wav", data),)),
            tool_name=call["name"], tool_input={}, user_id="user")
    outputs = [capture(b"full bytes") for _ in range(4)]
    assert len({out.output for out in outputs}) == 4
    assert [guard.observe([call], [result_record(call, out.output, "succeeded")])
            for out in outputs] == ["", "", "nudge", "stop"]
    changed = capture(b"different bytes")
    assert guard.observe([call], [result_record(call, changed.output, "succeeded")]) == ""


def test_ranked_canonical_digest_uses_full_matches_not_summary(tmp_path):
    store = OutputStore(tmp_path / "ranked.sqlite")
    one = deliver(RankedOutput("same summary", matches=("full first match",)),
                  store=store, owner="user")
    two = deliver(RankedOutput("same summary", matches=("full second match",)),
                  store=store, owner="user")
    assert one.evidence_digest != two.evidence_digest


async def test_cancel_before_coroutine_entry_settles_and_persists(tmp_path):
    manager = AgentManager()
    iteration, tool = AsyncMock(), AsyncMock()
    saver = AgentTrajectorySaver(directory=str(tmp_path))
    aid = manager.spawn(label="unstarted", goal="never run", channel_id="test",
                        requester_id="user", requester_name="User",
                        iteration_callback=iteration, tool_executor_callback=tool,
                        trajectory_saver=saver)
    agent = manager._agents[aid]
    manager.kill(aid)
    with pytest.raises(asyncio.CancelledError):
        await agent._task
    await asyncio.sleep(0)
    assert agent.status == "killed"
    assert agent.ended_at is not None
    assert manager.active_count == 0
    iteration.assert_not_awaited()
    tool.assert_not_awaited()
    cleanup = manager._cleanup_tasks[aid]
    # Let the real saver finish before deliberately retiring the agent.
    for _ in range(100):
        if list(tmp_path.glob("*.jsonl")):
            break
        await asyncio.sleep(0.01)
    assert manager._remove_agent(aid, source="test")
    result = read_result(tmp_path, aid)
    assert result["status"] == "killed"
    assert list(tmp_path.glob("*.jsonl"))
    if not cleanup.done():
        cleanup.cancel()


def test_default_codex_catalog_preserves_authored_model_selection_hint():
    config = Config(discord={"token": ""}, openai_codex={"enabled": True},
                    agents={"model": "auto", "model_selection_hints": {
                        "gpt-6.1-sol": "UNIQUE operator precision hint"}})
    definitions = apply_agent_axis_policy(get_tool_definitions(), config)
    spawn = next(d for d in definitions if d["name"] == "spawn_agent")
    assert "UNIQUE operator precision hint" in spawn["description"]
    model_desc = spawn["input_schema"]["properties"]["model"]["description"]
    assert "UNIQUE operator precision hint" in model_desc
