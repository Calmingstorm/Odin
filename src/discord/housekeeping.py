"""Periodic cache housekeeping (RFC-002 P4).

Bodies moved verbatim from ``OdinBot._cleanup_stale_caches`` /
``_maybe_cleanup_caches``: prune per-channel state for channels without
active sessions, expire the prompt-layer memory cache, agent health
checks, attachment-workspace cleanup, loop-agent-bridge record cleanup,
and the periodic FTS batch index. Throttled by the channel-state
registry's cleanup interval; triggered from the message pipeline after
session prune.
"""

from __future__ import annotations

import time
from collections.abc import Callable

from ..odin_log import get_logger

log = get_logger("discord")


class Housekeeping:
    def __init__(
        self,
        *,
        get_config: Callable,
        sessions,
        channel_state,
        prompt_builder,
        agent_manager,
        loop_manager,
        loop_agent_bridge,
        channel_logger,
        fts_index,
    ) -> None:
        self._get_config = get_config
        self._sessions = sessions
        self._channel_state = channel_state
        self._prompt_builder = prompt_builder
        self._agent_manager = agent_manager
        self._loop_manager = loop_manager
        self._loop_agent_bridge = loop_agent_bridge
        self._channel_logger = channel_logger
        self._fts_index = fts_index

    def cleanup_stale(self) -> None:
        """Remove stale entries from per-channel caches to prevent memory leaks.

        Called periodically (throttled by the channel-state registry's
        cleanup_interval) after session prune. Removes expired per-channel
        state for channels that no longer have active sessions.
        """
        now = time.time()
        # Per-channel state (recent actions, locks, pending files, cancel
        # events, active requests) — delegated to the registry.
        active_channels = set(self._sessions.ids())
        self._channel_state.cleanup(active_channels=active_channels)

        # Prompt-layer memory cache pruning — owned by PromptBuilder (P3)
        self._prompt_builder.prune_expired_memory(now)

        # Agent lifecycle: kill stuck agents, log stale ones
        if self._agent_manager is not None:
            self._agent_manager.check_health()

        # Clean up old attachment workspaces
        try:
            from .attachments import AttachmentProcessor

            config = self._get_config()
            cfg = config.attachments if hasattr(config, "attachments") else None
            proc = AttachmentProcessor(
                **(
                    {"temp_dir": cfg.temp_directory, "retention_hours": cfg.retention_hours}
                    if cfg
                    else {}
                )
            )
            proc.cleanup_old_workspaces()
        except Exception:
            pass

        # Clean up loop-agent bridge records for finished loops
        if self._loop_agent_bridge is not None:
            for loop_id in list(self._loop_agent_bridge._loop_agents):
                loop_info = self._loop_manager._loops.get(loop_id)
                if not loop_info or loop_info.status != "running":
                    self._loop_agent_bridge.cleanup_loop(loop_id)

        # Batch-index channel logs into FTS (runs every ~5 min with cache cleanup)
        if self._fts_index is not None and self._channel_logger is not None:
            try:
                self._channel_logger.index_to_fts(self._fts_index)
            except Exception:
                pass

    def maybe_cleanup(self) -> None:
        """Run cache cleanup if enough time has passed since the last run."""
        try:
            now = time.time()
            cs = self._channel_state
            if now - cs.last_cleanup > cs.cleanup_interval:
                self.cleanup_stale()
                cs.last_cleanup = now
        except Exception:
            pass  # Non-critical — don't break message processing
