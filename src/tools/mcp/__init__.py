"""MCP (Model Context Protocol) client package.

Dual-era core-tools client: current stateless MCP (revision 2026-07-28) and
deployed legacy MCP (2024-11-05 … 2025-11-25) for tools over stdio and
Streamable HTTP, with static authentication. Plan of record:
``docs/plans/mcp-wiring-plan.md``.

Public surface: :class:`MCPManager` (control plane), the typed error
hierarchy, and :class:`MCPToolOutcome` (typed tool-call results — never
stringly errors).
"""

from .errors import (
    MCPConfigError,
    MCPConnectError,
    MCPError,
    MCPProtocolError,
    MCPTimeoutError,
)
from .manager import MCPManager, validate_server_config
from .outcomes import MCPToolOutcome

__all__ = [
    "MCPConfigError",
    "MCPConnectError",
    "MCPError",
    "MCPManager",
    "MCPProtocolError",
    "MCPTimeoutError",
    "validate_server_config",
    "MCPToolOutcome",
]
