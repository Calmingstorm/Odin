"""Per-conversation prompt-cache affinity for Codex requests.

The ChatGPT Codex backend keeps a conversation's prompt cache on one machine
only while every request of that conversation carries the same ``session_id``
header (measured 2026-10-16: without it, follow-up requests reused none of the
previous prompt; with it, all of it). Odin makes his own random UUID per
conversation; nothing is derived from or copied from another client.

- Chat turns use one ID per channel session. A session reset forgets it, and
  IDs live in memory, so a restart starts new ones. A turn keeps the ID it
  started with for its whole life, so a preserved turn resumed after a reset
  never borrows the new conversation's ID.
- Spawned agents and autonomous loops get a new ID each, for their whole run.
- Requests made inside one of those (history compaction before a turn, the
  completion judge, a skill hand-off reply) inherit the surrounding ID through
  the context variable.
- Detached background work (reflection, delegated tasks) starts its own ID, so
  it never shares a conversation's ID or keeps one past a reset.
"""

from __future__ import annotations

import contextlib
import functools
import threading
import uuid
from collections.abc import Awaitable, Callable, Coroutine, Iterator
from contextvars import ContextVar
from typing import Any, ParamSpec, TypeVar

_P = ParamSpec("_P")
_R = TypeVar("_R")

# Bounded so a long-lived install with many channels cannot grow without
# limit; an evicted channel simply starts a new ID on its next turn.
_MAX_CHANNEL_IDS = 4096
# Bounded likewise; an evicted turn that resumes later gets its own new ID.
_MAX_TURN_IDS = 4096

_current: ContextVar[str | None] = ContextVar("odin_codex_cache_session", default=None)
_channel_ids: dict[str, str] = {}
_turn_ids: dict[tuple[str, str], str] = {}
_lock = threading.Lock()


def new_session_id() -> str:
    """A new random conversation ID (UUID4)."""
    return str(uuid.uuid4())


def current_session_id() -> str | None:
    """The conversation ID bound to the running request, if any."""
    return _current.get()


@contextlib.contextmanager
def bind_session(session_id: str | None) -> Iterator[None]:
    """Bind ``session_id`` for the Codex requests made inside the block."""
    token = _current.set(session_id)
    try:
        yield
    finally:
        _current.reset(token)


def with_new_session(
    fn: Callable[_P, Awaitable[_R]],
) -> Callable[_P, Coroutine[Any, Any, _R]]:
    """Run a coroutine function (an agent or loop run) under its own new ID."""

    @functools.wraps(fn)
    async def wrapper(*args: _P.args, **kwargs: _P.kwargs) -> _R:
        with bind_session(new_session_id()):
            return await fn(*args, **kwargs)

    return wrapper


async def in_new_session(awaitable: Awaitable[_R]) -> _R:
    """Await detached work (a background task's coroutine) under its own new ID."""
    with bind_session(new_session_id()):
        return await awaitable


def channel_session_id(channel_id: str) -> str:
    """The channel session's conversation ID, created on first use."""
    with _lock:
        return _channel_session_id_locked(channel_id)


def _channel_session_id_locked(channel_id: str) -> str:
    session_id = _channel_ids.get(channel_id)
    if session_id is None:
        if len(_channel_ids) >= _MAX_CHANNEL_IDS:
            _channel_ids.pop(next(iter(_channel_ids)))
        session_id = _channel_ids[channel_id] = new_session_id()
    return session_id


def turn_session_id(channel_id: str, turn_id: str, *, resumed: bool = False) -> str:
    """The ID a chat turn runs under, kept for the turn's whole life.

    A fresh turn takes its channel session's current ID. A resumed turn reuses
    the ID it started with, even if the channel was reset since. When that ID
    is unknown (after a restart, or eviction), the resumed turn gets its own
    new ID, never the channel's current one: a reset may have started a new
    conversation in the meantime.
    """
    key = (channel_id, turn_id)
    with _lock:
        session_id = _turn_ids.get(key)
        if session_id is None:
            session_id = new_session_id() if resumed else _channel_session_id_locked(channel_id)
            if len(_turn_ids) >= _MAX_TURN_IDS:
                _turn_ids.pop(next(iter(_turn_ids)))
            _turn_ids[key] = session_id
        return session_id


def forget_channel(channel_id: str) -> None:
    """Drop a channel's ID so its next turn starts a new conversation."""
    with _lock:
        _channel_ids.pop(channel_id, None)
