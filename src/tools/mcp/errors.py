"""Typed MCP error hierarchy.

Every failure mode has a type; nothing in this package communicates failure
through ambient strings. Dispatch layers translate these into user-facing
tool results; the durability layer relies on the ok/failed/uncertain
classification carried by :class:`~src.tools.mcp.outcomes.MCPToolOutcome`.
"""

from __future__ import annotations


class MCPError(Exception):
    """Base for every MCP client error."""


class MCPConfigError(MCPError):
    """A server configuration is structurally invalid (bad transport shape,
    illegal header name, malformed env/cwd, limit violation)."""


class MCPConnectError(MCPError):
    """Connecting failed: transport launch, era detection, version
    negotiation, or the initialize handshake. Retryable by reconnect."""


class MCPStdioEOFError(MCPConnectError):
    """Typed classification: the stdio server closed stdout (unexpected
    EOF). Raised into pending futures so the era probe can distinguish a
    die-on-unknown-method strict-legacy server (grants exactly one
    fresh-process legacy attempt) from every other transport failure —
    never by exception-text matching."""


class MCPPreWriteError(MCPConnectError):
    """A tool request was rejected locally before any bytes could be written."""


class MCPProtocolError(MCPError):
    """The server violated the negotiated protocol (malformed frame,
    oversized message, missing required fields, batch outside 2025-03-26,
    duplicate tool names, invalid pagination) — or rejected a request with a
    JSON-RPC error, whose code rides on ``rpc_code`` so callers can react
    structurally (never by matching error text)."""

    def __init__(self, message: str, *, rpc_code: int | None = None) -> None:
        super().__init__(message)
        self.rpc_code = rpc_code


class MCPTimeoutError(MCPError):
    """A bounded operation exceeded its budget before the request was
    written, or during connect/discovery where retry is safe."""
