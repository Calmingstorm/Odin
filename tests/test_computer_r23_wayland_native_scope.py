"""Production C dispatcher and inert libei pipe stub, never real desktop input."""

import subprocess
import time
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime.wayland_guardian import WaylandGuardian, WaylandGuardianError
from tests.test_computer_wayland_guardian_r8 import (  # noqa: F401
    HEADER,
    LIBRARY,
    SOURCE,
    Guardian,
    binaries,
    guardian,
)


def expiry():
    return time.monotonic_ns() // 1000 + 240_000


@pytest.fixture(scope="module")
def preflight_binary(tmp_path_factory):
    root = tmp_path_factory.mktemp("wayland-scope-preflight")
    (root / "libei.h").write_text(HEADER)
    # Inert transport only. Delay the first real keymap lookup during command
    # preflight, not scope acquisition or dispatch. No production fault hook.
    (root / "fake.c").write_text(
        LIBRARY
        + r"""
#include <time.h>
#include <errno.h>
uint32_t __real_xkb_state_key_get_utf32(struct xkb_state *, xkb_keycode_t);
uint32_t __wrap_xkb_state_key_get_utf32(struct xkb_state *state, xkb_keycode_t key) {
 static int delayed;
 if(!delayed++){
  struct timespec remaining={.tv_sec=0,.tv_nsec=300000000};
  emit("PREFLIGHT_BEGIN\n");
  while(nanosleep(&remaining,&remaining)<0 && errno==EINTR){}
  emit("PREFLIGHT_END\n");
 }
 return __real_xkb_state_key_get_utf32(state,key);
}
"""
    )
    libraries = subprocess.check_output(
        ["pkg-config", "--cflags", "--libs", "xkbcommon"], text=True
    ).split()
    binary = root / "preflight"
    subprocess.run(
        ["cc", "-std=c11", "-Wall", "-Wextra", "-Werror", "-I", str(root)]
        + [str(SOURCE), str(root / "fake.c"), "-Wl,--wrap=xkb_state_key_get_utf32"]
        + libraries
        + ["-lm", "-o", str(binary)],
        check=True,
        timeout=30,
    )
    return binary


@pytest.mark.parametrize("command", ["T 61", "J a"])
def test_native_scope_expiring_during_preflight_sends_no_input(preflight_binary, command):
    g = Guardian(preflight_binary)
    try:
        g.send(f"B 2000 {expiry()}\n{command}\n".encode())
        code, receipts = g.finish()
        assert "PREFLIGHT_BEGIN" in g.lines
        assert "PREFLIGHT_END" in g.lines
        assert code == 2
        assert not g.inputs()
        assert not any(line.startswith(("MOVE ", "SCROLL ")) for line in g.lines)
        assert not any(r["event"] == "action_done" for r in receipts)
        closed = next(r for r in receipts if r["event"] == "closed")
        assert closed["reason"] == "scope-evidence-expired"
        assert closed["input_was_sent"] is False
        assert closed["diagnostics"]["phase"] == "preflight"
        assert closed["diagnostics"]["steps_completed"] == 0
        assert closed["diagnostics"]["release"] == "confirmed"
    finally:
        g.close()


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
