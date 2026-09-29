"""Code-owned outcome provenance, never inferred from handler output bytes."""
from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class DispatchEvidence:
    uncertain: bool = False


dispatch_evidence: ContextVar[DispatchEvidence | None] = ContextVar(
    "tool_dispatch_evidence", default=None
)


def mark_dispatch_uncertain() -> None:
    """Transport lost settlement after dispatch; cleanup is not absence proof."""
    evidence = dispatch_evidence.get()
    if evidence is not None:
        # Nested transport tasks inherit this invocation's evidence object.
        # The next attempt installs a distinct object, never a global flag.
        evidence.uncertain = True


class ToolFailure(str):
    """A backward-compatible string with a trusted failure contract."""

    uncertain_outcome: bool

    def __new__(cls, text: str, *, uncertain_outcome: bool = False):
        value = super().__new__(cls, text)
        value.uncertain_outcome = uncertain_outcome
        return value


def is_tool_failure(value: object) -> bool:
    from .tool_text import _ERROR_RESULT_PREFIXES

    return isinstance(value, ToolFailure) or (
        isinstance(value, str) and value.startswith(_ERROR_RESULT_PREFIXES)
    )
