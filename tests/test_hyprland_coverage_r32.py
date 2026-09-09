"""R32 boundary regressions, with fake processes and no desktop connections."""
import asyncio
import json
import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime import hyprland_guardian as guardian_module
from src.computer.runtime import hyprland_identity
from src.computer.runtime import hyprland_scope as scope


@pytest.fixture
def guardian(monkeypatch):
    value = guardian_module.HyprlandGuardian("/fake/owner", os.geteuid())
    monkeypatch.setattr(guardian_module, "trusted_binary", Mock())
    monkeypatch.setattr(guardian_module, "connect_peer", AsyncMock(return_value=Mock()))
    value._identity = AsyncMock()
    value._read = AsyncMock()
    value._heartbeats = AsyncMock()
    value._receive = AsyncMock(return_value={"scope_lease_v1": True, "peer_pid": 123})
    return value


async def start(value):
    return await value.start("/fake/wayland", "TEST-1", "/fake/scope", 123, 800, 600)


@pytest.mark.parametrize("path", [None, "relative", "/bad\npath", "/" + "x" * 108])
def test_explicit_socket_validation(path):
    with pytest.raises(guardian_module.HyprlandGuardianError, match="explicit_socket"):
        guardian_module._path(path)


@pytest.mark.asyncio
async def test_start_rejects_revoked_configuration(guardian):
    guardian._closing = True
    with pytest.raises(guardian_module.HyprlandGuardianError, match="configuration_invalid"):
        await start(guardian)
    guardian_module.connect_peer.assert_not_awaited()


@pytest.mark.asyncio
async def test_nonroot_cannot_switch_uid(guardian, monkeypatch):
    monkeypatch.setattr(guardian_module.os, "geteuid", lambda: 1001)
    guardian.expected_uid = 1002
    with pytest.raises(guardian_module.HyprlandGuardianError, match="uid_unavailable"):
        await start(guardian)
    guardian_module.connect_peer.assert_not_awaited()


@pytest.mark.asyncio
async def test_root_spawn_drops_supplementary_groups(guardian, monkeypatch):
    monkeypatch.setattr(guardian_module.os, "geteuid", lambda: 0)
    monkeypatch.setattr(guardian_module.pwd, "getpwuid", lambda uid: SimpleNamespace(pw_gid=77))
    guardian.expected_uid = 1002
    child = SimpleNamespace(pid=os.getpid(), returncode=None, wait=AsyncMock(return_value=0))
    spawn = AsyncMock(return_value=child)
    monkeypatch.setattr(guardian_module.asyncio, "create_subprocess_exec", spawn)
    await start(guardian)
    assert {key: spawn.call_args.kwargs[key] for key in ("user", "group", "extra_groups")} == {
        "user": 1002, "group": 77, "extra_groups": []}
    assert await guardian.select("TEST-1") == guardian.ready
    with pytest.raises(guardian_module.HyprlandGuardianError, match="mapping_changed"):
        await guardian.select("OTHER")
    await asyncio.gather(guardian._reader, guardian._waiter, guardian._heartbeat)


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", [{}, {"scope_lease_v1": True, "peer_pid": 999}])
async def test_untrusted_ready_closes_owner(guardian, monkeypatch, reply):
    child = SimpleNamespace(pid=os.getpid(), wait=AsyncMock(return_value=0))
    monkeypatch.setattr(guardian_module.asyncio, "create_subprocess_exec",
                        AsyncMock(return_value=child))
    guardian._receive.return_value = reply
    guardian.close = AsyncMock()
    with pytest.raises(guardian_module.HyprlandGuardianError, match="scope_unavailable"):
        await start(guardian)
    guardian.close.assert_awaited_once()
    assert guardian._heartbeat is None
    await asyncio.gather(guardian._reader, guardian._waiter)


@pytest.mark.asyncio
async def test_cancel_during_spawn_retains_child_for_cleanup(guardian, monkeypatch):
    entered, finish = asyncio.Event(), asyncio.Event()
    child = SimpleNamespace(pid=os.getpid(), wait=AsyncMock(return_value=0))

    async def spawn(*args, **kwargs):
        entered.set()
        await finish.wait()
        return child

    monkeypatch.setattr(guardian_module.asyncio, "create_subprocess_exec", spawn)
    guardian.close = AsyncMock()
    task = asyncio.create_task(start(guardian))
    await entered.wait()
    task.cancel()
    await asyncio.sleep(0)
    assert not guardian._spawning.cancelled()
    finish.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert guardian._child is child
    guardian.close.assert_awaited_once()
    await asyncio.gather(guardian._reader, guardian._waiter)


@pytest.mark.asyncio
async def test_revocation_while_spawn_pending_never_admits_ready(guardian, monkeypatch):
    async def spawn(*args, **kwargs):
        guardian._closing = True
        return SimpleNamespace(pid=os.getpid(), wait=AsyncMock(return_value=0))

    monkeypatch.setattr(guardian_module.asyncio, "create_subprocess_exec", spawn)
    guardian.close = AsyncMock()
    with pytest.raises(guardian_module.HyprlandGuardianError, match="revoked"):
        await start(guardian)
    guardian._receive.assert_not_awaited()
    guardian.close.assert_awaited_once()
    await guardian._waiter


@pytest.mark.asyncio
@pytest.mark.parametrize("fails", [False, True])
async def test_close_joins_pending_spawn_and_distinguishes_no_owner(guardian, monkeypatch, fails):
    async def spawn():
        if fails:
            raise OSError("exec failed")
        return SimpleNamespace(wait=AsyncMock(return_value=0))

    guardian._spawning = asyncio.create_task(spawn())
    guardian._last_terminal = {"release_acknowledged": True}
    parent_close = AsyncMock(return_value={"release_submitted": True, "process_reaped": True})
    monkeypatch.setattr(guardian_module.WaylandGuardian, "close", parent_close)
    receipt = await guardian.close()
    assert receipt["release_not_required"] is fails
    assert receipt["native_release_acknowledged"] is (not fails)
    assert receipt["receiver_release_verified"] is False
    assert guardian._closing
    parent_close.assert_awaited_once()
    if not fails:
        await asyncio.gather(guardian._reader, guardian._waiter)


@pytest.mark.asyncio
async def test_non_mapping_scope_rejected_without_send(guardian):
    guardian._send = AsyncMock()
    with pytest.raises(guardian_module.HyprlandGuardianError, match="scope_invalid"):
        await guardian.bind_scope([])
    guardian._send.assert_not_awaited()


@pytest.mark.parametrize("path", ["relative", "/bad\npath", "/" + "x" * 108])
def test_provider_rejects_non_explicit_socket(path):
    with pytest.raises(scope.HyprlandScopeFailure, match="explicit_session"):
        scope.HyprlandScopeProvider(socket_path=path, expected_uid=os.geteuid(),
                                    expected_compositor_pid=123)


def test_provider_rejects_owner_aba(monkeypatch):
    provider = scope.HyprlandScopeProvider(socket_path="/fake/scope", expected_uid=os.geteuid(),
                                          expected_compositor_pid=123)
    monkeypatch.setattr(scope, "_proc_start", Mock(side_effect=[10, 11]))
    assert provider._identity()["start_ticks"] == 10
    with pytest.raises(scope.HyprlandScopeFailure, match="owner_changed"):
        provider._identity()


@pytest.mark.parametrize("ack,changed,failure", [
    (True, False, False), (False, False, False), (True, True, False), (True, False, True),
])
def test_recovery_cli_checks_identity_and_sanitizes_failure(
        monkeypatch, capsys, ack, changed, failure):
    monkeypatch.setattr(sys, "argv", ["recover", "--release-all", "--socket", "/fake/scope",
        "--pid", "123", "--uid", "1000", "--executable", "/fake/hyprland",
        "--sha256", "a" * 64, "--version", "fixture", "--commit", "b" * 40])
    receipt = {"release_submitted": True, "release_ack": ack,
               "receiver_release_verified": False}
    provider = SimpleNamespace(release_all=AsyncMock(return_value=receipt), close=AsyncMock())
    if failure:
        provider.release_all.side_effect = RuntimeError("private native token and window title")
    factory = Mock(return_value=provider)
    monkeypatch.setattr(scope, "HyprlandScopeProvider", factory)
    measure = Mock(side_effect=[{"start": 1}, {"start": 2 if changed else 1}])
    monkeypatch.setattr(hyprland_identity, "measure_process", measure)
    assert scope.main() == (0 if ack and not changed and not failure else 2)
    output = json.loads(capsys.readouterr().out)
    assert output == ({"error": "hyprland_recovery_unconfirmed",
                       "receiver_release_verified": False} if changed or failure else receipt)
    provider.close.assert_awaited_once()
    provider.release_all.assert_awaited_once()
    assert measure.call_count == (1 if failure else 2)
    factory.assert_called_once_with(socket_path="/fake/scope", expected_uid=1000,
                                    expected_compositor_pid=123)


def test_recovery_cli_requires_explicit_opt_in(monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["recover"])
    with pytest.raises(SystemExit) as error:
        scope.main()
    assert error.value.code == 2
    assert "--release-all" in capsys.readouterr().err
