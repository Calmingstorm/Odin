"""Tests for LLM cost tracking and token estimation."""
from __future__ import annotations

import time

from src.llm.cost_tracker import CostTracker, UsageRecord, estimate_tokens

# ---------------------------------------------------------------------------
# estimate_tokens
# ---------------------------------------------------------------------------

class TestEstimateTokens:
    def test_empty_string(self):
        assert estimate_tokens("") == 1

    def test_short_string(self):
        assert estimate_tokens("hi") == 1

    def test_four_chars(self):
        assert estimate_tokens("abcd") == 1

    def test_eight_chars(self):
        assert estimate_tokens("abcdefgh") == 2

    def test_long_string(self):
        text = "a" * 400
        assert estimate_tokens(text) == 100

    def test_returns_int(self):
        assert isinstance(estimate_tokens("hello world"), int)


# ---------------------------------------------------------------------------
# CostTracker.record
# ---------------------------------------------------------------------------

class TestCostTrackerRecord:
    def test_record_returns_usage_record(self):
        tracker = CostTracker()
        rec = tracker.record(100, 50, user_id="u1", channel_id="c1")
        assert isinstance(rec, UsageRecord)
        assert rec.input_tokens == 100
        assert rec.output_tokens == 50
        assert rec.cost_usd > 0

    def test_record_updates_totals(self):
        tracker = CostTracker()
        tracker.record(100, 50)
        tracker.record(200, 100)
        totals = tracker.get_totals()
        assert totals["input_tokens"] == 300
        assert totals["output_tokens"] == 150
        assert totals["total_tokens"] == 450
        assert totals["requests"] == 2

    def test_record_tracks_by_user(self):
        tracker = CostTracker()
        tracker.record(100, 50, user_id="alice")
        tracker.record(200, 100, user_id="alice")
        tracker.record(50, 25, user_id="bob")
        by_user = tracker.get_by_user()
        assert by_user["alice"]["input_tokens"] == 300
        assert by_user["alice"]["requests"] == 2
        assert by_user["bob"]["input_tokens"] == 50

    def test_record_tracks_by_channel(self):
        tracker = CostTracker()
        tracker.record(100, 50, channel_id="ch1")
        tracker.record(200, 100, channel_id="ch2")
        by_channel = tracker.get_by_channel()
        assert "ch1" in by_channel
        assert "ch2" in by_channel
        assert by_channel["ch1"]["input_tokens"] == 100

    def test_record_tracks_by_tool(self):
        tracker = CostTracker()
        tracker.record(100, 50, tools_used=["run_command", "read_file"])
        tracker.record(200, 100, tools_used=["run_command"])
        by_tool = tracker.get_by_tool()
        assert by_tool["run_command"]["requests"] == 2
        assert by_tool["read_file"]["requests"] == 1

    def test_empty_user_channel_not_tracked(self):
        tracker = CostTracker()
        tracker.record(100, 50, user_id="", channel_id="")
        assert tracker.get_by_user() == {}
        assert tracker.get_by_channel() == {}

    def test_cost_calculation(self):
        tracker = CostTracker(input_price_per_1k=0.01, output_price_per_1k=0.03)
        rec = tracker.record(1000, 1000)
        # 1000 input tokens * 0.01/1K + 1000 output tokens * 0.03/1K = 0.04
        assert abs(rec.cost_usd - 0.04) < 1e-9

    def test_custom_pricing(self):
        tracker = CostTracker(input_price_per_1k=0.1, output_price_per_1k=0.2)
        rec = tracker.record(2000, 500)
        expected = (2000 / 1000) * 0.1 + (500 / 1000) * 0.2
        assert abs(rec.cost_usd - expected) < 1e-9


# ---------------------------------------------------------------------------
# CostTracker.get_recent
# ---------------------------------------------------------------------------

class TestCostTrackerRecent:
    def test_get_recent_returns_list(self):
        tracker = CostTracker()
        tracker.record(100, 50, user_id="u1")
        recent = tracker.get_recent()
        assert len(recent) == 1
        assert recent[0]["user_id"] == "u1"

    def test_get_recent_limit(self):
        tracker = CostTracker()
        for i in range(10):
            tracker.record(100, 50, user_id=f"u{i}")
        assert len(tracker.get_recent(limit=3)) == 3

    def test_recent_bounded(self):
        tracker = CostTracker()
        tracker._max_recent = 5
        for i in range(10):
            tracker.record(100, 50, user_id=f"u{i}")
        assert len(tracker._recent) == 5

    def test_recent_records_have_timestamp(self):
        tracker = CostTracker()
        before = time.time()
        tracker.record(100, 50)
        after = time.time()
        recent = tracker.get_recent()
        assert before <= recent[0]["timestamp"] <= after


# ---------------------------------------------------------------------------
# CostTracker.get_summary
# ---------------------------------------------------------------------------

class TestCostTrackerSummary:
    def test_summary_structure(self):
        tracker = CostTracker()
        tracker.record(100, 50, user_id="u1", channel_id="c1", tools_used=["t1"])
        summary = tracker.get_summary()
        assert "totals" in summary
        assert "by_user" in summary
        assert "by_channel" in summary
        assert "by_tool" in summary
        assert "recent" in summary
        assert "pricing" in summary

    def test_summary_pricing_includes_note(self):
        tracker = CostTracker()
        summary = tracker.get_summary()
        assert "note" in summary["pricing"]

    def test_summary_empty(self):
        tracker = CostTracker()
        summary = tracker.get_summary()
        assert summary["totals"]["requests"] == 0
        assert summary["by_user"] == {}


# ---------------------------------------------------------------------------
# LLMResponse token fields
# ---------------------------------------------------------------------------

class TestLLMResponseTokenFields:
    def test_default_zero(self):
        from src.llm.types import LLMResponse
        resp = LLMResponse()
        assert resp.input_tokens == 0
        assert resp.output_tokens == 0

    def test_set_tokens(self):
        from src.llm.types import LLMResponse
        resp = LLMResponse(input_tokens=100, output_tokens=50)
        assert resp.input_tokens == 100
        assert resp.output_tokens == 50


# ---------------------------------------------------------------------------
# CodexChatClient._estimate_body_input_tokens
# ---------------------------------------------------------------------------

class TestEstimateBodyInputTokens:
    def test_empty_body(self):
        from src.llm.openai_codex import CodexChatClient
        assert CodexChatClient._estimate_body_input_tokens({}) == 1

    def test_system_prompt_only(self):
        from src.llm.openai_codex import CodexChatClient
        body = {"instructions": "a" * 40}
        tokens = CodexChatClient._estimate_body_input_tokens(body)
        assert tokens == 10  # 40 chars / 4

    def test_messages_with_content(self):
        from src.llm.openai_codex import CodexChatClient
        body = {
            "instructions": "system",  # 6 chars
            "input": [
                {"content": [{"text": "hello world test msg"}]},  # 20 chars
            ],
        }
        tokens = CodexChatClient._estimate_body_input_tokens(body)
        assert tokens == 6  # (6 + 20) / 4 = 6.5 → 6

    def test_function_call_output(self):
        from src.llm.openai_codex import CodexChatClient
        body = {
            "instructions": "",
            "input": [
                {"output": "result text here", "content": []},
            ],
        }
        tokens = CodexChatClient._estimate_body_input_tokens(body)
        assert tokens == 4  # 16 chars / 4


# ---------------------------------------------------------------------------
# Edge case coverage (Round 10 tightening)
# ---------------------------------------------------------------------------

class TestCostTrackerEdgeCases:
    def test_estimate_tokens_converts_non_string(self):
        assert estimate_tokens(str(123)) >= 1

    def test_concurrent_record_thread_safety(self):
        import threading
        tracker = CostTracker()
        errors = []

        def record_many():
            try:
                for _ in range(100):
                    tracker.record(10, 5, user_id="u1")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=record_many) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert not errors
        assert tracker.get_totals()["requests"] == 500

    def test_get_recent_ordering(self):
        tracker = CostTracker()
        tracker.record(10, 5, user_id="first")
        tracker.record(20, 10, user_id="second")
        recent = tracker.get_recent(2)
        assert len(recent) == 2
        assert recent[0]["user_id"] == "first"
        assert recent[1]["user_id"] == "second"

    def test_record_with_no_user_or_channel(self):
        tracker = CostTracker()
        tracker.record(10, 5)
        totals = tracker.get_totals()
        assert totals["requests"] == 1
        assert tracker.get_by_user() == {}
