"""Tests for session archive restore-on-demand and rolling summary segments.

Covers the memory-overhaul guarantees:
- pruned sessions come back in full from the archive, regardless of age
- archives are never deleted by time, only by size/count caps
- idle gaps close conversation segments at the natural boundary
- v1 session files (no schema_version / summary_segments) load transparently
- segment text is never silently chopped
"""
from __future__ import annotations

import json
import time

import pytest

from src.sessions.manager import (
    SEGMENT_HARD_CHARS,
    SEGMENT_IDLE_GAP_SECONDS,
    SEGMENT_MIN_MESSAGES,
    SEGMENT_TRUNCATION_MARKER,
    SESSION_SCHEMA_VERSION,
    Message,
    Session,
    SessionManager,
)


def _make_manager(tmp_path, **kw) -> SessionManager:
    defaults = dict(
        max_history=50,
        max_age_hours=1,
        persist_dir=str(tmp_path),
        adaptive_compaction=False,
    )
    defaults.update(kw)
    return SessionManager(**defaults)


def _fill_session(mgr, channel_id: str, count: int = 10, age_hours: float = 0.0):
    for i in range(count):
        mgr.add_message(channel_id, "user" if i % 2 == 0 else "assistant",
                        f"message {i}", user_id="42" if i % 2 == 0 else None)
    session = mgr.get(channel_id)
    if age_hours:
        session.last_active = time.time() - age_hours * 3600
        for m in session.messages:
            m.timestamp = session.last_active
    return session


class TestRestoreOnDemand:
    def test_pruned_session_restores_in_full(self, tmp_path):
        mgr = _make_manager(tmp_path)
        _fill_session(mgr, "ch1", count=12, age_hours=2)  # past 1h TTL
        assert mgr.prune() == 1
        assert not mgr.exists("ch1")

        restored = mgr.get_or_create("ch1")
        assert len(restored.messages) == 12
        assert restored.messages[0].content == "message 0"
        assert restored.messages[0].user_id == "42"

    def test_restore_ignores_archive_age(self, tmp_path):
        """The old 48h continuity window is gone — any-age archives restore."""
        mgr = _make_manager(tmp_path)
        _fill_session(mgr, "ch1", count=6, age_hours=2)
        mgr.prune()
        # Make the archive look 30 days old
        archive_dir = tmp_path / "archive"
        old = next(archive_dir.glob("ch1_*.json"))
        month_ago = time.time() - 30 * 86400
        data = json.loads(old.read_text())
        data["last_active"] = month_ago
        renamed = archive_dir / f"ch1_{int(month_ago)}.json"
        renamed.write_text(json.dumps(data))
        old.unlink()

        restored = mgr.get_or_create("ch1")
        assert len(restored.messages) == 6

    def test_restore_picks_latest_archive(self, tmp_path):
        mgr = _make_manager(tmp_path)
        archive_dir = tmp_path / "archive"
        archive_dir.mkdir()
        for ts, marker in ((1000, "older"), (2000, "newer")):
            data = {
                "channel_id": "ch1",
                "messages": [{"role": "user", "content": marker, "timestamp": ts, "user_id": None}],
                "created_at": ts,
                "last_active": ts,
                "summary": "",
                "last_user_id": None,
            }
            (archive_dir / f"ch1_{ts}.json").write_text(json.dumps(data))

        restored = mgr.get_or_create("ch1")
        assert restored.messages[0].content == "newer"

    def test_segments_survive_prune_restore_cycle(self, tmp_path):
        mgr = _make_manager(tmp_path)
        session = _fill_session(mgr, "ch1", count=6, age_hours=2)
        session.summary_segments.append({
            "id": "seg_1", "summary": "earlier work on the scheduler",
            "start_ts": 1.0, "end_ts": 2.0, "participants": ["42"],
            "source_count": 30, "created_at": 3.0,
            "topics": ["scheduler"], "entities": [], "decisions": [], "open_threads": [],
        })
        mgr.prune()
        restored = mgr.get_or_create("ch1")
        assert len(restored.summary_segments) == 1
        assert restored.summary_segments[0]["summary"] == "earlier work on the scheduler"

    def test_fresh_channel_without_archive_starts_empty(self, tmp_path):
        mgr = _make_manager(tmp_path)
        session = mgr.get_or_create("brand-new")
        assert session.messages == []
        assert session.summary_segments == []

    def test_corrupt_archive_falls_back_to_fresh(self, tmp_path):
        mgr = _make_manager(tmp_path)
        archive_dir = tmp_path / "archive"
        archive_dir.mkdir()
        (archive_dir / "ch1_1000.json").write_text("{not json")
        session = mgr.get_or_create("ch1")
        assert session.messages == []


class TestV1SchemaLoad:
    def test_v1_session_file_loads(self, tmp_path):
        """Old persisted sessions (no schema_version/summary_segments) load."""
        data = {
            "channel_id": "legacy",
            "messages": [{"role": "user", "content": "old", "timestamp": 1.0, "user_id": "7"}],
            "created_at": 1.0,
            "last_active": time.time(),
            "summary": "old style summary",
            "last_user_id": "7",
        }
        (tmp_path / "legacy.json").write_text(json.dumps(data))
        mgr = _make_manager(tmp_path)
        mgr.load()
        session = mgr.get("legacy")
        assert session is not None
        assert session.summary == "old style summary"
        assert session.summary_segments == []
        assert session.schema_version == SESSION_SCHEMA_VERSION

    def test_saved_session_includes_v2_fields(self, tmp_path):
        mgr = _make_manager(tmp_path)
        _fill_session(mgr, "ch1", count=2)
        mgr.save()
        data = json.loads((tmp_path / "ch1.json").read_text())
        assert data["schema_version"] == SESSION_SCHEMA_VERSION
        assert data["summary_segments"] == []


class TestArchiveRetention:
    def test_no_time_based_deletion(self, tmp_path):
        """Archives older than the old 7-day window must survive pruning."""
        mgr = _make_manager(tmp_path)
        archive_dir = tmp_path / "archive"
        archive_dir.mkdir()
        import os
        old_file = archive_dir / "ch9_100.json"
        old_file.write_text("{}")
        month_ago = time.time() - 30 * 86400
        os.utime(old_file, (month_ago, month_ago))

        mgr._prune_old_archives(archive_dir)
        assert old_file.exists()

    def test_file_count_cap_prunes_oldest(self, tmp_path):
        import os
        mgr = _make_manager(tmp_path, archive_max_files=3)
        archive_dir = tmp_path / "archive"
        archive_dir.mkdir()
        for i in range(5):
            f = archive_dir / f"ch{i}_100.json"
            f.write_text("{}")
            os.utime(f, (1000 + i, 1000 + i))
        mgr._prune_old_archives(archive_dir)
        remaining = sorted(p.name for p in archive_dir.glob("*.json"))
        assert remaining == ["ch2_100.json", "ch3_100.json", "ch4_100.json"]

    def test_byte_cap_prunes_oldest(self, tmp_path):
        import os
        mgr = _make_manager(tmp_path, archive_max_bytes=250)
        archive_dir = tmp_path / "archive"
        archive_dir.mkdir()
        for i in range(3):
            f = archive_dir / f"ch{i}_100.json"
            f.write_text("x" * 100)
            os.utime(f, (1000 + i, 1000 + i))
        mgr._prune_old_archives(archive_dir)
        remaining = sorted(p.name for p in archive_dir.glob("*.json"))
        assert remaining == ["ch1_100.json", "ch2_100.json"]


class TestIdleSplit:
    def _timed(self, specs):
        return [Message(role="user", content=f"m{i}", timestamp=ts)
                for i, ts in enumerate(specs)]

    def test_no_gap_no_split(self):
        msgs = self._timed([1000 + i * 60 for i in range(30)])
        assert SessionManager._find_idle_split(msgs) is None

    def test_gap_after_enough_messages_splits(self):
        base = [1000 + i * 60 for i in range(SEGMENT_MIN_MESSAGES)]
        after_gap = base[-1] + SEGMENT_IDLE_GAP_SECONDS + 60
        msgs = self._timed(base + [after_gap, after_gap + 60])
        assert SessionManager._find_idle_split(msgs) == SEGMENT_MIN_MESSAGES

    def test_gap_with_too_few_messages_does_not_split(self):
        base = [1000 + i * 60 for i in range(SEGMENT_MIN_MESSAGES - 5)]
        after_gap = base[-1] + SEGMENT_IDLE_GAP_SECONDS + 60
        msgs = self._timed(base + [after_gap])
        assert SessionManager._find_idle_split(msgs) is None

    @pytest.mark.asyncio
    async def test_idle_split_closes_segment_at_gap(self, tmp_path):
        from unittest.mock import AsyncMock
        mgr = _make_manager(tmp_path)
        mgr.set_compaction_fn(AsyncMock(return_value="vacation-era summary"))
        base_ts = time.time() - SEGMENT_IDLE_GAP_SECONDS * 2
        session = Session(channel_id="ch1")
        for i in range(20):
            session.messages.append(
                Message(role="user", content=f"old {i}", timestamp=base_ts + i * 60))
        # New conversation after a long gap
        for i in range(3):
            session.messages.append(
                Message(role="user", content=f"new {i}", timestamp=time.time() + i))
        mgr._sessions["ch1"] = session

        assert mgr._needs_compaction(session)
        await mgr._compact(session)
        # Everything before the gap became a segment; the new tail stays raw
        assert [m.content for m in session.messages] == ["new 0", "new 1", "new 2"]
        assert session.summary_segments[-1]["summary"] == "vacation-era summary"
        assert session.summary_segments[-1]["source_count"] == 20


class TestSegmentClip:
    def test_clip_is_marked_never_silent(self):
        long_text = "useful line\n" * 600
        clipped = SessionManager._clip_segment_text(long_text)
        assert len(clipped) <= SEGMENT_HARD_CHARS
        assert clipped.endswith(SEGMENT_TRUNCATION_MARKER)

    def test_short_text_untouched(self):
        assert SessionManager._clip_segment_text("short") == "short"
