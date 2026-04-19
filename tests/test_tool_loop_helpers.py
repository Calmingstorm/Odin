"""Tests for pure helpers extracted from the Discord tool loop."""
from __future__ import annotations

import hashlib

from src.discord.tool_loop_helpers import (
    build_request_preamble,
    compute_request_id,
    current_request_time,
)


class TestComputeRequestId:
    def test_matches_sha256_prefix(self):
        assert compute_request_id("hello") == hashlib.sha256(b"hello").hexdigest()[:8]

    def test_non_string_coerced(self):
        assert compute_request_id(12345) == hashlib.sha256(b"12345").hexdigest()[:8]

    def test_is_eight_chars(self):
        assert len(compute_request_id("x")) == 8


class TestCurrentRequestTime:
    def test_format_utc(self):
        ts = current_request_time()
        # Shape: YYYY-MM-DD HH:MM:SS UTC
        assert len(ts) == 23
        assert ts.endswith("UTC")
        assert ts[4] == "-" and ts[7] == "-"
        assert ts[10] == " "


class TestBuildRequestPreamble:
    def _base_kwargs(self) -> dict:
        return dict(
            request_id="abc12345",
            request_time="2026-04-18 12:00:00 UTC",
            user_display="alice",
            user_id="9001",
            message_id="msg-1",
            channel_description="Channel: #ops",
            has_history=True,
        )

    def test_no_history_returns_thin_preamble(self):
        kw = self._base_kwargs()
        kw["has_history"] = False
        p = build_request_preamble(**kw)
        assert p["role"] == "developer"
        assert "Channel: #ops" in p["content"]
        assert "Current message ID: msg-1" in p["content"]
        assert "=== CURRENT REQUEST" not in p["content"]

    def test_with_history_includes_all_sections(self):
        p = build_request_preamble(**self._base_kwargs())
        body = p["content"]
        assert "=== CURRENT REQUEST [req-abc12345] ===" in body
        assert "2026-04-18 12:00:00 UTC" in body
        assert "From: alice (ID: 9001)" in body
        assert "Channel: #ops" in body
        assert "HISTORY ABOVE | REQUEST BELOW" in body

    def test_topic_change_block(self):
        p = build_request_preamble(**self._base_kwargs(), topic_change=True)
        assert "TOPIC CHANGE DETECTED" in p["content"]

    def test_bot_message_block(self):
        p = build_request_preamble(**self._base_kwargs(), from_another_bot=True)
        body = p["content"]
        assert "from ANOTHER BOT" in body
        assert "EXECUTE immediately" in body

    def test_default_has_neither_extra_block(self):
        body = build_request_preamble(**self._base_kwargs())["content"]
        assert "TOPIC CHANGE" not in body
        assert "ANOTHER BOT" not in body
