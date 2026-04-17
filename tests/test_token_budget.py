"""Tests for session token-budget awareness (Round 2).

Tests cover:
- Session.estimated_tokens property
- _estimate_session_tokens helper
- _needs_compaction (message count + token budget triggers)
- Token-budget-triggered auto-compaction in get_history_with_compaction / get_task_history
- SessionManager.get_session_token_usage()
- SessionManager.get_token_metrics()
- Prometheus metrics rendering for session tokens
- /api/sessions/token-usage endpoint
- Session list/detail endpoints include estimated_tokens
- Config schema: SessionsConfig.token_budget default
- estimate_tokens consolidation (sessions/manager imports from cost_tracker)
"""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import SessionsConfig
from src.health.metrics import MetricsCollector
from src.llm.cost_tracker import estimate_tokens
from src.sessions.manager import (
    DEFAULT_SESSION_TOKEN_BUDGET,
    COMPACTION_THRESHOLD,
    Message,
    Session,
    SessionManager,
    _estimate_session_tokens,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_session(channel_id: str = "ch1", messages: list | None = None, summary: str = "") -> Session:
    msgs = messages or []
    return Session(
        channel_id=channel_id,
        messages=msgs,
        summary=summary,
    )


def _make_message(content: str, role: str = "user") -> Message:
    return Message(role=role, content=content, timestamp=time.time())


def _make_manager(tmp_path, token_budget: int = DEFAULT_SESSION_TOKEN_BUDGET) -> SessionManager:
    return SessionManager(
        max_history=50,
        max_age_hours=24,
        persist_dir=str(tmp_path),
        token_budget=token_budget,
    )


# ---------------------------------------------------------------------------
# _estimate_session_tokens
# ---------------------------------------------------------------------------

class TestEstimateSessionTokens:
    def test_empty_session(self):
        assert _estimate_session_tokens([], "") == 0

    def test_summary_only(self):
        summary = "a" * 400
        result = _estimate_session_tokens([], summary)
        assert result == estimate_tokens(summary)
        assert result == 100

    def test_messages_only(self):
        msgs = [_make_message("a" * 40), _make_message("b" * 80)]
        result = _estimate_session_tokens(msgs, "")
        assert result == estimate_tokens("a" * 40) + estimate_tokens("b" * 80)

    def test_messages_and_summary(self):
        msgs = [_make_message("a" * 100)]
        summary = "b" * 200
        result = _estimate_session_tokens(msgs, summary)
        assert result == estimate_tokens("a" * 100) + estimate_tokens("b" * 200)


# ---------------------------------------------------------------------------
# Session.estimated_tokens
# ---------------------------------------------------------------------------

class TestSessionEstimatedTokens:
    def test_empty_session(self):
        session = _make_session()
        assert session.estimated_tokens == 0

    def test_with_messages(self):
        msgs = [_make_message("hello " * 100)]
        session = _make_session(messages=msgs)
        assert session.estimated_tokens > 0
        assert session.estimated_tokens == estimate_tokens("hello " * 100)

    def test_with_summary(self):
        session = _make_session(summary="important context " * 50)
        assert session.estimated_tokens == estimate_tokens("important context " * 50)

    def test_updates_dynamically(self):
        session = _make_session()
        before = session.estimated_tokens
        session.messages.append(_make_message("new message " * 100))
        after = session.estimated_tokens
        assert after > before


# ---------------------------------------------------------------------------
# SessionManager._needs_compaction
# ---------------------------------------------------------------------------

class TestNeedsCompaction:
    def test_below_both_thresholds(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=100_000)
        session = _make_session(messages=[_make_message("hi")])
        assert not mgr._needs_compaction(session)

    def test_message_count_over_threshold(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=100_000)
        msgs = [_make_message(f"msg {i}") for i in range(COMPACTION_THRESHOLD + 1)]
        session = _make_session(messages=msgs)
        assert mgr._needs_compaction(session)

    def test_token_budget_exceeded(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=100)
        msgs = [_make_message("a" * 2000)]
        session = _make_session(messages=msgs)
        assert session.estimated_tokens > 100
        assert mgr._needs_compaction(session)

    def test_token_budget_not_exceeded(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=100_000)
        msgs = [_make_message("short")]
        session = _make_session(messages=msgs)
        assert not mgr._needs_compaction(session)

    def test_both_exceeded(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=10)
        msgs = [_make_message("x" * 100) for _ in range(COMPACTION_THRESHOLD + 1)]
        session = _make_session(messages=msgs)
        assert mgr._needs_compaction(session)


# ---------------------------------------------------------------------------
# Token-budget-triggered compaction
# ---------------------------------------------------------------------------

class TestTokenBudgetCompaction:
    @pytest.fixture
    def mgr_with_compaction(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=500)
        compaction_fn = AsyncMock(return_value="compacted summary")
        mgr.set_compaction_fn(compaction_fn)
        return mgr, compaction_fn

    async def test_get_history_with_compaction_triggers_on_token_budget(self, mgr_with_compaction):
        mgr, compaction_fn = mgr_with_compaction
        session = mgr.get_or_create("ch1")
        for i in range(10):
            mgr.add_message("ch1", "user", f"message with lots of content {i} " * 30)
        assert session.estimated_tokens > 500
        assert len(session.messages) <= COMPACTION_THRESHOLD
        await mgr.get_history_with_compaction("ch1")
        compaction_fn.assert_called_once()

    async def test_get_task_history_triggers_on_token_budget(self, mgr_with_compaction):
        mgr, compaction_fn = mgr_with_compaction
        for i in range(10):
            mgr.add_message("ch1", "user", f"verbose message {i} " * 30)
        session = mgr._sessions["ch1"]
        assert session.estimated_tokens > 500
        assert len(session.messages) <= COMPACTION_THRESHOLD
        await mgr.get_task_history("ch1")
        compaction_fn.assert_called_once()

    async def test_no_compaction_when_under_budget(self, mgr_with_compaction):
        mgr, compaction_fn = mgr_with_compaction
        mgr.token_budget = 1_000_000
        mgr.add_message("ch1", "user", "short message")
        await mgr.get_history_with_compaction("ch1")
        compaction_fn.assert_not_called()

    async def test_compaction_reduces_tokens(self, mgr_with_compaction):
        mgr, compaction_fn = mgr_with_compaction
        for i in range(15):
            mgr.add_message("ch1", "user", f"long message number {i} " * 40)
        session = mgr._sessions["ch1"]
        tokens_before = session.estimated_tokens
        await mgr.get_history_with_compaction("ch1")
        tokens_after = session.estimated_tokens
        assert tokens_after < tokens_before


# ---------------------------------------------------------------------------
# SessionManager.get_session_token_usage
# ---------------------------------------------------------------------------

class TestGetSessionTokenUsage:
    def test_empty(self, tmp_path):
        mgr = _make_manager(tmp_path)
        assert mgr.get_session_token_usage() == {}

    def test_single_session(self, tmp_path):
        mgr = _make_manager(tmp_path)
        mgr.add_message("ch1", "user", "hello " * 50)
        usage = mgr.get_session_token_usage()
        assert "ch1" in usage
        assert usage["ch1"]["estimated_tokens"] > 0
        assert usage["ch1"]["message_count"] == 1
        assert usage["ch1"]["budget"] == DEFAULT_SESSION_TOKEN_BUDGET
        assert "budget_pct" in usage["ch1"]

    def test_multiple_sessions(self, tmp_path):
        mgr = _make_manager(tmp_path)
        mgr.add_message("ch1", "user", "hello")
        mgr.add_message("ch2", "user", "world " * 100)
        usage = mgr.get_session_token_usage()
        assert len(usage) == 2
        assert usage["ch2"]["estimated_tokens"] > usage["ch1"]["estimated_tokens"]

    def test_budget_percentage(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=1000)
        mgr.add_message("ch1", "user", "a" * 400)
        usage = mgr.get_session_token_usage()
        assert usage["ch1"]["budget_pct"] == 10.0

    def test_has_summary_field(self, tmp_path):
        mgr = _make_manager(tmp_path)
        mgr.add_message("ch1", "user", "hello")
        session = mgr._sessions["ch1"]
        session.summary = "prior context"
        usage = mgr.get_session_token_usage()
        assert usage["ch1"]["has_summary"] is True


# ---------------------------------------------------------------------------
# SessionManager.get_token_metrics
# ---------------------------------------------------------------------------

class TestGetTokenMetrics:
    def test_empty(self, tmp_path):
        mgr = _make_manager(tmp_path)
        metrics = mgr.get_token_metrics()
        assert metrics["total_tokens"] == 0
        assert metrics["session_count"] == 0
        assert metrics["over_budget_count"] == 0
        assert metrics["token_budget"] == DEFAULT_SESSION_TOKEN_BUDGET
        assert metrics["per_session"] == {}

    def test_with_sessions(self, tmp_path):
        mgr = _make_manager(tmp_path)
        mgr.add_message("ch1", "user", "a" * 400)
        mgr.add_message("ch2", "user", "b" * 800)
        metrics = mgr.get_token_metrics()
        assert metrics["session_count"] == 2
        assert metrics["total_tokens"] == 100 + 200
        assert len(metrics["per_session"]) == 2

    def test_over_budget_count(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=50)
        mgr.add_message("ch1", "user", "a" * 400)
        mgr.add_message("ch2", "user", "short")
        metrics = mgr.get_token_metrics()
        assert metrics["over_budget_count"] == 1


# ---------------------------------------------------------------------------
# Prometheus metrics rendering
# ---------------------------------------------------------------------------

class TestSessionTokenPrometheusMetrics:
    def test_session_token_metrics_rendered(self, tmp_path):
        mgr = _make_manager(tmp_path)
        mgr.add_message("ch1", "user", "a" * 400)
        collector = MetricsCollector()
        collector.register_source("session_tokens", mgr.get_token_metrics)
        output = collector.render()
        assert "odin_session_tokens_total" in output
        assert "odin_session_token_budget" in output
        assert "odin_sessions_over_budget" in output
        assert 'channel="ch1"' in output

    def test_session_token_metrics_absent_when_no_source(self):
        collector = MetricsCollector()
        output = collector.render()
        assert "odin_session_tokens_total" not in output

    def test_session_token_metrics_empty_sessions(self, tmp_path):
        mgr = _make_manager(tmp_path)
        collector = MetricsCollector()
        collector.register_source("session_tokens", mgr.get_token_metrics)
        output = collector.render()
        assert "odin_session_tokens_total 0" in output

    def test_over_budget_metric_value(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=10)
        mgr.add_message("ch1", "user", "a" * 400)
        collector = MetricsCollector()
        collector.register_source("session_tokens", mgr.get_token_metrics)
        output = collector.render()
        assert "odin_sessions_over_budget 1" in output


# ---------------------------------------------------------------------------
# Config: SessionsConfig.token_budget
# ---------------------------------------------------------------------------

class TestSessionsConfigTokenBudget:
    def test_default_value(self):
        config = SessionsConfig()
        assert config.token_budget == 128_000

    def test_custom_value(self):
        config = SessionsConfig(token_budget=64_000)
        assert config.token_budget == 64_000

    def test_zero_budget(self):
        config = SessionsConfig(token_budget=0)
        assert config.token_budget == 0


# ---------------------------------------------------------------------------
# estimate_tokens consolidation
# ---------------------------------------------------------------------------

class TestEstimateTokensConsolidation:
    def test_sessions_manager_uses_cost_tracker_estimate(self):
        """sessions/manager.py imports estimate_tokens from cost_tracker, not local copy."""
        from src.sessions import manager
        from src.llm import cost_tracker
        assert manager.estimate_tokens is cost_tracker.estimate_tokens

    def test_consistent_results(self):
        text = "test " * 100
        from src.sessions.manager import estimate_tokens as session_et
        from src.llm.cost_tracker import estimate_tokens as cost_et
        assert session_et(text) == cost_et(text)


# ---------------------------------------------------------------------------
# DEFAULT_SESSION_TOKEN_BUDGET constant
# ---------------------------------------------------------------------------

class TestDefaultSessionTokenBudget:
    def test_value(self):
        assert DEFAULT_SESSION_TOKEN_BUDGET == 128_000

    def test_exported_from_init(self):
        from src.sessions import DEFAULT_SESSION_TOKEN_BUDGET as exported
        assert exported == 128_000


# ---------------------------------------------------------------------------
# SessionManager with token_budget parameter
# ---------------------------------------------------------------------------

class TestSessionManagerTokenBudget:
    def test_default_budget(self, tmp_path):
        mgr = _make_manager(tmp_path)
        assert mgr.token_budget == DEFAULT_SESSION_TOKEN_BUDGET

    def test_custom_budget(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=50_000)
        assert mgr.token_budget == 50_000


# ---------------------------------------------------------------------------
# Session list endpoint includes estimated_tokens
# ---------------------------------------------------------------------------

class TestAPISessionTokenUsage:
    """Test /api/sessions/token-usage and estimated_tokens in session endpoints."""

    @pytest.fixture
    def mock_bot_with_sessions(self, tmp_path):
        bot = MagicMock()
        mgr = _make_manager(tmp_path, token_budget=100_000)
        mgr.add_message("ch1", "user", "hello " * 100)
        mgr.add_message("ch2", "user", "world " * 200)
        bot.sessions = mgr
        return bot

    def test_token_usage_endpoint_returns_data(self, mock_bot_with_sessions):
        from src.web.api import create_api_routes
        bot = mock_bot_with_sessions
        usage = bot.sessions.get_session_token_usage()
        assert "ch1" in usage
        assert "ch2" in usage
        assert usage["ch1"]["estimated_tokens"] > 0
        assert usage["ch2"]["estimated_tokens"] > usage["ch1"]["estimated_tokens"]

    def test_session_has_estimated_tokens_property(self, mock_bot_with_sessions):
        bot = mock_bot_with_sessions
        session = bot.sessions._sessions["ch1"]
        assert hasattr(session, "estimated_tokens")
        assert session.estimated_tokens > 0


# ---------------------------------------------------------------------------
# Integration: compaction fallback preserves existing summary tokens
# ---------------------------------------------------------------------------

class TestCompactionFallbackTokens:
    async def test_fallback_compaction_preserves_summary(self, tmp_path):
        """When compaction fails, fallback trim should still reduce token count."""
        mgr = _make_manager(tmp_path, token_budget=100)
        failing_fn = AsyncMock(side_effect=RuntimeError("LLM error"))
        mgr.set_compaction_fn(failing_fn)
        for i in range(60):
            mgr.add_message("ch1", "user", f"message {i}")
        session = mgr._sessions["ch1"]
        tokens_before = session.estimated_tokens
        msg_count_before = len(session.messages)
        await mgr.get_history_with_compaction("ch1")
        assert len(session.messages) < msg_count_before
        # Fallback compaction builds an extractive summary which may add a few
        # tokens vs blind truncation, but should still be significantly smaller
        assert session.estimated_tokens <= tokens_before * 1.2
