"""Turn correlation context — joins trajectories, audit entries, and loop
iterations without threading parameters through every call signature.

The processing entry points (chat tool loop, web chat, loop iterations) set
the current turn context; downstream writers (audit logger, trajectory
construction) read it. contextvars propagate into tasks spawned via
asyncio.gather, so concurrent tool executions inherit the turn they belong
to. Pure metadata — never used for control flow.
"""
from __future__ import annotations

from contextvars import ContextVar, Token

current_turn: ContextVar[dict | None] = ContextVar("odin_current_turn", default=None)


def set_turn(**fields) -> Token:
    """Begin a turn context. Returns a token for reset_turn()."""
    clean = {k: v for k, v in fields.items() if v not in (None, "")}
    return current_turn.set(clean or None)


def reset_turn(token: Token) -> None:
    try:
        current_turn.reset(token)
    except ValueError:
        # Token from another context — never let correlation cleanup raise
        current_turn.set(None)


def get_turn() -> dict | None:
    return current_turn.get()
