"""Offline trust parser and enrollment failures, without network or process IO."""

import asyncio
import base64
import struct
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.tools.hosts import HostEnrollmentManager, HostRegistry, control
from src.tools.hosts.trust import HostTrustError, certificate_authority_key, normalize_public_key
from tests.test_campaign_process_hosts import key


def string(value):
    return struct.pack(">I", len(value)) + value


def certificate(kind, fields, *, wire_kind=None, tail=b""):
    authority = string(b"ssh-ed25519") + string(b"a" * 32)
    raw = (string((wire_kind or kind).encode()) + string(b"nonce")
           + b"".join(string(field) for field in fields)
           + struct.pack(">QI", 1, 2) + string(b"id") + string(b"")
           + struct.pack(">QQ", 0, 123) + string(b"") * 3
           + string(authority) + string(b"signature") + tail)
    return kind + " " + base64.b64encode(raw).decode(), key(authority)


@pytest.mark.parametrize("kind,fields", [
    ("ssh-ed25519-cert-v01@openssh.com", [b"a" * 32]),
    ("ssh-rsa-cert-v01@openssh.com", [b"\x01\x00\x01", b"modulus"]),
    ("ecdsa-sha2-nistp256-cert-v01@openssh.com", [b"nistp256", b"point"]),
    ("sk-ssh-ed25519-cert-v01@openssh.com", [b"a" * 32, b"ssh:fixture"]),
    ("sk-ecdsa-sha2-nistp256-cert-v01@openssh.com", [b"nistp256", b"point", b"ssh:fixture"]),
])
def test_signer_extraction_for_supported_wire_layouts(kind, fields):
    value, authority = certificate(kind, fields)
    assert certificate_authority_key(value) == authority


@pytest.mark.parametrize("value", [
    "ssh-ed25519 !!!", "ssh-ed25519 é", key(b"a" * 16385),
])
def test_invalid_public_key_encoding_or_size_refused(value):
    with pytest.raises(HostTrustError):
        normalize_public_key(value)


@pytest.mark.parametrize("value", [
    "ssh-ed25519-cert-v01@openssh.com " + base64.b64encode(b"a" * 65537).decode(),
    "ssh-ed25519-cert-v01@openssh.com " + base64.b64encode(b"\x00\x00\x00\xffx").decode(),
    certificate("ssh-ed25519-cert-v01@openssh.com", [b"leaf"], wire_kind="wrong")[0],
    certificate("unknown-cert-v01@openssh.com", [b"leaf"])[0],
    certificate("ssh-ed25519-cert-v01@openssh.com", [b"leaf"], tail=b"trailing")[0],
])
def test_malformed_certificate_never_yields_trust(value):
    with pytest.raises(HostTrustError, match="malformed"):
        certificate_authority_key(value)


@pytest.mark.parametrize("alias,body", [
    (None, {"address": "example.invalid"}),
    ("", {"address": "example.invalid"}),
    ("a" * 65, {"address": "example.invalid"}),
    ("remote", {"address": "example.invalid", "description": "one\ntwo"}),
    ("remote", {"address": "bad..name"}),
])
def test_invalid_host_fields_are_rejected(alias, body):
    with pytest.raises(HostTrustError):
        control.validate_host_details(alias, body)


@pytest.mark.parametrize("failure", [TimeoutError, asyncio.CancelledError])
async def test_subprocess_interruption_settles_owned_child(monkeypatch, failure):
    proc = SimpleNamespace(returncode=None, communicate=AsyncMock(side_effect=failure),
                           kill=Mock(), wait=AsyncMock())
    spawn = AsyncMock(return_value=proc)
    monkeypatch.setattr(control.asyncio, "create_subprocess_exec", spawn)
    with pytest.raises(failure):
        await control._run_argv(["ssh-keyscan", "example.invalid"], 1)
    proc.kill.assert_called_once_with()
    proc.wait.assert_awaited_once_with()


@pytest.mark.parametrize("expected,match", [(None, "required"), (["bad"], "SHA256")])
async def test_pinned_enrollment_requires_well_formed_expected_fingerprint(
    tmp_path, monkeypatch, expected, match,
):
    manager = HostEnrollmentManager(HostRegistry({}, trust_dir=tmp_path))
    monkeypatch.setattr(manager, "scan", AsyncMock(return_value=(key(),)))
    with pytest.raises(HostTrustError, match=match):
        await manager.prepare("remote", {"address": "example.invalid",
                                        "expected_fingerprints": expected}, allow_tofu=False)
    assert manager._candidates == {}
