"""Auxiliary LLM client — cheap-model wrapper for classification, summarization, and vision.

Wraps a separate ``CodexChatClient`` instance configured with a cheaper/faster
model (e.g. gpt-4o-mini) for auxiliary tasks that don't need the full-power
model: session compaction, learning reflection/consolidation, background task
follow-up, and vision description.

Falls back to the primary client transparently on error.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from ..odin_log import get_logger
from .circuit_breaker import CircuitOpenError
from .cost_tracker import CostTracker
from .types import LLMResponse

if TYPE_CHECKING:
    from .openai_codex import CodexChatClient

log = get_logger("auxiliary_llm")

# Tasks that can be routed to the auxiliary model
KNOWN_TASKS = frozenset({
    "compaction",
    "reflection",
    "consolidation",
    "background_followup",
    "vision_description",
    "classification",
    "summarization",
})


class AuxiliaryLLMClient:
    """Cheap-model client for auxiliary LLM tasks with automatic fallback.

    Parameters
    ----------
    aux_client:
        A ``CodexChatClient`` configured with the cheap model.
    primary_client:
        The main ``CodexChatClient`` used as fallback on auxiliary failure.
    enabled_tasks:
        Task names that should use the auxiliary model. Tasks not in this
        set are routed directly to the primary client.
    cost_tracker:
        Optional cost tracker for recording auxiliary model usage.
    """

    def __init__(
        self,
        aux_client: CodexChatClient,
        primary_client: CodexChatClient,
        enabled_tasks: set[str] | None = None,
        cost_tracker: CostTracker | None = None,
    ) -> None:
        self.aux_client = aux_client
        self.primary_client = primary_client
        self.enabled_tasks: set[str] = enabled_tasks if enabled_tasks is not None else set(KNOWN_TASKS)
        self.cost_tracker = cost_tracker
        self._aux_calls: int = 0
        self._fallback_calls: int = 0
        self._primary_direct_calls: int = 0

    def is_enabled(self, task: str) -> bool:
        """Return True if *task* should use the auxiliary model."""
        return task in self.enabled_tasks

    async def chat(
        self,
        messages: list[dict],
        system: str,
        *,
        task: str = "summarization",
        max_tokens: int | None = None,
    ) -> str:
        """Send a chat request, routing to auxiliary or primary based on task.

        If the auxiliary client fails (circuit open, API error, empty response),
        falls back to the primary client transparently.
        """
        if not self.is_enabled(task):
            self._primary_direct_calls += 1
            return await self.primary_client.chat(messages, system, max_tokens=max_tokens)

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

    async def chat_with_tools(
        self,
        messages: list[dict],
        system: str,
        tools: list[dict],
        *,
        task: str = "classification",
    ) -> LLMResponse:
        """Send a tool-calling request through auxiliary or primary client."""
        if not self.is_enabled(task):
            self._primary_direct_calls += 1
            return await self.primary_client.chat_with_tools(messages, system, tools)

        try:
            result = await self.aux_client.chat_with_tools(messages, system, tools)
            if result.text or result.tool_calls:
                self._aux_calls += 1
                self._track_cost(task, is_fallback=False)
                return result
            log.warning("Auxiliary LLM tool call returned empty for %s, falling back", task)
        except CircuitOpenError:
            log.warning("Auxiliary LLM circuit open for tool call %s, falling back", task)
        except Exception as exc:
            log.warning("Auxiliary LLM error for tool call %s: %s, falling back", task, exc)

        self._fallback_calls += 1
        self._track_cost(task, is_fallback=True)
        return await self.primary_client.chat_with_tools(messages, system, tools)

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
            "enabled_tasks": sorted(self.enabled_tasks),
            "aux_calls": self._aux_calls,
            "fallback_calls": self._fallback_calls,
            "primary_direct_calls": self._primary_direct_calls,
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
