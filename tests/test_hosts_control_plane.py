"""Hermetic contracts for the live managed-hosts control plane."""

from __future__ import annotations

import asyncio
import base64
import json
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolHost
from src.tools.hosts import (
    HostEnrollmentManager,
    HostForceRevokedError,
    HostRegistry,
    HostTrustError,
    deterministic_host_id,
)
from src.tools.hosts import control
from src.tools.hosts.control import (
    authorized_keys_command,
    public_key_info,
    scan_host_references,
    validate_host_details,
)
from src.tools.process_manager import ProcessRegistry


def _key(seed: bytes = b"host-key") -> str:
    return "ssh-ed25519 " + base64.b64encode(seed).decode("ascii")


def _host(**overrides) -> ToolHost:
    values = {
        "address": "example.invalid",
        "ssh_user": "deploy",
        "os": "linux",
        "host_id": "06eebf65-8f6e-4c36-9acc-ce393fb34642",
        "trust_mode": "pinned",
        "host_keys": [_key()],
    }
    values.update(overrides)
    return ToolHost(**values)


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


def test_validate_host_details_accepts_clean_values_and_rejects_unsafe_input(monkeypatch):
    monkeypatch.setattr(control, "scrub_output_secrets", lambda value: value)
    details = validate_host_details(
        " build-1 ",
        {
            "address": " 192.0.2.9 ",
            "ssh_user": " deploy ",
            "os": "MACOS",
            "port": 2222,
            "description": "token=not-a-real-secret",
            "enabled": 0,
            "trust_mode": "CA",
        },
    )
    assert details["alias"] == "build-1"
    assert details["address"] == "192.0.2.9"
    assert details["ssh_user"] == "deploy"
    assert details["os"] == "macos"
    assert details["port"] == 2222
    assert details["enabled"] is False
    assert details["trust_mode"] == "ca"

    for alias, body in (
        ("-bad", {}),
        ("build", {"address": "host name"}),
        ("build", {"address": "example.invalid", "ssh_user": "-root"}),
        ("build", {"address": "example.invalid", "os": "windows"}),
        ("build", {"address": "example.invalid", "port": True}),
        ("build", {"address": "example.invalid", "trust_mode": "none"}),
    ):
        with pytest.raises(HostTrustError):
            validate_host_details(alias, body)


async def test_prepare_rejects_pinned_mismatch_and_legacy_edits(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    key = _key(b"scanned")
    monkeypatch.setattr(manager, "scan", AsyncMock(return_value=(key,)))
    with pytest.raises(HostTrustError, match="does not match"):
        await manager.prepare(
            "build",
            {
                "address": "example.invalid",
                "trust_mode": "pinned",
                "expected_fingerprints": [
                    __import__(
                        "src.tools.hosts.trust", fromlist=["fingerprint_public_key"]
                    ).fingerprint_public_key(_key(b"other"))
                ],
            },
            allow_tofu=False,
        )

    legacy = _host(trust_mode="legacy", host_keys=[])
    with pytest.raises(HostTrustError, match="require pinned enrollment"):
        await manager.prepare(
            "build",
            {"address": "other.invalid", "trust_mode": "legacy"},
            allow_tofu=False,
            existing=legacy,
        )
    with pytest.raises(HostTrustError, match="only to existing"):
        await manager.prepare(
            "fresh", {"address": "example.invalid", "trust_mode": "legacy"}, allow_tofu=False
        )


async def test_prepare_local_and_tofu_policy_paths(monkeypatch, tmp_path):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    with pytest.raises(HostTrustError, match="confirm_local"):
        await manager.prepare("local", {"address": "127.0.0.1"}, allow_tofu=False)
    local = await manager.prepare(
        "local", {"address": "127.0.0.1", "confirm_local": True}, allow_tofu=False
    )
    assert (local.trust_mode, local.host_keys, local.local_confirmed) == (
        "legacy",
        (),
        True,
    )

    monkeypatch.setattr(manager, "scan", AsyncMock(return_value=(_key(),)))
    with pytest.raises(HostTrustError, match="TOFU is disabled"):
        await manager.prepare(
            "build", {"address": "example.invalid", "trust_mode": "tofu"}, allow_tofu=False
        )
    with pytest.raises(HostTrustError, match="exact candidate_fingerprints"):
        await manager.prepare(
            "build",
            {
                "address": "example.invalid",
                "trust_mode": "tofu",
                "confirm_tofu": True,
                "candidate_fingerprints": ["SHA256:not-the-observed-fingerprint"],
            },
            allow_tofu=True,
        )


async def test_scan_import_test_consume_and_expiry_are_hermetic(monkeypatch, tmp_path):
    key = _key(b"enrolled")
    fingerprint = __import__(
        "src.tools.hosts.trust", fromlist=["fingerprint_public_key"]
    ).fingerprint_public_key(key)
    calls = []

    async def fake(argv, timeout, **_kwargs):
        calls.append((argv, timeout))
        if argv[0] == "ssh-keyscan":
            return 0, f"# comment\nexample.invalid {key}\nbad key\nexample.invalid {key}\n".encode()
        if argv[0] == "ssh-keygen":
            return 0, f"# found\nexample.invalid {key}\n".encode()
        if argv[0] == "ssh":
            return 0, b"odin-host-test linux\n"
        raise AssertionError(argv)

    monkeypatch.setattr(control, "_run_argv", fake)
    registry = HostRegistry({}, key_path="/tmp/private", legacy_known_hosts_path="/tmp/legacy", trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)
    assert await manager.scan("example.invalid", 2222) == (key,)
    candidate = await manager.prepare(
        "build",
        {
            "address": "example.invalid",
            "port": 2222,
            "trust_mode": "pinned",
            "expected_fingerprints": [fingerprint],
        },
        allow_tofu=False,
    )
    tested = await manager.test(candidate.token)
    assert tested.tested and tested.test_result and tested.test_result["ok"]
    assert manager.consume(candidate.token).as_tool_host().host_keys == [key]
    with pytest.raises(HostTrustError, match="unknown or expired"):
        manager.get(candidate.token)

    legacy = _host(port=2222, trust_mode="legacy", host_keys=[])
    imported = await manager.import_legacy("build", legacy)
    assert imported.trust_mode == "pinned"
    assert calls[-1][0] == ["ssh-keygen", "-F", "[example.invalid]:2222", "-f", "/tmp/legacy"]
    manager._candidates[imported.token] = replace(imported, created_monotonic=0)
    monkeypatch.setattr(control.time, "monotonic", lambda: 1_000_000)
    with pytest.raises(HostTrustError, match="expired"):
        manager.get(imported.token)


async def test_enrollment_failure_diagnostics_and_local_test(monkeypatch, tmp_path):
    registry = HostRegistry({}, trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)

    async def scan_failure(*_args, **_kwargs):
        return 1, b"failure token=definitely-not-real"

    monkeypatch.setattr(control, "_run_argv", scan_failure)
    with pytest.raises(HostTrustError, match="host-key scan failed"):
        await manager.scan("example.invalid", 22)

    local = await manager.prepare(
        "local", {"address": "localhost", "confirm_local": True}, allow_tofu=False
    )

    async def local_test(argv, _timeout, **_kwargs):
        assert argv[:2] == ["sh", "-c"]
        return 0, b"odin-host-test linux\n"

    monkeypatch.setattr(control, "_run_argv", local_test)
    assert (await manager.test(local.token)).tested is True


async def test_public_key_info_and_authorized_key_command_are_hermetic(monkeypatch, tmp_path):
    private = tmp_path / "id_ed25519"
    private.write_text("placeholder")
    key = _key(b"public")

    async def fake(argv, _timeout, **_kwargs):
        assert argv == ["ssh-keygen", "-y", "-f", str(private)]
        return 0, (key + " comment").encode()

    monkeypatch.setattr(control, "_run_argv", fake)
    info = await public_key_info(str(private))
    assert info["public_key"] == key
    assert "authorized_keys" in info["authorized_keys_command"]
    assert "grep -qxF" in authorized_keys_command(key)
    with pytest.raises(HostTrustError, match="does not exist"):
        await public_key_info(str(tmp_path / "missing"))


def test_scan_host_references_finds_control_plane_dependencies():
    policy = SimpleNamespace(allowed_hosts=["build"], default_host="build")
    access = SimpleNamespace(
        default_policy=policy,
        list_users=lambda: {"7": {"allowed_hosts": ["build"], "default_host": "build"}},
    )
    token_manager = SimpleNamespace(
        list_tokens=lambda: [{"user_id": "api", "allowed_hosts": ["build"], "default_host": "build"}]
    )
    config = SimpleNamespace(
        web=SimpleNamespace(api_tokens=[SimpleNamespace(allowed_hosts=["build"], default_host="build")]),
        tools=SimpleNamespace(
            governor=SimpleNamespace(host_overrides={"build": {}}), default_host="build"
        ),
    )
    scheduler = SimpleNamespace(list_all=lambda: [{"host": "build", "nested": {"hosts": ["build"]}}])
    channel_state = SimpleNamespace(
        background_tasks={
            "run": SimpleNamespace(status="running", steps=[{"default_host": "build"}]),
            "done": SimpleNamespace(status="done", steps=[{"host": "build"}]),
        }
    )
    bot = SimpleNamespace(
        host_access_manager=access,
        api_token_manager=token_manager,
        config=config,
        scheduler=scheduler,
        channel_state=channel_state,
    )
    refs = scan_host_references(bot, "build")
    locations = {row["location"] for row in refs}
    assert {
        "default_policy.allowed_hosts",
        "users.7.default_host",
        "dynamic.api.allowed_hosts",
        "web.api_tokens.0.default_host",
        "tools.governor.host_overrides.build",
        "tools.default_host",
        "schedules.0.host",
        "schedules.0.nested.hosts",
        "background_tasks.run.steps.0.default_host",
    } <= locations


def test_registry_target_materialization_and_status(tmp_path):
    registry = HostRegistry(
        {
            "build": _host(description="builder"),
            "local": _host(address="127.0.0.1", trust_mode="pinned", host_keys=[]),
            "invalid": _host(host_id="a3eebf65-8f6e-4c36-9acc-ce393fb34642", host_keys=[]),
            "disabled": _host(host_id="b3eebf65-8f6e-4c36-9acc-ce393fb34642", enabled=False),
        },
        key_path="/tmp/key",
        legacy_known_hosts_path="/tmp/legacy",
        default_host="build",
        trust_dir=tmp_path,
    )
    build = registry.get("build", targetable_only=True)
    assert build is not None
    assert build.key_path == "/tmp/key" and build.trust_state == "pinned"
    assert build.legacy_tuple() == ("example.invalid", "deploy", "linux")
    assert registry.default_host == "build"
    assert registry.configured_aliases() == ("build", "local", "invalid", "disabled")
    assert registry.active_aliases() == ("build", "local")
    assert registry.get("invalid", targetable_only=True) is None
    assert registry.get("local").local is True
    assert registry.get("local").trust_state == "local"
    assert registry.get("disabled", targetable_only=True) is None
    rows = {row["alias"]: row for row in registry.status_rows()}
    assert rows["invalid"]["trust_state"] == "invalid"
    assert rows["disabled"]["active"] is False
    ca_path = registry.materialize_trust(build.host_id, "ca-host", "ca", [_key(b"ca")])
    assert open(ca_path, encoding="utf-8").read().startswith("@cert-authority ca-host ")
    assert deterministic_host_id("legacy") == deterministic_host_id("legacy")


async def test_registry_leases_revoke_release_and_retirement(tmp_path):
    retired = []
    registry = HostRegistry({"build": _host()}, trust_dir=tmp_path, default_host="build")
    registry.set_retire_callback(lambda target: retired.append(target.runtime_key))
    old = registry.acquire("build")
    assert old is not None and registry.has_active_leases("build")
    assert await old.run(lambda: asyncio.sleep(0, result="done")) == "done"
    borrowed = old.borrow()
    assert borrowed.target is old.target
    borrowed.release()

    unchanged = registry.stage({"build": _host()})
    assert unchanged.snapshot["build"] is old.target
    changed = registry.stage({"build": _host(description="new")})
    registry.publish_staged(changed)
    assert registry.draining_aliases() == ("build",)
    current = registry.acquire("build")
    assert current is not None
    assert registry.force_revoke("build") == 2
    assert set(registry.force_revoke_keys("build")) == {
        old.target.runtime_key,
        current.target.runtime_key,
    }
    with pytest.raises(HostForceRevokedError):
        await old.run(lambda: asyncio.sleep(0))
    assert registry.acquire("build") is None
    old.release()
    old.release()
    current.release()
    assert not registry.has_active_leases("build")
    assert retired == [old.target.runtime_key]


async def test_registry_run_cancels_inflight_work_and_stage_cas_and_mismatch(tmp_path):
    registry = HostRegistry({"build": _host()}, trust_dir=tmp_path)
    lease = registry.acquire("build")
    assert lease is not None
    started = asyncio.Event()

    async def blocked():
        started.set()
        await asyncio.Event().wait()

    running = asyncio.create_task(lease.run(blocked))
    await started.wait()
    assert registry.force_revoke_keys("build") == (lease.target.runtime_key,)
    with pytest.raises(HostForceRevokedError):
        await running
    lease.release()

    first = registry.stage({"build": _host(description="one")})
    second = registry.stage({"build": _host(description="two")})
    registry.publish_staged(first)
    with pytest.raises(RuntimeError, match="changed while publication was staged"):
        registry.publish_staged(second)
    before = registry.generation
    assert registry.mark_test_result("absent", {"ok": False}) == before
    updated = registry.mark_test_result("build", {"ok": False}, host_key_mismatch=True)
    target = registry.get("build")
    assert updated == before + 1
    assert target is not None and target.trust_state == "mismatch" and not target.targetable
    assert registry.default_host == ""


def test_registry_unmanaged_lease_and_context_release():
    lease = HostRegistry.unmanaged_lease("legacy", ("host", "user", "macos"))
    assert lease.target.host_id == deterministic_host_id("legacy")
    with lease as entered:
        assert entered.target.legacy_tuple() == ("host", "user", "macos")
