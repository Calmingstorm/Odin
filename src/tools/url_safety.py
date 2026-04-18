"""Shared URL safety validation — blocks SSRF attempts.

Rejects URLs targeting localhost, private IP ranges, cloud metadata
endpoints, and link-local addresses. Validates both literal hostnames
and DNS-resolved IPs to prevent rebinding attacks.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from ..odin_log import get_logger

log = get_logger("url_safety")

ALLOWED_SCHEMES = ("http://", "https://")


def _is_ip_blocked(addr_str: str) -> bool:
    """Check if an IP address string is private/loopback/link-local/metadata."""
    try:
        addr = ipaddress.ip_address(addr_str)
    except ValueError:
        return False
    if addr.is_private or addr.is_loopback or addr.is_link_local:
        return True
    if addr_str in ("169.254.169.254", "fd00::"):
        return True
    return False


def is_url_blocked(url: str, allowed_urls: list[str] | None = None, resolve_dns: bool = True) -> bool:
    """Return True if a URL targets localhost, private IPs, or metadata endpoints.

    When resolve_dns is True (default), also resolves the hostname and
    checks resolved IPs — prevents DNS rebinding attacks where a public
    domain resolves to a private IP.
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
    except Exception:
        return True

    if not host:
        return True

    if allowed_urls:
        url_base = f"{parsed.scheme}://{host}:{parsed.port}" if parsed.port else f"{parsed.scheme}://{host}"
        if any(url_base.rstrip("/") == a or url.startswith(a) for a in allowed_urls):
            return False

    if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return True

    if host in ("169.254.169.254", "metadata.google.internal"):
        return True

    if _is_ip_blocked(host):
        return True

    if resolve_dns:
        try:
            resolved = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            for _family, _type, _proto, _canonname, sockaddr in resolved:
                ip = sockaddr[0]
                if _is_ip_blocked(ip):
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
        raise ValueError(f"URL must start with http:// or https://")
    if is_url_blocked(url, allowed_urls=allowed_urls):
        raise ValueError("URL targets a blocked address (localhost, private IP, or metadata endpoint)")
