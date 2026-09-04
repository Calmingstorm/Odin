"""Hermetic contracts for the live managed-hosts control plane."""

from __future__ import annotations

import asyncio
import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolHost
from src.tools.hosts import HostEnrollmentManager, HostRegistry, HostTrustError
from src.tools.process_manager import ProcessRegistry


def _key(seed: bytes = b"host-key") -> str:
    return "ssh-ed25519 " + base64.b64encode(seed).decode("ascii")


async def test_enrollment_scan_uses_validated_argv(monkeypatch, tmp_path):
    calls = []

    async def fake(argv, timeout, **_kwargs):
        calls.append((argv, timeout))
        return 0, f"example.invalid {_key()}\n".encode()

    monkeypatch.setattr("src.tools.hosts.control._run_argv", fake)
    registry = HostRegistry({}, trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)
    fingerprint = __import__(
        "src.tools.hosts.trust", fromlist=["fingerprint_public_key"]
    ).fingerprint_public_key(_key())
    candidate = await manager.prepare(
        "build",
        {
            "address": "example.invalid",
            "ssh_user": "deploy",
            "os": "linux",
            "trust_mode": "pinned",
            "expected_fingerprints": [fingerprint],
        },
        allow_tofu=False,
    )
    assert candidate.fingerprints == (fingerprint,)
    assert calls[0][0] == ["ssh-keyscan", "-T", "8", "-p", "22", "example.invalid"]


async def test_tofu_requires_preview_then_exact_confirmation(monkeypatch, tmp_path):
    key = _key()
    fingerprint = __import__(
        "src.tools.hosts.trust", fromlist=["fingerprint_public_key"]
    ).fingerprint_public_key(key)
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    monkeypatch.setattr(manager, "scan", AsyncMock(return_value=(key,)))
    details = {
        "address": "example.invalid",
        "ssh_user": "deploy",
        "os": "linux",
        "trust_mode": "tofu",
    }
    preview = await manager.prepare("build", details, allow_tofu=True)
    assert preview.fingerprints == (fingerprint,)
    assert preview.tofu_confirmed is False
    with pytest.raises(HostTrustError):
        manager.consume(preview.token)
    confirmed = await manager.prepare(
        "build",
        {
            **details,
            "confirm_tofu": True,
            "candidate_fingerprints": [fingerprint],
        },
        allow_tofu=True,
    )
    assert confirmed.tofu_confirmed is True


def test_candidate_trust_material_does_not_replace_active_file(tmp_path):
    old = ToolHost(
        address="example.invalid",
        host_id="06eebf65-8f6e-4c36-9acc-ce393fb34642",
        trust_mode="pinned",
        host_keys=[_key(b"old")],
    )
    registry = HostRegistry({"build": old}, trust_dir=tmp_path)
    active = registry.get("build")
    assert active is not None
    old_bytes = open(active.known_hosts_path, "rb").read()
    candidate_path = registry.materialize_trust(
        old.host_id, f"odin-{old.host_id}", "pinned", (_key(b"new"),)
    )
    assert candidate_path != active.known_hosts_path
    assert open(active.known_hosts_path, "rb").read() == old_bytes


class _Lease:
    def __init__(self):
        self.target = SimpleNamespace(alias="remote")
        self.released = False

    async def run(self, factory):
        return await factory()

    def release(self):
        self.released = True


async def test_remote_start_transport_loss_is_unknown():
    async def lost(_target, _command, _timeout):
        raise ConnectionError("lost")

    lease = _Lease()
    registry = ProcessRegistry(remote_exec=lost)
    result = await registry.start_remote(lease, "sleep 1")
    assert "outcome_unknown=true" in result
    assert lease.released is True


async def test_remote_handle_namespace_and_identity_reply():
    async def remote(_target, command, _timeout):
        token = command.split(' "$d" ', 1)[1].split()[0]
        return 0, json.dumps(
            {"token": token, "pid": 101, "pgid": 101, "sid": 99, "start_id": "77"}
        )

    lease = _Lease()
    registry = ProcessRegistry(remote_exec=remote)
    result = await registry.start_remote(lease, "sleep 1")
    assert "PID -1" in result
    info = registry._processes[-1]
    assert (info.remote_pid, info.remote_pgid, info.remote_sid, info.remote_start_id) == (
        101,
        101,
        99,
        "77",
    )
    lifetime = asyncio.all_tasks()
    for task in lifetime:
        if task.get_name() == "remote_process_lifetime:-1":
            task.cancel()
