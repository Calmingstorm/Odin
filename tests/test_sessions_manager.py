"""Coverage for src/sessions/manager.py real-behaviour paths (RFC-006 P14, safe).

Two safe surfaces are exercised:
  1. A REAL SessionManager against a tmp persist dir — state ops, metrics, and
     compaction (the LLM compaction is the only faked boundary via
     set_compaction_fn), plus in-memory search_history and scrub_secrets.
  2. The module-level PURE helpers (summarize_tool_response, compute_activity_rate,
     apply_token_budget) and the pure _render_context_summary static method.

SAFE: no network, no LLM, no tool dispatch, real file storage in tmp only. The
archive round-trip bodies are already covered by the existing session suite; the
remaining uncovered lines here are these pure helpers and search/scrub branches.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.sessions.manager import (
    Session,
    SessionManager,
    apply_token_budget,
    compute_activity_rate,
    summarize_tool_response,
)


@pytest.fixture
def mgr(tmp_path):
    return SessionManager(max_history=100, max_age_hours=24,
                          persist_dir=str(tmp_path), token_budget=5000)


class TestStateOps:
    def test_add_get_history_and_state(self, mgr):
        mgr.add_message("c1", "user", "hello", user_id="u1")
        mgr.add_message("c1", "assistant", "hi there")
        assert mgr.count() == 1 and mgr.exists("c1") and "c1" in mgr.ids()
        hist = mgr.get_history("c1")
        assert len(hist) == 2 and hist[0]["content"] == "hello"
        snap = mgr.items_snapshot()
        assert snap[0][0] == "c1"
        assert mgr.get("c1") is not None and mgr.get("nope") is None

    def test_remove_last_message(self, mgr):
        mgr.add_message("c1", "user", "q")
        mgr.add_message("c1", "assistant", "a")
        assert mgr.remove_last_message("c1", "assistant") is True
        assert len(mgr.get_history("c1")) == 1
        assert mgr.remove_last_message("c1", "assistant") is False  # top is now 'user'

    def test_reset_and_clear(self, mgr):
        for cid in ("c1", "c2", "c3"):
            mgr.add_message(cid, "user", "x")
        assert mgr.reset_many(["c1", "c2"]) == 2
        assert mgr.exists("c3") and not mgr.exists("c1")
        mgr.reset("c3")
        assert not mgr.exists("c3")
        mgr.add_message("c4", "user", "y")
        assert mgr.clear_all() >= 1


class TestMetrics:
    def test_token_and_activity_metrics(self, mgr):
        mgr.add_message("c1", "user", "a message with some tokens in it")
        mgr.add_message("c2", "user", "another session")
        usage = mgr.get_session_token_usage()
        assert usage["c1"]["message_count"] == 1 and "budget_pct" in usage["c1"]
        tm = mgr.get_token_metrics()
        assert tm["session_count"] == 2 and tm["total_tokens"] >= 0
        act = mgr.get_activity_metrics()
        assert "c1" in act and "compaction_threshold" in act["c1"]

    def test_token_metrics_over_budget(self, tmp_path):
        m = SessionManager(max_history=1000, max_age_hours=24,
                           persist_dir=str(tmp_path), token_budget=1)
        for _ in range(3):
            m.add_message("c1", "user", "x" * 100)
        tm = m.get_token_metrics()
        assert tm["over_budget_count"] == 1  # tiny budget → the one session is over


class TestCompaction:
    async def test_compaction_triggers_with_fake_fn(self, tmp_path):
        m = SessionManager(max_history=1000, max_age_hours=24,
                           persist_dir=str(tmp_path), token_budget=1)  # tiny → always compacts
        fn = AsyncMock(return_value="a concise summary of earlier messages")
        m.set_compaction_fn(fn)
        for i in range(12):
            m.add_message("c1", "user" if i % 2 == 0 else "assistant", f"message number {i} " * 5)
        await m.get_history_with_compaction("c1")
        fn.assert_awaited()  # compaction ran
        session = m.get("c1")
        assert session is not None
        assert session.summary or len(session.messages) < 12

    async def test_get_task_history_relevance(self, tmp_path):
        m = SessionManager(max_history=1000, max_age_hours=24,
                           persist_dir=str(tmp_path), token_budget=5000)
        for i in range(15):
            m.add_message("c1", "user", f"unrelated chatter {i}")
        m.add_message("c1", "user", "database connection timeout error")
        hist = await m.get_task_history("c1", max_messages=12,
                                        current_query="database timeout")
        assert isinstance(hist, list)
        assert any("database" in str(msg.get("content", "")) for msg in hist)

    async def test_no_compaction_when_small(self, mgr):
        fn = AsyncMock(return_value="summary")
        mgr.set_compaction_fn(fn)
        mgr.add_message("c1", "user", "just one short message")
        await mgr.get_history_with_compaction("c1")
        fn.assert_not_awaited()  # under threshold → no compaction


class TestSearchHistory:
    """search_history over the in-memory sessions (archives empty, no vector/log store)."""

    async def test_matches_summary_segment_and_message(self, mgr):
        mgr._vector_store = None
        mgr._channel_logger = None
        mgr.add_message("c1", "user", "the database connection dropped", user_id="u1")
        session = mgr.get("c1")
        assert session is not None
        session.summary = "earlier we discussed a network outage"
        session.summary_segments = [
            {"summary": "a segment about caching layers", "end_ts": session.last_active},
        ]
        # message-body hit
        by_msg = await mgr.search_history("database", limit=10)
        assert any(r["type"] in ("user", "assistant") and "database" in r["content"]
                   for r in by_msg)
        # legacy-summary hit
        by_summary = await mgr.search_history("network outage", limit=10)
        assert any(r["type"] == "summary" for r in by_summary)
        # segment-summary hit
        by_seg = await mgr.search_history("caching", limit=10)
        assert any(r["type"] == "summary" and "caching" in r["content"] for r in by_seg)

    async def test_filters_and_limit(self, mgr):
        mgr._vector_store = None
        mgr._channel_logger = None
        mgr.add_message("c1", "user", "alpha keyword one", user_id="u1")
        mgr.add_message("c1", "user", "alpha keyword two", user_id="u2")
        mgr.add_message("c1", "user", "alpha keyword three", user_id="u1")
        # user_id filter keeps only u1's messages
        only_u1 = await mgr.search_history("alpha", limit=10, user_id="u1")
        assert only_u1 and all(r.get("user_id") == "u1" for r in only_u1)
        # limit caps the result count
        capped = await mgr.search_history("alpha", limit=1)
        assert len(capped) == 1
        # a timestamp window that excludes everything returns nothing
        none_after = await mgr.search_history("alpha", limit=10, after=9_999_999_999.0)
        assert none_after == []
        # a `before` far in the past likewise filters everything out
        none_before = await mgr.search_history("alpha", limit=10, before=1.0)
        assert none_before == []

    async def test_channel_id_filter_selects_single_session(self, mgr):
        mgr._vector_store = None
        mgr._channel_logger = None
        mgr.add_message("c1", "user", "shared keyword here")
        mgr.add_message("c2", "user", "shared keyword here too")
        res = await mgr.search_history("shared", limit=10, channel_id="c2")
        assert res and all(r["channel_id"] == "c2" for r in res)


class TestScrubSecrets:
    def test_scrub_removes_matching_message(self, mgr):
        mgr.add_message("c1", "user", "my api key is topsecret-token")
        mgr.add_message("c1", "assistant", "noted, thanks")
        assert mgr.scrub_secrets("c1", "topsecret-token") is True
        assert all("topsecret-token" not in m["content"] for m in mgr.get_history("c1"))

    def test_scrub_unknown_channel_and_no_match(self, mgr):
        assert mgr.scrub_secrets("nope", "anything") is False  # no such session
        mgr.add_message("c1", "user", "innocuous text")
        assert mgr.scrub_secrets("c1", "not-present") is False  # nothing removed


class TestRenderContextSummary:
    def _seg(self, summary, start=0.0, end=100.0, sid="s", topics=None, entities=None):
        return {"summary": summary, "start_ts": start, "end_ts": end, "id": sid,
                "topics": topics or [], "entities": entities or []}

    def test_recency_render_with_summary_and_segments(self):
        session = Session(channel_id="c1", messages=[], created_at=0.0, last_active=0.0,
                          summary="legacy summary text", last_user_id=None,
                          summary_segments=[self._seg("first segment", sid="a"),
                                            self._seg("second segment", sid="b")],
                          schema_version=1)
        out = SessionManager._render_context_summary(session, query=None)
        assert "legacy summary text" in out
        assert "first segment" in out and "second segment" in out
        assert "[Segment" in out  # header rendered

    def test_semantic_selection_with_query_and_trace(self):
        segs = [self._seg(f"segment number {i} about topic{i}", sid=str(i),
                          topics=[f"topic{i}"]) for i in range(6)]
        segs[2]["summary"] = "the critical database migration segment"
        session = Session(channel_id="c1", messages=[], created_at=0.0, last_active=0.0,
                          summary="", last_user_id=None, summary_segments=segs,
                          schema_version=1)
        trace = MagicMock()
        out = SessionManager._render_context_summary(
            session, query="database migration", max_segments=3, trace=trace)
        # query path selected relevant + newest; trace recorded per-segment decisions
        assert "database migration segment" in out
        trace.segment.assert_called()

    def test_empty_segment_summary_skipped_and_bad_timestamp(self):
        session = Session(channel_id="c1", messages=[], created_at=0.0, last_active=0.0,
                          summary="", last_user_id=None,
                          summary_segments=[self._seg("", sid="empty"),
                                            self._seg("kept", start=1e18, end=1e18, sid="k")],
                          schema_version=1)
        out = SessionManager._render_context_summary(session, query=None)
        assert "kept" in out            # the non-empty segment survives
        assert "[Segment]" in out       # out-of-range timestamp → bare header fallback


class TestPureHelpers:
    def test_summarize_below_threshold_or_short(self):
        # fewer than THRESHOLD tools → untouched
        assert summarize_tool_response("anything", ["t"] * 3) == "anything"
        # at threshold but response already short → untouched
        assert summarize_tool_response("short body", ["t"] * 12) == "short body"

    def test_summarize_multiparagraph_with_short_last(self):
        body = "intro paragraph\n\n" + "detail " * 400 + "\n\ndone"
        out = summarize_tool_response(body, [f"tool{i}" for i in range(12)])
        assert out.startswith("[Task used 12 tool calls")
        assert "done" in out and len(out) <= 2000  # trimmed to the char budget

    def test_summarize_caps_unique_tool_list(self):
        body = "x" * 2500 + "\n\noutcome"
        out = summarize_tool_response(body, [f"tool{i}" for i in range(20)])
        assert "(+5 more)" in out  # 20 unique tools, only 15 shown

    def test_summarize_single_block_no_paragraphs(self):
        body = "B" * 2500  # one long block, no paragraph breaks
        out = summarize_tool_response(body, [f"t{i}" for i in range(12)])
        assert out.startswith("[Task used")
        assert "B" in out

    def test_summarize_degenerate_whitespace_body(self):
        body = "\n" * 2500  # no extractable paragraphs → falls back to tail slice
        out = summarize_tool_response(body, [f"t{i}" for i in range(12)])
        assert out.startswith("[Task used")

    def test_compute_activity_rate_paths(self):
        def msgs(*ts):
            return [SimpleNamespace(timestamp=float(t)) for t in ts]
        assert compute_activity_rate(msgs(1.0)) == 0.0            # <2 messages
        assert compute_activity_rate(msgs(0.0, 100_000.0)) == 0.0  # window drops old → <2 recent
        assert compute_activity_rate(msgs(500.0, 500.0)) == 0.0    # zero span
        rate = compute_activity_rate(msgs(0.0, 900.0, 1800.0))     # 3 msgs over 0.5h
        assert rate > 0.0

    def test_apply_token_budget_drops_summary_pair_last(self):
        protected = [
            {"role": "user", "content": "[SESSION_CONTEXT_READ_ONLY] ctx a"},
            {"role": "assistant", "content": "[SESSION_CONTEXT_READ_ONLY] ctx b"},
        ]
        recent = [{"role": "user", "content": "big " * 300} for _ in range(12)]
        trimmed, dropped = apply_token_budget(protected + recent, budget=10)
        # recent alone blows the tiny budget → even the protected summary pair is dropped
        assert dropped >= 2
        assert all("[SESSION_CONTEXT_READ_ONLY]" not in m["content"] for m in trimmed)

    def test_apply_token_budget_noop_when_under(self):
        msgs = [{"role": "user", "content": "tiny"}]
        trimmed, dropped = apply_token_budget(msgs, budget=64000)
        assert trimmed == msgs and dropped == 0
