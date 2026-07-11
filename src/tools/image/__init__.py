"""Image-generation backends.

A backend-neutral seam so the image tool can target either native OpenAI
(over the Codex OAuth backend) or ComfyUI, selected by config + active
provider. Backends return an :class:`ImageResult` and never touch Discord —
the native tool layer owns attachment posting, keeping backends reusable from
the Web/API surface.
"""

from __future__ import annotations

from .base import (
    ImageBackend,
    ImageBackendUnavailableError,
    ImageGenError,
    ImageQuotaError,
    ImageRequestError,
    ImageResult,
    ImageTransportError,
    is_square_size,
    parse_size,
    png_dimensions,
)
from .comfyui_backend import ComfyUIImageBackend
from .openai_backend import OpenAIImageBackend
from .selector import ImageBackendSelector

__all__ = [
    "ImageBackend",
    "ImageBackendSelector",
    "ImageBackendUnavailableError",
    "ImageGenError",
    "ImageQuotaError",
    "ImageRequestError",
    "ImageResult",
    "ImageTransportError",
    "ComfyUIImageBackend",
    "OpenAIImageBackend",
    "is_square_size",
    "parse_size",
    "png_dimensions",
]
