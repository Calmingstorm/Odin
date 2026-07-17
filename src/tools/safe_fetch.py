"""Hardened HTTP transport that closes SSRF holes across redirects.

The plain ``aiohttp`` pattern used across the tool layer — validate the URL
once, then ``session.get(url, allow_redirects=True)`` — only checks the
*first* address and then follows 3xx hops to anywhere. A malicious server can
answer ``302 Location: http://169.254.169.254/…`` (cloud metadata) or an
RFC1918 service and the body is handed back to the model / stored as
knowledge.

``safe_fetch`` closes that:

* every hop's URL is validated (scheme, userinfo, metadata, block list) BEFORE
  the request is made;
* a custom resolver validates the resolved IPs at aiohttp connect time, so the
  socket targets exactly the address that was validated — there is no separate
  re-resolution window (the DNS-rebinding TOCTOU);
* redirects are followed MANUALLY with a hop cap; ``Authorization`` /
  ``Cookie`` / ``Proxy-Authorization`` are stripped when the origin changes;
* the body is streamed under a hard byte cap (``Content-Length`` is checked up
  front when present);
* TLS certificates are verified (no ``ssl=False``).

Callers that need to reach an intentional internal integration pass
``allowed_urls``; a matching host may resolve to a private address, but a
cloud-metadata address is rejected unconditionally.
"""
from __future__ import annotations

import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import aiohttp
from aiohttp.abc import AbstractResolver
from aiohttp.resolver import DefaultResolver

from ..odin_log import get_logger
from .url_safety import (
    _METADATA_HOSTS,
    _METADATA_IPS,
    _is_ip_blocked,
    is_url_blocked,
)

log = get_logger("safe_fetch")

_CREDENTIAL_HEADERS = ("authorization", "cookie", "proxy-authorization")
_REDIRECT_STATUSES = (301, 302, 303, 307, 308)
DEFAULT_MAX_REDIRECTS = 5
DEFAULT_MAX_BYTES = 10 * 1024 * 1024  # 10 MiB
DEFAULT_TIMEOUT = 30.0
DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; OdinBot/1.0)"


class SafeFetchError(Exception):
    """Base for safe-fetch failures (SSRF block, oversize, transport)."""


class BlockedAddressError(SafeFetchError):
    """A URL or a resolved IP targets a blocked address."""


class ResponseTooLargeError(SafeFetchError):
    """A response body exceeded the caller's byte cap."""


class TooManyRedirectsError(SafeFetchError):
    """The redirect chain exceeded ``max_redirects``."""


def _allowed_host_ports(allowed_urls: list[str] | None) -> frozenset[tuple[str, int]]:
    """Parse ``allowed_urls`` into the ``(hostname, port)`` pairs whose private
    IPs the resolver may permit. Path scoping is enforced at URL-validation
    time by ``is_url_blocked``; this only governs the connect-time IP permit."""
    if not allowed_urls:
        return frozenset()
    pairs: set[tuple[str, int]] = set()
    for entry in allowed_urls:
        try:
            p = urlparse(entry)
        except Exception:
            continue
        host = p.hostname or ""
        if not host:
            continue
        port = p.port or (443 if p.scheme == "https" else 80)
        pairs.add((host, port))
    return frozenset(pairs)


class _ValidatingResolver(AbstractResolver):
    """Wrap the default resolver; reject any host that resolves to a blocked IP.

    aiohttp calls this at connect time, so the socket targets exactly the
    address validated here — there is no independent re-resolution. A host on
    ``allowed_hosts`` may resolve to a private address (an intentional internal
    integration), but a cloud-metadata IP is rejected unconditionally.
    """

    def __init__(self, allowed_hosts: frozenset[tuple[str, int]] | None = None) -> None:
        self._inner = DefaultResolver()
        self._allowed_hosts = allowed_hosts or frozenset()

    async def resolve(
        self, host: str, port: int = 0, family: socket.AddressFamily = socket.AF_INET
    ) -> list:
        results = await self._inner.resolve(host, port, family)
        host_allowed = (host, port) in self._allowed_hosts
        for r in results:
            ip = r["host"]
            if ip in _METADATA_IPS:
                raise BlockedAddressError(f"{host} resolves to a metadata address ({ip})")
            if _is_ip_blocked(ip) and not host_allowed:
                raise BlockedAddressError(f"{host} resolves to a blocked address ({ip})")
        return results

    async def close(self) -> None:
        await self._inner.close()


def _validate_hop_url(url: str, allowed_urls: list[str] | None) -> None:
    """Validate a single hop's URL before it is requested. Raises
    ``BlockedAddressError`` on any unsafe URL."""
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise BlockedAddressError(f"unparseable URL: {exc}") from None
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise BlockedAddressError(f"unsupported scheme {scheme!r} (only http/https)")
    if parsed.username is not None or parsed.password is not None:
        raise BlockedAddressError("URLs with embedded credentials (userinfo) are not allowed")
    host = (parsed.hostname or "").lower()
    if not host:
        raise BlockedAddressError("URL has no host")
    if host in _METADATA_HOSTS:
        raise BlockedAddressError("URL targets a cloud-metadata host")
    if is_url_blocked(url, allowed_urls=allowed_urls):
        raise BlockedAddressError(
            "URL targets a blocked address (localhost, private IP, or metadata endpoint)"
        )


def _same_origin(a: str, b: str) -> bool:
    pa, pb = urlparse(a), urlparse(b)
    return (
        pa.scheme == pb.scheme
        and (pa.hostname or "") == (pb.hostname or "")
        and (pa.port or (443 if pa.scheme == "https" else 80))
        == (pb.port or (443 if pb.scheme == "https" else 80))
    )


def _strip_credential_headers(headers: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in _CREDENTIAL_HEADERS}


@dataclass
class SafeFetchResponse:
    """The result of a completed safe fetch (final hop after redirects)."""

    status: int
    headers: dict[str, str]
    body: bytes
    content_type: str
    url: str
    reason: str = ""

    def text(self, errors: str = "replace") -> str:
        """Decode the body using the response charset, defaulting to UTF-8."""
        charset = "utf-8"
        ct = self.content_type.lower()
        if "charset=" in ct:
            charset = ct.split("charset=", 1)[1].split(";", 1)[0].strip() or "utf-8"
        try:
            return self.body.decode(charset, errors=errors)
        except (LookupError, TypeError):
            return self.body.decode("utf-8", errors=errors)


async def _read_capped(resp: aiohttp.ClientResponse, max_bytes: int) -> bytes:
    """Stream the body, failing closed once ``max_bytes`` is exceeded."""
    cl = resp.headers.get("Content-Length")
    if cl is not None:
        try:
            if int(cl) > max_bytes:
                raise ResponseTooLargeError(
                    f"response Content-Length {cl} exceeds cap {max_bytes}"
                )
        except ValueError:
            pass
    chunks: list[bytes] = []
    total = 0
    async for chunk in resp.content.iter_chunked(65536):
        total += len(chunk)
        if total > max_bytes:
            raise ResponseTooLargeError(f"response body exceeded cap {max_bytes} bytes")
        chunks.append(chunk)
    return b"".join(chunks)


async def safe_fetch(
    url: str,
    *,
    method: str = "GET",
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
    follow_redirects: bool = True,
    allowed_urls: list[str] | None = None,
    headers: dict[str, str] | None = None,
    json_body: object | None = None,
    data: object | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    user_agent: str | None = DEFAULT_USER_AGENT,
) -> SafeFetchResponse:
    """Fetch ``url`` with per-hop SSRF validation and a hard byte cap.

    Redirects are followed manually (``allow_redirects=False``): each hop is
    re-validated, credential headers are dropped across origin changes, and the
    method degrades to GET on 301/302/303 (307/308 preserve method + body).

    Raises ``BlockedAddressError`` (unsafe URL / resolved IP),
    ``ResponseTooLargeError`` (body over ``max_bytes``),
    ``TooManyRedirectsError``, or ``aiohttp.ClientError`` (transport).
    """
    allowed_hosts = _allowed_host_ports(allowed_urls)
    req_headers: dict[str, str] = dict(headers or {})
    if user_agent and not any(k.lower() == "user-agent" for k in req_headers):
        req_headers["User-Agent"] = user_agent

    current_url = url
    current_method = method.upper()
    current_json = json_body
    current_data = data

    resolver = _ValidatingResolver(allowed_hosts)
    connector = aiohttp.TCPConnector(resolver=resolver)
    client_timeout = aiohttp.ClientTimeout(total=timeout)
    # DummyCookieJar: never store Set-Cookie, so a cookie learned on one hop
    # can't be resent after a cross-origin redirect (the credential-header
    # stripping only covers caller-supplied headers, not the jar).
    async with aiohttp.ClientSession(
        connector=connector, timeout=client_timeout, cookie_jar=aiohttp.DummyCookieJar()
    ) as session:
        for _hop in range(max_redirects + 1):
            _validate_hop_url(current_url, allowed_urls)
            async with session.request(
                current_method,
                current_url,
                headers=req_headers,
                json=current_json,
                data=current_data,
                allow_redirects=False,
            ) as resp:
                if resp.status in _REDIRECT_STATUSES and follow_redirects:
                    location = resp.headers.get("Location")
                    if not location:
                        body = await _read_capped(resp, max_bytes)
                        return SafeFetchResponse(
                            resp.status, dict(resp.headers), body,
                            resp.headers.get("Content-Type", ""), current_url,
                        )
                    next_url = urljoin(current_url, location)
                    # 301/302/303 -> GET and drop the body; 307/308 keep both.
                    if resp.status in (301, 302, 303):
                        current_method = "GET"
                        current_json = None
                        current_data = None
                    if not _same_origin(current_url, next_url):
                        req_headers = _strip_credential_headers(req_headers)
                    current_url = next_url
                    continue
                body = await _read_capped(resp, max_bytes)
                return SafeFetchResponse(
                    resp.status, dict(resp.headers), body,
                    resp.headers.get("Content-Type", ""), current_url,
                    resp.reason or "",
                )
    raise TooManyRedirectsError(f"exceeded {max_redirects} redirects fetching {url}")
