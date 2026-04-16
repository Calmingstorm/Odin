"""Tests for the auxiliary LLM client (Round 39).

Tests the AuxiliaryLLMClient, AuxiliaryLLMConfig, task routing,
fallback behavior, cost tracking, and factory functions.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import AuxiliaryLLMConfig, OpenAICodexConfig
from src.llm.auxiliary import KNOWN_TASKS, AuxiliaryLLMClient
from src.llm.circuit_breaker import CircuitOpenError
from src.llm.cost_tracker import CostTracker
from src.llm.types import LLMResponse, ToolCall


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_codex_mock(model: str = "gpt-4o-mini", chat_result: str = "aux response") -> MagicMock:
    """Create a mock CodexChatClient with common defaults."""
    client = MagicMock()
    client.model = model
    client.chat = AsyncMock(return_value=chat_result)
    client.chat_with_tools = AsyncMock(
        return_value=LLMResponse(text="tool response", tool_calls=[], stop_reason="end_turn")
    )
    client.breaker = MagicMock()
    client.breaker.state = "closed"
    client.close = AsyncMock()
    client._last_input_tokens = 100
    client._last_output_tokens = 50
    return client


def _make_client(
    aux_model: str = "gpt-4o-mini",
    primary_model: str = "gpt-4o",
    aux_result: str = "aux response",
    primary_result: str = "primary response",
    enabled_tasks: set[str] | None = None,
    cost_tracker: CostTracker | None = None,
) -> tuple[AuxiliaryLLMClient, MagicMock, MagicMock]:
    """Build an AuxiliaryLLMClient with mocked aux and primary clients."""
    aux = _make_codex_mock(model=aux_model, chat_result=aux_result)
    primary = _make_codex_mock(model=primary_model, chat_result=primary_result)
    client = AuxiliaryLLMClient(
        aux_client=aux,
        primary_client=primary,
        enabled_tasks=enabled_tasks,
        cost_tracker=cost_tracker,
    )
    return client, aux, primary


# ---------------------------------------------------------------------------
# AuxiliaryLLMConfig
# ---------------------------------------------------------------------------

class TestAuxiliaryLLMConfig:
    def test_defaults(self):
        cfg = AuxiliaryLLMConfig()
        assert cfg.enabled is False
        assert cfg.model == "gpt-4o-mini"
        assert cfg.max_tokens == 2048
        assert cfg.credentials_path == ""
        assert "compaction" in cfg.tasks
        assert "reflection" in cfg.tasks

    def test_custom_values(self):
        cfg = AuxiliaryLLMConfig(
            enabled=True, model="gpt-3.5-turbo", max_tokens=1024,
            credentials_path="/custom/path.json", tasks=["compaction"],
        )
        assert cfg.enabled is True
        assert cfg.model == "gpt-3.5-turbo"
        assert cfg.max_tokens == 1024
        assert cfg.credentials_path == "/custom/path.json"
        assert cfg.tasks == ["compaction"]

    def test_nested_in_openai_codex_config(self):
        cfg = OpenAICodexConfig()
        assert isinstance(cfg.auxiliary, AuxiliaryLLMConfig)
        assert cfg.auxiliary.enabled is False

    def test_custom_nested(self):
        cfg = OpenAICodexConfig(
            auxiliary=AuxiliaryLLMConfig(enabled=True, model="gpt-3.5-turbo"),
        )
        assert cfg.auxiliary.enabled is True
        assert cfg.auxiliary.model == "gpt-3.5-turbo"

    def test_default_tasks_list(self):
        cfg = AuxiliaryLLMConfig()
        expected = ["compaction", "reflection", "consolidation", "background_followup"]
        assert cfg.tasks == expected


# ---------------------------------------------------------------------------
# KNOWN_TASKS
# ---------------------------------------------------------------------------

class TestKnownTasks:
    def test_known_tasks_is_frozenset(self):
        assert isinstance(KNOWN_TASKS, frozenset)

    def test_contains_core_tasks(self):
        for task in ("compaction", "reflection", "consolidation", "background_followup"):
            assert task in KNOWN_TASKS

    def test_contains_extended_tasks(self):
        for task in ("vision_description", "classification", "summarization"):
            assert task in KNOWN_TASKS

    def test_count(self):
        assert len(KNOWN_TASKS) == 7


# ---------------------------------------------------------------------------
# AuxiliaryLLMClient.__init__
# ---------------------------------------------------------------------------

class TestInit:
    def test_basic_construction(self):
        client, aux, primary = _make_client()
        assert client.aux_client is aux
        assert client.primary_client is primary

    def test_default_enabled_tasks(self):
        client, _, _ = _make_client()
        assert client.enabled_tasks == set(KNOWN_TASKS)

    def test_custom_enabled_tasks(self):
        client, _, _ = _make_client(enabled_tasks={"compaction", "reflection"})
        assert client.enabled_tasks == {"compaction", "reflection"}

    def test_initial_counters(self):
        client, _, _ = _make_client()
        assert client._aux_calls == 0
        assert client._fallback_calls == 0
        assert client._primary_direct_calls == 0

    def test_cost_tracker_stored(self):
        tracker = CostTracker()
        client, _, _ = _make_client(cost_tracker=tracker)
        assert client.cost_tracker is tracker


# ---------------------------------------------------------------------------
# is_enabled
# ---------------------------------------------------------------------------

class TestIsEnabled:
    def test_enabled_task(self):
        client, _, _ = _make_client(enabled_tasks={"compaction", "reflection"})
        assert client.is_enabled("compaction") is True

    def test_disabled_task(self):
        client, _, _ = _make_client(enabled_tasks={"compaction"})
        assert client.is_enabled("reflection") is False

    def test_unknown_task(self):
        client, _, _ = _make_client()
        assert client.is_enabled("nonexistent_task") is False

    def test_all_known_enabled_by_default(self):
        client, _, _ = _make_client()
        for task in KNOWN_TASKS:
            assert client.is_enabled(task) is True


# ---------------------------------------------------------------------------
# chat — routing
# ---------------------------------------------------------------------------

class TestChatRouting:
    async def test_enabled_task_uses_aux(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        result = await client.chat([{"role": "user", "content": "test"}], "system", task="compaction")
        assert result == "aux response"
        aux.chat.assert_awaited_once()
        primary.chat.assert_not_awaited()

    async def test_disabled_task_uses_primary(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        result = await client.chat([{"role": "user", "content": "test"}], "system", task="reflection")
        assert result == "primary response"
        primary.chat.assert_awaited_once()
        aux.chat.assert_not_awaited()

    async def test_max_tokens_forwarded_to_aux(self):
        client, aux, _ = _make_client(enabled_tasks={"compaction"})
        await client.chat([{"role": "user", "content": "test"}], "system", task="compaction", max_tokens=100)
        aux.chat.assert_awaited_once_with(
            [{"role": "user", "content": "test"}], "system", max_tokens=100,
        )

    async def test_max_tokens_forwarded_to_primary(self):
        client, _, primary = _make_client(enabled_tasks=set())
        await client.chat([{"role": "user", "content": "test"}], "system", task="compaction", max_tokens=200)
        primary.chat.assert_awaited_once_with(
            [{"role": "user", "content": "test"}], "system", max_tokens=200,
        )


# ---------------------------------------------------------------------------
# chat — fallback
# ---------------------------------------------------------------------------

class TestChatFallback:
    async def test_fallback_on_empty_response(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        aux.chat = AsyncMock(return_value="")
        result = await client.chat([{"role": "user", "content": "test"}], "system", task="compaction")
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_fallback_on_circuit_open(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        aux.chat = AsyncMock(side_effect=CircuitOpenError("test", 30.0))
        result = await client.chat([{"role": "user", "content": "test"}], "system", task="compaction")
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_fallback_on_runtime_error(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        aux.chat = AsyncMock(side_effect=RuntimeError("API error"))
        result = await client.chat([{"role": "user", "content": "test"}], "system", task="compaction")
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_fallback_on_connection_error(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        aux.chat = AsyncMock(side_effect=ConnectionError("lost connection"))
        result = await client.chat([{"role": "user", "content": "test"}], "system", task="compaction")
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_no_fallback_on_success(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        result = await client.chat([{"role": "user", "content": "test"}], "system", task="compaction")
        assert result == "aux response"
        assert client._aux_calls == 1
        assert client._fallback_calls == 0


# ---------------------------------------------------------------------------
# chat — counters
# ---------------------------------------------------------------------------

class TestChatCounters:
    async def test_aux_call_increments(self):
        client, _, _ = _make_client(enabled_tasks={"compaction"})
        await client.chat([], "s", task="compaction")
        await client.chat([], "s", task="compaction")
        assert client._aux_calls == 2

    async def test_fallback_call_increments(self):
        client, aux, _ = _make_client(enabled_tasks={"compaction"})
        aux.chat = AsyncMock(return_value="")
        await client.chat([], "s", task="compaction")
        assert client._fallback_calls == 1

    async def test_primary_direct_increments(self):
        client, _, _ = _make_client(enabled_tasks=set())
        await client.chat([], "s", task="compaction")
        assert client._primary_direct_calls == 1


# ---------------------------------------------------------------------------
# chat_with_tools — routing
# ---------------------------------------------------------------------------

class TestChatWithToolsRouting:
    async def test_enabled_task_uses_aux(self):
        client, aux, primary = _make_client(enabled_tasks={"classification"})
        result = await client.chat_with_tools([], "system", [], task="classification")
        assert result.text == "tool response"
        aux.chat_with_tools.assert_awaited_once()
        primary.chat_with_tools.assert_not_awaited()

    async def test_disabled_task_uses_primary(self):
        client, aux, primary = _make_client(enabled_tasks=set())
        result = await client.chat_with_tools([], "system", [], task="classification")
        primary.chat_with_tools.assert_awaited_once()
        aux.chat_with_tools.assert_not_awaited()


# ---------------------------------------------------------------------------
# chat_with_tools — fallback
# ---------------------------------------------------------------------------

class TestChatWithToolsFallback:
    async def test_fallback_on_empty_response(self):
        client, aux, primary = _make_client(enabled_tasks={"classification"})
        aux.chat_with_tools = AsyncMock(
            return_value=LLMResponse(text="", tool_calls=[], stop_reason="end_turn")
        )
        primary.chat_with_tools = AsyncMock(
            return_value=LLMResponse(text="fallback", tool_calls=[], stop_reason="end_turn")
        )
        result = await client.chat_with_tools([], "system", [], task="classification")
        assert result.text == "fallback"
        assert client._fallback_calls == 1

    async def test_fallback_on_circuit_open(self):
        client, aux, primary = _make_client(enabled_tasks={"classification"})
        aux.chat_with_tools = AsyncMock(side_effect=CircuitOpenError("test", 30.0))
        result = await client.chat_with_tools([], "system", [], task="classification")
        primary.chat_with_tools.assert_awaited_once()
        assert client._fallback_calls == 1

    async def test_fallback_on_exception(self):
        client, aux, primary = _make_client(enabled_tasks={"classification"})
        aux.chat_with_tools = AsyncMock(side_effect=RuntimeError("fail"))
        result = await client.chat_with_tools([], "system", [], task="classification")
        primary.chat_with_tools.assert_awaited_once()

    async def test_no_fallback_with_tool_calls(self):
        client, aux, primary = _make_client(enabled_tasks={"classification"})
        aux.chat_with_tools = AsyncMock(
            return_value=LLMResponse(
                text="", tool_calls=[ToolCall(id="tc1", name="test", input={})],
                stop_reason="tool_use",
            )
        )
        result = await client.chat_with_tools([], "system", [], task="classification")
        assert len(result.tool_calls) == 1
        primary.chat_with_tools.assert_not_awaited()
        assert client._aux_calls == 1


# ---------------------------------------------------------------------------
# make_chat_fn
# ---------------------------------------------------------------------------

class TestMakeChatFn:
    async def test_returns_callable(self):
        client, _, _ = _make_client(enabled_tasks={"compaction"})
        fn = client.make_chat_fn("compaction")
        assert callable(fn)

    async def test_callable_routes_correctly(self):
        client, aux, _ = _make_client(enabled_tasks={"compaction"})
        fn = client.make_chat_fn("compaction")
        result = await fn([{"role": "user", "content": "text"}], "system prompt")
        assert result == "aux response"
        aux.chat.assert_awaited_once()

    async def test_callable_matches_compaction_fn_signature(self):
        client, _, _ = _make_client(enabled_tasks={"compaction"})
        fn = client.make_chat_fn("compaction")
        # CompactionFn signature: async (messages: list[dict], system: str) -> str
        result = await fn([{"role": "user", "content": "x"}], "system")
        assert isinstance(result, str)

    async def test_different_tasks_route_differently(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        compact_fn = client.make_chat_fn("compaction")
        reflect_fn = client.make_chat_fn("reflection")

        await compact_fn([], "s")
        await reflect_fn([], "s")

        aux.chat.assert_awaited_once()  # compaction → aux
        primary.chat.assert_awaited_once()  # reflection → primary (not enabled)


# ---------------------------------------------------------------------------
# make_codex_callback
# ---------------------------------------------------------------------------

class TestMakeCodexCallback:
    async def test_returns_callable(self):
        client, _, _ = _make_client()
        fn = client.make_codex_callback()
        assert callable(fn)

    async def test_callback_signature(self):
        client, _, _ = _make_client(enabled_tasks={"background_followup"})
        fn = client.make_codex_callback()
        # CodexCallback signature: async (messages, system, max_tokens) -> str
        result = await fn([{"role": "user", "content": "x"}], "system", 200)
        assert isinstance(result, str)

    async def test_max_tokens_passed_through(self):
        client, aux, _ = _make_client(enabled_tasks={"background_followup"})
        fn = client.make_codex_callback()
        await fn([], "system", 150)
        aux.chat.assert_awaited_once_with([], "system", max_tokens=150)

    async def test_custom_task(self):
        client, aux, primary = _make_client(enabled_tasks={"summarization"})
        fn = client.make_codex_callback(task="summarization")
        await fn([], "s", 100)
        aux.chat.assert_awaited_once()
        primary.chat.assert_not_awaited()


# ---------------------------------------------------------------------------
# get_metrics
# ---------------------------------------------------------------------------

class TestGetMetrics:
    def test_metrics_structure(self):
        client, _, _ = _make_client()
        m = client.get_metrics()
        assert "aux_model" in m
        assert "primary_model" in m
        assert "enabled_tasks" in m
        assert "aux_calls" in m
        assert "fallback_calls" in m
        assert "primary_direct_calls" in m
        assert "aux_breaker_state" in m

    def test_metrics_values(self):
        client, _, _ = _make_client(aux_model="gpt-4o-mini", primary_model="gpt-4o")
        m = client.get_metrics()
        assert m["aux_model"] == "gpt-4o-mini"
        assert m["primary_model"] == "gpt-4o"
        assert m["aux_calls"] == 0
        assert m["fallback_calls"] == 0

    async def test_metrics_after_calls(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        aux.chat = AsyncMock(return_value="")  # force fallback
        await client.chat([], "s", task="compaction")
        m = client.get_metrics()
        assert m["fallback_calls"] == 1

    def test_enabled_tasks_sorted(self):
        client, _, _ = _make_client(enabled_tasks={"reflection", "compaction", "consolidation"})
        m = client.get_metrics()
        assert m["enabled_tasks"] == ["compaction", "consolidation", "reflection"]


# ---------------------------------------------------------------------------
# close
# ---------------------------------------------------------------------------

class TestClose:
    async def test_close_calls_aux_close(self):
        client, aux, _ = _make_client()
        await client.close()
        aux.close.assert_awaited_once()


# ---------------------------------------------------------------------------
# Cost tracking
# ---------------------------------------------------------------------------

class TestCostTracking:
    async def test_aux_call_tracks_cost(self):
        tracker = CostTracker()
        client, aux, _ = _make_client(enabled_tasks={"compaction"}, cost_tracker=tracker)
        aux._last_input_tokens = 200
        aux._last_output_tokens = 80
        await client.chat([], "s", task="compaction")
        totals = tracker.get_totals()
        assert totals["requests"] == 1
        assert totals["input_tokens"] == 200
        assert totals["output_tokens"] == 80

    async def test_fallback_tracks_primary_cost(self):
        tracker = CostTracker()
        client, aux, primary = _make_client(enabled_tasks={"compaction"}, cost_tracker=tracker)
        aux.chat = AsyncMock(return_value="")  # force fallback
        primary._last_input_tokens = 300
        primary._last_output_tokens = 120
        await client.chat([], "s", task="compaction")
        totals = tracker.get_totals()
        assert totals["input_tokens"] == 300
        assert totals["output_tokens"] == 120

    async def test_no_tracker_no_error(self):
        client, _, _ = _make_client(cost_tracker=None)
        await client.chat([], "s", task="compaction")  # should not raise

    async def test_cost_user_id_includes_task(self):
        tracker = CostTracker()
        client, _, _ = _make_client(enabled_tasks={"compaction"}, cost_tracker=tracker)
        await client.chat([], "s", task="compaction")
        by_user = tracker.get_by_user()
        assert "auxiliary:compaction" in by_user

    async def test_cost_channel_id_is_system(self):
        tracker = CostTracker()
        client, _, _ = _make_client(enabled_tasks={"compaction"}, cost_tracker=tracker)
        await client.chat([], "s", task="compaction")
        by_channel = tracker.get_by_channel()
        assert "system" in by_channel


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    async def test_empty_enabled_tasks(self):
        client, _, primary = _make_client(enabled_tasks=set())
        result = await client.chat([], "s", task="compaction")
        assert result == "primary response"
        assert client._primary_direct_calls == 1

    async def test_concurrent_calls(self):
        client, aux, _ = _make_client(enabled_tasks={"compaction", "reflection"})
        results = await asyncio.gather(
            client.chat([], "s", task="compaction"),
            client.chat([], "s", task="reflection"),
        )
        assert all(r == "aux response" for r in results)
        assert client._aux_calls == 2

    async def test_primary_fallback_also_fails(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        aux.chat = AsyncMock(side_effect=RuntimeError("aux fail"))
        primary.chat = AsyncMock(side_effect=RuntimeError("primary fail"))
        with pytest.raises(RuntimeError, match="primary fail"):
            await client.chat([], "s", task="compaction")

    async def test_none_response_treated_as_empty(self):
        client, aux, primary = _make_client(enabled_tasks={"compaction"})
        aux.chat = AsyncMock(return_value=None)
        result = await client.chat([], "s", task="compaction")
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_chat_with_tools_counter_for_direct(self):
        client, _, _ = _make_client(enabled_tasks=set())
        await client.chat_with_tools([], "s", [], task="classification")
        assert client._primary_direct_calls == 1

    async def test_chat_with_tools_counter_for_aux(self):
        client, _, _ = _make_client(enabled_tasks={"classification"})
        await client.chat_with_tools([], "s", [], task="classification")
        assert client._aux_calls == 1


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------

class TestImports:
    def test_auxiliary_module_imports(self):
        from src.llm.auxiliary import AuxiliaryLLMClient, KNOWN_TASKS
        assert AuxiliaryLLMClient is not None
        assert KNOWN_TASKS is not None

    def test_llm_init_exports(self):
        from src.llm import AuxiliaryLLMClient
        assert AuxiliaryLLMClient is not None

    def test_config_exports(self):
        from src.config.schema import AuxiliaryLLMConfig
        assert AuxiliaryLLMConfig is not None
