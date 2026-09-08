"""Direct negative-evidence parser tests; synthetic peers, never a desktop."""
import asyncio
import json
import os

import pytest

from src.computer.runtime import hyprland_scope as scope


NOW = 1_000_000_000
START = NOW - 10


def evidence():
    return {
        "ok": False, "error": "window-geometry-unsettled", "version": 1,
        "locked": False, "native_wayland": True, "measured_monotonic_ns": NOW,
        "output": {"name": "TEST-1", "x": -100, "y": 0, "width": 800,
                   "height": 600, "pixel_width": 1200, "pixel_height": 900,
                   "scale": 1.5, "transform": 0},
        "focus": {"pid": os.getpid(), "uid": os.getuid(), "wm_class": "fixture",
                  "parent_chain_verified": True},
    }


@pytest.fixture
def parser(monkeypatch):
    provider = scope.HyprlandScopeProvider(
        socket_path="/tmp/synthetic-unconnected.sock", expected_uid=os.getuid(),
        expected_compositor_pid=os.getpid())
    monkeypatch.setattr(scope.time, "monotonic_ns", lambda: NOW)
    return provider


def rejected(parser, row, reason, started=START):
    with pytest.raises(scope.HyprlandScopeFailure, match=f"^{reason}$") as caught:
        parser._unsettled(row, "TEST-1", started)
    assert type(caught.value) is scope.HyprlandScopeFailure


def test_valid_typed_negative_has_only_measured_identity(parser):
    application = scope._process_identity(os.getpid(), os.getuid())
    compositor = parser._identity()
    with pytest.raises(scope.HyprlandGeometryUnsettled) as caught:
        parser._unsettled(evidence(), "TEST-1", START)
    result = caught.value
    assert str(result) == "window-geometry-unsettled"
    assert result.application == application
    assert result.compositor == compositor
    assert result.output == {
        "name": "TEST-1", "width": 1200, "height": 900, "transform": 0,
        "logical_x": -100, "logical_y": 0, "logical_width": 800,
        "logical_height": 600}
    for key in ("token", "native_scope_token", "safe_focus", "bounds", "authenticated"):
        assert not hasattr(result, key)


@pytest.mark.parametrize("key,value", [
    ("ok", True), ("ok", 0), ("error", "arbitrary-native-text"),
    ("version", True), ("version", 2), ("version", "1"),
    ("locked", True), ("locked", 0), ("native_wayland", False),
    ("native_wayland", 1), ("token", None), ("token", "a" * 64),
    ("safe_focus", False), ("safe_focus", True),
    ("measured_monotonic_ns", True), ("measured_monotonic_ns", NOW + 1),
    ("measured_monotonic_ns", START - 1), ("measured_monotonic_ns", None),
])
def test_envelope_fields_and_authority_injection(parser, key, value):
    row = evidence()
    row[key] = value
    rejected(parser, row, "hyprland_scope_unknown_locked_or_stale")


@pytest.mark.parametrize("key", list(evidence()))
def test_missing_required_fields(parser, key):
    row = evidence()
    del row[key]
    reason = ("hyprland_scope_reply_invalid" if key in {"output", "focus"}
              else "hyprland_scope_unknown_locked_or_stale")
    rejected(parser, row, reason)


@pytest.mark.parametrize("section", ["output", "focus"])
@pytest.mark.parametrize("value", [None, [], "invalid", 1])
def test_non_object_sections(parser, section, value):
    row = evidence()
    row[section] = value
    rejected(parser, row, "hyprland_scope_reply_invalid")


@pytest.mark.parametrize("section,key", [
    (section, key) for section in ("output", "focus") for key in evidence()[section]
])
def test_exact_section_keys(parser, section, key):
    row = evidence()
    del row[section][key]
    rejected(parser, row, "hyprland_scope_reply_invalid")


@pytest.mark.parametrize("section,key,value", [
    ("output", "name", "OTHER"), ("output", "token", "injected"),
    ("focus", "token", "injected"), ("focus", "safe_focus", True),
    ("focus", "parent_chain_verified", False),
    ("focus", "parent_chain_verified", 1),
])
def test_section_injection_and_unverified_parent(parser, section, key, value):
    row = evidence()
    row[section][key] = value
    rejected(parser, row, "hyprland_scope_reply_invalid")


@pytest.mark.parametrize("value", [True, None, "1", 0, -1, 17,
                                      float("nan"), float("inf"), -float("inf")])
def test_invalid_scale(parser, value):
    row = evidence()
    row["output"]["scale"] = value
    rejected(parser, row, "hyprland_scope_reply_invalid")


@pytest.mark.parametrize("section,key,lower,upper", [
    *[("output", key, 1, 16384) for key in
      ("pixel_width", "pixel_height", "width", "height")],
    ("output", "transform", 0, 7),
    ("output", "x", -(2**30), 2**30), ("output", "y", -(2**30), 2**30),
    ("focus", "pid", 2, 2**31 - 1), ("focus", "uid", 0, 2**32 - 1),
])
@pytest.mark.parametrize("kind", ["bool", "float", "string", "low", "high"])
def test_numeric_fields_are_bounded_integers(parser, section, key, lower, upper, kind):
    row = evidence()
    row[section][key] = {"bool": True, "float": 1.0, "string": "1",
                         "low": lower - 1, "high": upper + 1}[kind]
    rejected(parser, row, "hyprland_scope_reply_invalid")


@pytest.mark.parametrize("value", [None, 1, "\x00", "\ud800", "x" * 4097])
def test_invalid_class_text(parser, value):
    row = evidence()
    row["focus"]["wm_class"] = value
    rejected(parser, row, "hyprland_scope_reply_invalid")


@pytest.mark.parametrize("change", ["uid", "empty_class"])
def test_unavailable_application_identity(parser, change):
    row = evidence()
    row["focus"].update({"uid": os.getuid() + 1} if change == "uid" else {"wm_class": ""})
    rejected(parser, row, "hyprland_application_identity_unavailable")


@pytest.mark.parametrize("error", [OSError, RuntimeError, ValueError, IndexError, StopIteration])
def test_process_authentication_failures(parser, monkeypatch, error):
    def fail(*args):
        raise error("private process details")
    monkeypatch.setattr(scope, "_process_identity", fail)
    rejected(parser, evidence(), "hyprland_application_identity_unavailable")


def test_compositor_identity_changed(parser, monkeypatch):
    parser._identity()
    monkeypatch.setattr(scope, "_proc_start", lambda *args: "changed")
    rejected(parser, evidence(), "hyprland_provider_owner_changed")


@pytest.mark.parametrize("measured", [NOW, NOW - scope.LEASE_NS])
def test_expired_request_or_evidence(parser, measured):
    row = evidence()
    row["measured_monotonic_ns"] = measured
    rejected(parser, row, "hyprland_scope_unknown_locked_or_stale", NOW - scope.LEASE_NS)


def test_identity_work_cannot_extend_lease(parser, monkeypatch):
    clock = iter([NOW, START + scope.LEASE_NS])
    monkeypatch.setattr(scope.time, "monotonic_ns", lambda: next(clock))
    rejected(parser, evidence(), "hyprland_scope_unknown_locked_or_stale")


@pytest.mark.asyncio
async def test_snapshot_routes_negative_to_typed_parser(parser, monkeypatch):
    async def request(value):
        assert value == {"op": "snapshot", "output_name": "TEST-1"}
        return evidence()
    monkeypatch.setattr(parser, "_request", request)
    with pytest.raises(scope.HyprlandGeometryUnsettled) as caught:
        await parser.snapshot({"mapping_id": "TEST-1"})
    assert caught.value.application == scope._process_identity(os.getpid(), os.getuid())
    assert caught.value.compositor == parser._identity()


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [OSError, RuntimeError, ValueError, TimeoutError])
async def test_negative_cannot_bypass_peer_authentication(parser, monkeypatch, error):
    async def fail(*args):
        raise error("private peer details")
    monkeypatch.setattr(scope, "connect_peer", fail)
    with pytest.raises(scope.HyprlandScopeFailure, match="^hyprland_scope_unavailable$") as caught:
        await parser._request({"op": "snapshot", "output_name": "TEST-1"})
    assert type(caught.value) is scope.HyprlandScopeFailure


@pytest.mark.asyncio
@pytest.mark.parametrize("op,ok,error,accepted", [
    ("snapshot", False, "window-geometry-unsettled", True),
    ("snapshot", False, "unknown-negative", False),
    ("snapshot", 0, "window-geometry-unsettled", False),
    ("snapshot", None, "window-geometry-unsettled", False),
    ("status", False, "window-geometry-unsettled", False),
    ("release_all", False, "window-geometry-unsettled", False),
    ("unknown", False, "window-geometry-unsettled", False),
])
async def test_authenticated_request_whitelists_only_snapshot_negative(tmp_path, op, ok, error, accepted):
    path = str(tmp_path / "scope.sock")
    row = {"ok": ok, "error": error}
    finished = asyncio.Event()

    async def handle(reader, writer):
        try:
            request = json.loads(await reader.readline())
            assert request == {"op": op}
            writer.write(json.dumps(row).encode() + b"\n")
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()
            finished.set()

    listener = await asyncio.start_unix_server(handle, path)
    provider = scope.HyprlandScopeProvider(
        socket_path=path, expected_uid=os.getuid(), expected_compositor_pid=os.getpid())
    async with listener:
        try:
            if accepted:
                assert await provider._request({"op": op}) == row
            else:
                with pytest.raises(scope.HyprlandScopeFailure, match="^hyprland_scope_unavailable$"):
                    await provider._request({"op": op})
            await asyncio.wait_for(finished.wait(), 1)
        finally:
            await provider.close()
