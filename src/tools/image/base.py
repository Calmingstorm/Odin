"""Backend-neutral image-generation contract."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def png_dimensions(data: bytes) -> tuple[int, int] | None:
    """(width, height) from a PNG's IHDR, or None if not a valid PNG.

    Also serves as the magic-byte check — the decoded bytes must actually be a
    PNG before we ever attach or report dimensions.
    """
    if len(data) < 24 or data[:8] != _PNG_MAGIC or data[12:16] != b"IHDR":
        return None
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    if width <= 0 or height <= 0:
        return None
    return width, height


@dataclass
class ImageResult:
    """A generated image, ready for the tool layer to attach.

    Carries only non-sensitive metadata — never account identifiers, tokens,
    or raw provider payloads. ``route``/``fallback_reason`` are stamped by the
    selector for the audit record.
    """

    data: bytes
    mime: str
    width: int
    height: int
    backend: str  # "openai"
    image_model: str
    route: str = ""  # stable enum: auto_native (selector-set)
    fallback_reason: str | None = None  # retained for audit-shape compatibility


class ImageGenError(Exception):
    """Base image-generation failure.

    ``pre_generation`` is True only when generation is known NOT to have started
    (no accepted response / no generation event yet), so failing over to another
    account cannot duplicate work or quota. Anything
    that happens after a 2xx or the first generation event is post-generation
    and must NOT be retried or fallen back.

    ``reason`` is a stable enum (quota / account_unavailable / pool_exhausted /
    pre_response_transport) recorded as the audit fallback_reason — never raw
    exception text.
    """

    pre_generation: bool = False
    reason: str | None = None

    def __init__(self, message: str = "", *, reason: str | None = None) -> None:
        super().__init__(message)
        if reason is not None:
            self.reason = reason


class ImageBackendUnavailableError(ImageGenError):
    """The backend is not configured/usable at all (structural)."""

    pre_generation = True


class ImageQuotaError(ImageGenError):
    """usage_limit_reached / account disabled / pool exhausted — account-scoped
    and pre-generation, so eligible for account failover."""

    pre_generation = True


class ImageTransportError(ImageGenError):
    """5xx / connection / protocol failure. Pre-generation only when it happened
    before an accepted response; a mid-stream break after 2xx is post-generation
    (constructed with ``pre_generation=False``)."""

    def __init__(
        self, message: str, *, pre_generation: bool = True, reason: str | None = None
    ) -> None:
        super().__init__(message, reason=reason)
        self.pre_generation = pre_generation


class ImageRequestError(ImageGenError):
    """Content-policy refusal, invalid parameters, or malformed image output."""

    pre_generation = False


class ImageBackend(ABC):
    """A single image-generation backend."""

    name: str

    @abstractmethod
    async def generate(self, *, prompt: str, size: str | None = None, **opts) -> ImageResult:
        """Generate one image or raise an :class:`ImageGenError` subclass."""
        raise NotImplementedError
