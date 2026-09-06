"""Task-local switch for retaining output before legacy source formatting cuts.

Direct/internal helper calls retain their existing limits. Only delivery owners
which will retain the complete result should enter ``result_capture``.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

_CAPTURE_ACTIVE: ContextVar[bool] = ContextVar("tool_result_capture", default=False)


def capture_active() -> bool:
    return _CAPTURE_ACTIVE.get()


@contextmanager
def result_capture() -> Iterator[None]:
    token = _CAPTURE_ACTIVE.set(True)
    try:
        yield
    finally:
        _CAPTURE_ACTIVE.reset(token)
