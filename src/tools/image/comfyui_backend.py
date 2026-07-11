"""ComfyUI image backend — wraps the existing ComfyUIClient behind the seam."""

from __future__ import annotations

from collections.abc import Callable

from ...odin_log import get_logger
from ..comfyui import ComfyUIClient
from .base import (
    ImageBackend,
    ImageBackendUnavailableError,
    ImageResult,
    ImageTransportError,
    png_dimensions,
)

log = get_logger("image.comfyui")


def _parse_size(size: str | None, width: int | None, height: int | None) -> tuple[int, int]:
    """Resolve a WxH pair from an explicit size string or width/height args.

    Explicit width/height (a ComfyUI-only concept) win; otherwise parse the
    backend-neutral ``size`` string; default 1024x1024. Clamped to a sane range.
    """
    w, h = 1024, 1024
    if size and "x" in size:
        try:
            sw, sh = size.lower().split("x", 1)
            w, h = int(sw), int(sh)
        except ValueError:
            pass
    if width:
        w = int(width)
    if height:
        h = int(height)
    w = max(64, min(2048, w))
    h = max(64, min(2048, h))
    return w, h


class ComfyUIImageBackend(ImageBackend):
    name = "comfyui"

    def __init__(self, *, get_config: Callable) -> None:
        self.get_config = get_config

    async def generate(
        self,
        *,
        prompt: str,
        size: str | None = None,
        negative: str = "",
        model: str = "",
        width: int | None = None,
        height: int | None = None,
        **_ignored,
    ) -> ImageResult:
        config = self.get_config()
        if not config.comfyui.enabled:
            raise ImageBackendUnavailableError("ComfyUI is not enabled")

        w, h = _parse_size(size, width, height)
        client = ComfyUIClient(
            config.comfyui.url, default_checkpoint=config.comfyui.default_checkpoint
        )
        image_bytes = await client.generate(
            prompt=prompt, negative=negative, width=w, height=h, model=model
        )
        if not image_bytes:
            raise ImageTransportError("ComfyUI generation failed (unavailable or timed out)")

        dims = png_dimensions(image_bytes)
        aw, ah = dims if dims else (w, h)
        return ImageResult(
            data=image_bytes,
            mime="image/png",
            width=aw,
            height=ah,
            backend="comfyui",
            image_model=model or config.comfyui.default_checkpoint or "default",
        )
