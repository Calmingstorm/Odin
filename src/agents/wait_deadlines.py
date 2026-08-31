"""Outer backstop deadlines for the native ``wait_for_agents`` handler."""

from __future__ import annotations

import math

WAIT_FOR_AGENTS_DEFAULT_SECONDS = 300.0
WAIT_FOR_AGENTS_NATIVE_GRACE_SECONDS = 15.0
WAIT_FOR_AGENTS_NESTED_GRACE_SECONDS = 30.0


def wait_for_agents_handler_deadline(tool_input: dict | None) -> float | None:
    """Return the handler's own requested deadline, or None for invalid input.

    This mirrors the handler's default/float conversion without changing the
    handler contract. Invalid and non-finite values stay on the caller's normal
    fallback so the handler itself can report the input error.
    """
    raw = (tool_input or {}).get("timeout", WAIT_FOR_AGENTS_DEFAULT_SECONDS)
    try:
        deadline = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(deadline) or deadline < 0:
        return None
    return deadline


def wait_for_agents_wrapper_timeout(
    tool_name: str,
    tool_input: dict | None,
    fallback: float,
    *,
    grace_seconds: float,
) -> float:
    """Resolve an outer timeout that cannot race the handler's own deadline."""
    if tool_name != "wait_for_agents":
        return float(fallback)
    handler_deadline = wait_for_agents_handler_deadline(tool_input)
    if handler_deadline is None:
        return float(fallback)
    return handler_deadline + grace_seconds
