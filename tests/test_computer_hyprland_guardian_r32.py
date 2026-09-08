"""Python transport checks with no native display."""
import asyncio
import os
import time
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import hyprland_guardian as module


def snapshot():
    return {"locked": False, "authenticated": True,
            "observed_monotonic_ns": time.monotonic_ns(), "native_scope_token": "a" * 64,
            "source_digest": "b" * 64, "focus_digest": "c" * 64, "bounds_digest": "d" * 64}


@pytest.mark.asyncio
async def test_bind_and_refresh_cannot_extend_evidence():
    guardian = module.HyprlandGuardian("/not/executed", os.getuid())
    guardian._send = AsyncMock()
    scope = snapshot()
    await guardian.bind_scope(scope)
    guardian._send.assert_awaited_once_with("F " + "a" * 64 + "\n")
    guardian._active = True
    await guardian.refresh_scope(scope["observed_monotonic_ns"] + 200_000_000)
    assert guardian._send.await_args.args[0].startswith("O ")
    with pytest.raises(module.HyprlandGuardianError, match="expired"):
        await guardian.refresh_scope(scope["observed_monotonic_ns"] + 251_000_000)


@pytest.mark.parametrize("mutation", [
    lambda s: s.update(locked=True), lambda s: s.update(authenticated=False),
    lambda s: s.update(native_scope_token="X\nC"),
    lambda s: s.update(observed_monotonic_ns=0), lambda s: s.update(source_digest="no"),
    lambda s: s.update(observed_monotonic_ns=time.monotonic_ns() + 10**9),
])
@pytest.mark.asyncio
async def test_bad_scope_sends_nothing(mutation):
    guardian = module.HyprlandGuardian("/not/executed", os.getuid())
    guardian._send = AsyncMock()
    scope = snapshot()
    mutation(scope)
    with pytest.raises(module.HyprlandGuardianError):
        await guardian.bind_scope(scope)
    guardian._send.assert_not_awaited()


@pytest.mark.asyncio
async def test_active_scope_cannot_switch_focus():
    guardian = module.HyprlandGuardian("/not/executed", os.getuid())
    guardian._send = AsyncMock()
    scope = snapshot()
    await guardian.bind_scope(scope)
    guardian._active = True
    scope["focus_digest"] = "e" * 64
    with pytest.raises(module.HyprlandGuardianError, match="scope_invalid"):
        await guardian.bind_scope(scope)
    assert guardian._send.await_count == 1


@pytest.mark.asyncio
async def test_act_requires_scope_before_writing():
    guardian = module.HyprlandGuardian("/not/executed", os.getuid())
    guardian._send = AsyncMock()
    with pytest.raises(module.HyprlandGuardianError, match="scope_expired"):
        await guardian.act("M 10 10")
    guardian._send.assert_not_awaited()


@pytest.mark.asyncio
async def test_receiver_proof_not_inferred(monkeypatch):
    guardian = module.HyprlandGuardian("/not/executed", os.getuid())
    guardian._scope_deadline = time.monotonic_ns() + 250_000_000
    monkeypatch.setattr(module.WaylandGuardian, "act", AsyncMock(return_value={
        "release_acknowledged": True, "receiver_release_verified": True}))
    result = await guardian.act("M 10 10", scope_deadline_ns=guardian._scope_deadline)
    assert result == {"release_ack": True, "receiver_release_verified": False}


@pytest.mark.asyncio
async def test_not_started_close_does_not_claim_native_ack():
    guardian = module.HyprlandGuardian("/not/executed", os.getuid())
    result = await guardian.close()
    assert result["process_reaped"]
    assert not result["release_ack"]
    assert not result["receiver_release_verified"]


@pytest.mark.asyncio
async def test_native_start_arguments_and_identity(monkeypatch):
    guardian = module.HyprlandGuardian("/fake/binary", os.getuid())
    child = AsyncMock()
    child.pid = os.getpid()
    child.returncode = None
    child.wait = AsyncMock(return_value=0)
    spawn = AsyncMock(return_value=child)
    monkeypatch.setattr(module.asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(module, "trusted_binary", lambda _: None)
    peer = type("Peer", (), {"close": lambda self: None})()
    monkeypatch.setattr(module, "connect_peer", AsyncMock(return_value=peer))
    guardian._read = AsyncMock()
    guardian._receive = AsyncMock(return_value={"scope_lease_v1": True, "peer_pid": os.getpid()})
    guardian._heartbeats = AsyncMock()
    await guardian.start("/fake/wayland", "TEST-1", "/fake/scope", os.getpid(), 800, 600)
    assert spawn.await_args.args == (
        "/fake/binary", "/fake/wayland", str(os.getpid()), str(os.getuid()),
        "TEST-1", "/fake/scope", "800", "600")
    assert "pass_fds" not in spawn.await_args.kwargs
    assert spawn.await_args.kwargs["start_new_session"] is True
    await asyncio.gather(guardian._reader, guardian._heartbeat, guardian._waiter)


@pytest.mark.asyncio
async def test_preflight_peer_failure_never_spawns(monkeypatch):
    guardian = module.HyprlandGuardian("/fake/binary", os.getuid())
    spawn = AsyncMock()
    monkeypatch.setattr(module.asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(module, "trusted_binary", lambda _: None)
    monkeypatch.setattr(module, "connect_peer", AsyncMock(side_effect=ValueError("fake mismatch")))
    with pytest.raises(ValueError):
        await guardian.start("/fake/wayland", "TEST-1", "/fake/scope", os.getpid(), 800, 600)
    spawn.assert_not_awaited()
