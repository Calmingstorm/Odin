"""Joined Python/native/fake-wire evidence, never live receiver proof.

Run with ODIN_HYPRLAND_INPUT_TEST_BINARY pointing to the guardian-only build.
Only installation trust and the Python preliminary socket probes are replaced:
WirePeer accepts one connection per socket, reserved for the real native child.
The child still performs actual SO_PEERCRED checks against this test process.
"""

import asyncio
import importlib.util
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import pytest

from src.computer.runtime import hyprland_guardian as module
from src.computer.runtime.wayland_guardian import WaylandGuardianError

spec = importlib.util.spec_from_file_location(
    "joined_hyprland_wire", Path(__file__).parent / "fixtures/hyprland_input_wire_r32.py"
)
wire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wire)


@pytest.fixture
def native(tmp_path, monkeypatch):
    configured = os.environ.get("ODIN_HYPRLAND_INPUT_TEST_BINARY")
    if not configured:
        pytest.skip("set ODIN_HYPRLAND_INPUT_TEST_BINARY to run joined native wire tests")
    binary = Path(configured).resolve()
    assert binary.is_file() and os.access(binary, os.X_OK)
    peer = wire.WirePeer(tmp_path)

    class PreliminaryProbe:
        def close(self):
            pass

    async def probe(path, pid, uid, deadline):
        assert path in (peer.wayland, peer.scope)
        assert pid == os.getpid() and uid == os.getuid()
        assert deadline > time.monotonic()
        return PreliminaryProbe()

    monkeypatch.setattr(module, "trusted_binary", lambda path: None)
    monkeypatch.setattr(module, "connect_peer", probe)
    yield str(binary), peer
    peer.close()
    assert not peer.errors, peer.errors


async def bind(guardian):
    measured = time.monotonic_ns()
    await guardian.bind_scope({
        "observed_monotonic_ns": measured,
        "native_scope_token": "a" * 64,
        "source_digest": "b" * 64,
        "focus_digest": "c" * 64,
        "bounds_digest": "d" * 64,
        "locked": False,
        "authenticated": True,
    })
    return measured + module.LEASE_NS


@asynccontextmanager
async def started(native):
    binary, peer = native
    guardian = module.HyprlandGuardian(binary, os.getuid())
    try:
        ready = await guardian.start(
            peer.wayland, "WIRE-1", peer.scope, os.getpid(), 800, 600
        )
        assert ready["peer_pid"] == os.getpid()
        assert ready["scope_lease_v1"] is True
        assert (ready["width"], ready["height"]) == (800, 600)
        assert peer.keymaps and b"xkb_keymap" in peer.keymaps[0]
        yield guardian, peer
    finally:
        receipt = await guardian.close()
        assert receipt["process_reaped"] is True
        assert guardian._child.returncode is not None


@pytest.mark.asyncio
async def test_joined_click_then_second_action(native):
    async with started(native) as (guardian, peer):
        for x in (30, 60):
            deadline = await bind(guardian)
            receipt = await guardian.act(f"P 272 {x} 40", scope_deadline_ns=deadline)
            assert receipt["release_ack"] is True
            assert receipt["release_submitted"] is True
            assert receipt["receiver_release_verified"] is False
            assert guardian.alive
        assert peer.buttons() == [(272, 1), (272, 0)] * 2
        assert sum(r["op"] == "arm" for r in peer.requests) == 2


@pytest.mark.asyncio
async def test_joined_long_stroke_with_async_scope_renewals(native):
    async with started(native) as (guardian, peer):
        deadline = await bind(guardian)
        before = time.monotonic()
        task = asyncio.create_task(guardian.act(
            "L 272 3 650 30 40 200 200 300 400", scope_deadline_ns=deadline
        ))
        try:
            while not task.done():
                await asyncio.sleep(0.05)
                if not task.done():
                    await guardian.refresh_scope(await bind(guardian))
            receipt = await task
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        assert time.monotonic() - before >= 0.60
        assert receipt["release_ack"] is True
        assert peer.buttons() == [(272, 1), (272, 0)]
        assert sum(r["op"] == "renew" for r in peer.requests) >= 3


@pytest.mark.asyncio
@pytest.mark.parametrize("ack", [True, False])
async def test_joined_close_propagates_native_ack(native, ack):
    async with started(native) as (guardian, peer):
        deadline = await bind(guardian)
        task = asyncio.create_task(guardian.act(
            "L 272 2 1000 30 40 300 400", scope_deadline_ns=deadline
        ))
        try:
            await asyncio.to_thread(peer.wait, lambda: (272, 1) in peer.buttons())
            peer.ack_release = ack
            receipt = await guardian.close()
            assert receipt["release_ack"] is ack
            assert receipt["native_release_acknowledged"] is ack
            assert receipt["receiver_release_verified"] is False
            assert peer.buttons() == [(272, 1), (272, 0)]
        finally:
            results = await asyncio.gather(task, return_exceptions=True)
        assert isinstance(results[0], WaylandGuardianError)


@pytest.mark.asyncio
@pytest.mark.parametrize("command", ["J definitely_not_a_keysym", "K 1 999"])
async def test_joined_invalid_key_rejected_without_input(native, command):
    async with started(native) as (guardian, peer):
        with pytest.raises(WaylandGuardianError) as caught:
            await guardian.act(command, scope_deadline_ns=await bind(guardian))
        assert not peer.buttons()
        assert not [(i, op) for i, op, _ in peer.events if i == "keyboard" and op == 1]
        assert caught.value.details.get("input_was_sent") is False, caught.value.details


@pytest.mark.asyncio
async def test_joined_cancel_mid_stroke_releases_and_reaps(native):
    async with started(native) as (guardian, peer):
        deadline = await bind(guardian)
        task = asyncio.create_task(guardian.act(
            "L 272 2 1000 30 40 300 400", scope_deadline_ns=deadline
        ))
        try:
            await asyncio.to_thread(peer.wait, lambda: (272, 1) in peer.buttons())
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            receipt = await guardian.close()
            assert receipt["release_ack"] is True
            assert receipt["process_reaped"] is True
            assert peer.buttons() == [(272, 1), (272, 0)]
            assert not guardian.alive
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
