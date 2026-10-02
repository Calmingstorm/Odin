"""Offline URL-authority classification for command policy.

This module deliberately classifies only the authority written in a URL.  It
does not resolve names or make a network request; it is not a general SSRF
validator.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

from .url_safety import _METADATA_HOSTS, _is_metadata_ip

_METADATA_ALIASES = frozenset(
    {
        "metadata.google",
        "metadata.google.internal",
        "metadata.azure.internal",
        "instance-data.ec2.internal",
    }
)
_ADDITIONAL_METADATA_IPS = frozenset({"169.254.170.2"})
_LOCAL_SUFFIXES = (".lan", ".local", ".internal")
_MAX_URL_LENGTH = 8192


def _authority_host(value: str) -> str | None:
    """Extract a normalized URL hostname, rejecting malformed authorities."""
    if not isinstance(value, str) or not value or len(value) > _MAX_URL_LENGTH:
        return None
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        # Force port validation too; urlsplit otherwise tolerates malformed ports.
        _ = parsed.port
    except (ValueError, UnicodeError):
        return None
    if not parsed.scheme or not parsed.netloc or not host:
        return None
    return host.rstrip(".").lower()


def _numeric_address(host: str):
    """Parse standard IP literals and legacy inet_aton IPv4 forms offline."""
    candidate = host
    if "%" in candidate:  # IPv6 zone identifiers do not alter address identity.
        candidate = candidate.split("%", 1)[0]
    try:
        return ipaddress.ip_address(candidate)
    except ValueError:
        pass
    try:
        packed = socket.inet_aton(candidate)
    except (OSError, TypeError):
        return None
    return ipaddress.IPv4Address(packed)


def is_metadata_url(value: str) -> bool:
    """Whether a URL authority is a known cloud metadata endpoint.

    Recognizes metadata host aliases, canonical addresses and legacy numeric
    IPv4 spellings. Other private and link-local authorities are not metadata.
    """
    host = _authority_host(value)
    if host is None:
        return False
    if host in {item.lower() for item in _METADATA_HOSTS} | _METADATA_ALIASES:
        return True
    address = _numeric_address(host)
    if address is None:
        return False
    normalized = str(getattr(address, "ipv4_mapped", None) or address)
    return _is_metadata_ip(normalized) or normalized in _ADDITIONAL_METADATA_IPS


def is_external_url(value: str) -> bool:
    """Whether a URL authority denotes an external, non-local target.

    Publicly classified IPs and multi-label DNS names outside local-use suffixes
    count as external. Private, loopback, link-local, reserved, single-label,
    and conventional local-domain authorities do not. No DNS is performed.
    """
    host = _authority_host(value)
    if host is None:
        return False
    address = _numeric_address(host)
    if address is not None:
        return address.is_global
    if "." not in host or host.endswith(_LOCAL_SUFFIXES):
        return False
    return True
