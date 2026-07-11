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
    parse_size,
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

    @staticmethod
    def _resolve_size(size: str | None, width: int | None, height: int | None) -> str | None:
        """Canonical requested size (``WxH``) or None.

        Explicit ``size`` wins; otherwise legacy ``width``/``height`` (both
        required) are normalized. Malformed/one-sided/out-of-bounds inputs are
        rejected here so routing never guesses.
        """
        if size:
            try:
                dims = parse_size(size)
            except ValueError as e:
                raise ImageRequestError(str(e)) from e
            return f"{dims[0]}x{dims[1]}"  # type: ignore[index]
        if width is not None and height is not None:
            # Let parse_size do all validation — never int() raw input (a
            # non-integer would leak a ValueError; a float would truncate).
            try:
                dims = parse_size(f"{width}x{height}")
            except ValueError as e:
                raise ImageRequestError(str(e)) from e
            return f"{dims[0]}x{dims[1]}"  # type: ignore[index]
        if width is not None or height is not None:
            raise ImageRequestError("both width and height are required (or use size WxH)")
        return None

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

        req_size = self._resolve_size(size, width, height)
        # Only `negative` and a checkpoint `model` are genuinely ComfyUI-only.
        comfy_only = bool(negative) or bool(model)
        # Native ignores the requested size and picks its own dimensions, so ANY
        # explicit size is a request only ComfyUI can honor.
        has_size = req_size is not None

        async def _comfy(route: str, fallback_reason: str | None = None) -> ImageResult:
            if fallback_reason:
                log.info("image gen -> ComfyUI (%s: %s)", route, fallback_reason)
            res = await self.comfyui.generate(
                prompt=prompt, size=req_size, negative=negative, model=model
            )
            res.route = route
            res.fallback_reason = fallback_reason
            return res

        async def _native(route: str) -> ImageResult:
            res = await self.openai.generate(prompt=prompt)
            res.route = route
            return res

        if backend == "comfyui":
            if not comfy:
                raise ImageBackendUnavailableError("ComfyUI is not configured")
            return await _comfy("forced_comfyui")

        if backend == "openai":
            if comfy_only:
                raise ImageRequestError(
                    "negative/model are ComfyUI-only and not supported by the OpenAI backend"
                )
            if has_size:
                raise ImageRequestError(
                    "the OpenAI backend chooses its own dimensions and cannot honor a "
                    f"requested size ({req_size}); omit size or use ComfyUI"
                )
            if not native:
                raise ImageBackendUnavailableError(
                    "Native OpenAI image generation requires the Codex provider and credentials"
                )
            return await _native("forced_openai")

        # auto — the gate is whether an exact size (or ComfyUI-only field) was asked for
        if comfy_only:
            if comfy:
                return await _comfy("auto_comfy_features")
            raise ImageRequestError("negative/model require ComfyUI, which is not configured")
        if has_size:
            # Only ComfyUI honors an exact size — NEVER fall back to native, which
            # would ignore it and return arbitrary dimensions.
            if comfy:
                return await _comfy("auto_comfy_size")
            raise ImageBackendUnavailableError(
                f"the requested size {req_size} needs ComfyUI, which is unavailable; "
                "the OpenAI backend cannot honor a specific size"
            )
        if native:
            try:
                return await _native("auto_native")
            except ImageGenError as e:
                if e.pre_generation and comfy:
                    return await _comfy("auto_comfy_fallback", e.reason or "unavailable")
                raise
        if comfy:
            # native not available on this provider — ComfyUI is the only backend
            return await _comfy("auto_comfy_fallback")
        raise ImageBackendUnavailableError("No image backend is available")
