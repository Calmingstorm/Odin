"""Shared URL safety validation — blocks SSRF attempts.

Rejects URLs targeting localhost, private IP ranges, cloud metadata
endpoints, and link-local addresses. Validates both literal hostnames
and DNS-resolved IPs to prevent rebinding attacks.
"""

from __future__ import annotations

import ipaddress
import posixpath
import socket
from urllib.parse import unquote, urlparse

from ..odin_log import get_logger

log = get_logger("url_safety")

ALLOWED_SCHEMES = ("http://", "https://")


def _is_ip_blocked(addr_str: str) -> bool:
    """True for any address SSRF must never reach.

    Blocks every NON-GLOBAL address — private, loopback, link-local, the
    CGNAT / Tailscale ``100.64.0.0/10`` overlay range, reserved, multicast,
    unspecified — not just the RFC1918 subset. Allowlisted origins are
    permitted separately, BEFORE this check, by ``is_url_blocked``.
    """
    try:
        addr = ipaddress.ip_address(addr_str)
    except ValueError:
        return False
    if not addr.is_global:
        return True
    # Belt-and-suspenders for metadata endpoints (already non-global, but pin
    # them explicitly in case a stdlib version classifies one as global).
    if addr_str in ("169.254.169.254", "fd00::"):
        return True
    return False


_METADATA_HOSTS = frozenset({"169.254.169.254", "metadata.google.internal"})
_METADATA_IPS = frozenset({"169.254.169.254", "fd00:ec2::254"})


def is_metadata_url(url: str, resolve_dns: bool = True) -> bool:
    """Return True if a URL targets a cloud-metadata endpoint.

    Narrower than is_url_blocked: it does NOT block general private/loopback
    addresses, so tools that legitimately probe internal infrastructure
    (http_probe) still work, while the one target that is never legitimate —
    the cloud-metadata service that hands out instance credentials — is blocked
    even via DNS rebinding.
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
    except Exception:
        return True
    if not host:
        return False
    if host in _METADATA_HOSTS or host in _METADATA_IPS:
        return True
    if resolve_dns:
        try:
            resolved = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            for _f, _t, _p, _c, sockaddr in resolved:
                if sockaddr[0] in _METADATA_IPS:
                    log.warning("Metadata SSRF blocked: %s resolves to %s", host, sockaddr[0])
                    return True
        except (socket.gaierror, OSError):
            return False
    return False


def _matches_allowlist(parsed, allowed_urls: list[str]) -> bool:
    """Check if a parsed URL matches any allowlist entry by scheme, host, and port."""
    if parsed.username is not None:
        return False
    for entry in allowed_urls:
        try:
            allowed = urlparse(entry)
        except Exception:
            continue
        if parsed.scheme != allowed.scheme:
            continue
        if (parsed.hostname or "") != (allowed.hostname or ""):
            continue
        req_port = parsed.port or (443 if parsed.scheme == "https" else 80)
        allow_port = allowed.port or (443 if allowed.scheme == "https" else 80)
        if req_port != allow_port:
            continue
        allow_path = allowed.path
        if allow_path and allow_path != "/":
            # Normalize percent-encoding + collapse traversal, then require a
            # SEGMENT-BOUNDARY match: "/allowed-evil" must not match "/allowed",
            # and "/allowed/%2e%2e/admin" must not escape the allowed prefix.
            req_norm = posixpath.normpath(unquote(parsed.path or "/"))
            allow_norm = posixpath.normpath(unquote(allow_path)).rstrip("/")
            if req_norm != allow_norm and not req_norm.startswith(allow_norm + "/"):
                continue
        return True
    return False


def is_url_blocked(
    url: str, allowed_urls: list[str] | None = None, resolve_dns: bool = True
) -> bool:
    """Return True if a URL targets localhost, private IPs, or metadata endpoints.

    When resolve_dns is True (default), also resolves the hostname and
    checks resolved IPs — prevents DNS rebinding attacks where a public
    domain resolves to a private IP.

    Cloud metadata endpoints are ALWAYS blocked, even if listed in
    allowed_urls.
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
    except Exception:
        return True

    if not host:
        return True

    if host in _METADATA_HOSTS:
        return True

    if allowed_urls and _matches_allowlist(parsed, allowed_urls):
        return False

    if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return True

    if _is_ip_blocked(host):
        return True

    if resolve_dns:
        try:
            resolved = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            for _family, _type, _proto, _canonname, sockaddr in resolved:
                ip = sockaddr[0]
                # AF_UNSPEC+SOCK_STREAM resolution yields only AF_INET/6
                # sockaddrs, whose first element is always str.
                if _is_ip_blocked(ip):  # type: ignore[arg-type]
                    log.warning("DNS rebinding blocked: %s resolves to private IP %s", host, ip)
                    return True
        except socket.gaierror:
            pass

    return False


def validate_url_safe(url: str, allowed_urls: list[str] | None = None) -> None:
    """Validate URL scheme and block SSRF. Raises ValueError on failure."""
    if not url or not url.strip():
        raise ValueError("URL is required")
    url = url.strip()
    if not any(url.lower().startswith(s) for s in ALLOWED_SCHEMES):
        raise ValueError("URL must start with http:// or https://")
    if is_url_blocked(url, allowed_urls=allowed_urls):
        raise ValueError(
            "URL targets a blocked address (localhost, private IP, or metadata endpoint)"
        )
