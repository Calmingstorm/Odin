"""Native image generation + the structural availability check used for visibility.

Availability is STRUCTURAL (config + Codex authentication) so the tool definition does
not appear/disappear on transient health (a cooling-down account or open
breaker). Only a provider/config change flips it — and that
rebuilds the registry + system prompt.
"""

from __future__ import annotations

from collections.abc import Callable

from .base import ImageBackendUnavailableError, ImageResult


def _native_possible(config) -> bool:
    """Native image generation rides Codex auth, not the chat provider."""
    oc = getattr(config, "openai_codex", None)
    return bool(
        oc
        and getattr(oc, "enabled", False)
        and config.image.openai.enabled
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
        native = self.openai is not None and _native_possible(config) and (
            not hasattr(self.openai, "is_configured") or self.openai.is_configured()
        )
        if not native:
            raise ImageBackendUnavailableError(
                "Native OpenAI image generation requires enabled, authenticated Codex "
                "image configuration"
            )
        res = await self.openai.generate(prompt=prompt)
        res.route = "auto_native"
        return res
