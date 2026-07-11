"""Backend selection + the structural availability check used for tool visibility.

Availability is STRUCTURAL (config + active provider) so the tool definition does
not appear/disappear on transient health (a cooling-down account, an offline
ComfyUI, an open breaker). Only a provider/config change flips it — and that
rebuilds the registry + system prompt.
"""

from __future__ import annotations

from collections.abc import Callable

from ...odin_log import get_logger
from .base import (
    ImageBackendUnavailableError,
    ImageGenError,
    ImageRequestError,
    ImageResult,
)

log = get_logger("image.selector")


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


def _comfy_possible(config) -> bool:
    comfy = getattr(config, "comfyui", None)
    return bool(comfy and getattr(comfy, "enabled", False))


def image_tool_available(config) -> bool:
    """Whether the image tool should appear in the registry for this config.

    - ``openai``: only when native is available (Codex provider + creds).
    - ``comfyui``: only when ComfyUI is configured.
    - ``auto``: whenever EITHER is available — so Kimi with no ComfyUI hides it.
    """
    backend = config.image.backend
    if backend == "openai":
        return _native_possible(config)
    if backend == "comfyui":
        return _comfy_possible(config)
    return _native_possible(config) or _comfy_possible(config)


class ImageBackendSelector:
    def __init__(self, *, get_config: Callable, openai_backend, comfyui_backend) -> None:
        self.get_config = get_config
        self.openai = openai_backend  # OpenAIImageBackend | None
        self.comfyui = comfyui_backend  # ComfyUIImageBackend

    def tool_available(self, config=None) -> bool:
        return image_tool_available(config or self.get_config())

    async def generate(
        self,
        *,
        prompt: str,
        size: str | None = None,
        negative: str = "",
        model: str = "",
        width: int | None = None,
        height: int | None = None,
    ) -> ImageResult:
        config = self.get_config()
        backend = config.image.backend
        native = self.openai is not None and _native_possible(config)
        comfy = _comfy_possible(config)
        # ComfyUI-only concepts. Their presence routes to ComfyUI in auto and is
        # rejected (never silently ignored) under the OpenAI backend.
        wants_comfy_features = (
            bool(negative) or bool(model) or width is not None or height is not None
        )

        if backend == "comfyui":
            if not comfy:
                raise ImageBackendUnavailableError("ComfyUI is not configured")
            return await self.comfyui.generate(
                prompt=prompt, size=size, negative=negative, model=model, width=width, height=height
            )

        if backend == "openai":
            if wants_comfy_features:
                raise ImageRequestError(
                    "negative/model/width/height are ComfyUI-only and not supported "
                    "by the OpenAI backend"
                )
            if not native:
                raise ImageBackendUnavailableError(
                    "Native OpenAI image generation requires the Codex provider and credentials"
                )
            return await self.openai.generate(prompt=prompt, size=size)

        # auto — follow the active provider, with ComfyUI as the pre-generation fallback
        if wants_comfy_features:
            if comfy:
                return await self.comfyui.generate(
                    prompt=prompt,
                    size=size,
                    negative=negative,
                    model=model,
                    width=width,
                    height=height,
                )
            raise ImageRequestError(
                "negative/model/width/height require ComfyUI, which is not configured"
            )
        if native:
            try:
                return await self.openai.generate(prompt=prompt, size=size)
            except ImageGenError as e:
                if e.pre_generation and comfy:
                    log.info(
                        "Native image gen unavailable (%s); falling back to ComfyUI",
                        type(e).__name__,
                    )
                    return await self.comfyui.generate(prompt=prompt, size=size)
                raise
        if comfy:
            return await self.comfyui.generate(prompt=prompt, size=size)
        raise ImageBackendUnavailableError("No image backend is available")
