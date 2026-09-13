"""Serialized Discord gateway attachment for one long-lived OdinBot."""

from __future__ import annotations

import asyncio
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

    def __init__(self, bot: Any, adapter: GatewayAdapter | None = None) -> None:
        self.bot = bot
        self.adapter = adapter or DiscordPyReattachmentAdapter(bot)
        self._lock = asyncio.Lock()
        self._generation = 0
        self._task: asyncio.Task[Any] | None = None
        self._retirement: asyncio.Task[None] | None = None
        self._state = "detached"
        self._detail = "no Discord token attached"
        self._connection_epoch = 0
        self._closed = False

    def status(self) -> ConnectionStatus:
        return ConnectionStatus(self._generation, self._state, self._detail)

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

    def transport_ready(self, expected_generation: int) -> ConnectionStatus:
        """Record ready only for the currently owned, live generation."""
        if (expected_generation == self._generation and self._task is not None
                and not self._task.done() and not self._closed):
            self._set_state("connected", "Discord gateway ready")
        return self.status()

    def transport_disconnected(self, expected_generation: int) -> ConnectionStatus:
        """Record a library disconnect without allowing it to rearm ownership."""
        if (expected_generation == self._generation and self._task is not None
                and not self._task.done() and not self._closed):
            self._set_state("disconnected", "Discord gateway disconnected")
        return self.status()

    def owns(self, expected_generation: int) -> bool:
        return (expected_generation == self._generation and self._task is not None
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
        if generation != self._generation or task is not self._task:
            return
        if task.cancelled():
            self._set_state("stopped", "gateway task cancelled")
            return
        try:
            error = task.exception()
        except asyncio.CancelledError:
            self._set_state("stopped", "gateway task cancelled")
            return
        if error is None:
            self._set_state("stopped", "gateway disconnected")
        else:
            self._set_state("failed", f"gateway failed: {type(error).__name__}")
