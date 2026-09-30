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


class ToolSuccess(str):
    """Successful settlement with uncertainty about an earlier dispatch."""

    uncertain_outcome = True


def is_tool_failure(value: object) -> bool:
    from .tool_text import _ERROR_RESULT_PREFIXES

    if isinstance(value, ToolSuccess):
        return False
    return isinstance(value, ToolFailure) or (
        isinstance(value, str) and value.startswith(_ERROR_RESULT_PREFIXES)
    )


def result_text(value: object) -> str:
    """String API compatibility without erasing a nested tool's provenance."""
    from .result_validator import ToolResult

    if isinstance(value, ToolResult):
        if value.uncertain_outcome:
            mark_dispatch_uncertain()
        if not value.ok:
            return ToolFailure(value.output, uncertain_outcome=value.uncertain_outcome)
        if value.uncertain_outcome:
            return ToolSuccess(value.output)
        return value.output
    if isinstance(value, (ToolFailure, ToolSuccess)) and value.uncertain_outcome:
        mark_dispatch_uncertain()
    return value if isinstance(value, str) else str(value)
