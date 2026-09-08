"""Python transport checks with no native display."""
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
