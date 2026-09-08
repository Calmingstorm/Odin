"""Fake scope peers only. No actual desktop access."""
import asyncio
import json
import os
import time

import pytest

from src.computer.runtime import hyprland_scope as scope


def sample():
    return {
        "ok": True, "version": 1, "token": "a" * 64,
        "measured_monotonic_ns": time.monotonic_ns(), "locked": False,
        "native_wayland": True, "safe_focus": True,
        "output": {"name": "TEST-1", "x": -100, "y": 0, "width": 800, "height": 600,
                   "pixel_width": 1200, "pixel_height": 900, "scale": 1.5, "transform": 0},
        "focus": {"token": "123", "serial": 1, "pid": os.getpid(), "wm_class": "fixture",
                  "title": "private", "x": -80, "y": 20, "width": 400, "height": 300,
                  "modal": False, "uid": os.getuid(),
                  "parent_chain_verified": True, "parent_tokens": []},
    }


@pytest.mark.parametrize("mutation", [
    lambda r: r.update(locked=True), lambda r: r.update(locked=None),
    lambda r: r.update(native_wayland=False), lambda r: r.update(safe_focus=None),
    lambda r: r.update(measured_monotonic_ns=0),
    lambda r: r.update(measured_monotonic_ns=time.monotonic_ns() + 10**9),
    lambda r: r.update(token="secret\n"), lambda r: r.update(version=True),
    lambda r: r["output"].update(name="OTHER"),
    lambda r: r["output"].update(scale=float("nan")),
    lambda r: r["output"].update(width=True),
    lambda r: r["focus"].update(x=-101), lambda r: r["focus"].update(width=1000),
    lambda r: r["focus"].update(title="\ud800"), lambda r: r["focus"].update(serial=0),
    lambda r: r["focus"].update(pid=True), lambda r: r["focus"].update(modal=None),
])
def test_malformed_observation_refused(mutation):
    started = time.monotonic_ns()
    row = sample()
    mutation(row)
    with pytest.raises(scope.HyprlandScopeFailure):
        scope._observation(row, "TEST-1", started)


def test_output_local_conversion():
    started = time.monotonic_ns()
    result = scope._observation(sample(), "TEST-1", started)
    assert result["bounds"] == {"x": 20, "y": 20, "width": 400, "height": 300}
    assert result["output"]["logical_x"] == -100
    assert result["output"]["width"] == 1200


async def server(tmp_path, responder):
    path = str(tmp_path / "scope.sock")

    async def handle(reader, writer):
        try:
            raw = await reader.readline()
            if not raw:
                return
            row = responder(json.loads(raw))
            data = row if isinstance(row, bytes) else json.dumps(row).encode() + b"\n"
            writer.write(data)
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    listener = await asyncio.start_unix_server(handle, path)
    provider = scope.HyprlandScopeProvider(
        socket_path=path, expected_uid=os.getuid(), expected_compositor_pid=os.getpid())
    return listener, provider


@pytest.mark.asyncio
async def test_authenticated_refresh_and_aba(tmp_path):
    row = sample()

    def reply(request):
        assert request == {"op": "snapshot", "output_name": "TEST-1"}
        row["measured_monotonic_ns"] = time.monotonic_ns()
        return row

    listener, provider = await server(tmp_path, reply)
    async with listener:
        first = await provider.snapshot({"mapping_id": "TEST-1"})
        row["token"] = "b" * 64
        second = await provider.snapshot({"mapping_id": "TEST-1"})
        assert first["focus_digest"] == second["focus_digest"]
        assert first["native_scope_token"] != second["native_scope_token"]
        row["focus"]["serial"] += 1
        third = await provider.snapshot({"mapping_id": "TEST-1"})
        assert third["focus_digest"] != first["focus_digest"]
        assert third["source_digest"] == first["source_digest"]
        assert "title" not in third
    await provider.close()
    with pytest.raises(scope.HyprlandScopeFailure, match="closed"):
        await provider.snapshot({"mapping_id": "TEST-1"})


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", [
    b'{"ok":true,"ok":true}\n', b'{"ok":true}\n{}\n', b'[]\n', b'{}\n',
    b'{"ok":true,"x":"' + b'a' * 17000 + b'"}\n',
])
async def test_transport_strict_parsing(tmp_path, reply):
    listener, provider = await server(tmp_path, lambda _: reply)
    async with listener:
        with pytest.raises(scope.HyprlandScopeFailure):
            await provider.identity()


@pytest.mark.asyncio
async def test_peer_pid_mismatch(tmp_path):
    listener, provider = await server(tmp_path, lambda _: {"ok": True})
    provider.expected_compositor_pid = os.getppid()
    async with listener:
        with pytest.raises(scope.HyprlandScopeFailure):
            await provider.identity()


@pytest.mark.asyncio
async def test_recovery_never_claims_receiver_proof(tmp_path):
    reply = {"ok": True, "release_submitted": True, "release_acknowledged": True,
             "receiver_release_verified": True}
    listener, provider = await server(tmp_path, lambda _: reply)
    async with listener:
        assert await provider.release_all() == {
            "release_submitted": True, "release_ack": True, "receiver_release_verified": False}


@pytest.mark.parametrize("metadata", [{}, {"mapping_id": "../TEST"}, None, "TEST-1"])
@pytest.mark.asyncio
async def test_explicit_output_required(tmp_path, metadata):
    provider = scope.HyprlandScopeProvider(
        socket_path=str(tmp_path / "not-connected"), expected_uid=os.getuid(),
        expected_compositor_pid=os.getpid())
    with pytest.raises(scope.HyprlandScopeFailure, match="explicit_output"):
        await provider.snapshot(metadata)
