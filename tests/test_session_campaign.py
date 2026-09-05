import asyncio
import json
import os
import stat
import threading
from dataclasses import asdict
from pathlib import Path

import pytest

from src.sessions.manager import SessionManager


def manager(path):
    return SessionManager(100, 1, str(path))


def test_quiet_channel_restores_newest_archive_byte_complete(tmp_path):
    old = manager(tmp_path)
    old.add_message("42", "user", "  exact\n café 雪\t", user_id="7")
    session = old.get("42")
    session.summary = " legacy\n summary "
    session.summary_segments = [{"id": "segment", "summary": "  full\n雪 ",
                                 "extra": ["preserved", 7]}]
    session.last_active = 100
    old._archive_session("42")
    old.add_message("42", "assistant", "newest\n\t")
    session.last_active = 200
    old._archive_session("42")
    expected = json.dumps({k: asdict(session)[k] for k in
                           ("messages", "summary", "summary_segments")}).encode()
    archives = {p.name: p.read_bytes() for p in (tmp_path / "archive").glob("*")}
    fresh = manager(tmp_path)
    fresh.add_message("42", "user", "next activity")
    restored = asdict(fresh.get("42"))
    restored["messages"].pop()
    actual = json.dumps({k: restored[k] for k in
                         ("messages", "summary", "summary_segments")}).encode()
    assert actual == expected
    assert archives == {p.name: p.read_bytes() for p in (tmp_path / "archive").glob("*")}


@pytest.mark.parametrize("method", ["save", "save_all"])
def test_snapshot_keeps_newer_revision_dirty(tmp_path, monkeypatch, method):
    sm = manager(tmp_path)
    sm.add_message("42", "user", "first")
    entered, release = threading.Event(), threading.Event()
    original = Path.write_text

    def pause(path, *args, **kwargs):
        if path.suffix == ".tmp":
            entered.set()
            assert release.wait(5)
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", pause)
    worker = threading.Thread(target=getattr(sm, method))
    worker.start()
    assert entered.wait(5)
    sm.add_message("42", "user", "second")
    release.set()
    worker.join(5)
    assert not worker.is_alive()
    assert "42" in sm._dirty
    sm.save()
    assert len(json.loads((tmp_path / "42.json").read_text())["messages"]) == 2


@pytest.mark.parametrize("operation", ["write_text", "replace"])
def test_failed_reset_is_not_acknowledged_and_can_retry(tmp_path, monkeypatch, operation):
    sm = manager(tmp_path)
    sm.add_message("42", "user", "preserved")
    sm._archive_session("42")
    original = getattr(Path, operation)
    with monkeypatch.context() as patch:
        def fail(path, *args, **kwargs):
            if "reset_epochs" in path.name:
                raise OSError("injected publication failure")
            return original(path, *args, **kwargs)
        patch.setattr(Path, operation, fail)
        with pytest.raises(OSError):
            sm.reset("42")
    assert sm.get("42").messages[0].content == "preserved"
    assert sm._pending_reset_epochs
    sm.reset("42")
    assert not sm._pending_reset_epochs
    assert not manager(tmp_path).get_or_create("42").messages
    assert list((tmp_path / "archive").glob("*.json"))


@pytest.mark.parametrize("body", ["{", "[]", '{"42": "bad"}', '{"42": NaN}'])
def test_corrupt_epochs_degrade_without_boot_or_live_session_outage(tmp_path, body, caplog):
    sm = manager(tmp_path)
    sm.add_message("42", "user", "live history")
    sm.add_message("archived", "user", "possibly reset history")
    sm._archive_session("archived")
    sm.reset("archived")
    sm.save_all()
    archive = next((tmp_path / "archive").glob("*.json"))
    original_archive = archive.read_bytes()
    (tmp_path / "reset_epochs.json").write_text(body)
    sm = manager(tmp_path)
    sm.load()
    assert sm._reset_epochs_degraded
    assert "archive restoration and pruning suspended" in caplog.text
    assert sm.get_or_create("42").messages[0].content == "live history"
    assert not sm.get_or_create("archived").messages
    sm.add_message("42", "user", "still available")
    sm.add_message("new", "user", "new channel")
    sm.get("42").last_active = 100
    assert sm.prune() == 0
    sm.save_all()
    assert json.loads((tmp_path / "42.json").read_text())["messages"][-1]["content"] == (
        "still available"
    )
    assert (tmp_path / "new.json").exists()
    with pytest.raises(RuntimeError, match="store degraded"):
        sm.reset("42")
    assert (tmp_path / "reset_epochs.json").read_text() == body
    assert archive.read_bytes() == original_archive


def test_successful_reset_fences_stale_live_file(tmp_path):
    sm = manager(tmp_path)
    sm.add_message("42", "user", "old")
    sm.save()
    old = (tmp_path / "42.json").read_bytes()
    sm.reset("42")
    (tmp_path / "42.json").write_bytes(old)
    fresh = manager(tmp_path)
    fresh.load()
    assert not fresh.get_or_create("42").messages
    fresh.add_message("42", "user", "new")
    fresh.save()
    newer = manager(tmp_path)
    newer.load()
    assert newer.get("42").messages[0].content == "new"


def test_reset_waits_for_inflight_publication(tmp_path, monkeypatch):
    sm = manager(tmp_path)
    sm.add_message("42", "user", "old")
    entered, release, reset_done = threading.Event(), threading.Event(), threading.Event()
    original = Path.write_text

    def pause(path, *args, **kwargs):
        if path.name.startswith(".42."):
            entered.set()
            assert release.wait(5)
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", pause)
    writer = threading.Thread(target=sm.save)
    writer.start()
    assert entered.wait(5)
    def reset():
        sm.reset("42")
        reset_done.set()
    resetter = threading.Thread(target=reset)
    resetter.start()
    assert not reset_done.wait(.05)
    release.set()
    writer.join(5)
    resetter.join(5)
    assert reset_done.is_set()
    fresh = manager(tmp_path)
    fresh.load()
    assert not fresh.get_or_create("42").messages


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["append", "reset"])
@pytest.mark.parametrize("fail", [False, True])
async def test_compaction_cannot_publish_over_new_revision(tmp_path, mutation, fail):
    sm = manager(tmp_path)
    for i in range(150):
        sm.add_message("42", "user", str(i))
    entered, release = asyncio.Event(), asyncio.Event()

    async def summarize(*args):
        entered.set()
        await release.wait()
        if fail:
            raise RuntimeError("synthetic compaction failure")
        return "summary"

    sm.set_compaction_fn(summarize)
    task = asyncio.create_task(sm._compact(sm.get("42")))
    await entered.wait()
    if mutation == "reset":
        sm.reset("42")
    sm.add_message("42", "user", "new revision")
    release.set()
    await task
    assert sm.get("42").messages[-1].content == "new revision"
    assert len(sm.get("42").messages) == (1 if mutation == "reset" else 151)
    assert not sm.get("42").summary_segments


def test_repeated_archive_and_summary_only_prune_preserve_history(tmp_path):
    sm = manager(tmp_path)
    sm.add_message("42", "user", "first")
    sm.get("42").last_active = 100
    sm._archive_session("42")
    sm.get("42").summary = "summary only"
    sm.get("42").messages = []
    sm.prune()
    assert len(list((tmp_path / "archive").glob("*.json"))) == 2
    assert sm.get_or_create("42").summary == "summary only"


@pytest.mark.parametrize("caps", [{"archive_max_files": 1}, {"archive_max_bytes": 1}])
def test_capacity_pressure_preserves_every_archive_and_full_latest_restore(tmp_path, caps):
    sm = SessionManager(100, 1, str(tmp_path), **caps)
    expected = {}
    preserved = {}
    for channel in ("quiet", "busy"):
        for revision in range(2):
            sm.add_message(channel, "user", f"  full 雪\n{revision}\t", user_id="7")
            session = sm.get(channel)
            session.summary = " legacy summary\n "
            session.summary_segments = [{"summary": "full 雪", "extra": [1, 2]}]
            session.last_active = 100 + revision
            expected[channel] = {k: asdict(session)[k] for k in
                                 ("messages", "summary", "summary_segments")}
            sm.prune()
            current = {p.name: p.read_bytes() for p in (tmp_path / "archive").glob("*")}
            assert all(current.get(name) == body for name, body in preserved.items())
            assert len(current) == len(preserved) + 1
            preserved = current
    fresh = manager(tmp_path)
    for channel, body in expected.items():
        fresh.add_message(channel, "user", "next activity")
        restored = asdict(fresh.get(channel))
        restored["messages"].pop()
        assert json.dumps({k: restored[k] for k in body}).encode() == json.dumps(body).encode()
    assert preserved == {p.name: p.read_bytes() for p in (tmp_path / "archive").glob("*")}


@pytest.mark.parametrize("post_rename", [False, True])
def test_pending_reset_requires_explicit_retry_not_unrelated_or_empty_reset(
    tmp_path, monkeypatch, post_rename,
):
    sm = manager(tmp_path)
    sm.add_message("42", "user", "preserved")
    sm.add_message("other", "user", "other history")
    sm.save_all()
    original_fsync = os.fsync

    def fail_fsync(fd):
        if stat.S_ISDIR(os.fstat(fd).st_mode) == post_rename:
            raise OSError("injected sync failure")
        return original_fsync(fd)

    with monkeypatch.context() as patch:
        patch.setattr(os, "fsync", fail_fsync)
        with pytest.raises(OSError):
            sm.reset("42")
    if post_rename:
        assert sm._reset_epochs == json.loads((tmp_path / "reset_epochs.json").read_text())
        restarted = manager(tmp_path)
        restarted.load()
        assert restarted.get("42") is None
    else:
        assert "42" not in sm._reset_epochs
    pending = dict(sm._pending_reset_epochs)
    assert sm.reset_many([]) == 0
    assert sm._pending_reset_epochs == pending
    assert sm.get("42").messages[0].content == "preserved"
    assert sm.reset_many(["other"]) == 1
    assert sm._pending_reset_epochs == pending
    assert sm.get("42").messages[0].content == "preserved"
    before_live = (tmp_path / "42.json").read_bytes()
    with pytest.raises(RuntimeError, match="durability unresolved"):
        sm.get_or_create("42")
    sm.add_message("other", "user", "new other history")
    sm.add_message("new", "user", "new channel history")
    sm.save()
    sm.save_all()
    assert (tmp_path / "42.json").read_bytes() == before_live
    assert json.loads((tmp_path / "other.json").read_text())["messages"][0]["content"] == (
        "new other history"
    )
    assert json.loads((tmp_path / "new.json").read_text())["messages"][0]["content"] == (
        "new channel history"
    )
    assert sm._pending_reset_epochs == pending
    sm.reset("42")
    assert not sm._pending_reset_epochs
    assert sm.get("42") is None


@pytest.mark.asyncio
@pytest.mark.parametrize("fail", [False, True])
async def test_pending_reset_blocks_compaction_publication(tmp_path, monkeypatch, fail):
    sm = manager(tmp_path)
    for i in range(150):
        sm.add_message("42", "user", str(i))
    original = asdict(sm.get("42"))
    entered, release = asyncio.Event(), asyncio.Event()

    async def summarize(*args):
        entered.set()
        await release.wait()
        if fail:
            raise RuntimeError("synthetic backend failure")
        return "summary"

    sm.set_compaction_fn(summarize)
    task = asyncio.create_task(sm._compact(sm.get("42")))
    await entered.wait()
    with monkeypatch.context() as patch:
        patch.setattr(os, "fsync", lambda fd: (_ for _ in ()).throw(OSError("sync failed")))
        with pytest.raises(OSError):
            sm.reset("42")
    release.set()
    await task
    assert asdict(sm.get("42")) == original
    sm.get("42").last_active = 100
    assert sm.prune() == 0
