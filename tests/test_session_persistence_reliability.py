"""Tests for session/archive persistence reliability fixes (PR3).

Covers:
- 2.9  save()/save_all() clear dirty only after a successful write
- 2.10 archive write is atomic; restore falls back past a corrupt newest archive
- token estimator adds per-message overhead (no longer content-only)
- archive eviction protects each channel's newest archive
- reset/purge content no longer surfaces via search_history/_search_archives
- compaction feeds full-length source messages (no 500-char clip)
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from src.sessions.manager import (
    SessionManager, Session, Message, _estimate_session_tokens,
    MESSAGE_TOKEN_OVERHEAD, COMPACTION_SOURCE_MAX_CHARS, CHAT_RESPONSE_MAX_CHARS,
)


def _mgr(tmp_path, **kw) -> SessionManager:
    return SessionManager(
        max_history=kw.pop("max_history", 50),
        max_age_hours=kw.pop("max_age_hours", 24),
        persist_dir=str(tmp_path),
        **kw,
    )


# ---------------------------------------------------------------------------
# 2.9 — save() dirty handling
# ---------------------------------------------------------------------------

def test_save_failure_keeps_channel_dirty(tmp_path, monkeypatch):
    mgr = _mgr(tmp_path)
    mgr.add_message("chanA", "user", "hello", user_id="u1")
    assert "chanA" in mgr._dirty

    # Force the write to fail.
    real_write = Path.write_text

    def _boom(self, *a, **k):
        if self.name.endswith(".tmp"):
            raise OSError("disk full")
        return real_write(self, *a, **k)

    monkeypatch.setattr(Path, "write_text", _boom)
    mgr.save()
    # Change was NOT lost — still dirty for the next save.
    assert "chanA" in mgr._dirty

    # Recover: a normal save now persists it and clears dirty.
    monkeypatch.setattr(Path, "write_text", real_write)
    mgr.save()
    assert "chanA" not in mgr._dirty
    assert (tmp_path / "chanA.json").exists()


def test_successful_save_clears_dirty(tmp_path):
    mgr = _mgr(tmp_path)
    mgr.add_message("chanB", "user", "hi", user_id="u1")
    mgr.save()
    assert "chanB" not in mgr._dirty


def test_save_all_keeps_only_failed_dirty(tmp_path, monkeypatch):
    mgr = _mgr(tmp_path)
    mgr.add_message("good", "user", "x", user_id="u1")
    mgr.add_message("bad", "user", "y", user_id="u1")

    real_write = Path.write_text

    def _selective(self, *a, **k):
        if "bad" in self.name:
            raise OSError("nope")
        return real_write(self, *a, **k)

    monkeypatch.setattr(Path, "write_text", _selective)
    mgr.save_all()
    assert mgr._dirty == {"bad"}


# ---------------------------------------------------------------------------
# 2.10 — atomic archive + restore fallback
# ---------------------------------------------------------------------------

def test_restore_falls_back_past_corrupt_newest_archive(tmp_path):
    mgr = _mgr(tmp_path)
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()

    good = Session(channel_id="c1", messages=[Message(role="user", content="older good")],
                   last_active=100.0)
    (archive_dir / "c1_100.json").write_text(json.dumps(_asdict(good)))
    # Newest archive is truncated / invalid JSON.
    (archive_dir / "c1_200.json").write_text('{"channel_id": "c1", "messa')

    restored = mgr._restore_from_archive("c1")
    assert restored is not None
    assert restored.messages[0].content == "older good"


def test_restore_returns_none_when_all_corrupt(tmp_path):
    mgr = _mgr(tmp_path)
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    (archive_dir / "c1_100.json").write_text("garbage")
    (archive_dir / "c1_200.json").write_text("{bad")
    assert mgr._restore_from_archive("c1") is None


def test_archive_write_is_atomic_no_tmp_left(tmp_path):
    mgr = _mgr(tmp_path)
    mgr._sessions["c2"] = Session(
        channel_id="c2",
        messages=[Message(role="user", content="m")],
        last_active=500.0,
    )
    mgr._archive_session("c2")
    archive_dir = tmp_path / "archive"
    assert (archive_dir / "c2_500.json").exists()
    assert list(archive_dir.glob("*.tmp")) == []
    # And it round-trips.
    data = json.loads((archive_dir / "c2_500.json").read_text())
    assert data["channel_id"] == "c2"


# ---------------------------------------------------------------------------
# Token estimator overhead
# ---------------------------------------------------------------------------

def test_estimator_adds_per_message_overhead():
    msgs = [Message(role="user", content="hello"), Message(role="assistant", content="hi")]
    from src.llm.cost_tracker import estimate_tokens
    content_only = estimate_tokens("hello") + estimate_tokens("hi")
    est = _estimate_session_tokens(msgs, "")
    assert est == content_only + 2 * MESSAGE_TOKEN_OVERHEAD
    assert est > content_only  # strictly more conservative than before


# ---------------------------------------------------------------------------
# Archive eviction protects newest-per-channel
# ---------------------------------------------------------------------------

def test_eviction_protects_quiet_channels_newest_archive(tmp_path):
    mgr = _mgr(tmp_path)
    mgr.archive_max_files = 3  # tiny cap to force eviction
    mgr.archive_max_bytes = 10**9
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()

    # Quiet channel: one old archive. Churny channel: several newer ones.
    files = {
        "quiet_100.json": 100,
        "churn_200.json": 200,
        "churn_300.json": 300,
        "churn_400.json": 400,
        "churn_500.json": 500,
    }
    for name, mtime in files.items():
        p = archive_dir / name
        p.write_text("{}")
        import os
        os.utime(p, (mtime, mtime))

    mgr._prune_old_archives(archive_dir)

    remaining = {p.name for p in archive_dir.glob("*.json")}
    # The quiet channel's only restore point survives despite being oldest.
    assert "quiet_100.json" in remaining
    # Cap respected.
    assert len(remaining) <= 3


# ---------------------------------------------------------------------------
# Reset content no longer searchable
# ---------------------------------------------------------------------------

async def test_search_excludes_reset_content(tmp_path):
    mgr = _mgr(tmp_path)
    archive_dir = tmp_path / "archive"
    archive_dir.mkdir()
    # Archived message at t=100 containing "banana".
    sess = Session(
        channel_id="c9",
        messages=[Message(role="user", content="banana secret", timestamp=100.0)],
        last_active=100.0,
    )
    (archive_dir / "c9_100.json").write_text(json.dumps(_asdict(sess)))

    # Before reset: searchable.
    hits = await mgr.search_history("banana", channel_id="c9")
    assert any("banana" in h["content"] for h in hits)

    # Reset the channel (epoch now > 100).
    mgr._reset_epochs["c9"] = 150.0
    hits_after = await mgr.search_history("banana", channel_id="c9")
    assert not any("banana" in h["content"] for h in hits_after)


# ---------------------------------------------------------------------------
# Compaction source length
# ---------------------------------------------------------------------------

def test_compaction_source_cap_matches_chat_response_cap():
    # Regression guard: source cap must be >= the length assistant responses
    # are persisted at, or long responses get clipped before summarizing.
    assert COMPACTION_SOURCE_MAX_CHARS >= CHAT_RESPONSE_MAX_CHARS


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _asdict(session: Session) -> dict:
    from dataclasses import asdict
    return asdict(session)
