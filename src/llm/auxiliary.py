"""Auxiliary LLM client — cheap-model wrapper for fixed background jobs.

Wraps a separate ``CodexChatClient`` configured with a cheaper/faster model for
the background jobs that don't need the full-power model: session compaction,
learning reflection/consolidation, and background-task follow-up.

The wrapper is only constructed/used when the operator has enabled it, and the
gateway only routes those specific jobs here — so every call SHOULD use the aux
model. It falls back to the primary client transparently on error.
"""
from __future__ import annotations

import asyncio
import contextlib
from typing import TYPE_CHECKING

from ..odin_log import get_logger
from .circuit_breaker import CircuitOpenError
from .cost_tracker import CostTracker

if TYPE_CHECKING:
    from .openai_codex import CodexChatClient

log = get_logger("auxiliary_llm")


class AuxiliaryLLMClient:
    """Cheap-model client for auxiliary background jobs with automatic fallback.

    Parameters
    ----------
    aux_client:
        A ``CodexChatClient`` configured with the cheap model.
    primary_client:
        The main ``CodexChatClient`` used as fallback on auxiliary failure.
    cost_tracker:
        Optional cost tracker for recording auxiliary model usage.
    """

    def __init__(
        self,
        aux_client: CodexChatClient,
        primary_client: CodexChatClient,
        cost_tracker: CostTracker | None = None,
    ) -> None:
        self.aux_client = aux_client
        self.primary_client = primary_client
        self.cost_tracker = cost_tracker
        self._aux_calls: int = 0
        self._fallback_calls: int = 0
        # Lease refcount so a live-reload swap can drain the RETIRED wrapper
        # without cutting an in-flight call. Every entry point brackets its
        # work with _lease(); close_when_idle() waits for the count to reach
        # zero (bounded) before closing the aiohttp session.
        self._inflight: int = 0
        self._idle = asyncio.Event()
        self._idle.set()

    @contextlib.asynccontextmanager
    async def _lease(self):
        """Bracket one auxiliary call so a retiring wrapper can drain."""
        self._inflight += 1
        self._idle.clear()
        try:
            yield
        finally:
            self._inflight -= 1
            if self._inflight == 0:
                self._idle.set()

    async def drain_and_close(self) -> None:
        """Wait for ALL in-flight leased calls to finish, then close the aux
        client's session — no wall-clock cut, so a legitimately long request
        (auxiliary turns can run minutes) is never severed. Called on a
        RETIRED wrapper AFTER the live pointer has been swapped away and the
        provider_lock released, typically as a tracked background task (an
        hour-long call must never block a reload)."""
        await self._idle.wait()
        await self.aux_client.close()

    async def chat(
        self,
        messages: list[dict],
        system: str,
        *,
        task: str,
        max_tokens: int | None = None,
    ) -> str:
        """Send a background-job chat request through the auxiliary model.

        The caller (the gateway's job router) only invokes this when the aux
        model should handle the job, so it always tries the aux client; on any
        failure (circuit open, API error, empty response) it falls back to the
        primary client transparently. ``task`` labels the job for cost/metrics.
        """
        async with self._lease():
            return await self._chat_aux(messages, system, task, max_tokens)

    async def _chat_aux(
        self, messages: list[dict], system: str, task: str, max_tokens: int | None
    ) -> str:
        try:
            result = await self.aux_client.chat(messages, system, max_tokens=max_tokens)
            if result:
                self._aux_calls += 1
                self._track_cost(task, is_fallback=False)
                return result
            log.warning("Auxiliary LLM returned empty response for %s, falling back", task)
        except CircuitOpenError:
            log.warning("Auxiliary LLM circuit open for %s, falling back", task)
        except Exception as exc:
            log.warning("Auxiliary LLM error for %s: %s, falling back", task, exc)

        self._fallback_calls += 1
        self._track_cost(task, is_fallback=True)
        return await self.primary_client.chat(messages, system, max_tokens=max_tokens)

    def make_chat_fn(self, task: str):
        """Return an ``async (messages, system) -> str`` callable for a specific task.

        This matches the ``CompactionFn`` / ``TextFn`` signatures used by
        ``SessionManager`` and ``ConversationReflector``.
        """
        async def _fn(messages: list[dict], system: str) -> str:
            return await self.chat(messages, system, task=task)
        return _fn

    def make_codex_callback(self, task: str = "background_followup"):
        """Return a ``CodexCallback``-compatible callable.

        Matches ``async (messages, system, max_tokens) -> str`` used by
        ``background_task._send_conversational_followup``.
        """
        async def _fn(messages: list[dict], system: str, max_tokens: int) -> str:
            return await self.chat(messages, system, task=task, max_tokens=max_tokens)
        return _fn

    def get_metrics(self) -> dict:
        """Return usage metrics for observability."""
        return {
            "aux_model": self.aux_client.model,
            "primary_model": self.primary_client.model,
            "aux_calls": self._aux_calls,
            "fallback_calls": self._fallback_calls,
            "aux_breaker_state": self.aux_client.breaker.state,
        }

    async def close(self) -> None:
        """Close the auxiliary client's HTTP session."""
        await self.aux_client.close()

    def _track_cost(self, task: str, *, is_fallback: bool) -> None:
        if self.cost_tracker is None:
            return
        client = self.primary_client if is_fallback else self.aux_client
        self.cost_tracker.record(
            input_tokens=client._last_input_tokens,
            output_tokens=client._last_output_tokens,
            model=client.model,
            user_id=f"auxiliary:{task}",
            channel_id="system",
        )
