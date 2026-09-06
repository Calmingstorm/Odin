"""Full roster, aggregate preview ceiling and invocation interruption pins."""
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.agents.results import result_page
from src.agents.tool_cycle import result_record
from src.agents.wait_results import render_wait_results, validate_wait_roster
from src.discord.response_guards import truncate_tool_output
from src.tools.result_validator import ToolResult
from tests.test_native_agents_tasks import _tools


def snapshots(count=20):
    return {f"agent-{i}": {"id": f"agent-{i}", "status": "completed", "label": "worker",
                           "iteration_count": i, "result": "🌍water\n" * 400,
                           "requester_id": "owner", "channel_id": "channel"}
            for i in range(count)}


def test_all_accepted_ids_survive_real_guard_and_cursors_match_preview():
    results = snapshots()
    ids = list(results)
    validate_wait_roster(ids, results, 12000)
    rendered = render_wait_results(ids, results, 12000)
    assert truncate_tool_output(rendered) == rendered
    lengths = []
    for aid, row in zip(ids, rendered.split("\n\n"), strict=True):
        assert f"(`{aid}`): completed [iterations={results[aid]['iteration_count']}]" in row
        preview = row.split("\n", 1)[1].split("\n... [truncated;", 1)[0]
        cursor = re.search(r"cursor=([^\]]+)", row).group(1)
        count = len(preview.encode())
        lengths.append(count)
        assert 0 < count <= 800
        continuation = result_page(results[aid], cursor)
        assert continuation["offset"] == count
        assert (preview + continuation["preview"]) == results[aid]["result"][:
            len(preview + continuation["preview"])]
    assert len(set(lengths)) == 1


async def test_oversized_minimal_roster_rejected_before_wait():
    tools = _tools()
    tools._load_agent_result = AsyncMock(return_value=None)
    tools._agent_manager.wait_for_agents = AsyncMock(return_value={})
    result = await tools._handle_wait_for_agents({"agent_ids": list(snapshots(200))})
    assert "Split agent_ids" in result
    tools._agent_manager.wait_for_agents.assert_not_awaited()


async def test_durable_fallback_preserves_interruption_text_and_audit_metadata():
    tools = _tools()
    saved = snapshots(1)["agent-0"]
    tools._load_agent_result = AsyncMock(return_value=saved)
    tools._can_read_agent_result = lambda *_: True
    tools._agent_manager.wait_for_agents = AsyncMock(return_value={
        "agent-0": {"status": "not_found", "wait_interrupted": "parent_message"}})
    out = await tools._handle_wait_for_agents({"agent_ids": ["agent-0"]})
    assert isinstance(out, ToolResult)
    assert "Wait interrupted by parent message; children continue." in str(out)
    assert "completed" in str(out) and "[iterations=0]" in str(out)
    assert out.audit_metadata == {"wait_interrupted": "parent_message"}
    delivered = result_record({"name": "wait_for_agents", "id": "call"}, str(out), "succeeded")
    assert "Wait interrupted by parent message; children continue." in delivered["result"]
    assert truncate_tool_output(delivered["result"]) == delivered["result"]
    assert "wait_interrupted" not in saved


async def test_revocation_during_wait_does_not_deliver_saved_output():
    tools = _tools()
    saved = snapshots(1)["agent-0"]
    tools._load_agent_result = AsyncMock(return_value=saved)
    allowed = iter([True, False])
    tools._can_read_agent_result = lambda *_: next(allowed)
    tools._agent_manager.wait_for_agents = AsyncMock(return_value={"agent-0": saved})
    out = await tools._handle_wait_for_agents({"agent_ids": ["agent-0"]})
    assert "not_found" in str(out) and "water" not in str(out)


@pytest.mark.parametrize("ids", [[1], [""], [None]])
async def test_invalid_ids_rejected(ids):
    result = await _tools()._handle_wait_for_agents({"agent_ids": ids})
    assert "non-empty agent ID strings" in result


def test_fixed_800_preview_mutation_exceeds_guard_budget():
    results = snapshots()
    unbounded = render_wait_results(list(results), results, 100000)
    assert len(unbounded) > 12000
    assert truncate_tool_output(unbounded) != unbounded


async def test_handlers_use_executor_effective_delivery_budget():
    config = SimpleNamespace(tools=SimpleNamespace(tool_output_max_chars=3000))
    executor = SimpleNamespace(config=config.tools)
    tools = _tools(get_config=lambda: config, tool_executor=executor)
    saved = snapshots(1)["agent-0"]
    saved["result"] = "\x00" * 10000
    tools._load_agent_result = AsyncMock(return_value=saved)
    tools._can_read_agent_result = lambda *_: True
    tools._agent_manager.wait_for_agents = AsyncMock(return_value={"agent-0": saved})
    first = await tools._handle_get_agent_results({"agent_id": "agent-0"})
    assert len(first) <= 3000
    wait = await tools._handle_wait_for_agents({"agent_ids": ["agent-0"]})
    assert len(wait) <= 3000
    config = SimpleNamespace(tools=SimpleNamespace(tool_output_max_chars=1500))
    # A Config Center publication is pending restart for this field. Agent
    # envelopes must not silently use a different cap than executor/processes.
    assert await tools._handle_get_agent_results({"agent_id": "agent-0"}) == first
    executor.config = config.tools
    second = await tools._handle_get_agent_results({"agent_id": "agent-0"})
    assert len(second) <= 1500 < len(first)
    wait = await tools._handle_wait_for_agents({"agent_ids": list(snapshots(4))})
    assert "Split agent_ids" in wait
    assert tools._agent_manager.wait_for_agents.await_count == 1


@pytest.mark.parametrize("interrupted", [False, True])
async def test_malformed_terminal_snapshot_error_preserves_wait_invocation(interrupted):
    tools = _tools()
    saved = snapshots(1)["agent-0"]
    tools._load_agent_result = AsyncMock(return_value=saved)
    tools._can_read_agent_result = lambda *_: True
    # A hostile/unbounded optional terminal field cannot break the guard or
    # erase the fact that THIS wait was interrupted, even if rendering fails.
    terminal = {**saved, "status": "x" * 20000}
    if interrupted:
        terminal["wait_interrupted"] = "parent_message"
    tools._agent_manager.wait_for_agents = AsyncMock(return_value={"agent-0": terminal})
    result = await tools._handle_wait_for_agents({"agent_ids": ["agent-0"]})
    assert "exceeds delivery budget" in str(result)
    assert len(str(result)) < 12000
    if interrupted:
        assert isinstance(result, ToolResult)
        assert result.audit_metadata == {"wait_interrupted": "parent_message"}
        assert str(result).startswith("Wait interrupted by parent message; children continue.")
    else:
        assert isinstance(result, str)
