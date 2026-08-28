"""Typed tool-call outcomes.

A ``tools/call`` ends in exactly one of three states, and the distinction is
load-bearing for the durability ledger (an uncertain external effect must
never be recorded as success or silently replayed):

- ``ok``        — the server returned a result without ``isError``.
- ``failed``    — definite failure: server ``isError: true``, a JSON-RPC
                  error, a validation failure, an explicit session
                  rejection, or any failure BEFORE the request was written.
- ``uncertain`` — the request was written and the outcome is unknowable
                  (timeout, disconnect, stream loss after send). NEVER
                  automatically replayed.
"""

from __future__ import annotations

from dataclasses import dataclass, field

OUTCOME_OK = "ok"
OUTCOME_FAILED = "failed"
OUTCOME_UNCERTAIN = "uncertain"

_VALID_STATUSES = frozenset({OUTCOME_OK, OUTCOME_FAILED, OUTCOME_UNCERTAIN})


@dataclass(frozen=True)
class MCPToolOutcome:
    """Result of one MCP tool invocation, classified.

    ``text`` is the model-facing rendering (already bounded by the caller's
    caps). ``server``/``tool`` identify the ORIGINAL names; the published
    (namespaced, provider-safe) name is dispatch-layer metadata.
    """

    status: str
    text: str
    server: str
    tool: str
    negotiated_version: str = ""
    generation: int = 0
    detail: str = field(default="", repr=False)

    def __post_init__(self) -> None:
        if self.status not in _VALID_STATUSES:
            raise ValueError(f"invalid outcome status: {self.status!r}")

    @property
    def ok(self) -> bool:
        return self.status == OUTCOME_OK

    @property
    def uncertain(self) -> bool:
        return self.status == OUTCOME_UNCERTAIN
