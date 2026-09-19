"""Native image generation over the Codex OAuth backend.

The backend returns an :class:`ImageResult` and never touches Discord —
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
    png_dimensions,
)
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
    "OpenAIImageBackend",
    "png_dimensions",
]
