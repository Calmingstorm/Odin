"""ComfyUI image backend — wraps the existing ComfyUIClient behind the seam."""

from __future__ import annotations

from collections.abc import Callable

from ...odin_log import get_logger
from ..comfyui import ComfyUIClient
from .base import (
    ImageBackend,
    ImageBackendUnavailableError,
    ImageRequestError,
    ImageResult,
    ImageTransportError,
    parse_size,
    png_dimensions,
)

log = get_logger("image.comfyui")


def _resolve_size(size: str | None, width: int | None, height: int | None) -> tuple[int, int]:
    """Resolve a WxH pair, defaulting to 1024x1024.

    Uses the ONE canonical contract (``parse_size``) shared with the selector —
    out-of-range values are rejected, never clamped, so an accepted request's
    aspect ratio is never silently altered. Raises ValueError on invalid input.
    """
    dims = parse_size(size)
    if dims is None and width is not None and height is not None:
        dims = parse_size(f"{width}x{height}")
    return dims if dims is not None else (1024, 1024)


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

        try:
            w, h = _resolve_size(size, width, height)
        except ValueError as e:
            raise ImageRequestError(str(e)) from e
        client = ComfyUIClient(
            config.comfyui.url, default_checkpoint=config.comfyui.default_checkpoint
        )
        image_bytes = await client.generate(
            prompt=prompt, negative=negative, width=w, height=h, model=model
        )
        if not image_bytes:
            raise ImageTransportError("ComfyUI generation failed (unavailable or timed out)")

        # Report DECODED dimensions — never substitute the request. Invalid /
        # non-PNG output is rejected, not posted with a fabricated size.
        dims = png_dimensions(image_bytes)
        if dims is None:
            raise ImageTransportError(
                "ComfyUI returned invalid (non-PNG) image data", pre_generation=False
            )
        return ImageResult(
            data=image_bytes,
            mime="image/png",
            width=dims[0],
            height=dims[1],
            backend="comfyui",
            image_model=model or config.comfyui.default_checkpoint or "default",
        )
