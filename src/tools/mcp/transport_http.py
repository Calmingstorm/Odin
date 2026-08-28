"""Streamable HTTP transport, both era shapes.

- Legacy (2025-03-26 … 2025-11-25): sessions are OPTIONAL — when the server
  mints an ``Mcp-Session-Id`` on the InitializeResult we echo it on every
  subsequent request and DELETE it on disconnect; when it doesn't, no session
  semantics apply at all. ``MCP-Protocol-Version`` is sent on every
  post-negotiation request.
- Modern (2026-07-28): stateless; every POST carries ``MCP-Protocol-Version``,
  ``Mcp-Method``, ``Mcp-Name`` where a name exists, and mirrored
  ``Mcp-Param-*`` headers for ``x-mcp-header`` annotations.

Shared mechanics: every message is its own POST with
``Accept: application/json, text/event-stream``; a request's reply is either
one JSON object or an SSE stream scoped to that request (request-related
notifications — and, legacy only, server-initiated requests — may precede
the final response). Messages are dispatched to the caller MID-STREAM so a
legacy server waiting on a reply to its own request cannot deadlock the
stream. Redirects are never followed (a redirecting endpoint is a
configuration error — configured credentials must never travel to another
origin). One reused ClientSession per server, cookie-isolated.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import aiohttp

from ...odin_log import get_logger
from .errors import MCPConnectError, MCPProtocolError
from .protocol import (
    MAX_SSE_EVENT_BYTES,
    WIRE_RESULT_CEILING,
    parse_wire_payload,
)

log = get_logger("mcp.http")

_SOCK_CONNECT_TIMEOUT = 15
_DEFAULT_STALL_TIMEOUT = 120

# Headers the transport owns. Configured per-server headers and mirrored
# Mcp-Param-* values must never override these (case-insensitive).
_MANAGED_HEADERS = frozenset(
    {
        "host",
        "content-length",
        "content-type",
        "accept",
        "connection",
        "transfer-encoding",
        "mcp-protocol-version",
        "mcp-session-id",
        "mcp-method",
        "mcp-name",
    }
)

RESULT_JSON = "json"
RESULT_ACCEPTED = "accepted"
RESULT_HTTP_ERROR = "http_error"
RESULT_STREAM_ENDED = "stream_ended"


@dataclass
class PostOutcome:
    """What one POST produced.

    ``json``:         ``messages`` holds the parsed body message(s).
    ``accepted``:     2xx with no meaningful body (notification/response POST).
    ``http_error``:   non-2xx; ``status`` + parsed ``messages`` (when the body
                      was JSON-RPC) + a bounded ``body_snippet`` for sanitized
                      diagnostics.
    ``stream_ended``: an SSE reply ended; every message was already delivered
                      mid-stream via ``on_message``.
    """

    kind: str
    status: int = 0
    messages: list[dict] = field(default_factory=list)
    body_snippet: str = ""
    session_id: str | None = None


def _filter_configured_headers(configured: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in (configured or {}).items():
        name = str(key)
        lowered = name.lower()
        if lowered in _MANAGED_HEADERS or lowered.startswith("mcp-param-"):
            log.warning("MCP: dropping configured header %r (managed by transport)", name)
            continue
        out[name] = str(value)
    return out


class HttpTransport:
    """One MCP server endpoint over Streamable HTTP."""

    def __init__(
        self,
        server_name: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        stall_timeout: float = _DEFAULT_STALL_TIMEOUT,
    ) -> None:
        if not url or not url.lower().startswith(("http://", "https://")):
            raise MCPConnectError(f"{server_name}: http transport requires an http(s) url")
        self.server_name = server_name
        self.url = url
        self.configured_headers = _filter_configured_headers(headers or {})
        self.stall_timeout = stall_timeout
        self.session_id: str | None = None
        self._session: aiohttp.ClientSession | None = None

    async def start(self) -> None:
        if self._session is not None:
            return
        self._session = aiohttp.ClientSession(
            cookie_jar=aiohttp.DummyCookieJar(),
            timeout=aiohttp.ClientTimeout(
                total=None,
                sock_connect=_SOCK_CONNECT_TIMEOUT,
                sock_read=self.stall_timeout,
            ),
        )

    async def close(self) -> None:
        session, self._session = self._session, None
        if session is not None:
            try:
                await session.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # POST
    # ------------------------------------------------------------------

    def _build_headers(
        self,
        *,
        protocol_version: str | None,
        mcp_method: str | None,
        mcp_name: str | None,
        param_headers: dict[str, str] | None,
        include_session: bool,
    ) -> dict[str, str]:
        headers: dict[str, str] = dict(self.configured_headers)
        headers["Content-Type"] = "application/json"
        headers["Accept"] = "application/json, text/event-stream"
        if protocol_version:
            headers["MCP-Protocol-Version"] = protocol_version
        if mcp_method:
            headers["Mcp-Method"] = mcp_method
        if mcp_name:
            headers["Mcp-Name"] = mcp_name
        if include_session and self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        for name, value in (param_headers or {}).items():
            headers[f"Mcp-Param-{name}"] = value
        return headers

    async def post(
        self,
        body: dict[str, Any],
        *,
        protocol_version: str | None,
        mcp_method: str | None = None,
        mcp_name: str | None = None,
        param_headers: dict[str, str] | None = None,
        include_session: bool = True,
        capture_session: bool = False,
        negotiated_version: str | None = None,
        on_message: Callable[[dict], None] | None = None,
    ) -> PostOutcome:
        """POST one JSON-RPC message and interpret the reply.

        For SSE replies every message is delivered through ``on_message`` as
        it arrives (mid-stream); the call returns once the stream ends.
        Cancelling the awaiting task aborts the underlying request/stream —
        which IS the modern cancellation signal.
        """
        if self._session is None:
            raise MCPConnectError(f"{self.server_name}: transport not started")
        headers = self._build_headers(
            protocol_version=protocol_version,
            mcp_method=mcp_method,
            mcp_name=mcp_name,
            param_headers=param_headers,
            include_session=include_session,
        )
        try:
            async with self._session.post(
                self.url,
                data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
                headers=headers,
                allow_redirects=False,
            ) as resp:
                if 300 <= resp.status < 400:
                    raise MCPConnectError(
                        f"{self.server_name}: endpoint redirected "
                        f"({resp.status}); redirects are not followed — "
                        "configure the final URL"
                    )
                if capture_session:
                    minted = resp.headers.get("Mcp-Session-Id")
                    if minted:
                        self.session_id = minted
                content_type = (resp.content_type or "").lower()
                if resp.status >= 400:
                    return await self._read_error(resp, negotiated_version)
                if resp.status in (202, 204):
                    return PostOutcome(
                        RESULT_ACCEPTED, status=resp.status, session_id=self.session_id
                    )
                if content_type == "text/event-stream":
                    await self._consume_sse(resp, negotiated_version, on_message)
                    return PostOutcome(
                        RESULT_STREAM_ENDED, status=resp.status, session_id=self.session_id
                    )
                raw = await self._read_bounded(resp)
                if not raw.strip():
                    return PostOutcome(
                        RESULT_ACCEPTED, status=resp.status, session_id=self.session_id
                    )
                messages = parse_wire_payload(raw, negotiated_version=negotiated_version)
                return PostOutcome(
                    RESULT_JSON,
                    status=resp.status,
                    messages=messages,
                    session_id=self.session_id,
                )
        except aiohttp.ClientError as e:
            raise MCPConnectError(
                f"{self.server_name}: HTTP transport error: {e.__class__.__name__}"
            ) from e

    async def _read_bounded(self, resp: aiohttp.ClientResponse) -> bytes:
        data = bytearray()
        async for chunk in resp.content.iter_chunked(65536):
            data.extend(chunk)
            if len(data) > WIRE_RESULT_CEILING:
                raise MCPProtocolError(
                    f"{self.server_name}: response body exceeds {WIRE_RESULT_CEILING} bytes"
                )
        return bytes(data)

    async def _read_error(
        self, resp: aiohttp.ClientResponse, negotiated_version: str | None
    ) -> PostOutcome:
        """Non-2xx: parse a JSON-RPC error body when present; keep only a
        bounded snippet otherwise (raw upstream bodies are never surfaced)."""
        try:
            raw = await self._read_bounded(resp)
        except MCPProtocolError:
            raw = b""
        messages: list[dict] = []
        snippet = ""
        if raw.strip():
            try:
                messages = parse_wire_payload(raw, negotiated_version=negotiated_version)
            except MCPProtocolError:
                snippet = raw[:200].decode("utf-8", errors="replace")
        return PostOutcome(
            RESULT_HTTP_ERROR,
            status=resp.status,
            messages=messages,
            body_snippet=snippet,
            session_id=self.session_id,
        )

    # ------------------------------------------------------------------
    # SSE
    # ------------------------------------------------------------------

    async def _consume_sse(
        self,
        resp: aiohttp.ClientResponse,
        negotiated_version: str | None,
        on_message: Callable[[dict], None] | None,
    ) -> None:
        """Incrementally parse one SSE stream, dispatching each JSON-RPC
        message as it completes. Comment lines (``:`` prefix) are keep-alives
        and ignored; event ``data:`` accumulation is bounded."""
        data_lines: list[str] = []
        data_bytes = 0
        buffer = b""

        def dispatch_event() -> None:
            nonlocal data_lines, data_bytes
            if not data_lines:
                return
            payload = "\n".join(data_lines)
            data_lines = []
            data_bytes = 0
            try:
                messages = parse_wire_payload(payload, negotiated_version=negotiated_version)
            except MCPProtocolError as e:
                log.warning("MCP %s: dropping SSE event: %s", self.server_name, e)
                return
            for msg in messages:
                if on_message is not None:
                    try:
                        on_message(msg)
                    except Exception:
                        log.exception("MCP %s: SSE message handler failed", self.server_name)

        async for chunk in resp.content.iter_chunked(16384):
            buffer += chunk
            if len(buffer) > MAX_SSE_EVENT_BYTES:
                raise MCPProtocolError(
                    f"{self.server_name}: SSE event exceeds {MAX_SSE_EVENT_BYTES} bytes"
                )
            while True:
                for sep in (b"\r\n", b"\n", b"\r"):
                    idx = buffer.find(sep)
                    if idx != -1:
                        line, buffer = buffer[:idx], buffer[idx + len(sep) :]
                        break
                else:
                    break
                text = line.decode("utf-8", errors="replace")
                if not text:
                    dispatch_event()
                    continue
                if text.startswith(":"):
                    continue  # SSE comment / keep-alive
                field_name, _, value = text.partition(":")
                if value.startswith(" "):
                    value = value[1:]
                if field_name == "data":
                    data_bytes += len(value)
                    if data_bytes > MAX_SSE_EVENT_BYTES:
                        raise MCPProtocolError(
                            f"{self.server_name}: SSE data exceeds {MAX_SSE_EVENT_BYTES} bytes"
                        )
                    data_lines.append(value)
                # event/id/retry fields carry no data we act on.
        dispatch_event()

    # ------------------------------------------------------------------
    # Legacy session termination
    # ------------------------------------------------------------------

    async def delete_session(self, *, protocol_version: str | None) -> None:
        """Legacy: explicitly terminate a server-minted session. 405 (server
        does not allow client termination) is tolerated; only called when a
        session id exists."""
        if self._session is None or not self.session_id:
            return
        headers: dict[str, str] = dict(self.configured_headers)
        headers["Mcp-Session-Id"] = self.session_id
        if protocol_version:
            headers["MCP-Protocol-Version"] = protocol_version
        try:
            async with self._session.delete(
                self.url, headers=headers, allow_redirects=False
            ) as resp:
                await resp.read()
        except aiohttp.ClientError:
            pass
        finally:
            self.session_id = None
