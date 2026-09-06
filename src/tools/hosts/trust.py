"""Validation and public host-key primitives for host enrollment."""

from __future__ import annotations

import base64
import binascii
import hashlib
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
