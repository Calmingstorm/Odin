"""Per-channel mutable state registry (RFC-001 Phase 2).

Owns the per-channel dictionaries that used to live as ~20 loose fields on
``OdinBot``, plus their housekeeping. Behavior is unchanged — methods are
verbatim moves of the inline logic they replace.

Facade note: five dicts (``channel_locks``, ``cancel_events``,
``pending_files``, ``recent_actions``, ``last_op_details``) plus
``background_tasks`` are also exposed on the bot under their historical
underscore names as ALIASES to these same objects, because external code
and tests read them there (RFC-001 Appendix B). The rest of the names here
are covered by the Appendix B negative contract: nothing outside the
discord package may reach into them.
"""

from __future__ import annotations

import asyncio
import collections
import time

from ..odin_log import get_logger

log = get_logger("discord")


class ChannelStateRegistry:
    """Per-channel conversation state + bounded caches + housekeeping."""

    def __init__(
        self,
        *,
        processed_messages_max: int = 100,
        bot_msg_buffer_delay: float = 2.0,
        bot_msg_buffer_max: int = 20,
        recent_actions_max: int = 10,
        recent_actions_expiry: float = 3600.0,
        background_tasks_max: int = 20,
        cleanup_interval: float = 300.0,
    ) -> None:
        # Per-channel lock to prevent concurrent processing of the same message
        self.channel_locks: dict[str, asyncio.Lock] = {}
        # Per-channel cancellation for /stop command
        self.cancel_events: dict[str, asyncio.Event] = {}
        self.active_requests: dict[str, str] = {}
        # Pending file attachments from skills — per-channel to avoid cross-channel leaks
        self.pending_files: dict[str, list[tuple[bytes, str]]] = {}
        # Track recently processed message IDs to prevent duplicate handling
        self.processed_messages: collections.OrderedDict[int, None] = collections.OrderedDict()
        self.processed_messages_max = processed_messages_max
        # Bot message buffer: accumulate rapid-fire bot messages before processing
        # Key: (channel_id, author_id) → list of content strings
        self.bot_msg_buffer: dict[tuple[str, str], list[str]] = {}
        self.bot_msg_tasks: dict[tuple[str, str], asyncio.Task] = {}
        self.bot_msg_buffer_delay = bot_msg_buffer_delay  # seconds to wait for more
        self.bot_msg_buffer_max = bot_msg_buffer_max  # max messages per bot+channel
        # Recent tool executions for conversational context (system prompt)
        # Per-channel: {channel_id: [(timestamp, entry_text), ...]}
        self.recent_actions: dict[str, list[tuple[float, str]]] = {}
        # Per-channel tool input/result details from the most recent tool
        # loop — consumed by post-operation reflection.
        self.last_op_details: dict[str, list[dict]] = {}
        self.recent_actions_max = recent_actions_max
        self.recent_actions_expiry = recent_actions_expiry  # seconds
        # Background task tracking
        self.background_tasks: dict[str, object] = {}
        self.background_tasks_max = background_tasks_max
        # Throttled housekeeping
        self.last_cleanup: float = 0.0
        self.cleanup_interval = cleanup_interval

    # -- request lifecycle --------------------------------------------------

    def lock_for(self, channel_id: str) -> asyncio.Lock:
        return self.channel_locks.setdefault(channel_id, asyncio.Lock())

    def cancel_event(self, channel_id: str) -> asyncio.Event:
        return self.cancel_events.setdefault(channel_id, asyncio.Event())

    def is_cancelled(self, channel_id: str) -> bool:
        ev = self.cancel_events.get(channel_id)
        return bool(ev and ev.is_set())

    def set_active_request(self, channel_id: str, request_id: str) -> None:
        self.active_requests[channel_id] = request_id

    def clear_active_request(self, channel_id: str, request_id: str) -> None:
        """Clear the active-request marker and cancel flag — only if this
        request still owns the channel (a newer request must not be cleared
        by a stale one)."""
        if self.active_requests.get(channel_id) == request_id:
            self.active_requests.pop(channel_id, None)
            ev = self.cancel_events.get(channel_id)
            if ev is not None:
                ev.clear()

    # -- message dedup -------------------------------------------------------

    def seen_message(self, message_id: int) -> bool:
        """Record a message id; True if it was already processed (duplicate)."""
        if message_id in self.processed_messages:
            return True
        self.processed_messages[message_id] = None
        # Keep bounded — remove oldest entries (OrderedDict preserves insertion order)
        while len(self.processed_messages) > self.processed_messages_max:
            self.processed_messages.popitem(last=False)
        return False

    # -- recent actions ------------------------------------------------------

    def track_recent_action(self, channel_id: str, entry: str) -> None:
        actions = self.recent_actions.setdefault(channel_id, [])
        actions.append((time.time(), entry))
        # Cap per-channel list
        if len(actions) > self.recent_actions_max:
            self.recent_actions[channel_id] = actions[-self.recent_actions_max :]

    def recent_entries(self, channel_id: str) -> list[str]:
        """Non-expired recent-action entries for a channel, oldest first."""
        now = time.time()
        return [
            entry
            for ts, entry in self.recent_actions.get(channel_id, [])
            if now - ts < self.recent_actions_expiry
        ]

    # -- housekeeping ---------------------------------------------------------

    def cleanup(self, *, active_channels: set[str]) -> None:
        """Remove stale per-channel entries — verbatim move of the channel-state
        portion of the old _cleanup_stale_caches."""
        now = time.time()
        # Clean up recent_actions: remove channels with all expired entries
        expired_channels = []
        for channel_id, actions in self.recent_actions.items():
            actions[:] = [
                (ts, entry) for ts, entry in actions if now - ts < self.recent_actions_expiry
            ]
            if not actions:
                expired_channels.append(channel_id)
        for channel_id in expired_channels:
            del self.recent_actions[channel_id]

        # Clean up channel_locks for channels no longer in active sessions.
        # A lock that is currently HELD must not be deleted: an in-flight
        # request in a channel whose session was just reset/purged still owns
        # its lock, and dropping it lets the next message setdefault() a fresh
        # lock, so two handlers run concurrently in the same channel.
        stale_locks = [
            cid
            for cid, lock in self.channel_locks.items()
            if cid not in active_channels and not lock.locked()
        ]
        for cid in stale_locks:
            del self.channel_locks[cid]

        # Clean up pending_files for channels no longer active
        stale_files = [cid for cid in self.pending_files if cid not in active_channels]
        for cid in stale_files:
            leaked = self.pending_files.pop(cid, [])
            if leaked:
                log.warning("Evicted %d stale pending file(s) for channel %s", len(leaked), cid)

        # Clean up stale cancel events and active request tracking
        stale_cancel = [
            cid
            for cid, ev in self.cancel_events.items()
            if cid not in active_channels and not ev.is_set()
        ]
        for cid in stale_cancel:
            del self.cancel_events[cid]
        stale_active = [
            cid
            for cid in self.active_requests
            if cid not in active_channels
            and not self.cancel_events.get(cid, asyncio.Event()).is_set()
        ]
        for cid in stale_active:
            del self.active_requests[cid]
