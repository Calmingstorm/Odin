"""Full roster, aggregate preview ceiling and invocation interruption pins."""
import re
from unittest.mock import AsyncMock

import pytest

from src.agents.results import result_page
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
