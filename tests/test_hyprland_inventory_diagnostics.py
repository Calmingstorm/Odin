"""Inventory reporting regression tests; all native calls are mocked."""

import asyncio
import traceback
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from src.computer.runtime import hyprland_discovery as hd
from src.computer.runtime.hyprland_errors import (
    HyprlandDiagnosticError,
    HyprlandFailureCause,
    HyprlandFailureStage,
)
from src.computer.runtime.hyprland_identity import HyprlandIdentityError
from src.computer.runtime.hyprland_scope import _NATIVE_REFUSALS, HyprlandScopeFailure
from tests.test_computer_hyprland_foundation_r29 import pinned
from tests.test_computer_hyprland_preinventory_r42 import config

SECRET = "private-token=/run/private.sock\nAuthorization: Bearer sensitive"
PHASES = (
    "resolve", "pin_connections", "prepare_plugin", "open_provider",
    "inventory_targets", "export_selection_proofs", "close_provider", "close_connection",
)


@pytest.fixture
def rig(monkeypatch):
    backend = hb.HyprlandRuntimeBackend(config=config(), enabled=True)
    backend._selection_proofs["stale"] = object()
    result = {"candidate_epoch": 3, "candidates": [{"id": "new"}]}
    connection = SimpleNamespace(close=Mock())
    provider = SimpleNamespace(
        inventory_targets=AsyncMock(return_value=result),
        export_selection_proof=Mock(return_value="new-proof"), close=AsyncMock(),
    )
    resolved = SimpleNamespace(
        runtime_dir="/run/user/fixture", wayland_display="wayland-9",
        instance_signature="instance", pid=pinned().process.pid,
    )
    phases = dict(zip(PHASES, (
        AsyncMock(return_value=resolved), AsyncMock(return_value=(pinned(), connection)),
        AsyncMock(), AsyncMock(return_value=provider), provider.inventory_targets,
        provider.export_selection_proof, provider.close, connection.close,
    ), strict=True))
    monkeypatch.setattr(hd.HyprlandDiscoveryResolver, "resolve", phases["resolve"])
    monkeypatch.setattr(hb, "pin_connections", phases["pin_connections"])
    monkeypatch.setattr(backend, "_prepare_plugin", phases["prepare_plugin"])
    monkeypatch.setattr(hb.HyprlandScopeProvider, "from_identity", phases["open_provider"])
    return SimpleNamespace(
        backend=backend, connection=connection, provider=provider, phases=phases, result=result,
    )


def assert_safe(caplog, phase, reason, error_type):
    assert f"phase={phase} " in caplog.text
    assert f"reason={reason} " in caplog.text
    assert f"type={error_type} " in caplog.text
    assert SECRET not in caplog.text
    assert "private.sock" not in caplog.text
    assert "Authorization" not in caplog.text
    assert all(record.exc_info is None and record.stack_info is None for record in caplog.records)


@pytest.mark.parametrize("reason", sorted(
    {"hyprland_" + value.replace("-", "_") for value in _NATIVE_REFUSALS}
    | {"hyprland_scope_reply_invalid", "hyprland_provider_owner_changed",
       "hyprland_scope_selection_invalid", "hyprland_scope_unavailable"}
))
async def test_native_refusals_reach_computer_boundary(rig, caplog, reason):
    rig.phases["inventory_targets"].side_effect = HyprlandScopeFailure(reason)
    with pytest.raises(ComputerError) as caught:
        await rig.backend.inventory_targets()
    assert caught.value.code == reason
    assert isinstance(caught.value, HyprlandDiagnosticError)
    assert caught.value.diagnostic == {"stage": "read", "cause": "unavailable"}
    assert_safe(caplog, "inventory_targets", reason, "HyprlandScopeFailure")
    assert rig.backend._selection_proofs == {}
    rig.provider.close.assert_awaited_once()
    rig.connection.close.assert_called_once()


@pytest.mark.parametrize("phase", PHASES)
@pytest.mark.parametrize("constructor", [RuntimeError, HyprlandScopeFailure,
                                        HyprlandIdentityError, ComputerError])
async def test_secret_exceptions_sanitized_at_every_phase(rig, caplog, phase, constructor):
    rig.phases[phase].side_effect = constructor(SECRET)
    with pytest.raises(ComputerError) as caught:
        await rig.backend.inventory_targets()
    assert caught.value.code == "target_inventory_unavailable"
    assert SECRET not in "".join(traceback.format_exception(caught.value))
    assert_safe(caplog, phase, "target_inventory_unavailable", constructor.__name__)
    assert rig.backend._selection_proofs == {}
    if phase not in {"resolve", "pin_connections"}:
        rig.connection.close.assert_called_once()


@pytest.mark.parametrize("phase", PHASES)
async def test_identity_diagnostics_preserved(rig, caplog, phase):
    rig.phases[phase].side_effect = HyprlandIdentityError(
        "hyprland_identity_transport_failed",
        stage=HyprlandFailureStage.SOCKET, cause=HyprlandFailureCause.UNREADABLE,
    )
    with pytest.raises(HyprlandDiagnosticError) as caught:
        await rig.backend.inventory_targets()
    assert caught.value.code == "hyprland_identity_transport_failed"
    assert caught.value.diagnostic == {"stage": "socket", "cause": "unreadable"}
    assert "stage=socket cause=unreadable" in caplog.text
    assert_safe(caplog, phase, caught.value.code, "HyprlandIdentityError")
    assert rig.backend._selection_proofs == {}


@pytest.mark.parametrize("reason", ["hyprland_discovery_not_found", "hyprland_discovery_ambiguous",
                                   "hyprland_discovery_deadline", "hyprland_peer_mismatch"])
async def test_discovery_semantics_preserved(rig, caplog, reason):
    rig.phases["resolve"].side_effect = hd.HyprlandDiscoveryError(reason)
    with pytest.raises(hd.HyprlandDiscoveryError) as caught:
        await rig.backend.inventory_targets()
    assert caught.value.code == reason
    assert_safe(caplog, "resolve", reason, "HyprlandDiscoveryError")
    assert rig.backend._selection_proofs == {}
    rig.phases["pin_connections"].assert_not_awaited()


async def test_unknown_discovery_sanitized(rig, caplog):
    rig.phases["resolve"].side_effect = hd.HyprlandDiscoveryError(SECRET)
    with pytest.raises(ComputerError, match="^target_inventory_unavailable$"):
        await rig.backend.inventory_targets()
    assert SECRET not in caplog.text


@pytest.mark.parametrize("phase", PHASES)
async def test_cancellation_at_every_phase(rig, caplog, phase):
    error = asyncio.CancelledError(SECRET)
    rig.phases[phase].side_effect = error
    with pytest.raises(asyncio.CancelledError) as caught:
        await rig.backend.inventory_targets()
    assert caught.value is error
    assert rig.backend._selection_proofs == {}
    assert_safe(caplog, phase, "cancelled", "CancelledError")
    if phase not in {"resolve", "pin_connections"}:
        rig.connection.close.assert_called_once()


@pytest.mark.parametrize("cancelled", [False, True])
async def test_cleanup_does_not_mask_primary(rig, caplog, cancelled):
    primary = (asyncio.CancelledError(SECRET) if cancelled else
               HyprlandScopeFailure("hyprland_lock_or_input_held"))
    rig.phases["inventory_targets"].side_effect = primary
    rig.phases["close_provider"].side_effect = RuntimeError(SECRET)
    rig.phases["close_connection"].side_effect = RuntimeError(SECRET)
    with pytest.raises(asyncio.CancelledError if cancelled else ComputerError) as caught:
        await rig.backend.inventory_targets()
    if cancelled:
        assert caught.value is primary
    else:
        assert caught.value.code == "hyprland_lock_or_input_held"
    rig.provider.close.assert_awaited_once()
    rig.connection.close.assert_called_once()
    assert rig.backend._selection_proofs == {}
    assert "phase=close_provider" in caplog.text
    assert "phase=close_connection" in caplog.text
    assert SECRET not in caplog.text


@pytest.mark.parametrize("cleanup_phase", ["close_provider", "close_connection"])
async def test_new_cancellation_during_cleanup_wins_over_primary_error(rig, cleanup_phase):
    rig.phases["inventory_targets"].side_effect = HyprlandScopeFailure(
        "hyprland_lock_or_input_held"
    )
    cancelled = asyncio.CancelledError()
    rig.phases[cleanup_phase].side_effect = cancelled
    with pytest.raises(asyncio.CancelledError) as caught:
        await rig.backend.inventory_targets()
    assert caught.value is cancelled
    rig.connection.close.assert_called_once()
    assert rig.backend._selection_proofs == {}


async def test_publish_proofs_only_after_successful_cleanup(rig, caplog):
    observed = []

    async def close_provider():
        observed.append("provider")
        assert rig.backend._selection_proofs == {}

    def close_connection():
        observed.append("connection")
        assert rig.backend._selection_proofs == {}

    rig.provider.close.side_effect = close_provider
    rig.connection.close.side_effect = close_connection
    assert await rig.backend.inventory_targets() == rig.result
    assert observed == ["provider", "connection"]
    assert rig.backend._selection_proofs == {"new": "new-proof"}
    assert rig.backend._guardian is None and not rig.backend._started
    assert not caplog.records


async def test_task_cancellation_during_provider_close(rig):
    entered = asyncio.Event()

    async def blocked_close():
        entered.set()
        await asyncio.Event().wait()

    rig.provider.close.side_effect = blocked_close
    task = asyncio.create_task(rig.backend.inventory_targets())
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    rig.connection.close.assert_called_once()
    assert rig.backend._selection_proofs == {}


@pytest.mark.parametrize("field", ["enabled", "_closed", "_started"])
async def test_admission_clears_proofs(rig, field):
    setattr(rig.backend, field, field != "enabled")
    with pytest.raises(ComputerError, match="^target_inventory_unavailable$"):
        await rig.backend.inventory_targets()
    assert rig.backend._selection_proofs == {}
    rig.phases["resolve"].assert_not_awaited()


async def test_unexpected_traceback_is_bounded_metadata_only(rig, caplog):
    def nested(depth):
        private_local = SECRET
        if depth:
            return nested(depth - 1)
        raise RuntimeError(private_local)

    async def fail():
        nested(20)

    rig.provider.inventory_targets.side_effect = fail
    with pytest.raises(ComputerError, match="^target_inventory_unavailable$"):
        await rig.backend.inventory_targets()
    record = next(row for row in caplog.records if row.name == hb.__name__)
    frames = record.args[-1]
    assert len(frames) == 8
    assert all(len(frame) == 3 and isinstance(frame[1], int) for frame in frames)
    assert all("/" not in frame[0] for frame in frames)
    assert SECRET not in caplog.text
    assert "private_local" not in caplog.text


async def test_untyped_static_looking_message_stays_generic(rig, caplog):
    rig.provider.inventory_targets.side_effect = RuntimeError("hyprland_lock_or_input_held")
    with pytest.raises(ComputerError, match="^target_inventory_unavailable$"):
        await rig.backend.inventory_targets()
    assert "reason=hyprland_lock_or_input_held" not in caplog.text


async def test_exception_str_and_diagnostic_properties_not_used(rig, caplog):
    class HostileScopeError(HyprlandScopeFailure):
        def __str__(self):
            raise AssertionError("exception text must never be rendered")

        @property
        def diagnostic(self):
            raise AssertionError("untrusted diagnostic property must never be rendered")

    error = HostileScopeError("hyprland_scope_unavailable", stage=SECRET, cause=SECRET)
    rig.provider.inventory_targets.side_effect = error
    with pytest.raises(HyprlandDiagnosticError) as caught:
        await rig.backend.inventory_targets()
    assert caught.value.diagnostic == {"stage": "read", "cause": "unavailable"}
    assert SECRET not in caplog.text
