"""Shared URL safety validation — blocks SSRF attempts.

Rejects URLs targeting localhost, private IP ranges, cloud metadata
endpoints, and link-local addresses. Used by browser automation,
outbound webhooks, and knowledge import.
"""
from __future__ import annotations

import ipaddress
from urllib.parse import urlparse


ALLOWED_SCHEMES = ("http://", "https://")


def is_url_blocked(url: str, allowed_urls: list[str] | None = None) -> bool:
    """Return True if a URL targets localhost, private IPs, or metadata endpoints."""
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

    try:
        addr = ipaddress.ip_address(host)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            return True
    except ValueError:
        pass

    return False


def validate_url_safe(url: str, allowed_urls: list[str] | None = None) -> None:
    """Validate URL scheme and block SSRF. Raises ValueError on failure."""
    if not url or not url.strip():
        raise ValueError("URL is required")
    url = url.strip()
    if not any(url.lower().startswith(s) for s in ALLOWED_SCHEMES):
        raise ValueError(f"URL must start with http:// or https:// (got: {url[:50]})")
    if is_url_blocked(url, allowed_urls=allowed_urls):
        raise ValueError(f"URL targets a blocked address (localhost, private IP, or metadata endpoint): {url[:80]}")
