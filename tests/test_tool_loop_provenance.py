"""Per-iteration execution provenance at the chat/loop ToolIteration sites.

Both construction sites in tool_loop stamp provider/model/reasoning_effort
from the RESPONSE's provenance fields — the only source that survives
gateway routing, retries, and live reloads. A response without provenance
is recorded as UNKNOWN (empty/None), never replaced by a call-site guess.
"""
import asyncio
from types import SimpleNamespace

from src.discord.response_guards import StuckLoopTracker
from src.discord.tool_loop import ToolLoopRunner
from src.llm.types import LLMResponse
from src.trajectories.saver import TrajectoryTurn


def _turn():
    return TrajectoryTurn(
        message_id="m1", channel_id="c1", user_id="u1",
        user_name="u", source="discord",
    )


def _chat_st():
    return SimpleNamespace(
        iteration=1, _trajectory=_turn(), stuck_tracker=StuckLoopTracker(),
    )


class TestChatIterationProvenance:
    async def test_stamps_from_response(self):
        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        st = _chat_st()
        resp = LLMResponse(
            text="hi",
            provenance_provider="codex",
            provenance_model="gpt-5.6-sol",
            provenance_reasoning_effort="xhigh",
        )
        assert await runner._check_stuck_and_record(st, resp) is None
        it = st._trajectory.iterations[0]
        assert it.provider == "codex"
        assert it.model == "gpt-5.6-sol"
        assert it.reasoning_effort == "xhigh"
        assert it.server_input_tokens is None

    async def test_missing_provenance_stays_unknown(self):
        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        st = _chat_st()
        resp = SimpleNamespace(
            text="hi", tool_calls=[], stop_reason="end_turn",
            input_tokens=0, output_tokens=0,
        )
        assert await runner._check_stuck_and_record(st, resp) is None
        it = st._trajectory.iterations[0]
        assert it.provider == ""
        assert it.model == ""
        assert it.reasoning_effort is None


class TestLoopIterationProvenance:
    def test_stamps_from_response(self):
        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        st = SimpleNamespace(_trajectory=_turn(), final_text="", completed_naturally=False)
        resp = LLMResponse(
            text="done",
            provenance_provider="codex",
            provenance_model="gpt-5.6-luna",
            provenance_reasoning_effort="low",
        )
        ended = runner._record_loop_iteration(st, resp, 2)
        assert ended is True  # tool-free response ends the loop naturally
        it = st._trajectory.iterations[0]
        assert it.provider == "codex"
        assert it.model == "gpt-5.6-luna"
        assert it.reasoning_effort == "low"

    def test_missing_provenance_stays_unknown(self):
        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        st = SimpleNamespace(_trajectory=_turn(), final_text="", completed_naturally=False)
        resp = SimpleNamespace(text="", tool_calls=[], stop_reason="end_turn")
        runner._record_loop_iteration(st, resp, 1)
        it = st._trajectory.iterations[0]
        assert it.provider == ""
        assert it.model == ""
        assert it.reasoning_effort is None


def test_loop_iteration_stamps_frozen_context_budget_snapshot():
    from src.llm.context_budget import resolve_context_budget

    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    snapshot = resolve_context_budget("gpt-5.6-sol", density_milli=609)
    st = SimpleNamespace(
        _trajectory=_turn(),
        _generation_budget_snapshot=snapshot,
        final_text="",
        completed_naturally=False,
    )
    runner._record_loop_iteration(st, LLMResponse(text="done"), 2)
    row = st._trajectory.iterations[-1]
    assert row.context_density_milli == 609
    assert row.context_density_source == "calibrated"
    assert row.context_primary_chars == snapshot.primary_chars


def test_chat_iteration_stamps_frozen_context_budget_snapshot():
    from src.llm.context_budget import resolve_context_budget

    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    st = _chat_st()
    st._generation_budget_snapshot = resolve_context_budget(
        "gpt-5.6-sol", density_milli=609
    )
    resp = LLMResponse(text="hi")
    asyncio.run(runner._check_stuck_and_record(st, resp))
    row = st._trajectory.iterations[-1]
    assert row.context_density_milli == 609
    assert row.context_density_source == "calibrated"
    assert row.context_primary_chars == st._generation_budget_snapshot.primary_chars


async def test_chat_iteration_persists_accepted_usage_provenance():
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    st = _chat_st()
    resp = LLMResponse(
        text="hi",
        input_tokens=999,
        output_tokens=8,
        server_input_tokens=321,
        server_output_tokens=7,
        estimated_input_tokens=456,
        input_token_provenance="provider_reported",
        output_token_provenance="provider_reported",
    )
    await runner._check_stuck_and_record(st, resp)
    row = st._trajectory.iterations[-1]
    assert row.server_input_tokens == 321
    assert row.server_output_tokens == 7
    assert row.estimated_input_tokens == 456
    assert row.input_token_provenance == "provider_reported"
    assert row.output_token_provenance == "provider_reported"


def test_loop_iteration_persists_accepted_usage_provenance():
    runner = ToolLoopRunner.__new__(ToolLoopRunner)
    st = SimpleNamespace(_trajectory=_turn(), final_text="", completed_naturally=False)
    resp = LLMResponse(
        text="done",
        input_tokens=999,
        output_tokens=8,
        server_input_tokens=321,
        estimated_input_tokens=456,
        input_token_provenance="provider_reported",
        output_token_provenance="estimated_text_v1",
    )
    runner._record_loop_iteration(st, resp, 1)
    row = st._trajectory.iterations[-1]
    assert row.server_input_tokens == 321
    assert row.estimated_input_tokens == 456
    assert row.input_token_provenance == "provider_reported"
    assert row.output_token_provenance == "estimated_text_v1"


def test_usage_capture_failure_is_declared_nonfatal_at_both_generation_sites():
    import inspect

    source = inspect.getsource(ToolLoopRunner)
    assert source.count('apply_accepted_usage(') == 2


class TestWaitForAgentsWrapperGrace:
    async def test_chat_wrapper_uses_handler_deadline_plus_native_grace(self, monkeypatch):
        import asyncio
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        from src.discord.tool_loop import ToolLoopRunner

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._run_one_tool = AsyncMock(return_value={"content": "snapshot"})
        block = SimpleNamespace(
            name="wait_for_agents",
            input={"agent_ids": ["a"], "timeout": 42},
            id="call",
        )
        observed = {}

        async def capture(awaitable, timeout):
            observed["timeout"] = timeout
            return await awaitable

        monkeypatch.setattr(asyncio, "wait_for", capture)
        result = await runner._run_one_tool_with_timeout(SimpleNamespace(), block, 300)
        assert result == {"content": "snapshot"}
        assert observed["timeout"] == 57

    async def test_chat_wrapper_preserves_truthy_non_mapping_input_path(self, monkeypatch):
        import asyncio
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        from src.discord.tool_loop import ToolLoopRunner

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._run_one_tool = AsyncMock(return_value={"content": "input error"})
        block = SimpleNamespace(name="wait_for_agents", input=["bad"], id="call")
        observed = {}

        async def capture(awaitable, timeout):
            observed["timeout"] = timeout
            return await awaitable

        monkeypatch.setattr(asyncio, "wait_for", capture)
        result = await runner._run_one_tool_with_timeout(SimpleNamespace(), block, 91)
        assert result == {"content": "input error"}
        assert observed["timeout"] == 91

    async def test_loop_wrapper_uses_handler_deadline_plus_native_grace(self, monkeypatch):
        import asyncio
        from types import SimpleNamespace
        from unittest.mock import AsyncMock

        from src.discord.tool_loop import ToolLoopRunner

        runner = ToolLoopRunner.__new__(ToolLoopRunner)
        runner._native_tools = SimpleNamespace(handles=lambda _name: True)
        runner.dispatch_loop_tool = AsyncMock(return_value="snapshot")
        runner._audit = SimpleNamespace(log_execution=AsyncMock())
        block = SimpleNamespace(
            name="wait_for_agents",
            input={"agent_ids": ["a"], "timeout": 42},
            id="call",
            parse_error=None,
        )
        st = SimpleNamespace(
            tool_timeout=300,
            msg_proxy=object(),
            user_id="u",
            system_prompt="",
            channel=object(),
            requester_name="u",
            channel_id_str="c",
        )
        observed = {}

        async def capture(awaitable, timeout):
            observed["timeout"] = timeout
            return await awaitable

        monkeypatch.setattr(asyncio, "wait_for", capture)
        result = await runner._run_one_loop_tool(st, block)
        assert result["content"] == "snapshot"
        assert observed["timeout"] == 57
