"""Pinned discord.py transport retirement for Odin's long-lived bot."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from discord.ext import commands

import discord

SUPPORTED_DISCORDPY_VERSION = "2.7.1"


class UnsupportedDiscordAttachmentError(RuntimeError):
    """The process can continue serving HTTP, but cannot attach Discord."""


@dataclass(frozen=True, slots=True)
class AttachmentCompatibility:
    available: bool
    detail: str


class DiscordPyReattachmentAdapter:
    """Retire one gateway generation while preserving bot/http/state/tree/cogs."""

    def __init__(self, bot: commands.Bot) -> None:
        self.bot = bot
        self.compatibility = check_attachment_compatibility(bot)
        self._configured_owner_id = bot.owner_id
        self._configured_owner_ids = bot.owner_ids

    @property
    def attachment_available(self) -> bool:
        return self.compatibility.available

    def require_supported(self) -> None:
        if not self.compatibility.available:
            raise UnsupportedDiscordAttachmentError(self.compatibility.detail)

    async def close_transport(self) -> None:
        """Close library transport only. Bot.close would unload application state."""
        self.require_supported()
        task = asyncio.create_task(discord.Client.close(self.bot))
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            # A cancelled caller must not abandon connector teardown.
            await asyncio.shield(task)
            raise

    async def retire_gateway(self, gateway_task: asyncio.Task[Any] | None = None) -> None:
        self.require_supported()
        if gateway_task is asyncio.current_task():
            raise RuntimeError("cannot retire discord.py from its own gateway task")
        await self.close_transport()
        if gateway_task is not None:
            try:
                await asyncio.shield(gateway_task)
            except asyncio.CancelledError:
                if not gateway_task.cancelled():
                    raise
            except Exception:
                pass
        await self._reset_after_retirement()

    async def _reset_after_retirement(self) -> None:
        self.require_supported()
        if self.bot._closing_task is None or not self.bot._closing_task.done():
            raise RuntimeError("cannot reset discord.py before transport closure completes")
        await self._cancel_gateway_work()
        self._cancel_client_waiters()
        await self._reset_http_resources()
        self.bot._connection.clear()
        self.bot.ws = None  # type: ignore[assignment]
        self.bot._application = None
        self.bot._connection.application_id = None
        self.bot._connection.application_flags = discord.utils.MISSING
        self.bot.owner_id = self._configured_owner_id
        self.bot.owner_ids = self._configured_owner_ids
        if hasattr(self.bot, "_synced_command_scopes"):
            self.bot._synced_command_scopes.clear()
        self.bot._closing_task = None
        await discord.Client._async_setup_hook(self.bot)

    async def _cancel_gateway_work(self) -> None:
        state = self.bot._connection
        # discord.py's event dispatcher can have callbacks queued behind a
        # retired transport. They must not mutate the next attachment after
        # private state is reset. These are tracked by OdinBot at scheduling
        # time; absent on plain compatible Bot test doubles.
        generation_tasks = getattr(self.bot, "_gateway_event_tasks", {})
        active_events = [
            task
            for tasks in generation_tasks.values()
            for task in tasks
            if not task.done() and task is not asyncio.current_task()
        ]
        for task in active_events:
            task.cancel()
        if active_events:
            await asyncio.gather(*active_events, return_exceptions=True)
        generation_tasks.clear()
        tasks = [getattr(state, "_ready_task", None)]
        tasks.extend(getattr(state, "_ready_tasks", {}).values())
        active = [task for task in tasks if task is not None and not task.done()]
        for task in active:
            task.cancel()
        if active:
            await asyncio.gather(*active, return_exceptions=True)
        if hasattr(state, "_ready_task"):
            state._ready_task = None
        if hasattr(state, "_ready_tasks"):
            state._ready_tasks = {}
        for request in state._chunk_requests.values():
            for waiter in request.waiters:
                if not waiter.done():
                    waiter.cancel()
        state._chunk_requests.clear()

    def _cancel_client_waiters(self) -> None:
        for listeners in self.bot._listeners.values():
            for waiter, _condition in listeners:
                if not waiter.done():
                    waiter.cancel()
        self.bot._listeners.clear()

    async def _reset_http_resources(self) -> None:
        http = self.bot.http
        await http.close()
        connector = http.connector
        if connector is not discord.utils.MISSING and not connector.closed:
            await connector.close()
        waiters = []
        for bucket in http._buckets.values():
            for waiter in bucket._pending_requests:
                if not waiter.done():
                    waiter.cancel()
                waiters.append(waiter)
        if waiters:
            await asyncio.gather(*waiters, return_exceptions=True)
        http.connector = discord.utils.MISSING
        setattr(http, "_HTTPClient__session", discord.utils.MISSING)
        http.token = None
        http._bucket_hashes.clear()
        http._buckets.clear()
        http._global_over = discord.utils.MISSING


def check_attachment_compatibility(bot: commands.Bot | None = None) -> AttachmentCompatibility:
    if discord.__version__ != SUPPORTED_DISCORDPY_VERSION:
        return AttachmentCompatibility(
            False,
            "Discord reattachment is unavailable: tested only with discord.py "
            f"{SUPPORTED_DISCORDPY_VERSION}, found {discord.__version__}.",
        )
    if not all(hasattr(discord.Client, name) for name in ("close", "_async_setup_hook")):
        return AttachmentCompatibility(
            False, "Discord reattachment is unavailable: unsupported Client API layout."
        )
    if bot is not None:
        required_bot = (
            "_closing_task", "_ready", "_application", "_listeners", "_connection", "http"
        )
        required_http = (
            "connector",
            "token",
            "_bucket_hashes",
            "_buckets",
            "_global_over",
            "_HTTPClient__session",
        )
        required_state = ("_ready_task", "_chunk_requests", "clear")
        present = all(hasattr(bot, name) for name in required_bot)
        present = present and all(hasattr(bot.http, name) for name in required_http)
        present = present and all(hasattr(bot._connection, name) for name in required_state)
        if not present:
            return AttachmentCompatibility(
                False, "Discord reattachment is unavailable: unsupported private state layout."
            )
    return AttachmentCompatibility(True, "discord.py 2.7.1 private reattachment adapter available.")
