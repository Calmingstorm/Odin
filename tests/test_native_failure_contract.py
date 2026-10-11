"""Native failures preserve their text and settle through the executor as failures."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.config.schema import ToolsConfig
from src.discord.native_tools.agents_tasks import AgentTaskTools
from src.discord.native_tools.channel_ops import ChannelOpsTools
from src.discord.native_tools.knowledge import KnowledgeTools
from src.discord.native_tools.media import MediaTools
from src.discord.native_tools.scheduling import SchedulingTools
from src.tools.execution_outcome import ToolFailure, is_tool_failure, result_text
from src.tools.executor import ToolExecutor


@pytest.mark.parametrize("family", ["media", "knowledge", "scheduling", "agents", "channel"])
async def test_native_failure_settlement_and_model_text(family, tmp_path):
    message = SimpleNamespace(channel=SimpleNamespace(send=AsyncMock()), author=None)
    if family == "media":
        tools = MediaTools(get_config=lambda: None, browser_manager=None, tool_executor=None)
        out = await tools._handle_post_file(message, {})
        expected = "Both 'host' and 'path' are required."
    elif family == "knowledge":
        tools = KnowledgeTools(
            sessions=None, get_knowledge_store=lambda: None, embedder=None, audit=None,
        )
        out = await tools._handle_search_knowledge({"query": "x"})
        expected = "Knowledge base is not available (search not enabled or not initialized)."
    elif family == "scheduling":
        out = await SchedulingTools(scheduler=None)._handle_schedule_task(message, {})
        expected = "Failed to create schedule: action=reminder requires a non-empty 'message'."
    elif family == "agents":
        # Validation occurs before any dependency is accessed or work is launched.
        out = await AgentTaskTools._handle_delegate_task(None, message, {})
        expected = "No steps provided."
    else:
        tools = ChannelOpsTools(sessions=None, permissions=None, get_channel=lambda _: None)
        out = await tools._handle_read_channel(message, {"channel_id": "123"})
        expected = "Channel 123 not found or not accessible."
    assert isinstance(out, ToolFailure)
    # This is the code-owned settlement predicate used by ToolExecutor.execute.
    assert is_tool_failure(out)
    assert result_text(out) == expected
    assert str(out) == expected
    executor = ToolExecutor(config=ToolsConfig(), memory_path=str(tmp_path / "memory.json"))
    executor._handle_test_tool = AsyncMock(return_value=out)
    settled = await executor.execute("test_tool", {})
    assert settled.ok is False
    assert settled.error is not None
    assert settled.output == expected


async def test_valid_empty_native_answers_remain_successes():
    empty = MagicMock()
    empty.search_history = AsyncMock(return_value=[])
    empty.list_all.return_value = []
    empty.list.return_value = []
    tools = KnowledgeTools(
        sessions=empty, get_knowledge_store=lambda: empty, embedder=None, audit=None,
    )
    empty.list_sources.return_value = []
    answers = [
        await tools._handle_search_history({"query": "x"}),
        tools._handle_list_knowledge(),
        SchedulingTools(scheduler=empty)._handle_list_schedules(),
        AgentTaskTools._handle_list_agents(
            SimpleNamespace(_agent_manager=empty), SimpleNamespace(id=1),
        ),
    ]
    for answer in answers:
        assert not isinstance(answer, ToolFailure)
        assert not is_tool_failure(answer)


@pytest.mark.parametrize("operation", ["send", "kill", "stop_loop"])
async def test_manager_refusals_remain_typed_failures(operation):
    error = (
        "No loop found with ID `missing`." if operation == "stop_loop"
        else "Error: Agent 'missing' not found."
    )
    manager = MagicMock()
    manager.send.return_value = error
    manager.kill.return_value = error
    manager.stop_loop = AsyncMock(return_value=error)
    tools = SimpleNamespace(_agent_manager=manager, _loop_manager=manager)
    if operation == "send":
        out = AgentTaskTools._handle_send_to_agent(
            tools, {"agent_id": "missing", "message": "text"},
        )
    elif operation == "kill":
        out = AgentTaskTools._handle_kill_agent(tools, {"agent_id": "missing"})
    else:
        out = await AgentTaskTools._handle_stop_loop(tools, {"loop_id": "missing"})
    assert isinstance(out, ToolFailure)
    assert out == error
