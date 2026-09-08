"""Dependency-optional scope transport refusal tests."""

import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import wayland_scope as m

NS = SimpleNamespace


@pytest.mark.parametrize("fault", ["none", "error", "sender", "oserror", "import"])
async def test_r10_dbus_refusals_are_static(monkeypatch, fault):
    monkeypatch.setattr(m.os, "geteuid", lambda: 1000)
    provider = m.GNOMEWaylandScopeProvider(bus_address="unix:path=/inert", expected_uid=1000)
    reply = NS(message_type="error" if fault == "error" else "return", sender=":1.3", body=[])
    bus = NS(call=AsyncMock(return_value=reply))
    connect = AsyncMock(return_value=None if fault == "none" else bus)
    if fault == "oserror":
        connect.side_effect = OSError("private detail")
    monkeypatch.setitem(
        sys.modules,
        "dbus_next",
        None
        if fault == "import"
        else NS(Message=lambda **kw: kw, MessageType=NS(METHOD_RETURN="return")),
    )
    monkeypatch.setitem(
        sys.modules, "dbus_next.aio", NS(MessageBus=lambda **kw: NS(connect=connect))
    )
    with pytest.raises(m.WaylandScopeFailure) as caught:
        await provider._call(":1.2", "/fake", "fake", "Read")
    assert str(caught.value) in {"wayland_scope_unavailable", "wayland_provider_owner_changed"}


async def test_r10_daemon_body_cardinality(monkeypatch):
    monkeypatch.setattr(m.os, "geteuid", lambda: 1000)
    provider = m.GNOMEWaylandScopeProvider(bus_address="unix:path=/inert", expected_uid=1000)
    provider._call = AsyncMock(return_value=[])
    with pytest.raises(m.WaylandScopeFailure, match="untrusted"):
        await provider._daemon("member", "name")


@pytest.mark.parametrize("pid,profile", [(True, "xed"), (0, "xed"), (42, "unknown")])
def test_r10_process_identity_arguments(pid, profile):
    with pytest.raises(m.WaylandScopeFailure, match="unavailable"):
        m._process_identity(pid, 1000, profile)


def test_r10_non_mapping_source():
    with pytest.raises(m.WaylandScopeFailure, match="source_unavailable"):
        m._source([])


@pytest.mark.parametrize("fault", [None, "zombie", "uids", "owner", "io"])
def test_r10_proc_identity_read(monkeypatch, fault):
    def read(path):
        if fault == "io":
            raise OSError()
        if path.name == "status":
            return "Uid:\t1000 1000 1000 " + ("2000" if fault == "uids" else "1000")
        return "42 (synthetic) " + " ".join(
            ["Z" if fault == "zombie" else "S"] + ["0"] * 18 + ["77"]
        )

    monkeypatch.setattr(m.Path, "read_text", read)
    monkeypatch.setattr(
        m.Path, "stat", lambda p: NS(st_uid=2000 if fault == "owner" else 1000, st_dev=1, st_ino=2)
    )
    monkeypatch.setattr(m.Path, "resolve", lambda p, **kw: m.Path("/usr/bin/xed"))
    monkeypatch.setattr(m.Path, "exists", lambda p: True)
    monkeypatch.setattr(m, "_trusted_executable", lambda p: ("/usr/bin/xed", (1, 2)))
    if fault:
        with pytest.raises(m.WaylandScopeFailure):
            m._process_identity(42, 1000, "gnome-shell")
    else:
        assert m._process_identity(42, 1000, "gnome-shell")["start_ticks"] == 77
