"""Tests for history replay protection."""
from __future__ import annotations

import pytest
from src.sessions.manager import _sanitize_summary


class TestSanitizeSummary:
    def test_reframes_imperative_restart(self):
        summary = "restart cron on server"
        result = _sanitize_summary(summary)
        assert "[completed]" in result
        assert "restart" in result

    def test_reframes_imperative_deploy(self):
        summary = "deploy latest to production"
        result = _sanitize_summary(summary)
        assert "[completed]" in result

    def test_leaves_non_imperative_alone(self):
        summary = "The disk was at 85% usage on the server."
        result = _sanitize_summary(summary)
        assert "[completed]" not in result
        assert result == summary

    def test_reframes_multiple_imperatives(self):
        summary = "run df -h on all hosts\ncheck nginx status"
        result = _sanitize_summary(summary)
        assert result.count("[completed]") == 2

    def test_handles_empty_summary(self):
        assert _sanitize_summary("") == ""

    def test_preserves_completed_facts(self):
        summary = "Odin restarted cron successfully. Disk usage dropped to 42%."
        result = _sanitize_summary(summary)
        assert "42%" in result


class TestHistoryReadOnlyMarker:
    @pytest.mark.asyncio
    async def test_history_gets_readonly_marker(self, tmp_path):
        from src.sessions.manager import SessionManager
        mgr = SessionManager(
            max_history=100, max_age_hours=24,
            persist_dir=str(tmp_path / "sessions"),
        )
        mgr.add_message("ch1", "user", "restart cron")
        mgr.add_message("ch1", "assistant", "Done, cron restarted.")
        mgr.add_message("ch1", "user", "what time is it")

        messages = await mgr.get_task_history("ch1")
        developer_msgs = [m for m in messages if m["role"] == "developer"]
        assert any("HISTORY_READ_ONLY" in m["content"] for m in developer_msgs)

    @pytest.mark.asyncio
    async def test_single_message_no_marker(self, tmp_path):
        from src.sessions.manager import SessionManager
        mgr = SessionManager(
            max_history=100, max_age_hours=24,
            persist_dir=str(tmp_path / "sessions"),
        )
        mgr.add_message("ch1", "user", "hello")

        messages = await mgr.get_task_history("ch1")
        developer_msgs = [m for m in messages if m["role"] == "developer"]
        assert not any("HISTORY_READ_ONLY" in m.get("content", "") for m in developer_msgs)

    @pytest.mark.asyncio
    async def test_summary_sanitized(self, tmp_path):
        from src.sessions.manager import SessionManager
        mgr = SessionManager(
            max_history=100, max_age_hours=24,
            persist_dir=str(tmp_path / "sessions"),
        )
        session = mgr.get_or_create("ch1")
        session.summary = "restart nginx and deploy latest build"
        mgr.add_message("ch1", "user", "what happened earlier?")

        messages = await mgr.get_task_history("ch1")
        summary_msgs = [m for m in messages if "COMPLETED SUMMARY" in m.get("content", "")]
        assert any("[completed]" in m["content"] for m in summary_msgs)

    @pytest.mark.asyncio
    async def test_marker_before_summary(self, tmp_path):
        """HISTORY_READ_ONLY marker must appear before summary in message list."""
        from src.sessions.manager import SessionManager
        mgr = SessionManager(
            max_history=100, max_age_hours=24,
            persist_dir=str(tmp_path / "sessions"),
        )
        session = mgr.get_or_create("ch1")
        session.summary = "deploy latest build"
        mgr.add_message("ch1", "user", "old message")
        mgr.add_message("ch1", "assistant", "done")
        mgr.add_message("ch1", "user", "what happened?")

        messages = await mgr.get_task_history("ch1")
        marker_idx = None
        summary_idx = None
        for i, m in enumerate(messages):
            content = m.get("content", "")
            if "HISTORY_READ_ONLY" in content:
                marker_idx = i
            if "COMPLETED SUMMARY" in content:
                summary_idx = i
        assert marker_idx is not None, "HISTORY_READ_ONLY marker missing"
        assert summary_idx is not None, "Summary missing"
        assert marker_idx < summary_idx, f"Marker at {marker_idx} must be before summary at {summary_idx}"
