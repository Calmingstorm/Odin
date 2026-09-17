"""B0 bounded Hyprland diagnostics. No compositor is contacted."""

import asyncio
import os
import socket

import pytest

from src.computer.runtime import hyprland_identity as identity
from src.computer.runtime import hyprland_scope as scope
from src.computer.runtime.hyprland_errors import HyprlandFailureCause, HyprlandFailureStage


def test_identity_os_failure_is_safe_and_classified(monkeypatch):
    def unreadable(_pid, _uid):
        raise PermissionError(13, "secret /run/user/1000/socket token=private")

    monkeypatch.setattr(identity, "_proc_start", unreadable)
    trust = identity.ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.1", "b" * 40)
    with pytest.raises(identity.HyprlandIdentityError) as caught:
        identity.measure_process(99, 1000, trust, 10**12)

    assert caught.value.code == "hyprland_identity_unavailable"
    assert caught.value.stage is HyprlandFailureStage.PROCESS
    assert caught.value.cause is HyprlandFailureCause.UNREADABLE
    assert "secret" not in str(caught.value)
    assert "/run/" not in str(caught.value)


@pytest.mark.asyncio
async def test_socket_failure_preserves_static_code_and_safe_socket_stage(tmp_path):
    with pytest.raises(identity.HyprlandIdentityError) as caught:
        await identity.connect_peer(
            str(tmp_path / "missing-private-token"), 2, 0, 10**12,
        )

    assert caught.value.code == "hyprland_identity_transport_failed"
    assert caught.value.stage is HyprlandFailureStage.SOCKET
    assert caught.value.cause is HyprlandFailureCause.MISSING
    assert "missing-private-token" not in str(caught.value)


@pytest.mark.asyncio
async def test_scope_does_not_swallow_typed_computer_error(monkeypatch):
    provider = scope.HyprlandScopeProvider(
        socket_path="/tmp/odin-b0-scope", expected_uid=os.geteuid(), expected_compositor_pid=2,
    )
    typed = identity.HyprlandIdentityError(
        "hyprland_peer_mismatch", stage=HyprlandFailureStage.PEER,
        cause=HyprlandFailureCause.MISMATCH,
    )

    monkeypatch.setattr(
        provider, "_identity", lambda: {"pid": 2, "uid": os.geteuid(), "start_ticks": 1}
    )

    async def fail_connect(*_args, **_kwargs):
        raise typed

    monkeypatch.setattr(scope, "connect_peer", fail_connect)
    with pytest.raises(scope.HyprlandScopeFailure) as caught:
        await provider._request({"op": "status"})

    assert isinstance(caught.value, scope.HyprlandScopeFailure)
    assert str(caught.value) == "hyprland_scope_unavailable"
    assert caught.value.stage is HyprlandFailureStage.PEER
    assert caught.value.cause is HyprlandFailureCause.MISMATCH


@pytest.mark.asyncio
async def test_scope_read_failure_is_classified_without_socket_text(monkeypatch):
    provider = scope.HyprlandScopeProvider(
        socket_path="/tmp/odin-b0-scope", expected_uid=os.geteuid(), expected_compositor_pid=2,
    )
    monkeypatch.setattr(
        provider, "_identity", lambda: {"pid": 2, "uid": os.geteuid(), "start_ticks": 1}
    )

    async def missing(*_args, **_kwargs):
        raise FileNotFoundError(2, "private socket /tmp/token")

    monkeypatch.setattr(scope, "connect_peer", missing)
    with pytest.raises(scope.HyprlandScopeFailure) as caught:
        await provider._request({"op": "status"})

    assert str(caught.value) == "hyprland_scope_unavailable"
    assert caught.value.diagnostic == {"stage": "read", "cause": "missing"}
    assert "token" not in str(caught.value)


@pytest.mark.asyncio
async def test_version_parse_failure_has_no_peer_reply_text():
    left, right = socket.socketpair()
    left.setblocking(False)
    right.setblocking(False)
    trust = identity.ExecutableTrust("/usr/bin/Hyprland", "a" * 64, "0.1", "b" * 40)

    async def server():
        await asyncio.get_running_loop().sock_recv(right, 4096)
        await asyncio.get_running_loop().sock_sendall(right, b'{"reply":"private-token"}')
        right.close()

    task = asyncio.create_task(server())
    try:
        with pytest.raises(identity.HyprlandIdentityError) as caught:
            await identity._version(left, trust, 10**12)
    finally:
        left.close()
        await task

    assert caught.value.code == "hyprland_version_reply_invalid"
    assert caught.value.stage is HyprlandFailureStage.PARSE
    assert caught.value.cause is HyprlandFailureCause.INVALID
    assert "private-token" not in str(caught.value)
