"""Neutral, observer-only progress events for agent LLM generations.

The observer is deliberately optional. Providers never expose model text or
reasoning through it, and ordinary chat calls do not install one.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

ProgressKind = Literal["wire", "substantive", "retry", "discarded"]


@dataclass(frozen=True, slots=True)
class GenerationProgress:
    kind: ProgressKind
    provider: str
    attempt: int = 1
    discarded_text_chars: int = 0
    discarded_tool_argument_chars: int = 0
    text_chars: int = 0
    tool_argument_chars: int = 0


GenerationProgressObserver = Callable[[GenerationProgress], None]


def emit_progress(
    observer: GenerationProgressObserver | None,
    event: GenerationProgress,
) -> None:
    """Notify an observer without allowing telemetry to break generation."""
    if observer is None:
        return
    try:
        observer(event)
    except Exception:
        return
