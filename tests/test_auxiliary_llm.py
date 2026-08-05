"""Tests for the auxiliary LLM client.

Tests the AuxiliaryLLMClient, AuxiliaryLLMConfig, the always-route chat path,
fallback behavior, cost tracking, factory functions, and lease/drain.

The auxiliary wrapper no longer gates on a per-task set: the gateway only
routes the fixed background jobs here, so ``chat`` ALWAYS tries the aux client
and falls back to the primary transparently on error. ``task`` labels the job
for cost/metrics only.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.config.schema import AuxiliaryLLMConfig, OpenAICodexConfig
from src.llm.auxiliary import AuxiliaryLLMClient
from src.llm.circuit_breaker import CircuitOpenError
from src.llm.cost_tracker import CostTracker

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_codex_mock(model: str = "gpt-4o-mini", chat_result: str = "aux response") -> MagicMock:
    """Create a mock CodexChatClient with common defaults."""
    client = MagicMock()
    client.model = model
    client.chat = AsyncMock(return_value=chat_result)
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
    cost_tracker: CostTracker | None = None,
) -> tuple[AuxiliaryLLMClient, MagicMock, MagicMock]:
    """Build an AuxiliaryLLMClient with mocked aux and primary clients."""
    aux = _make_codex_mock(model=aux_model, chat_result=aux_result)
    primary = _make_codex_mock(model=primary_model, chat_result=primary_result)
    client = AuxiliaryLLMClient(
        aux_client=aux,
        primary_client=primary,
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
        # Default is Luna (v3.62.x): the Codex catalog's cheap extraction/
        # classification tier; gpt-4o-mini is no longer in the catalog.
        assert cfg.model == "gpt-5.6-luna"

    def test_custom_values(self):
        cfg = AuxiliaryLLMConfig(enabled=True, model="gpt-3.5-turbo")
        assert cfg.enabled is True
        assert cfg.model == "gpt-3.5-turbo"

    def test_only_enabled_and_model_fields(self):
        # The config surface is exactly two knobs — per-task configuration,
        # max_tokens, and credentials_path were removed (auth + token limit are
        # shared with the main Codex client).
        assert set(AuxiliaryLLMConfig.model_fields) == {"enabled", "model"}

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


# ---------------------------------------------------------------------------
# AuxiliaryLLMClient.__init__
# ---------------------------------------------------------------------------

class TestInit:
    def test_basic_construction(self):
        client, aux, primary = _make_client()
        assert client.aux_client is aux
        assert client.primary_client is primary

    def test_initial_counters(self):
        client, _, _ = _make_client()
        assert client._aux_calls == 0
        assert client._fallback_calls == 0

    def test_cost_tracker_stored(self):
        tracker = CostTracker()
        client, _, _ = _make_client(cost_tracker=tracker)
        assert client.cost_tracker is tracker


# ---------------------------------------------------------------------------
# chat — always routes to aux
# ---------------------------------------------------------------------------

class TestChatRouting:
    async def test_uses_aux(self):
        client, aux, primary = _make_client()
        result = await client.chat(
            [{"role": "user", "content": "test"}],
            "system",
            task="compaction",
        )
        assert result == "aux response"
        aux.chat.assert_awaited_once()
        primary.chat.assert_not_awaited()

    async def test_max_tokens_forwarded_to_aux(self):
        client, aux, _ = _make_client()
        await client.chat(
            [{"role": "user", "content": "test"}],
            "system",
            task="compaction",
            max_tokens=100,
        )
        aux.chat.assert_awaited_once_with(
            [{"role": "user", "content": "test"}], "system", max_tokens=100,
        )

    async def test_max_tokens_forwarded_to_primary_on_fallback(self):
        client, aux, primary = _make_client()
        aux.chat = AsyncMock(return_value="")  # force fallback
        await client.chat(
            [{"role": "user", "content": "test"}],
            "system",
            task="compaction",
            max_tokens=200,
        )
        primary.chat.assert_awaited_once_with(
            [{"role": "user", "content": "test"}], "system", max_tokens=200,
        )


# ---------------------------------------------------------------------------
# chat — fallback
# ---------------------------------------------------------------------------

class TestChatFallback:
    async def test_fallback_on_empty_response(self):
        client, aux, primary = _make_client()
        aux.chat = AsyncMock(return_value="")
        result = await client.chat(
            [{"role": "user", "content": "test"}],
            "system",
            task="compaction",
        )
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_fallback_on_circuit_open(self):
        client, aux, primary = _make_client()
        aux.chat = AsyncMock(side_effect=CircuitOpenError("test", 30.0))
        result = await client.chat(
            [{"role": "user", "content": "test"}],
            "system",
            task="compaction",
        )
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_fallback_on_runtime_error(self):
        client, aux, primary = _make_client()
        aux.chat = AsyncMock(side_effect=RuntimeError("API error"))
        result = await client.chat(
            [{"role": "user", "content": "test"}],
            "system",
            task="compaction",
        )
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_fallback_on_connection_error(self):
        client, aux, primary = _make_client()
        aux.chat = AsyncMock(side_effect=ConnectionError("lost connection"))
        result = await client.chat(
            [{"role": "user", "content": "test"}],
            "system",
            task="compaction",
        )
        assert result == "primary response"
        assert client._fallback_calls == 1

    async def test_no_fallback_on_success(self):
        client, aux, primary = _make_client()
        result = await client.chat(
            [{"role": "user", "content": "test"}],
            "system",
            task="compaction",
        )
        assert result == "aux response"
        assert client._aux_calls == 1
        assert client._fallback_calls == 0


# ---------------------------------------------------------------------------
# chat — counters
# ---------------------------------------------------------------------------

class TestChatCounters:
    async def test_aux_call_increments(self):
        client, _, _ = _make_client()
        await client.chat([], "s", task="compaction")
        await client.chat([], "s", task="compaction")
        assert client._aux_calls == 2

    async def test_fallback_call_increments(self):
        client, aux, _ = _make_client()
        aux.chat = AsyncMock(return_value="")
        await client.chat([], "s", task="compaction")
        assert client._fallback_calls == 1


# ---------------------------------------------------------------------------
# make_chat_fn
# ---------------------------------------------------------------------------

class TestMakeChatFn:
    async def test_returns_callable(self):
        client, _, _ = _make_client()
        fn = client.make_chat_fn("compaction")
        assert callable(fn)

    async def test_callable_routes_to_aux(self):
        client, aux, _ = _make_client()
        fn = client.make_chat_fn("compaction")
        result = await fn([{"role": "user", "content": "text"}], "system prompt")
        assert result == "aux response"
        aux.chat.assert_awaited_once()

    async def test_callable_matches_compaction_fn_signature(self):
        client, _, _ = _make_client()
        fn = client.make_chat_fn("compaction")
        # CompactionFn signature: async (messages: list[dict], system: str) -> str
        result = await fn([{"role": "user", "content": "x"}], "system")
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# make_codex_callback
# ---------------------------------------------------------------------------

class TestMakeCodexCallback:
    async def test_returns_callable(self):
        client, _, _ = _make_client()
        fn = client.make_codex_callback()
        assert callable(fn)

    async def test_callback_signature(self):
        client, _, _ = _make_client()
        fn = client.make_codex_callback()
        # Background callback signature: async (messages, system, output_budget) -> str
        result = await fn([{"role": "user", "content": "x"}], "system", 200)
        assert isinstance(result, str)

    async def test_max_tokens_passed_through(self):
        client, aux, _ = _make_client()
        fn = client.make_codex_callback()
        await fn([], "system", 150)
        aux.chat.assert_awaited_once_with([], "system", max_tokens=150)

    async def test_custom_task(self):
        client, aux, primary = _make_client()
        fn = client.make_codex_callback(task="reflection")
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
        assert set(m) == {
            "aux_model", "primary_model", "aux_calls",
            "fallback_calls", "aux_breaker_state",
        }

    def test_metrics_values(self):
        client, _, _ = _make_client(aux_model="gpt-4o-mini", primary_model="gpt-4o")
        m = client.get_metrics()
        assert m["aux_model"] == "gpt-4o-mini"
        assert m["primary_model"] == "gpt-4o"
        assert m["aux_calls"] == 0
        assert m["fallback_calls"] == 0
        assert m["aux_breaker_state"] == "closed"

    async def test_metrics_after_calls(self):
        client, aux, primary = _make_client()
        aux.chat = AsyncMock(return_value="")  # force fallback
        await client.chat([], "s", task="compaction")
        m = client.get_metrics()
        assert m["fallback_calls"] == 1


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
        client, aux, _ = _make_client(cost_tracker=tracker)
        aux._last_input_tokens = 200
        aux._last_output_tokens = 80
        await client.chat([], "s", task="compaction")
        totals = tracker.get_totals()
        assert totals["requests"] == 1
        assert totals["input_tokens"] == 200
        assert totals["output_tokens"] == 80

    async def test_fallback_tracks_primary_cost(self):
        tracker = CostTracker()
        client, aux, primary = _make_client(cost_tracker=tracker)
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
        client, _, _ = _make_client(cost_tracker=tracker)
        await client.chat([], "s", task="compaction")
        by_user = tracker.get_by_user()
        assert "auxiliary:compaction" in by_user

    async def test_cost_channel_id_is_system(self):
        tracker = CostTracker()
        client, _, _ = _make_client(cost_tracker=tracker)
        await client.chat([], "s", task="compaction")
        by_channel = tracker.get_by_channel()
        assert "system" in by_channel


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    async def test_concurrent_calls(self):
        client, aux, _ = _make_client()
        results = await asyncio.gather(
            client.chat([], "s", task="compaction"),
            client.chat([], "s", task="reflection"),
        )
        assert all(r == "aux response" for r in results)
        assert client._aux_calls == 2

    async def test_primary_fallback_also_fails(self):
        client, aux, primary = _make_client()
        aux.chat = AsyncMock(side_effect=RuntimeError("aux fail"))
        primary.chat = AsyncMock(side_effect=RuntimeError("primary fail"))
        with pytest.raises(RuntimeError, match="primary fail"):
            await client.chat([], "s", task="compaction")

    async def test_none_response_treated_as_empty(self):
        client, aux, primary = _make_client()
        aux.chat = AsyncMock(return_value=None)
        result = await client.chat([], "s", task="compaction")
        assert result == "primary response"
        assert client._fallback_calls == 1


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------

class TestImports:
    def test_auxiliary_module_imports(self):
        from src.llm.auxiliary import AuxiliaryLLMClient
        assert AuxiliaryLLMClient is not None

    def test_llm_init_exports(self):
        from src.llm import AuxiliaryLLMClient
        assert AuxiliaryLLMClient is not None

    def test_config_exports(self):
        from src.config.schema import AuxiliaryLLMConfig
        assert AuxiliaryLLMConfig is not None


# ---------------------------------------------------------------------------
# Lease / drain — a retiring wrapper drains in-flight leased calls, never cut
# ---------------------------------------------------------------------------

class TestLease:
    async def test_drain_and_close_waits_for_inflight(self):
        client, aux, primary = _make_client()
        started = asyncio.Event()
        release = asyncio.Event()

        async def _slow(*a, **k):
            started.set()
            await release.wait()
            return "done"

        aux.chat = AsyncMock(side_effect=_slow)
        call = asyncio.create_task(client.chat([], "s", task="compaction"))
        await started.wait()
        # a drain started now must not close until the call finishes
        drain = asyncio.create_task(client.drain_and_close())
        await asyncio.sleep(0.05)
        assert not drain.done()
        assert not aux.close.called
        release.set()
        await call
        await drain
        aux.close.assert_awaited_once()

    async def test_drain_never_cuts_a_long_lease(self):
        # A legitimately long in-flight call is NEVER severed by a wall-clock
        # timeout — the drain waits for the lease to reach zero.
        client, aux, primary = _make_client()
        started = asyncio.Event()
        release = asyncio.Event()

        async def _long(*a, **k):
            started.set()
            await release.wait()
            return "done"

        aux.chat = AsyncMock(side_effect=_long)
        call = asyncio.create_task(client.chat([], "s", task="compaction"))
        await started.wait()
        drain = asyncio.create_task(client.drain_and_close())
        # even well past any old 30s wall-clock cut, the session stays open
        await asyncio.sleep(0.1)
        assert not drain.done()
        assert not aux.close.called
        release.set()
        await call
        await drain
        aux.close.assert_awaited_once()
        call.cancel()
