"""Archive pruning keeps the archive restore would use.

Restore picks a channel's newest archive by the time in its name. Pruning protected the
newest by mtime, so when two archives shared an mtime (a coarse filesystem clock, as on tmpfs
with older kernels) or their mtimes disagreed with their archive times, pruning could delete
exactly the archive restore needed.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict

from src.sessions.manager import SessionManager


def archive(sm: SessionManager, directory, channel: str, text: str, stamp: int, mtime: float):
    sm.add_message(channel, "user", text, user_id="7")
    path = directory / f"{channel}_{stamp}.json"
    path.write_text(json.dumps(asdict(sm.get(channel))), encoding="utf-8")
    os.utime(path, (mtime, mtime))
    return path


def restored_texts(tmp_path, channel: str) -> list[str]:
    fresh = SessionManager(100, 1, str(tmp_path))
    session = fresh._restore_from_archive(channel)
    return [message.content for message in session.messages] if session else []


def test_pruning_keeps_the_archive_restore_uses_when_mtimes_disagree(tmp_path):
    sm = SessionManager(100, 1, str(tmp_path), archive_max_files=2)
    directory = tmp_path / "archive"
    directory.mkdir()
    archive(sm, directory, "busy", "first", 100, mtime=2_000)
    archive(sm, directory, "busy", "second", 101, mtime=1_000)  # written back later, older mtime
    archive(sm, directory, "quiet", "only", 100, mtime=1_500)
    sm._prune_old_archives(directory)
    assert sorted(p.name for p in directory.glob("*.json")) == ["busy_101.json", "quiet_100.json"]
    assert restored_texts(tmp_path, "busy")[-1] == "second"


def test_pruning_keeps_the_archive_restore_uses_when_mtimes_tie(tmp_path):
    sm = SessionManager(100, 1, str(tmp_path), archive_max_files=2)
    directory = tmp_path / "archive"
    directory.mkdir()
    archives = (("busy", "first", 100), ("busy", "second", 101), ("quiet", "only", 100))
    for channel, text, stamp in archives:
        archive(sm, directory, channel, text, stamp, mtime=1_000)
    sm._prune_old_archives(directory)
    assert sorted(p.name for p in directory.glob("*.json")) == ["busy_101.json", "quiet_100.json"]
    assert restored_texts(tmp_path, "busy")[-1] == "second"


def test_pruning_still_evicts_oldest_first_by_mtime(tmp_path):
    sm = SessionManager(100, 1, str(tmp_path), archive_max_files=3)
    directory = tmp_path / "archive"
    directory.mkdir()
    archive(sm, directory, "busy", "a", 100, mtime=1_000)
    archive(sm, directory, "busy", "b", 101, mtime=2_000)
    archive(sm, directory, "busy", "c", 102, mtime=3_000)
    archive(sm, directory, "quiet", "only", 100, mtime=500)
    sm._prune_old_archives(directory)
    # The quiet channel's only archive is protected; the oldest unprotected one goes.
    assert sorted(p.name for p in directory.glob("*.json")) == [
        "busy_101.json", "busy_102.json", "quiet_100.json"]


def test_an_archive_name_without_a_time_is_ordered_by_its_mtime(tmp_path):
    sm = SessionManager(100, 1, str(tmp_path), archive_max_files=2)
    directory = tmp_path / "archive"
    directory.mkdir()
    archive(sm, directory, "busy", "named", 100, mtime=1_000)
    unnamed = archive(sm, directory, "busy", "unnamed", 101, mtime=5_000)
    # No time in the name: restore orders this one by its mtime.
    unnamed.rename(directory / "busy_copy.json")
    archive(sm, directory, "quiet", "only", 100, mtime=500)
    sm._prune_old_archives(directory)
    assert sorted(p.name for p in directory.glob("*.json")) == ["busy_copy.json", "quiet_100.json"]
    assert restored_texts(tmp_path, "busy")[-1] == "unnamed"
