"""Abstract LLM provider interface.

All LLM backends (Codex, Ollama, future providers) implement this
protocol so the bot can swap providers at runtime via config.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from .types import LLMResponse


class LLMProvider(ABC):
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
