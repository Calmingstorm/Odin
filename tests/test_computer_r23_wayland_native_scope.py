"""Production C dispatcher and inert libei pipe stub, never real desktop input."""

import time
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime.wayland_guardian import WaylandGuardian, WaylandGuardianError
from tests.test_computer_wayland_guardian_r8 import binaries, guardian  # noqa: F401


def expiry():
    return time.monotonic_ns() // 1000 + 240_000


def test_native_scope_expires_while_python_is_blocked(guardian):  # noqa: F811
    g = guardian()
    assert g.event("ready")["scope_lease_v1"] is True
    g.send(f"B 2000 {expiry()}\nL 272 2 1000 160 260 180 280\n".encode())
    # Native process runs independently while the Python controller is stalled.
    # Neither fixture clock progress nor Python cooperation can renew this lease.
    time.sleep(0.4)
    code, receipts = g.finish()
    assert code != 0
    assert any(r.get("reason") == "scope-evidence-expired" for r in receipts)
    assert not any(r["event"] == "action_done" for r in receipts)
    assert ["BUTTON", "272", "1"] in g.inputs()
    assert ["BUTTON", "272", "0"] in g.inputs()


def test_native_fresh_renewals_finish_and_heartbeat_does_not_renew(guardian):  # noqa: F811
    g = guardian()
    g.send(f"B 2000 {expiry()}\nL 272 2 1000 160 260 180 280\n".encode())
    for _ in range(40):
        time.sleep(0.05)
        g.outputs()
        if any(r["event"] == "action_done" for r in g.receipts):
            break
        g.send(f"O {expiry()}\n".encode())
    assert g.event("action_done")["diagnostics"]["release"] == "confirmed"
    g.send(b"C\n")
    assert g.finish()[0] == 0


@pytest.mark.parametrize("fault", ["expired", "future", "replayed", "heartbeat"])
def test_native_scope_invalid_or_unrenewed_authority_fences(guardian, fault):  # noqa: F811
    g = guardian()
    deadline = expiry()
    if fault == "expired":
        deadline -= 300_000
    elif fault == "future":
        deadline += 1_000_000
    g.send(f"B 2000 {deadline}\nL 272 2 1000 160 260 180 280\n".encode())
    if fault == "replayed":
        g.send(f"O {deadline}\n".encode())
    elif fault == "heartbeat":
        for _ in range(6):
            if g.proc.poll() is not None:
                break
            g.send(b"N\n")
            time.sleep(0.05)
    code, receipts = g.finish()
    assert code != 0
    assert not any(r["event"] == "action_done" for r in receipts)
    if fault in {"expired", "future"}:
        assert not g.inputs()


async def test_old_guardian_cannot_receive_scope_protected_action():
    g = WaylandGuardian("/unused", 123)
    g._child = Mock(returncode=None)
    g._send = AsyncMock()
    with pytest.raises(WaylandGuardianError, match="scope_lease_unavailable"):
        await g.act("T 61", scope_deadline_ns=time.monotonic_ns() + 250_000_000)
    g._send.assert_not_awaited()
    assert not g._active


async def test_transport_sends_absolute_scope_and_authenticated_renewal():
    g = WaylandGuardian("/unused", 123)
    g._child = Mock(returncode=None)
    g._ready = {"scope_lease_v1": True}
    g._send = AsyncMock()
    g._events.put_nowait({"event": "action_done"})
    deadline = time.monotonic_ns() + 250_000_000
    await g.act("T 61", scope_deadline_ns=deadline)
    g._send.assert_awaited_once_with(f"B 2000 {deadline // 1000}\nT 61\n")
    await g.refresh_scope(deadline)
    assert g._send.await_count == 1  # Idle refresh cannot pre-authorize another action.
    g._active = True
    await g.refresh_scope(deadline)
    assert g._send.await_args.args == (f"O {deadline // 1000}\n",)
