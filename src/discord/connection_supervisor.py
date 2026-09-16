"""Serialized Discord gateway attachment for one long-lived OdinBot."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from ..scheduler.scheduler import ConnectionAvailability, ConnectionReason
from .discordpy_adapter import DiscordPyReattachmentAdapter


@dataclass(frozen=True, slots=True)
class ConnectionStatus:
    generation: int
    state: str
    detail: str = ""


class GatewayAdapter(Protocol):
    def require_supported(self) -> None: ...

    async def retire_gateway(self, gateway_task: asyncio.Task[Any]) -> None: ...


class ConnectionSupervisor:
    """Own gateway tasks so a retired generation cannot rearm itself."""

    def __init__(
        self, bot: Any, adapter: GatewayAdapter | None = None,
        *, on_terminal: Callable[[ConnectionStatus], None] | None = None,
    ) -> None:
        self.bot = bot
        self.adapter = adapter or DiscordPyReattachmentAdapter(bot)
        self._lock = asyncio.Lock()
        self._generation = 0
        self._task: asyncio.Task[Any] | None = None
        self._retirement: asyncio.Task[None] | None = None
        self._state = "detached"
        self._detail = "no Discord token attached"
        self._connection_epoch = 0
        self._transition = 0
        self._closed = False
        self._on_terminal = on_terminal

    def status(self) -> ConnectionStatus:
        detail = self._detail
        compatibility = getattr(self.adapter, "compatibility", None)
        if compatibility is not None and not compatibility.available:
            detail = f"{detail}; {compatibility.detail}"
        return ConnectionStatus(self._generation, self._state, detail)

    def connection_availability(self) -> ConnectionAvailability:
        available = (
            self._state == "connected"
            and self._task is not None
            and not self._task.done()
            and not self._closed
        )
        if available:
            return ConnectionAvailability(True, ConnectionReason.AVAILABLE, self._connection_epoch)
        disconnected = self._closed or self._state in {
            "detached",
            "detaching",
            "disconnected",
            "stopped",
        }
        reason = ConnectionReason.DISCONNECTED if disconnected else ConnectionReason.UNAVAILABLE
        return ConnectionAvailability(False, reason, self._connection_epoch)

    def _set_state(self, state: str, detail: str) -> None:
        if (state, detail) != (self._state, self._detail):
            self._connection_epoch += 1
        self._state, self._detail = state, detail

    async def attach(self, token: str) -> ConnectionStatus:
        if not isinstance(token, str) or not token.strip():
            raise ValueError("a non-empty Discord token is required")
        async with self._lock:
            if self._closed:
                raise RuntimeError("Discord connection supervisor is permanently closed")
            if self._task is not None:
                await self._detach_locked()
            # close() fences synchronously before acquiring this lock, so it
            # can begin while the retirement above yields. Never start a new
            # gateway after that terminal fence has been published.
            if self._closed:
                raise RuntimeError("Discord connection supervisor is permanently closed")
            # First login uses only discord.py's public start API. Private
            # reset compatibility is required only when reusing a transport.
            if self._generation:
                self.adapter.require_supported()
            self._generation += 1
            generation = self._generation
            self._set_state("connecting", "gateway login in progress")
            task = asyncio.create_task(self.bot.start(token), name=f"discord-gateway-{generation}")
            self._task = task
            task.add_done_callback(lambda done: self._gateway_finished(generation, done))
            return self.status()

    async def detach(self) -> ConnectionStatus:
        async with self._lock:
            await self._detach_locked()
            return self.status()

    async def close(self) -> ConnectionStatus:
        # Fence a racing attach before waiting for the ownership lock.
        self._closed = True
        async with self._lock:
            await self._detach_locked()
            return self.status()

    def callback_generation(self) -> int:
        """Capture ownership when discord.py schedules an event callback."""
        return self._generation

    def callback_transition(self) -> int:
        """Capture event ordering independently of public availability changes."""
        return self._transition

    def begin_transition(self, expected_generation: int) -> None:
        """Fence older callbacks synchronously when a transport event arrives."""
        if self.owns(expected_generation):
            self._transition += 1

    def transport_ready(
        self, expected_generation: int, expected_transition: int | None = None
    ) -> ConnectionStatus:
        """Record ready only for the currently owned, live generation."""
        if self.owns(expected_generation, expected_transition):
            self._set_state("connected", "Discord gateway ready")
        return self.status()

    def transport_disconnected(
        self, expected_generation: int, expected_transition: int | None = None
    ) -> ConnectionStatus:
        """Record a library disconnect without allowing it to rearm ownership."""
        if self.owns(expected_generation, expected_transition):
            if expected_transition is None:
                # Each event invalidates older readiness, even if already disconnected.
                self.begin_transition(expected_generation)
            self._set_state("disconnected", "Discord gateway disconnected")
        return self.status()

    def owns(self, expected_generation: int, expected_transition: int | None = None) -> bool:
        return (expected_generation == self._generation and self._task is not None
                and (expected_transition is None or expected_transition == self._transition)
                and not self._task.done() and not self._closed)

    async def _detach_locked(self) -> None:
        task = self._task
        if task is None:
            return
        self._generation += 1
        self._set_state("detaching", "retiring gateway generation")
        if self._retirement is None:
            self._retirement = asyncio.create_task(
                self.adapter.retire_gateway(task), name="discord-gateway-retirement"
            )
        retirement = self._retirement
        try:
            await asyncio.shield(retirement)
        except asyncio.CancelledError:
            # Keep the generation fenced and the retirement task tracked.
            raise
        if retirement.cancelled():
            raise RuntimeError("gateway retirement was cancelled")
        retirement.result()
        self._task = None
        self._retirement = None
        self._set_state("detached", "no Discord token attached")

    def _gateway_finished(self, generation: int, task: asyncio.Task[Any]) -> None:
        if self._closed or generation != self._generation or task is not self._task:
            return
        if task.cancelled():
            self._set_state("stopped", "gateway task cancelled")
        else:
            error = task.exception()
            if error is None:
                self._set_state("stopped", "gateway disconnected")
            else:
                self._set_state("failed", f"gateway failed: {type(error).__name__}")
        # discord.py already owns reconnect/backoff. Exhausting that loop is
        # terminal, not a healthy HTTP-only mode. Intentional retirement fences
        # the generation before cancellation and never reaches this callback.
        if self._on_terminal is not None:
            self._on_terminal(self.status())
