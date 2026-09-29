import asyncio
import base64
import struct
from unittest.mock import AsyncMock

import pytest

from src.config.schema import ToolHost
from src.tools.hosts import HostEnrollmentManager, HostRegistry, control
from src.tools.hosts.trust import HostTrustError, certificate_authority_key, fingerprint_public_key


def key(value=b"public"):
    return "ssh-ed25519 " + base64.b64encode(value).decode()


def host(**kwargs):
    return ToolHost(address="example.invalid", **kwargs)


@pytest.mark.parametrize("edit", [{}, {"description": "new"}, {"enabled": False}])
def test_quarantine_survives_inventory_publication(tmp_path, edit):
    configured = host()
    registry = HostRegistry({"remote": configured}, trust_dir=tmp_path)
    registry.mark_test_result("remote", {"ok": False}, host_key_mismatch=True)
    registry.publish({"remote": configured.model_copy(update=edit)})
    assert registry.get("remote").trust_state == "mismatch"
    assert not registry.get("remote").targetable
    registry.mark_test_result("remote", {"ok": True})
    assert registry.get("remote").trust_state == "legacy"
    assert registry.get("remote").targetable == edit.get("enabled", True)


async def test_test_publication_waits_for_management_commit(tmp_path, monkeypatch):
    configured = host()
    registry = HostRegistry({"remote": configured}, trust_dir=tmp_path)
    lock = asyncio.Lock()
    manager = HostEnrollmentManager(registry, publication_lock=lock)
    candidate = await manager.prepare(
        "remote", configured.model_dump(), existing=configured, allow_tofu=False,
    )
    ssh_done = asyncio.Event()

    async def mismatch(*args, **kwargs):
        ssh_done.set()
        return 255, b"REMOTE HOST IDENTIFICATION HAS CHANGED"

    monkeypatch.setattr(control, "_run_argv", mismatch)
    async with lock:
        staged = registry.stage({"remote": configured.model_copy(update={"enabled": False})})
        task = asyncio.create_task(manager.test(candidate.token))
        await ssh_done.wait()
        await asyncio.sleep(0)
        assert not task.done()
        registry.publish_staged(staged)
    await task
    assert not registry.get("remote").enabled
    assert registry.get("remote").trust_state == "mismatch"


def cert(ca, *, certificate_type=2):
    def string(value):
        return struct.pack(">I", len(value)) + value

    kind = b"ssh-ed25519-cert-v01@openssh.com"
    authority = string(b"ssh-ed25519") + string(ca)
    raw = (
        string(kind) + string(b"nonce") + string(b"leaf")
        + struct.pack(">QI", 1, certificate_type) + string(b"id") + string(b"")
        + struct.pack(">QQ", 0, 123) + string(b"") + string(b"") + string(b"")
        + string(authority) + string(b"signature")
    )
    return "example.invalid " + kind.decode() + " " + base64.b64encode(raw).decode(), key(authority)


async def test_ca_enrollment_uses_certificate_signer_not_leaf(tmp_path, monkeypatch):
    certificate, authority = cert(b"actual-ca")
    runner = AsyncMock(return_value=(0, certificate.encode()))
    monkeypatch.setattr(control, "_run_argv", runner)
    registry = HostRegistry({}, trust_dir=tmp_path)
    manager = HostEnrollmentManager(registry)
    candidate = await manager.prepare("remote", {
        "address": "example.invalid", "trust_mode": "ca",
        "expected_fingerprints": [fingerprint_public_key(authority)],
    }, allow_tofu=False)
    assert candidate.host_keys == (authority,)
    assert "-c" in runner.call_args.args[0]
    assert certificate_authority_key(certificate) == authority
    path = registry.materialize_trust(candidate.host_id, "alias", "ca", candidate.host_keys)
    with open(path) as file:
        assert file.read() == f"@cert-authority alias {authority}\n"
    with pytest.raises(HostTrustError, match="malformed"):
        certificate_authority_key(cert(b"user-ca", certificate_type=1)[0])


async def test_ca_does_not_accept_leaf_only_scan(tmp_path, monkeypatch):
    monkeypatch.setattr(control, "_run_argv", AsyncMock(return_value=(0, key().encode())))
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    with pytest.raises(HostTrustError, match="no supported host certificates"):
        await manager.prepare("remote", {
            "address": "example.invalid", "trust_mode": "ca",
            "expected_fingerprints": [fingerprint_public_key(key())],
        }, allow_tofu=False)
