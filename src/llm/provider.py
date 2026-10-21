"""Abstract LLM provider interface.

All LLM backends (Codex, Ollama, future providers) implement this
protocol so the bot can swap providers at runtime via config.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from .client_lifecycle import ClientLifecycle
from .progress import GenerationProgressObserver
from .types import LLMResponse


class LLMProvider(ClientLifecycle, ABC):
    """Minimal interface that every LLM backend must implement."""

    @abstractmethod
    async def chat(
        self, messages: list[dict], system: str,
        max_tokens: int | None = None,
    ) -> str:
        """Simple text completion — returns plain string."""

    @abstractmethod
    async def chat_with_tools(
        self, messages: list[dict], system: str,
        tools: list[dict],
        *, reasoning_effort: str | None = None,
        model: str | None = None,
        progress_observer: GenerationProgressObserver | None = None,
        allow_empty_reply: bool = False,
    ) -> LLMResponse:
        """Completion with tool calling — returns structured response.

        reasoning_effort overrides the provider's configured effort for this
        single request (None = use the configured value). Providers without
        a reasoning-effort concept accept and ignore it.

        model overrides the provider's configured model for this single
        request (None = use the configured value). Codex honors it (spawned
        agents run on ``openai_codex.agent_model``); providers that pin
        their model accept and ignore it — callers must never present an
        ignored override as the model that answered.

        allow_empty_reply is set only by a caller for which silence is a valid
        answer (a silent loop's quiet iteration). A settled, normally finished
        empty reply is then a successful response on its first attempt. A
        refusal, a filtered or truncated finish, an unfinished stream or a
        malformed payload is never accepted as one. The default keeps every
        provider's own empty-response handling.
        """

    @abstractmethod
    async def close(self) -> None:
        """Release any held connections."""

    def pool_stats(self) -> dict:
        """Optional: return connection pool metrics."""
        return {}

    @property
    def provider_name(self) -> str:
        return self.__class__.__name__

    @property
    def model_name(self) -> str:
        return getattr(self, "model", "unknown")
