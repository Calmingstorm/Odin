"""Validation and public host-key primitives for host enrollment."""

from __future__ import annotations

import base64
import binascii
import hashlib
import struct
from dataclasses import dataclass
from typing import Any


class HostTrustError(ValueError):
    pass


_KEY_TYPES = frozenset(
    {
        "ssh-ed25519",
        "ssh-rsa",
        "ecdsa-sha2-nistp256",
        "ecdsa-sha2-nistp384",
        "ecdsa-sha2-nistp521",
        "sk-ssh-ed25519@openssh.com",
        "sk-ecdsa-sha2-nistp256@openssh.com",
    }
)


def normalize_public_key(value: str) -> str:
    """Return ``type base64`` for an OpenSSH public key or keyscan line."""
    if not isinstance(value, str):
        raise HostTrustError("host key must be a string")
    # ssh-keygen emits a trailing newline. As with _clean_line, tolerate
    # surrounding whitespace but never embedded control characters.
    text = value.strip()
    if any(ord(c) < 32 or ord(c) == 127 for c in text):
        raise HostTrustError("host key contains control characters")
    parts = text.split()
    key_index = next((i for i, part in enumerate(parts) if part in _KEY_TYPES), -1)
    if key_index < 0 or key_index + 1 >= len(parts):
        raise HostTrustError("unsupported or malformed OpenSSH public key")
    key_type, encoded = parts[key_index], parts[key_index + 1]
    try:
        raw = base64.b64decode(encoded.encode("ascii"), validate=True)
    except (UnicodeEncodeError, binascii.Error):
        raise HostTrustError("host key is not valid base64") from None
    if not raw or len(raw) > 16_384:
        raise HostTrustError("host key payload is empty or too large")
    return f"{key_type} {encoded}"


def fingerprint_public_key(value: str) -> str:
    normalized = normalize_public_key(value)
    encoded = normalized.split()[1]
    raw = base64.b64decode(encoded.encode("ascii"), validate=True)
    digest = base64.b64encode(hashlib.sha256(raw).digest()).decode("ascii").rstrip("=")
    return f"SHA256:{digest}"


def certificate_authority_key(value: str) -> str:
    """Extract the signing public key from an OpenSSH *host* certificate.

    Discovery is not trust: prepare still requires the operator's CA fingerprint
    and test still verifies the certificate through StrictHostKeyChecking.
    """
    parts = value.split()
    index = next((i for i, part in enumerate(parts) if "-cert-v01@openssh.com" in part), -1)
    try:
        if index < 0:
            raise ValueError("not a certificate")
        raw = base64.b64decode(parts[index + 1], validate=True)
        if len(raw) > 65536:
            raise ValueError("certificate too large")
        offset = 0

        def take(size: int) -> bytes:
            nonlocal offset
            if size < 0 or offset + size > len(raw):
                raise ValueError("truncated certificate")
            data = raw[offset:offset + size]
            offset += size
            return data

        def string() -> bytes:
            return take(struct.unpack(">I", take(4))[0])

        kind = string().decode("ascii")
        if kind != parts[index]:
            raise ValueError("certificate type mismatch")
        string()  # nonce
        if kind.startswith("ssh-ed25519-cert-"):
            count = 1
        elif kind.startswith("ssh-rsa-cert-"):
            count = 2
        elif kind.startswith("ecdsa-sha2-"):
            count = 2
        elif kind.startswith("sk-ssh-ed25519-cert-"):
            count = 2
        elif kind.startswith("sk-ecdsa-sha2-"):
            count = 3
        else:
            raise ValueError("unsupported certificate")
        for _ in range(count):
            string()
        take(8)  # serial
        if struct.unpack(">I", take(4))[0] != 2:
            raise ValueError("not a host certificate")
        string()  # key id
        string()  # principals
        take(16)  # validity
        string()  # critical options
        string()  # extensions
        string()  # reserved
        authority = string()
        string()  # signature, checked by SSH during the connection test
        if offset != len(raw):
            raise ValueError("trailing certificate data")
        size = struct.unpack(">I", authority[:4])[0]
        authority_type = authority[4:4 + size].decode("ascii")
        return normalize_public_key(
            authority_type + " " + base64.b64encode(authority).decode("ascii")
        )
    except (ValueError, IndexError, struct.error, UnicodeError) as exc:
        raise HostTrustError("unsupported or malformed OpenSSH host certificate") from exc


@dataclass(frozen=True, slots=True)
class HostCandidate:
    token: str
    alias: str
    host_id: str
    address: str
    ssh_user: str
    os: str
    port: int
    description: str
    enabled: bool
    trust_mode: str
    host_keys: tuple[str, ...]
    fingerprints: tuple[str, ...]
    local_confirmed: bool
    tofu_confirmed: bool
    created_monotonic: float
    expected_definition: tuple[Any, ...] | None = None
    tested: bool = False
    test_result: dict[str, Any] | None = None

    def as_tool_host(self) -> Any:
        from ...config.schema import ToolHost

        return ToolHost(
            address=self.address,
            ssh_user=self.ssh_user,
            os=self.os,
            port=self.port,
            description=self.description,
            enabled=self.enabled,
            host_id=self.host_id,
            trust_mode=self.trust_mode,
            host_keys=list(self.host_keys),
        )
