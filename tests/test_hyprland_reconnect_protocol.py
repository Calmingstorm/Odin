"""Fault-injected exact-owner protocol, never a live display qualification."""

import asyncio
import copy
import os
from dataclasses import replace
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import hyprland_scope as scope
from src.computer.runtime.hyprland_identity import ExecutableTrust, HyprlandIdentity, ProcessPin


@pytest.fixture
def protocol(monkeypatch):
    identity = HyprlandIdentity(
        ProcessPin(321, os.geteuid(), 456, "boot-id", 1, 2, 3, 4, 5, "a" * 64),
        ExecutableTrust("/test/Hyprland", "a" * 64, "0.55.2", "b" * 40),
    )
    provider = scope.HyprlandScopeProvider(
        socket_path="/tmp/not-connected.sock", expected_uid=os.geteuid(),
        expected_compositor_pid=321,
    )
    provider._attested_identity = identity
    provider._attested_instance = "i1-" + "1" * 32
    provider._attested_plugin = "2" * 48
    monkeypatch.setattr(scope, "_proc_start", lambda pid, uid: 456)
    monkeypatch.setattr(scope, "revalidate", AsyncMock())
    row = {
        "ok": True, "version": 1, "scope_protocol_version": 1,
        "instance_id": provider._attested_instance,
        "compositor_pid": 321, "compositor_uid": os.geteuid(), "compositor_start_ticks": "456",
        "boot_id": "boot-id", "companion_build_id": "a" * 64,
        "owner_protocol_version": 1, "plugin_epoch": "2" * 48, "ledger_id": "3" * 48,
        "guardian_pid": 999, "guardian_uid": os.geteuid(), "guardian_start_ticks": "456",
        "recovery_pid": os.getpid(), "recovery_uid": os.geteuid(), "recovery_start_ticks": "456",
        "owner_matched": True, "revoked": False, "retired": False,
        "native_resources_retired": False, "unknown_release": False, "ledger_empty": True,
        "release_ack": True, "receiver_release_verified": False, "command_id": "",
    }
    requests = []

    async def request(value):
        requests.append(value)
        if value["op"] in {"owner_reconcile", "owner_retire"}:
            row["revoked"] = True
            row["command_id"] = value["command_id"]
            if value["op"] == "owner_retire":
                row["retired"] = True
        return copy.deepcopy(row)

    provider._request = request
    return provider, row, requests


async def capture(protocol):
    return await protocol[0].capture_owner({"pid": 999, "uid": os.geteuid(), "start_ticks": 456})


@pytest.mark.asyncio
async def test_capture_then_exact_reconcile_and_retire(protocol):
    provider, row, requests = protocol
    handle = await capture(protocol)
    result = await provider.reconcile_owner(handle, command_id="transaction-1")
    assert result["revoked"] and result["release_ack"] and result["ledger_empty"]
    assert not result["receiver_release_verified"]
    retired = await provider.retire_owner(handle, command_id="transaction-1")
    assert retired["retired"] and not retired["native_resources_retired"]
    assert [r["op"] for r in requests] == ["owner_capture", "owner_reconcile", "owner_retire"]
    assert all(r["instance_id"] == handle.instance_id and r["plugin_epoch"] == handle.plugin_epoch
               for r in requests)


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [
    ("instance_id", "i1-" + "a" * 32), ("plugin_epoch", "a" * 48),
    ("ledger_id", "a" * 48), ("guardian_pid", 1000), ("guardian_uid", -1),
    ("guardian_start_ticks", "457"), ("recovery_pid", 2), ("recovery_start_ticks", "457"),
    ("boot_id", "other-boot"), ("compositor_start_ticks", "457"),
    ("owner_protocol_version", True), ("owner_matched", False),
    ("receiver_release_verified", True), ("ledger_empty", 1),
    ("unknown_release", True), ("release_ack", "true"),
])
async def test_rejects_forged_or_cross_incarnation_reply(protocol, field, value):
    handle = await capture(protocol)
    protocol[1][field] = value
    with pytest.raises(scope.HyprlandScopeFailure):
        await protocol[0].reconcile_owner(handle, command_id="transaction-1")


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [
    ("plugin_epoch", "a" * 48), ("instance_id", "i1-" + "a" * 32),
    ("recovery_pid", 2), ("recovery_start_ticks", "789"),
])
async def test_wrong_handle_refused_before_send(protocol, field, value):
    handle = replace(await capture(protocol), **{field: value})
    protocol[2].clear()
    with pytest.raises(scope.HyprlandScopeFailure):
        await protocol[0].reconcile_owner(handle, command_id="txn")
    assert protocol[2] == []


@pytest.mark.asyncio
async def test_unknown_retirement_never_becomes_release(protocol):
    handle = await capture(protocol)
    protocol[1].update(unknown_release=True, release_ack=False, ledger_empty=False)
    result = await protocol[0].retire_owner(handle, command_id="txn")
    assert result["retired"] and result["revoked"] and result["unknown_release"]
    assert not result["release_ack"] and not result["receiver_release_verified"]


@pytest.mark.asyncio
@pytest.mark.parametrize("error", [asyncio.CancelledError, TimeoutError, ConnectionResetError])
async def test_lost_mutation_reply_preserves_handle_no_automatic_replay(protocol, error):
    provider, row, requests = protocol
    handle = await capture(protocol)
    original = provider._request

    async def lost(value):
        await original(value)  # mutation applied, reply lost
        raise error()

    provider._request = lost
    with pytest.raises(error):
        await provider.reconcile_owner(handle, command_id="txn")
    assert len(requests) == 2  # no implicit retry or release_all
    provider._request = original
    result = await provider.owner_status(handle, command_id="txn")
    assert result["revoked"] and result["ledger_id"] == handle.ledger_id
    assert requests[-1]["op"] == "owner_status"


@pytest.mark.asyncio
async def test_status_cannot_ack_an_unsubmitted_transaction(protocol):
    handle = await capture(protocol)
    with pytest.raises(scope.HyprlandScopeFailure):
        await protocol[0].owner_status(handle, command_id="never-submitted")


@pytest.mark.asyncio
async def test_capture_cancelled_after_registration_can_query_same_owner(protocol):
    provider, row, requests = protocol
    original = provider._request

    async def lost(value):
        await original(value)
        raise asyncio.CancelledError()

    provider._request = lost
    with pytest.raises(asyncio.CancelledError):
        await capture(protocol)
    provider._request = original
    handle = await capture(protocol)
    assert handle.ledger_id == row["ledger_id"]
    assert [r["op"] for r in requests] == ["owner_capture", "owner_capture"]


@pytest.mark.asyncio
async def test_missing_ledger_or_plugin_death_does_not_fall_back(protocol):
    handle = await capture(protocol)
    protocol[0]._request = AsyncMock(side_effect=scope.HyprlandScopeFailure())
    with pytest.raises(scope.HyprlandScopeFailure):
        await protocol[0].retire_owner(handle, command_id="txn")
    assert protocol[0]._request.call_count == 1
    assert protocol[0]._request.call_args.args[0]["op"] == "owner_retire"


@pytest.mark.asyncio
async def test_owner_protocol_unavailable_without_attestation(protocol):
    protocol[0]._attested_plugin = None
    with pytest.raises(scope.HyprlandScopeFailure):
        await capture(protocol)
    assert not protocol[2]


@pytest.mark.asyncio
@pytest.mark.parametrize("handoff", [False, True])
async def test_focus_recovery_requires_window_not_just_process(protocol, handoff):
    provider = protocol[0]
    lifetime = {"window_id": "w1-" + "2" * 48 + "-" + "4" * 48, "plugin_epoch": "2" * 48}
    binding = {"id": "old", "instance_id": provider._attested_instance, "output_id": "old-output",
               "output_name": "DP-1", "topology_epoch": 1, "topology_digest": "a" * 64,
               "output": {"x": 0}, "identity": {"pid": 999}, **lifetime}
    substitute = {**binding, "window_id": "w1-" + "2" * 48 + "-" + "5" * 48}

    async def inventory():
        provider._inventory = {"substitute": substitute}
        provider._inventory_instance = binding["instance_id"]
        provider._inventory_epoch = 2

    provider.inventory_targets = inventory
    provider.focus_candidate = AsyncMock()
    with pytest.raises(scope.HyprlandScopeFailure):
        await provider.focus_bound_candidate(binding, allow_output_handoff=handoff)
    provider.focus_candidate.assert_not_awaited()


@pytest.mark.asyncio
async def test_exact_window_can_move_output_only_with_explicit_handoff(protocol):
    provider = protocol[0]
    binding = {"id": "old", "instance_id": provider._attested_instance, "output_id": "old-output",
               "output_name": "DP-1", "topology_epoch": 1, "topology_digest": "a" * 64,
               "output": {"x": 0}, "identity": {"pid": 999},
               "window_id": "w1-" + "2" * 48 + "-" + "4" * 48, "plugin_epoch": "2" * 48}

    async def inventory():
        provider._inventory = {
            "same-window": {**binding, "output_name": "DP-2", "output_id": "new"}
        }
        provider._inventory_instance = binding["instance_id"]
        provider._inventory_epoch = 2

    provider.inventory_targets = inventory
    provider.focus_candidate = AsyncMock(return_value={"selected": True})
    with pytest.raises(scope.HyprlandScopeFailure):
        await provider.focus_bound_candidate(binding)
    result = await provider.focus_bound_candidate(binding, allow_output_handoff=True)
    assert result == {"selected": True}


def test_native_source_reconciliation_is_before_implicit_revoke():
    text = Path("assets/hyprland-input/scope-plugin.cpp").read_text()
    request = text.split("J request(Peer& peer, json_object* j)", 1)[1]
    assert request.index('op == "owner_status"') < request.index('revoke("request-scope-fence")')
    assert request.index('op == "status"') < request.index('revoke("request-scope-fence")')
    assert 'op != "release_status"' in request
    owner = text.split("J ownerRequest(", 1)[1].split("struct WireEvent", 1)[0]
    assert "release_all" not in owner
    assert "recorded = command" in owner
    assert "owners.erase" not in text
    assert "owner-device-incarnation-changed" in text
    assert "activeOwner && activeOwner->unknown" in text


def test_native_window_birth_identity_has_no_address_aba():
    text = Path("assets/hyprland-input/scope-plugin.cpp").read_text()
    assert '"w1-" + pluginEpoch + "-" + nonce()' in text
    assert "it->second.expired()" in text
    assert 'put(f.get(), "token", windowID(w))' in text
    assert "windowID(parent->m_window.lock())" in text
