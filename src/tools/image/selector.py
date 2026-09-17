"""Native image generation + the structural availability check used for visibility.

Availability is STRUCTURAL (config + active provider) so the tool definition does
not appear/disappear on transient health (a cooling-down account or open
breaker). Only a provider/config change flips it — and that
rebuilds the registry + system prompt.
"""

from __future__ import annotations

from collections.abc import Callable

from .base import ImageBackendUnavailableError, ImageResult


def _native_possible(config) -> bool:
    """Native OpenAI image gen is available only when Odin is actively on the
    Codex provider (it rides that live auth) with the kill switch on."""
    oc = getattr(config, "openai_codex", None)
    lp = getattr(config, "llm_provider", None)
    return bool(
        oc
        and getattr(oc, "enabled", False)
        and config.image.openai.enabled
        and lp
        and getattr(lp, "active_provider", None) == "codex"
    )


def image_tool_available(config) -> bool:
    """Whether native Codex image generation should appear in the registry."""
    return _native_possible(config)


class ImageBackendSelector:
    def __init__(self, *, get_config: Callable, openai_backend) -> None:
        self.get_config = get_config
        self.openai = openai_backend  # OpenAIImageBackend | None

    def tool_available(self, config=None) -> bool:
        return image_tool_available(config or self.get_config())

    async def generate(self, *, prompt: str) -> ImageResult:
        config = self.get_config()
        native = self.openai is not None and _native_possible(config)
        if not native:
            raise ImageBackendUnavailableError(
                "Native OpenAI image generation requires the active Codex provider and "
                "enabled native image configuration"
            )
        res = await self.openai.generate(prompt=prompt)
        res.route = "auto_native"
        return res
