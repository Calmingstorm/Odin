"""Fake peers/helpers only. Never connect to a desktop display."""

import asyncio
import hashlib
import json
import os
import socket
import time
from dataclasses import replace
from pathlib import Path

import pytest

from src.computer.runtime import hyprland_capture as capture
from src.computer.runtime import hyprland_identity as identity
from src.computer.runtime.wayland_identity import WaylandIdentityError, compositor_adapter


def trust_self():
    path = Path(f"/proc/{os.getpid()}/exe")
    return identity.ExecutableTrust(
        os.readlink(path), hashlib.sha256(path.read_bytes()).hexdigest(),
        "0.0.fixture", "a" * 40, path.stat().st_uid,
    )


def pinned():
    trust = trust_self()
    return identity.HyprlandIdentity(
        identity.measure_process(os.getpid(), os.getuid(), trust, time.monotonic() + 3), trust
    )


def output(**changes):
    return replace(capture.ExplicitOutput("TEST-1", 4, 2, 0, -200, 10, 4, 2), **changes)


def proof(pin, out, **changes):
    return replace(capture.ScopeProof(
        pin.digest, out, 1, 1, time.monotonic_ns(), False, "c" * 64,
    ), **changes)


def test_existing_adapters_unchanged():
    with pytest.raises(WaylandIdentityError, match="hyprland_remote_portal_unqualified"):
        compositor_adapter("/usr/bin/Hyprland", "0.55.0")
    assert compositor_adapter("/usr/bin/gnome-shell", "46.2").name == "gnome-shell"
    assert compositor_adapter("/usr/bin/kwin_wayland", "6.1.0").name == "kwin_wayland"


def test_real_peer_pin_and_build_hash():
    pin = pinned()
    assert pin.process.pid == os.getpid()
    assert len(pin.digest) == 64
    left, right = socket.socketpair()
    try:
        assert identity.peer_credentials(left) == (os.getpid(), os.getuid())
    finally:
        left.close()
        right.close()
    with pytest.raises(identity.HyprlandIdentityError, match="executable_changed"):
        identity.measure_process(
            os.getpid(), os.getuid(), replace(pin.trust, sha256="0" * 64), time.monotonic() + 3
        )
    with pytest.raises(identity.HyprlandIdentityError, match="deadline"):
        identity.measure_process(os.getpid(), os.getuid(), pin.trust, time.monotonic() - 1)


@pytest.mark.parametrize("field,value", [
    ("path", "Hyprland"), ("sha256", "x" * 64), ("commit", "unknown"),
    ("owner_uid", True), ("version", "bad\nversion"),
])
def test_trust_invalid(field, value):
    with pytest.raises(identity.HyprlandIdentityError):
        replace(trust_self(), **{field: value})


@pytest.mark.parametrize("field,value", [
    ("name", ""), ("name", "../TEST"), ("name", "TEST\x00"),
    ("width", True), ("width", 0), ("height", -1), ("transform", 8),
    ("logical_x", 2**31), ("logical_width", 0), ("width", 16385),
])
def test_output_invalid(field, value):
    with pytest.raises(capture.HyprlandCaptureError):
        output(**{field: value})


def test_large_allocation_rejected_before_helper():
    with pytest.raises(capture.HyprlandCaptureError):
        output(width=8000, height=4000)


@pytest.mark.parametrize("transform,expected", [
    (0, (0.5, 0.5)), (1, (1.0, 1.75)), (2, (3.5, 1.5)), (3, (3.0, 0.25)),
    (4, (3.5, 0.5)), (5, (1.0, 0.25)), (6, (0.5, 1.5)), (7, (3.0, 1.75)),
])
def test_transform_all_eight_are_local(transform, expected):
    out = output(transform=transform)
    assert out.native_to_local(0, 0) == expected
    assert out.oriented_size == ((2, 4) if transform & 1 else (4, 2))
    for x in range(out.width):
        for y in range(out.height):
            lx, ly = out.native_to_local(x, y)
            assert 0 < lx < out.logical_width and 0 < ly < out.logical_height


@pytest.mark.parametrize("x,y", [(-1, 0), (4, 0), (0, 2), (True, 0), (0.5, 0)])
def test_transform_bounds(x, y):
    with pytest.raises(capture.HyprlandCaptureError):
        output().native_to_local(x, y)


@pytest.mark.parametrize("change", [
    {"locked": True}, {"locked": None}, {"locked": 0}, {"revision": 0},
    {"consent_generation": True}, {"identity_digest": "wrong"},
    {"scope_digest": ""}, {"measured_ns": 0}, {"measured_ns": 2**64},
    {"output": output(name="TEST-2")},
])
def test_scope_lock_unknown_and_staleness_fail_shut(change):
    pin, out = pinned(), output()
    with pytest.raises(capture.HyprlandCaptureError):
        proof(pin, out, **change).check(pin, out)


def header(**changes):
    values = dict(magic=b"ODINSC01", width=4, height=2, stride=16, fmt=1, flags=0, size=32)
    values.update(changes)
    return capture.HEADER.pack(*values.values())


@pytest.mark.parametrize("change", [
    {"magic": b"OTHER001"}, {"width": 8}, {"height": 3}, {"stride": 0},
    {"fmt": 2}, {"flags": 1}, {"size": 2**32-1},
])
def test_header_rejects_unbounded_mismatched_or_unnormalized(change):
    with pytest.raises(capture.HyprlandCaptureError):
        capture.parse_header(header(**change), output())


def test_header_and_scope_valid():
    pin, out = pinned(), output()
    proof(pin, out).check(pin, out)
    assert capture.parse_header(header(), out) == 32


@pytest.mark.asyncio
async def test_ipc_wayland_same_pid_and_strict_version(tmp_path):
    trust = trust_self()

    async def wayland(reader, writer):
        await reader.read()
        writer.close()
        await writer.wait_closed()

    async def ipc(reader, writer):
        assert await reader.read(4096) == b"j/version"
        writer.write(json.dumps({"version": trust.version, "commit": trust.commit}).encode())
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    wlpath, ipath = str(tmp_path / "wl"), str(tmp_path / "ipc")
    async with await asyncio.start_unix_server(wayland, path=wlpath):
        async with await asyncio.start_unix_server(ipc, path=ipath):
            pin, connection = await identity.pin_connections(
                wayland_path=wlpath, ipc_path=ipath, expected_pid=os.getpid(),
                expected_uid=os.getuid(), trust=trust,
            )
            assert pin.process.pid == os.getpid()
            connection.close()
            await asyncio.sleep(0.01)


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", [
    b"{}", b"[]", b"not json", b"{" + b"x" * 16384,
    b'{"version":"0.0.fixture","version":"0.0.fixture","commit":"' + b"a" * 40 + b'"}',
])
async def test_version_untrusted_reply(reply):
    left, right = socket.socketpair()
    left.setblocking(False)
    right.setblocking(False)

    async def server():
        await asyncio.get_running_loop().sock_recv(right, 4096)
        await asyncio.get_running_loop().sock_sendall(right, reply)
        right.close()

    task = asyncio.create_task(server())
    try:
        with pytest.raises(identity.HyprlandIdentityError):
            await identity._version(left, trust_self(), time.monotonic() + 1)
    finally:
        left.close()
        await task


@pytest.mark.asyncio
async def test_wrong_peer_closed(tmp_path):
    path = str(tmp_path / "peer")
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(path)
    server.listen()
    try:
        with pytest.raises(identity.HyprlandIdentityError, match="peer_mismatch"):
            await identity.connect_peer(path, os.getpid() + 1, os.getuid(), time.monotonic() + 1)
    finally:
        server.close()


def helper_script(tmp_path, payload):
    path = tmp_path / "fake-helper"
    path.write_text("#!/usr/bin/python3\n" + payload)
    path.chmod(0o700)
    return str(path)


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", [
    "ok", "extra", "bad_status", "short", "stall", "scope_changed", "flood",
    "locked_after", "unknown_after", "consent_changed", "output_changed",
])
async def test_helper_transport_and_scope_fence(tmp_path, mode):
    pin, out = pinned(), output()
    wire = header() + b"\x00\x00\x00\xff" * 8
    code = f"import os,time\nos.write(1, {wire!r})\n"
    if mode == "extra":
        code += "os.write(1,b'x')\n"
    elif mode == "bad_status":
        code += "raise SystemExit(1)\n"
    elif mode == "short":
        code = "import os\nos.write(1,b'short')\n"
    elif mode == "stall":
        code = "import time\ntime.sleep(10)\n"
    elif mode == "flood":
        code = "import os\nwhile True: os.write(1,b'x'*65536)\n"
    helper = helper_script(tmp_path, code)
    calls = 0

    async def scope():
        nonlocal calls
        calls += 1
        changes = {}
        if calls > 1:
            changes = {
                "scope_changed": {"revision": 2},
                "locked_after": {"locked": True},
                "unknown_after": {"locked": None},
                "consent_changed": {"consent_generation": 2},
                "output_changed": {"output": output(logical_x=1)},
            }.get(mode, {})
        return proof(pin, out, **changes)

    left, right = socket.socketpair()
    try:
        task = capture.capture_explicit_output(
            helper=helper, wayland=left, identity=pin, output=out, scope=scope,
            timeout_seconds=0.2 if mode == "stall" else 3,
        )
        if mode == "ok":
            frame = await task
            assert frame.pixels == wire[32:]
            assert frame.output == out
        else:
            with pytest.raises(capture.HyprlandCaptureError):
                await task
        assert left.fileno() == -1
    finally:
        left.close()
        right.close()


@pytest.mark.asyncio
async def test_cancel_reaps_helper(tmp_path):
    pid_path = tmp_path / "pid"
    helper = helper_script(tmp_path, (
        f"import os,time\nopen({str(pid_path)!r},'w').write(str(os.getpid()))\ntime.sleep(20)\n"
    ))
    pin, out = pinned(), output()

    async def scope():
        return proof(pin, out)

    left, right = socket.socketpair()
    task = asyncio.create_task(capture.capture_explicit_output(
        helper=helper, wayland=left, identity=pin, output=out, scope=scope,
    ))
    try:
        async with asyncio.timeout(2):
            while not pid_path.exists():
                await asyncio.sleep(0.01)
        pid = int(pid_path.read_text())
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)
        assert left.fileno() == -1
    finally:
        left.close()
        right.close()
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
