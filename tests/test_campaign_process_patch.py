import os
import stat
from types import SimpleNamespace

import pytest

from src.tools import apply_patch as patch


def envelope(body):
    return patch.parse_patch(f"*** Begin Patch\n{body}\n*** End Patch\n")


@pytest.mark.parametrize("content,body,match", [
    (b"\xff", "@@\n-old\n+new", "UTF-8"),
    (b"actual\n", "@@\n-old\n+new", "context mismatch"),
    (b"old\n", "*** Move to: occupied\n@@\n-old\n+new", "already exists"),
])
def test_semantic_failure_closes_snapshot(tmp_path, monkeypatch, content, body, match):
    (tmp_path / "source").write_bytes(content)
    (tmp_path / "occupied").write_bytes(b"untouched")
    real_open = patch._open_regular_at
    captured = []

    def record(*args):
        snapshot = real_open(*args)
        captured.append(snapshot["fd"])
        return snapshot

    monkeypatch.setattr(patch, "_open_regular_at", record)
    with pytest.raises(patch.PatchError, match=match):
        patch.apply_plan(str(tmp_path), envelope("*** Update File: source\n" + body))
    assert len(captured) == 1
    with pytest.raises(OSError):
        os.fstat(captured[0])
    assert (tmp_path / "source").read_bytes() == content


def test_nonregular_open_is_nonblocking_and_closed(monkeypatch):
    opened = []
    closed = []
    monkeypatch.setattr(patch.os, "open", lambda name, flags, **kwargs: opened.append(flags) or 9123)
    monkeypatch.setattr(patch.os, "fstat", lambda fd: SimpleNamespace(st_mode=stat.S_IFIFO))
    monkeypatch.setattr(patch.os, "close", closed.append)
    with pytest.raises(patch.PatchError, match="regular"):
        patch._open_regular_at(7, "fifo", "fifo")
    assert opened[0] & os.O_NONBLOCK
    assert closed == [9123]


@pytest.mark.parametrize("separator", ["\u2028", "\u2029", "\v", "\f", "\x85"])
def test_patch_preserves_unicode_content_and_mixed_endings(separator):
    source = '{"text":"one' + separator + 'two"}\r\nkeep\nold\r\nlast\r'
    plan = envelope("*** Update File: source\n@@\n keep\n-old\n+new\n last")
    actual = patch._apply_hunks("source", source, plan["operations"][0]["hunks"])
    assert actual == source.replace("old\r\n", "new\r\n")
