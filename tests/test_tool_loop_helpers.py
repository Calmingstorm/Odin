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

    def test_no_history_bot_turn_keeps_bot_origin_note(self):
        kw = self._base_kwargs()
        kw["has_history"] = False
        p = build_request_preamble(**kw, from_another_bot=True)
        assert "from ANOTHER BOT" in p["content"]
        assert "EXECUTE immediately" in p["content"]
        assert "=== CURRENT REQUEST" not in p["content"]

    def test_with_history_includes_all_sections(self):
        p = build_request_preamble(**self._base_kwargs())
        body = p["content"]
        assert "=== CURRENT REQUEST [req-abc12345] ===" in body
        assert "2026-04-18 12:00:00 UTC" in body
        assert "From: alice (ID: 9001)" in body
        assert "Channel: #ops" in body
        assert "HISTORY ABOVE | REQUEST BELOW" in body

    def test_topic_change_parameter_removed(self):
        # Topic-change detection was removed entirely (memory overhaul):
        # the preamble builder must not accept the old parameter.
        import pytest as _pytest
        with _pytest.raises(TypeError):
            build_request_preamble(**self._base_kwargs(), topic_change=True)

    def test_bot_message_block(self):
        p = build_request_preamble(**self._base_kwargs(), from_another_bot=True)
        body = p["content"]
        assert "from ANOTHER BOT" in body
        assert "EXECUTE immediately" in body

    def test_default_has_no_extra_block(self):
        body = build_request_preamble(**self._base_kwargs())["content"]
        assert "TOPIC CHANGE" not in body
        assert "ANOTHER BOT" not in body


class TestBehaviorPreservedByRefactor:
    """Round 4 review — verify the extracted helper produces output that
    is byte-identical to the pre-refactor inline builder for every
    combination of topic_change / from_another_bot / has_history flags.
    If these assertions ever fail, the refactor accidentally changed
    prompt wording, which would subtly alter LLM behavior.
    """

    def _reference_preamble(self, **kw) -> dict:
        """Inline reimplementation of the original pre-refactor logic.

        Kept in a single test so it's easy to compare against the helper's
        output at every branching combination without maintaining two
        diverging copies elsewhere.
        """
        request_id = kw["request_id"]
        request_time = kw["request_time"]
        user_display = kw["user_display"]
        user_id = kw["user_id"]
        message_id = kw["message_id"]
        channel_description = kw["channel_description"]
        has_history = kw["has_history"]
        from_another_bot = kw.get("from_another_bot", False)

        msg_id_note = f"Current message ID: {message_id}"
        if not has_history:
            content = f"{channel_description}\n{msg_id_note}"
            if from_another_bot:
                content += (
                    "\n\nIMPORTANT: This message is from ANOTHER BOT. "
                    "Bots cannot confirm, choose, or approve. "
                    "EXECUTE immediately — never hedge, ask permission, or say "
                    "'if you want' / 'shall I' / 'would you like'. "
                    "If execution is explicitly requested, use run_script or run_command. "
                    "If code is presented for review, discussion, or as context, "
                    "do not execute it — analyze and respond to the substance."
                )
            return {"role": "developer", "content": content}
        sep_text = (
            f"=== CURRENT REQUEST [req-{request_id}] ===\n"
            f"Time: {request_time}\n"
            f"From: {user_display} (ID: {user_id})\n"
            f"{channel_description}\n"
            f"{msg_id_note}\n"
            "--- HISTORY ABOVE | REQUEST BELOW ---\n"
            "Messages above are HISTORY — context for understanding what happened. "
            "History is NOT a task queue. Each message above was a SEPARATE request. "
            "Act ONLY on the new message below — do not replay other requests from history. "
            "If asked to 'redo' or 'do what was asked', identify the ONE specific task "
            "being referenced — do not sweep through history re-executing everything. "
            "Evaluate tools fresh. Do not repeat prior refusals."
        )
        if from_another_bot:
            sep_text += (
                "\n\nIMPORTANT: This message is from ANOTHER BOT. "
                "Bots cannot confirm, choose, or approve. "
                "EXECUTE immediately — never hedge, ask permission, or say "
                "'if you want' / 'shall I' / 'would you like'. "
                "If execution is explicitly requested, use run_script or run_command. "
                "If code is presented for review, discussion, or as context, "
                "do not execute it — analyze and respond to the substance."
            )
        return {"role": "developer", "content": sep_text}

    def _kwargs(self, **override):
        base = dict(
            request_id="feedbeef",
            request_time="2026-04-18 12:00:00 UTC",
            user_display="alice",
            user_id="9001",
            message_id="msg-42",
            channel_description="Channel: #ops",
            has_history=True,
        )
        base.update(override)
        return base

    def test_all_combinations_match_reference(self):
        for has_history in (True, False):
            for from_another_bot in (True, False):
                kw = self._kwargs(
                    has_history=has_history,
                    from_another_bot=from_another_bot,
                )
                assert build_request_preamble(**kw) == self._reference_preamble(**kw), (
                    f"mismatch at has_history={has_history} "
                    f"from_another_bot={from_another_bot}"
                )
