"""Identity decisions against a synthetic proc tree, never a compositor."""

import hashlib
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import wayland_identity as m

NS = SimpleNamespace


@pytest.fixture
def proc(monkeypatch):
    scope = dict(pid=42, uid=1000, owner=":1.2", start_ticks=10, backend="native", version="46")
    process = Mock(return_value=(10, 3, 1000))
    monkeypatch.setattr(m, "_process", process)
    monkeypatch.setattr(m.os, "readlink", lambda p: "/usr/bin/gnome-shell")
    monkeypatch.setattr(m.os, "stat", lambda p: NS(st_dev=0, st_ino=4))
    maps = (
        "x r 0 00:00 2 /lib/libmutter-14.so\nx r 0 00:00 2 /lib/libmutter-14.so\n"
        "x r 0 00:00 3 /lib/other.so\nx r 0 0 0 [heap]\nshort"
    )
    monkeypatch.setattr(m.Path, "read_text", lambda p: maps)
    monkeypatch.setattr(m, "_hash_object", lambda p, d, i, **kw: m.MappedObject(p, d, i, "abc"))
    from src.computer.runtime import recovery

    monkeypatch.setattr(recovery, "boot_id", lambda: "boot")
    return scope, dict(pid=42, uid=1000), process


async def test_r10_capture_public_and_revalidation(proc, monkeypatch):
    scope, peer, process = proc
    identity = await m.capture_identity(scope, peer)
    assert identity.pid == 42 and identity.session_id == 3
    assert len(identity.libraries) == 1
    assert len(identity.binding_digest) == 64
    assert identity.public().name == "gnome-shell"
    assert await m.revalidate_identity(identity, scope, peer)
    assert not await m.revalidate_identity(identity, scope, {})


@pytest.mark.parametrize(
    "change,error",
    [
        ({"pid": True}, "peer_mismatch"),
        ({"owner": "bad"}, "peer_mismatch"),
        ({"start_ticks": 11}, "start_changed"),
        ({"backend": "unknown"}, "backend_unidentified"),
        ({"version": "\n"}, "backend_unidentified"),
        ({"version": ""}, "backend_unidentified"),
    ],
)
def test_r10_capture_scope_refusal(proc, change, error):
    scope, peer, _ = proc
    with pytest.raises(m.WaylandIdentityError, match=error):
        m._capture(scope | change, peer)


@pytest.mark.parametrize(
    "case,error",
    [
        ("uid", "uid_changed"),
        ("changed", "identity_changed"),
        ("exe", "executable_unqualified"),
        ("missing", "mutter_mapping_unavailable"),
        ("deleted", "mapped_object_deleted"),
        ("io", "identity_unavailable"),
    ],
)
def test_r10_capture_proc_refusal(proc, monkeypatch, case, error):
    scope, peer, process = proc
    if case == "uid":
        process.return_value = (10, 3, 2000)
    if case == "changed":
        process.side_effect = [(10, 3, 1000), (11, 3, 1000)]
    if case == "exe":
        monkeypatch.setattr(m.os, "readlink", lambda p: "/tmp/fake")
    if case == "missing":
        monkeypatch.setattr(m.Path, "read_text", lambda p: "")
    if case == "deleted":
        monkeypatch.setattr(
            m.Path, "read_text", lambda p: "x r 0 00:00 2 /lib/libmutter-14.so (deleted)"
        )
    if case == "io":
        process.side_effect = OSError()
    with pytest.raises(m.WaylandIdentityError, match=error):
        m._capture(scope, peer)


@pytest.mark.parametrize("zombie", [False, True])
def test_r10_process_stat_with_parentheses(monkeypatch, zombie):
    fields = ["Z" if zombie else "S", "1", "2", "3"] + ["0"] * 15 + ["77"]
    monkeypatch.setattr(
        m.Path, "read_text", lambda p: "42 (name with ) bracket) " + " ".join(fields)
    )
    monkeypatch.setattr(m.os, "stat", lambda p: NS(st_uid=1000))
    if zombie:
        with pytest.raises(m.WaylandIdentityError, match="exited"):
            m._process(42)
    else:
        assert m._process(42) == (77, 3, 1000)


@pytest.mark.parametrize("changed", [False, True])
def test_r10_hash_verified_descriptor(monkeypatch, changed):
    before = NS(
        st_mode=0o100644, st_ino=8, st_dev=0, st_size=3, st_uid=0, st_mtime_ns=1, st_ctime_ns=1
    )
    after = NS(**vars(before))
    if changed:
        after.st_ctime_ns = 2
    monkeypatch.setattr(m.os, "open", lambda *a: 100)
    monkeypatch.setattr(m.os, "fstat", Mock(side_effect=[before, after]))
    monkeypatch.setattr(m.os, "read", Mock(side_effect=[b"abc", b""]))
    close = Mock()
    monkeypatch.setattr(m.os, "close", close)
    if changed:
        with pytest.raises(m.WaylandIdentityError, match="changed"):
            m._hash_object("/lib/a", "0:0", 8, proc_path="/fake")
    else:
        assert (
            m._hash_object("/lib/a", "0:0", 8, proc_path="/fake").sha256
            == hashlib.sha256(b"abc").hexdigest()
        )
    close.assert_called_once_with(100)
