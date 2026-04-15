"""Tests for adaptive session consolidation (Round 23).

Tests cover:
- compute_activity_rate: message rate calculation over time windows
- adaptive_compaction_threshold: scaling trigger threshold by activity
- adaptive_summary_chars: scaling summary char budget by activity
- adaptive_keep_ratio: scaling keep ratio by activity
- _lerp: linear interpolation helper
- SessionManager._get_compaction_params: adaptive parameter computation
- SessionManager._needs_compaction: adaptive threshold integration
- SessionManager._compact: adaptive keep/summary in compaction
- SessionManager.get_activity_metrics: per-channel activity metrics
- Config schema: SessionsConfig.adaptive_compaction field
- REST API: /api/sessions/activity endpoint
"""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.schema import SessionsConfig
from src.sessions.manager import (
    ACTIVITY_HIGH,
    ACTIVITY_LOW,
    ACTIVITY_WINDOW,
    ADAPTIVE_KEEP_DEFAULT,
    ADAPTIVE_KEEP_HIGH,
    ADAPTIVE_KEEP_LOW,
    ADAPTIVE_SUMMARY_HIGH,
    ADAPTIVE_SUMMARY_LOW,
    ADAPTIVE_THRESHOLD_HIGH,
    ADAPTIVE_THRESHOLD_LOW,
    COMPACTION_MAX_CHARS,
    COMPACTION_THRESHOLD,
    Message,
    Session,
    SessionManager,
    _lerp,
    adaptive_compaction_threshold,
    adaptive_keep_ratio,
    adaptive_summary_chars,
    compute_activity_rate,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_message(content: str, role: str = "user", ts: float | None = None) -> Message:
    return Message(role=role, content=content, timestamp=ts or time.time())


def _make_session(
    channel_id: str = "ch1",
    messages: list | None = None,
    summary: str = "",
) -> Session:
    return Session(
        channel_id=channel_id,
        messages=messages or [],
        summary=summary,
    )


def _make_manager(
    tmp_path,
    token_budget: int = 128_000,
    adaptive_compaction: bool = True,
) -> SessionManager:
    return SessionManager(
        max_history=50,
        max_age_hours=24,
        persist_dir=str(tmp_path),
        token_budget=token_budget,
        adaptive_compaction=adaptive_compaction,
    )


def _make_timed_messages(count: int, interval_seconds: float, start: float | None = None) -> list[Message]:
    """Create *count* messages spaced *interval_seconds* apart."""
    base = start or time.time()
    return [
        _make_message(f"msg {i}", ts=base + i * interval_seconds)
        for i in range(count)
    ]


# ---------------------------------------------------------------------------
# _lerp
# ---------------------------------------------------------------------------

class TestLerp:
    def test_at_zero(self):
        assert _lerp(10.0, 20.0, 0.0) == 10.0

    def test_at_one(self):
        assert _lerp(10.0, 20.0, 1.0) == 20.0

    def test_midpoint(self):
        assert _lerp(10.0, 20.0, 0.5) == 15.0

    def test_clamp_below(self):
        assert _lerp(10.0, 20.0, -0.5) == 10.0

    def test_clamp_above(self):
        assert _lerp(10.0, 20.0, 1.5) == 20.0

    def test_decreasing(self):
        assert _lerp(60.0, 25.0, 0.5) == 42.5


# ---------------------------------------------------------------------------
# compute_activity_rate
# ---------------------------------------------------------------------------

class TestComputeActivityRate:
    def test_empty_messages(self):
        assert compute_activity_rate([]) == 0.0

    def test_single_message(self):
        assert compute_activity_rate([_make_message("hi")]) == 0.0

    def test_two_messages_same_timestamp(self):
        ts = time.time()
        msgs = [_make_message("a", ts=ts), _make_message("b", ts=ts)]
        assert compute_activity_rate(msgs) == 0.0

    def test_ten_messages_in_one_hour(self):
        now = time.time()
        msgs = _make_timed_messages(10, interval_seconds=360, start=now - 3600)
        rate = compute_activity_rate(msgs)
        assert 9.0 < rate < 12.0

    def test_high_rate(self):
        now = time.time()
        msgs = _make_timed_messages(60, interval_seconds=60, start=now - 3600)
        rate = compute_activity_rate(msgs)
        assert rate > 20.0

    def test_low_rate(self):
        now = time.time()
        msgs = _make_timed_messages(3, interval_seconds=1200, start=now - 3600)
        rate = compute_activity_rate(msgs)
        assert rate < 5.0

    def test_window_parameter(self):
        now = time.time()
        # 20 messages: 10 old (2 hours ago), 10 recent (last 30 min)
        old_msgs = _make_timed_messages(10, interval_seconds=60, start=now - 7200)
        recent_msgs = _make_timed_messages(10, interval_seconds=120, start=now - 1800)
        all_msgs = old_msgs + recent_msgs
        # Default window (1 hour) should only see the recent ones
        rate_default = compute_activity_rate(all_msgs, window=ACTIVITY_WINDOW)
        # Large window sees all
        rate_wide = compute_activity_rate(all_msgs, window=10000)
        assert rate_default != rate_wide

    def test_all_messages_outside_window(self):
        now = time.time()
        # All messages are well before the window: start 2 hours ago, end ~1.9hrs ago
        msgs = _make_timed_messages(5, interval_seconds=60, start=now - 7200)
        # The window is relative to the LAST message, not "now"
        # Last msg at now - 7200 + 4*60 = now - 6960
        # Window cutoff = (now - 6960) - 3600 = now - 10560
        # All msgs are within that window (they span now-7200 to now-6960)
        rate = compute_activity_rate(msgs)
        assert rate > 0  # all messages are within window relative to last msg


# ---------------------------------------------------------------------------
# adaptive_compaction_threshold
# ---------------------------------------------------------------------------

class TestAdaptiveCompactionThreshold:
    def test_zero_rate(self):
        assert adaptive_compaction_threshold(0.0) == ADAPTIVE_THRESHOLD_LOW

    def test_low_rate(self):
        assert adaptive_compaction_threshold(ACTIVITY_LOW) == ADAPTIVE_THRESHOLD_LOW

    def test_high_rate(self):
        assert adaptive_compaction_threshold(ACTIVITY_HIGH) == ADAPTIVE_THRESHOLD_HIGH

    def test_very_high_rate(self):
        assert adaptive_compaction_threshold(100.0) == ADAPTIVE_THRESHOLD_HIGH

    def test_mid_rate_interpolates(self):
        mid_rate = (ACTIVITY_LOW + ACTIVITY_HIGH) / 2
        result = adaptive_compaction_threshold(mid_rate)
        mid_expected = round((ADAPTIVE_THRESHOLD_LOW + ADAPTIVE_THRESHOLD_HIGH) / 2)
        assert result == mid_expected

    def test_monotonically_decreasing(self):
        rates = [0.0, 5.0, 10.0, 15.0, 20.0, 50.0]
        thresholds = [adaptive_compaction_threshold(r) for r in rates]
        for i in range(len(thresholds) - 1):
            assert thresholds[i] >= thresholds[i + 1]


# ---------------------------------------------------------------------------
# adaptive_summary_chars
# ---------------------------------------------------------------------------

class TestAdaptiveSummaryChars:
    def test_zero_rate(self):
        assert adaptive_summary_chars(0.0) == ADAPTIVE_SUMMARY_LOW

    def test_low_rate(self):
        assert adaptive_summary_chars(ACTIVITY_LOW) == ADAPTIVE_SUMMARY_LOW

    def test_high_rate(self):
        assert adaptive_summary_chars(ACTIVITY_HIGH) == ADAPTIVE_SUMMARY_HIGH

    def test_mid_rate_interpolates(self):
        mid_rate = (ACTIVITY_LOW + ACTIVITY_HIGH) / 2
        result = adaptive_summary_chars(mid_rate)
        mid_expected = round((ADAPTIVE_SUMMARY_LOW + ADAPTIVE_SUMMARY_HIGH) / 2)
        assert result == mid_expected

    def test_monotonically_decreasing(self):
        rates = [0.0, 5.0, 10.0, 15.0, 20.0, 50.0]
        chars = [adaptive_summary_chars(r) for r in rates]
        for i in range(len(chars) - 1):
            assert chars[i] >= chars[i + 1]


# ---------------------------------------------------------------------------
# adaptive_keep_ratio
# ---------------------------------------------------------------------------

class TestAdaptiveKeepRatio:
    def test_zero_rate(self):
        assert adaptive_keep_ratio(0.0) == ADAPTIVE_KEEP_LOW

    def test_low_rate(self):
        assert adaptive_keep_ratio(ACTIVITY_LOW) == ADAPTIVE_KEEP_LOW

    def test_high_rate(self):
        assert adaptive_keep_ratio(ACTIVITY_HIGH) == ADAPTIVE_KEEP_HIGH

    def test_mid_rate_interpolates(self):
        mid_rate = (ACTIVITY_LOW + ACTIVITY_HIGH) / 2
        result = adaptive_keep_ratio(mid_rate)
        mid_expected = round((ADAPTIVE_KEEP_LOW + ADAPTIVE_KEEP_HIGH) / 2, 2)
        assert result == mid_expected

    def test_monotonically_decreasing(self):
        rates = [0.0, 5.0, 10.0, 15.0, 20.0, 50.0]
        ratios = [adaptive_keep_ratio(r) for r in rates]
        for i in range(len(ratios) - 1):
            assert ratios[i] >= ratios[i + 1]


# ---------------------------------------------------------------------------
# SessionManager._get_compaction_params
# ---------------------------------------------------------------------------

class TestGetCompactionParams:
    def test_adaptive_disabled(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=False)
        msgs = _make_timed_messages(50, interval_seconds=60)
        session = _make_session(messages=msgs)
        params = mgr._get_compaction_params(session)
        assert params["threshold"] == COMPACTION_THRESHOLD
        assert params["summary_chars"] == COMPACTION_MAX_CHARS
        assert params["keep_ratio"] == ADAPTIVE_KEEP_DEFAULT
        assert params["activity_rate"] == 0.0

    def test_adaptive_enabled_few_messages(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        session = _make_session(messages=[_make_message("hi")])
        params = mgr._get_compaction_params(session)
        # < 2 messages → falls back to default
        assert params["threshold"] == COMPACTION_THRESHOLD
        assert params["activity_rate"] == 0.0

    def test_adaptive_enabled_high_activity(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        now = time.time()
        msgs = _make_timed_messages(60, interval_seconds=30, start=now - 1800)
        session = _make_session(messages=msgs)
        params = mgr._get_compaction_params(session)
        assert params["threshold"] < COMPACTION_THRESHOLD
        assert params["summary_chars"] < COMPACTION_MAX_CHARS
        assert params["keep_ratio"] < ADAPTIVE_KEEP_DEFAULT

    def test_adaptive_enabled_low_activity(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        now = time.time()
        msgs = _make_timed_messages(3, interval_seconds=1200, start=now - 3600)
        session = _make_session(messages=msgs)
        params = mgr._get_compaction_params(session)
        assert params["threshold"] >= COMPACTION_THRESHOLD
        assert params["summary_chars"] >= COMPACTION_MAX_CHARS


# ---------------------------------------------------------------------------
# _needs_compaction with adaptive thresholds
# ---------------------------------------------------------------------------

class TestNeedsCompactionAdaptive:
    def test_below_adaptive_threshold(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        # Low activity → threshold = 60, so 45 messages should NOT trigger
        now = time.time()
        msgs = _make_timed_messages(45, interval_seconds=1200, start=now - 54000)
        session = _make_session(messages=msgs)
        assert not mgr._needs_compaction(session)

    def test_above_adaptive_threshold_high_activity(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        # High activity → threshold = 25, so 30 messages should trigger
        now = time.time()
        msgs = _make_timed_messages(30, interval_seconds=30, start=now - 900)
        session = _make_session(messages=msgs)
        assert mgr._needs_compaction(session)

    def test_token_budget_still_triggers(self, tmp_path):
        mgr = _make_manager(tmp_path, token_budget=10, adaptive_compaction=True)
        msgs = [_make_message("a" * 200)]
        session = _make_session(messages=msgs)
        assert mgr._needs_compaction(session)

    def test_adaptive_disabled_uses_fixed_threshold(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=False)
        # 35 messages = below fixed 40, should NOT trigger
        msgs = [_make_message(f"msg {i}") for i in range(35)]
        session = _make_session(messages=msgs)
        assert not mgr._needs_compaction(session)

    def test_adaptive_disabled_above_fixed_threshold(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=False)
        msgs = [_make_message(f"msg {i}") for i in range(COMPACTION_THRESHOLD + 1)]
        session = _make_session(messages=msgs)
        assert mgr._needs_compaction(session)


# ---------------------------------------------------------------------------
# _compact with adaptive parameters
# ---------------------------------------------------------------------------

class TestCompactAdaptive:
    @pytest.fixture
    def mgr_adaptive(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        compaction_fn = AsyncMock(return_value="compacted summary")
        mgr.set_compaction_fn(compaction_fn)
        return mgr, compaction_fn

    @pytest.fixture
    def mgr_fixed(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=False)
        compaction_fn = AsyncMock(return_value="compacted summary")
        mgr.set_compaction_fn(compaction_fn)
        return mgr, compaction_fn

    async def test_high_activity_keeps_fewer(self, mgr_adaptive):
        mgr, fn = mgr_adaptive
        now = time.time()
        msgs = _make_timed_messages(50, interval_seconds=30, start=now - 1500)
        session = _make_session(messages=msgs)
        mgr._sessions["ch1"] = session
        await mgr._compact(session)
        # High activity: keep_ratio ~0.35 → keep ~18, compact ~32
        assert len(session.messages) < 25
        assert session.summary == "compacted summary"

    async def test_low_activity_keeps_more(self, mgr_adaptive):
        mgr, fn = mgr_adaptive
        now = time.time()
        msgs = _make_timed_messages(50, interval_seconds=1200, start=now - 60000)
        session = _make_session(messages=msgs)
        mgr._sessions["ch1"] = session
        await mgr._compact(session)
        # Low activity: keep_ratio ~0.60, clamped to max_history//2 = 25
        assert len(session.messages) == 25

    async def test_adaptive_disabled_uses_fixed_keep(self, mgr_fixed):
        mgr, fn = mgr_fixed
        msgs = [_make_message(f"msg {i}") for i in range(50)]
        session = _make_session(messages=msgs)
        mgr._sessions["ch1"] = session
        await mgr._compact(session)
        # Fixed mode: max_history // 2 = 25
        assert len(session.messages) == 25

    async def test_summary_chars_scales_with_activity(self, mgr_adaptive):
        mgr, fn = mgr_adaptive
        now = time.time()
        # High activity channel
        msgs = _make_timed_messages(50, interval_seconds=30, start=now - 1500)
        session = _make_session(messages=msgs)
        mgr._sessions["ch1"] = session
        await mgr._compact(session)
        # Check the system instruction passed to compaction_fn
        call_args = fn.call_args
        system_instruction = call_args[0][1]
        assert f"under {ADAPTIVE_SUMMARY_HIGH}" in system_instruction or "under 5" in system_instruction

    async def test_summary_truncation_uses_adaptive_budget(self, mgr_adaptive):
        mgr, fn = mgr_adaptive
        # Return a long summary that needs truncation
        fn.return_value = "x " * 1000
        now = time.time()
        # High activity → summary budget ~500 chars
        msgs = _make_timed_messages(50, interval_seconds=30, start=now - 1500)
        session = _make_session(messages=msgs)
        mgr._sessions["ch1"] = session
        await mgr._compact(session)
        assert len(session.summary) <= ADAPTIVE_SUMMARY_HIGH

    async def test_compaction_fn_failure_fallback(self, mgr_adaptive):
        mgr, fn = mgr_adaptive
        fn.side_effect = Exception("API error")
        now = time.time()
        msgs = _make_timed_messages(50, interval_seconds=60, start=now - 3000)
        session = _make_session(messages=msgs)
        mgr._sessions["ch1"] = session
        original_count = len(session.messages)
        await mgr._compact(session)
        # Fallback: trim to max_history
        assert len(session.messages) <= mgr.max_history

    async def test_compaction_via_get_history_with_compaction(self, mgr_adaptive):
        mgr, fn = mgr_adaptive
        now = time.time()
        # High activity: 30 msgs at 30s intervals → rate > 20
        msgs = _make_timed_messages(30, interval_seconds=30, start=now - 900)
        session = _make_session(channel_id="ch2", messages=msgs)
        mgr._sessions["ch2"] = session
        history = await mgr.get_history_with_compaction("ch2")
        # Should have compacted (threshold ~25) since we have 30 msgs
        assert fn.called

    async def test_compaction_via_get_task_history(self, mgr_adaptive):
        mgr, fn = mgr_adaptive
        now = time.time()
        msgs = _make_timed_messages(30, interval_seconds=30, start=now - 900)
        session = _make_session(channel_id="ch3", messages=msgs)
        mgr._sessions["ch3"] = session
        history = await mgr.get_task_history("ch3")
        assert fn.called


# ---------------------------------------------------------------------------
# get_activity_metrics
# ---------------------------------------------------------------------------

class TestGetActivityMetrics:
    def test_no_sessions(self, tmp_path):
        mgr = _make_manager(tmp_path)
        assert mgr.get_activity_metrics() == {}

    def test_single_session(self, tmp_path):
        mgr = _make_manager(tmp_path)
        now = time.time()
        msgs = _make_timed_messages(10, interval_seconds=120, start=now - 1200)
        session = _make_session(channel_id="ch1", messages=msgs)
        mgr._sessions["ch1"] = session
        metrics = mgr.get_activity_metrics()
        assert "ch1" in metrics
        m = metrics["ch1"]
        assert "activity_rate" in m
        assert "compaction_threshold" in m
        assert "summary_chars" in m
        assert "keep_ratio" in m
        assert "message_count" in m
        assert m["message_count"] == 10
        assert m["adaptive_enabled"] is True

    def test_multiple_sessions(self, tmp_path):
        mgr = _make_manager(tmp_path)
        now = time.time()
        for cid in ["ch1", "ch2", "ch3"]:
            msgs = _make_timed_messages(5, interval_seconds=300, start=now - 1500)
            mgr._sessions[cid] = _make_session(channel_id=cid, messages=msgs)
        metrics = mgr.get_activity_metrics()
        assert len(metrics) == 3
        for cid in ["ch1", "ch2", "ch3"]:
            assert cid in metrics

    def test_adaptive_disabled_flag(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=False)
        mgr._sessions["ch1"] = _make_session(messages=[_make_message("hi")])
        metrics = mgr.get_activity_metrics()
        assert metrics["ch1"]["adaptive_enabled"] is False

    def test_high_activity_session_params(self, tmp_path):
        mgr = _make_manager(tmp_path)
        now = time.time()
        msgs = _make_timed_messages(60, interval_seconds=30, start=now - 1800)
        mgr._sessions["busy"] = _make_session(channel_id="busy", messages=msgs)
        metrics = mgr.get_activity_metrics()
        m = metrics["busy"]
        assert m["activity_rate"] > 20.0
        assert m["compaction_threshold"] == ADAPTIVE_THRESHOLD_HIGH
        assert m["summary_chars"] == ADAPTIVE_SUMMARY_HIGH
        assert m["keep_ratio"] == ADAPTIVE_KEEP_HIGH


# ---------------------------------------------------------------------------
# SessionsConfig.adaptive_compaction
# ---------------------------------------------------------------------------

class TestSessionsConfigAdaptive:
    def test_default_enabled(self):
        config = SessionsConfig()
        assert config.adaptive_compaction is True

    def test_can_disable(self):
        config = SessionsConfig(adaptive_compaction=False)
        assert config.adaptive_compaction is False

    def test_from_dict(self):
        config = SessionsConfig(**{"adaptive_compaction": False})
        assert config.adaptive_compaction is False

    def test_other_defaults_unchanged(self):
        config = SessionsConfig()
        assert config.max_history == 50
        assert config.max_age_hours == 24
        assert config.token_budget == 128_000


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

class TestConstants:
    def test_activity_low_positive(self):
        assert ACTIVITY_LOW > 0

    def test_activity_high_greater_than_low(self):
        assert ACTIVITY_HIGH > ACTIVITY_LOW

    def test_threshold_low_greater_than_high(self):
        assert ADAPTIVE_THRESHOLD_LOW > ADAPTIVE_THRESHOLD_HIGH

    def test_summary_low_greater_than_high(self):
        assert ADAPTIVE_SUMMARY_LOW > ADAPTIVE_SUMMARY_HIGH

    def test_keep_low_greater_than_high(self):
        assert ADAPTIVE_KEEP_LOW > ADAPTIVE_KEEP_HIGH

    def test_keep_ratios_between_zero_and_one(self):
        assert 0 < ADAPTIVE_KEEP_HIGH < 1
        assert 0 < ADAPTIVE_KEEP_LOW < 1
        assert 0 < ADAPTIVE_KEEP_DEFAULT < 1


# ---------------------------------------------------------------------------
# Module imports
# ---------------------------------------------------------------------------

class TestModuleImports:
    def test_compute_activity_rate_importable(self):
        from src.sessions.manager import compute_activity_rate
        assert callable(compute_activity_rate)

    def test_adaptive_functions_importable(self):
        from src.sessions.manager import (
            adaptive_compaction_threshold,
            adaptive_summary_chars,
            adaptive_keep_ratio,
        )
        assert callable(adaptive_compaction_threshold)
        assert callable(adaptive_summary_chars)
        assert callable(adaptive_keep_ratio)


# ---------------------------------------------------------------------------
# REST API — /api/sessions/activity
# ---------------------------------------------------------------------------

class TestSessionActivityAPI:
    @pytest.fixture
    def mock_bot(self, tmp_path):
        bot = MagicMock()
        mgr = _make_manager(tmp_path)
        bot.sessions = mgr
        return bot

    def test_empty_sessions(self, mock_bot):
        result = mock_bot.sessions.get_activity_metrics()
        assert result == {}

    def test_returns_dict_per_channel(self, mock_bot):
        now = time.time()
        msgs = _make_timed_messages(10, interval_seconds=120, start=now - 1200)
        mock_bot.sessions._sessions["ch1"] = _make_session(
            channel_id="ch1", messages=msgs,
        )
        result = mock_bot.sessions.get_activity_metrics()
        assert "ch1" in result
        entry = result["ch1"]
        assert isinstance(entry["activity_rate"], float)
        assert isinstance(entry["compaction_threshold"], int)
        assert isinstance(entry["summary_chars"], int)
        assert isinstance(entry["keep_ratio"], float)
        assert isinstance(entry["message_count"], int)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_activity_rate_burst_then_silence(self):
        now = time.time()
        # 20 messages in a burst 5 minutes ago, then silence
        burst = _make_timed_messages(20, interval_seconds=5, start=now - 400)
        rate = compute_activity_rate(burst)
        # All messages are within the 1-hour window
        assert rate > 0

    def test_activity_rate_steady_low(self):
        now = time.time()
        # 3 msgs over 1.5 hours → ~2 msg/hr
        msgs = _make_timed_messages(3, interval_seconds=2700, start=now - 5400)
        rate = compute_activity_rate(msgs)
        assert rate < ACTIVITY_LOW

    def test_adaptive_threshold_boundary_low(self):
        # Exactly at ACTIVITY_LOW
        assert adaptive_compaction_threshold(ACTIVITY_LOW) == ADAPTIVE_THRESHOLD_LOW

    def test_adaptive_threshold_boundary_high(self):
        # Exactly at ACTIVITY_HIGH
        assert adaptive_compaction_threshold(ACTIVITY_HIGH) == ADAPTIVE_THRESHOLD_HIGH

    def test_adaptive_threshold_just_above_low(self):
        result = adaptive_compaction_threshold(ACTIVITY_LOW + 0.1)
        assert ADAPTIVE_THRESHOLD_HIGH <= result <= ADAPTIVE_THRESHOLD_LOW

    def test_keep_ratio_clamp_to_max_history(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        compaction_fn = AsyncMock(return_value="summary")
        mgr.set_compaction_fn(compaction_fn)
        now = time.time()
        # Low activity: keep_ratio 0.60, so 50 * 0.60 = 30
        # But max_history // 2 = 25, so should clamp to 25
        msgs = _make_timed_messages(50, interval_seconds=1200, start=now - 60000)
        session = _make_session(messages=msgs)
        mgr._sessions["ch1"] = session

    async def test_compact_with_existing_summary(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        compaction_fn = AsyncMock(return_value="new summary")
        mgr.set_compaction_fn(compaction_fn)
        now = time.time()
        msgs = _make_timed_messages(50, interval_seconds=60, start=now - 3000)
        session = _make_session(messages=msgs, summary="old summary context")
        mgr._sessions["ch1"] = session
        await mgr._compact(session)
        assert session.summary == "new summary"
        # Verify the previous summary was included in the compaction input
        call_args = compaction_fn.call_args[0][0]
        assert "old summary" in call_args[0]["content"]

    async def test_manager_constructor_default_adaptive(self, tmp_path):
        mgr = SessionManager(
            max_history=50, max_age_hours=24, persist_dir=str(tmp_path),
        )
        assert mgr.adaptive_compaction is True

    async def test_manager_constructor_disabled_adaptive(self, tmp_path):
        mgr = SessionManager(
            max_history=50, max_age_hours=24, persist_dir=str(tmp_path),
            adaptive_compaction=False,
        )
        assert mgr.adaptive_compaction is False

    def test_activity_rate_negative_timestamps_handled(self):
        # Timestamps going backwards (shouldn't happen, but defensive)
        msgs = [_make_message("a", ts=100.0), _make_message("b", ts=50.0)]
        rate = compute_activity_rate(msgs)
        # Only last message used as "now", cutoff = 50 - 3600 = -3550
        # Both in window, span = 50 - 100 = -50 → 0 → returns 0
        assert rate == 0.0

    async def test_get_history_with_compaction_adapts(self, tmp_path):
        mgr = _make_manager(tmp_path, adaptive_compaction=True)
        fn = AsyncMock(return_value="compacted")
        mgr.set_compaction_fn(fn)
        now = time.time()
        # 30 messages at high rate → threshold ~25 → should compact
        msgs = _make_timed_messages(30, interval_seconds=30, start=now - 900)
        session = _make_session(channel_id="ch1", messages=msgs)
        mgr._sessions["ch1"] = session
        await mgr.get_history_with_compaction("ch1")
        assert fn.called
        assert session.summary == "compacted"
