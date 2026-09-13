"""Durable owner descriptors and fault-injected reconnect, no live display."""

import asyncio
import copy
import os
from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import hyprland_scope as scope
from src.computer.runtime.hyprland_identity import ExecutableTrust, HyprlandIdentity, ProcessPin


@pytest.fixture
def durable(monkeypatch):
    identity = HyprlandIdentity(
        ProcessPin(321, os.geteuid(), 456, "12345678-1234-1234-1234-123456789abc",
                   1, 2, 3, 4, 5, "a" * 64),
        ExecutableTrust("/test/Hyprland", "a" * 64, "0.55.2", "b" * 40),
    )
    provider = scope.HyprlandScopeProvider(socket_path="/tmp/unused-scope.sock",
                                         expected_uid=os.geteuid(), expected_compositor_pid=321)
    provider._attested_identity = identity
    provider._attested_instance = "i1-" + "1" * 32
    provider._attested_plugin = "2" * 48
    monkeypatch.setattr(scope, "_proc_start", lambda pid, uid: 456)
    monkeypatch.setattr(scope, "revalidate", AsyncMock())
    handle = scope.HyprlandOwnerHandle(identity, provider._attested_instance, "2" * 48,
                                     "3" * 48, 999, os.geteuid(), "456", 998,
                                     os.geteuid(), "455", "4" * 48)
    row = {
        "ok": True, "version": 1, "scope_protocol_version": 1,
        "instance_id": handle.instance_id, "compositor_pid": 321,
        "compositor_uid": os.geteuid(), "compositor_start_ticks": "456",
        "boot_id": identity.process.boot_id, "companion_build_id": "a" * 64,
        "owner_protocol_version": 1, "owner_reconnect_version": 1,
        "retirement_evidence_version": 1, "cross_compositor_retirement_supported": False,
        "retirement_evidence_kind": "unavailable",
        **{k: getattr(handle, k) for k in ("plugin_epoch", "ledger_id", "guardian_pid",
                                         "guardian_uid", "guardian_start_ticks", "recovery_uid")},
        "recovery_pid": os.getpid(), "recovery_start_ticks": "456",
        "owner_matched": True, "revoked": False, "retired": False,
        "native_resources_retired": False, "unknown_release": True, "ledger_empty": False,
        "release_ack": False, "receiver_release_verified": False,
        "previous_recovery_pid": 998, "previous_recovery_start_ticks": "455",
        "adoption_confirmed": True, "command_id": "adopt-1",
        "guardian_input_fenced": True,
    }
    requests = []

    async def request(value):
        requests.append(value)
        return copy.deepcopy(row)

    provider._request = request
    return provider, handle, row, requests


def test_descriptor_roundtrip_private_complete(durable):
    handle = durable[1]
    record = scope.owner_handle_to_record(handle)
    assert scope.owner_handle_from_record(record) == handle
    assert record["owner"]["compositor"]["trust"]["sha256"] == "a" * 64
    assert handle.recovery_capability not in repr(handle)
    record["owner"]["recovery_capability"] = "f" * 48
    assert handle.recovery_capability == "4" * 48


@pytest.mark.parametrize("path,value", [
    (("version",), 1), (("version",), True), (("owner", "recovery_pid"), True),
    (("owner", "recovery_capability"), ""), (("owner", "ledger_id"), "wrong"),
    (("owner", "compositor", "process", "boot_id"), "another-boot"),
    (("owner", "compositor", "process", "pid"), True),
    (("owner", "compositor", "trust", "sha256"), "bad"),
    (("owner", "compositor", "trust", "sha256"), "f" * 64),
    (("owner", "compositor", "process", "pid"), 2**32),
])
def test_descriptor_rejects_partial_or_malformed(durable, path, value):
    record = scope.owner_handle_to_record(durable[1])
    target = record
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(scope.HyprlandScopeFailure):
        scope.owner_handle_from_record(record)


@pytest.mark.asyncio
async def test_adoption_is_not_reconcile_or_release(durable):
    provider, handle, row, requests = durable
    successor = await provider.reconnect_owner(handle, command_id="adopt-1")
    assert successor == replace(handle, recovery_pid=os.getpid(), recovery_start_ticks="456")
    assert [r["op"] for r in requests] == ["status", "owner_reconnect"]
    assert row["unknown_release"] and not row["release_ack"]
    assert requests[-1]["recovery_capability"] == handle.recovery_capability


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [TimeoutError, ConnectionResetError, asyncio.CancelledError])
async def test_lost_adoption_ack_only_queries_same_token(durable, failure):
    provider, handle, _, requests = durable
    original = provider._request

    async def lose(value):
        row = await original(value)
        if value["op"] == "owner_reconnect":
            raise failure()
        return row

    provider._request = lose
    with pytest.raises(failure):
        await provider.reconnect_owner(handle, command_id="adopt-1")
    provider._request = original
    await provider.reconnect_owner(handle, command_id="adopt-1", query_only=True)
    assert [r["op"] for r in requests] == [
        "status", "owner_reconnect", "status", "owner_reconnect_status"]


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [
    ("owner_reconnect_version", True), ("owner_reconnect_version", 2),
    ("plugin_epoch", "a" * 48), ("previous_recovery_pid", True),
    ("previous_recovery_start_ticks", "other"), ("adoption_confirmed", False),
    ("recovery_pid", 998), ("guardian_pid", 998), ("command_id", "wrong"),
    ("receiver_release_verified", True),
    ("retirement_evidence_kind", "exact-client-resources-destroyed"),
    ("retirement_evidence_version", True),
    ("guardian_input_fenced", False),
])
async def test_adoption_refuses_forged_or_changed_evidence(durable, field, value):
    provider, handle, row, _ = durable
    row[field] = value
    with pytest.raises(scope.HyprlandScopeFailure):
        await provider.reconnect_owner(handle, command_id="adopt-1")


@pytest.mark.asyncio
async def test_death_retirement_capability_explicitly_unavailable(durable):
    provider, handle, _, requests = durable
    assert (await provider.recovery_capabilities())["runtime_qualified"] is False
    with pytest.raises(scope.HyprlandScopeFailure, match="cross_compositor_retirement_unavailable"):
        await provider.prove_resource_absence(handle, command_id="retire-1")
    assert all(r["op"] == "status" for r in requests)


@pytest.mark.asyncio
@pytest.mark.parametrize("capability,version", [
    ("4" * 48, None), ("", 1), ("4" * 48, True), ("4" * 48, 2),
])
async def test_capture_cannot_export_unnegotiated_capability(durable, capability, version):
    provider, _, row, _ = durable
    row.update(recovery_capability=capability, owner_reconnect_version=version)
    with pytest.raises(scope.HyprlandScopeFailure, match="reconnect_unavailable"):
        await provider.capture_owner({"pid": 999, "uid": os.geteuid(), "start_ticks": 456})


@pytest.mark.asyncio
async def test_forged_cross_compositor_support_is_not_a_protocol(durable):
    provider, handle, row, _ = durable
    row["cross_compositor_retirement_supported"] = True
    with pytest.raises(scope.HyprlandScopeFailure, match="retirement_protocol_unavailable"):
        await provider.prove_resource_absence(handle, command_id="retire-1")
