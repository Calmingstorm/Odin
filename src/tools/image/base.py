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


# One canonical dimension contract for BOTH backends — the range ComfyUI can
# actually honor. Requests outside it are rejected (never silently clamped,
# which would change the caller's aspect ratio).
MIN_DIM = 64
MAX_DIM = 2048


def parse_size(size: str | None) -> tuple[int, int] | None:
    """Parse a ``WxH`` size string to ``(width, height)``.

    Returns None for an omitted/empty size. Raises ValueError for a malformed,
    one-sided, non-integer, or out-of-range value so callers reject before
    routing rather than guess or clamp.
    """
    if not size:
        return None
    parts = str(size).strip().lower().split("x")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError(f"malformed size {size!r} (expected WxH)")
    try:
        width, height = int(parts[0]), int(parts[1])
    except ValueError:
        raise ValueError(f"malformed size {size!r} (expected integer WxH)") from None
    if not (MIN_DIM <= width <= MAX_DIM) or not (MIN_DIM <= height <= MAX_DIM):
        raise ValueError(
            f"size {size!r} out of range — each dimension must be {MIN_DIM}..{MAX_DIM}"
        )
    return (width, height)


def is_square_size(size: str | None) -> bool:
    """True when no size is given (unconstrained) or the requested size is square.

    Native OpenAI produces a backend-selected SQUARE image and ignores the
    requested size, so only square/unspecified requests can be honored there.
    """
    dims = parse_size(size)
    return dims is None or dims[0] == dims[1]


@dataclass
class ImageResult:
    """A generated image, ready for the tool layer to attach.

    Carries only non-sensitive metadata — never account identifiers, tokens,
    or raw provider payloads.
    """

    data: bytes
    mime: str
    width: int
    height: int
    backend: str  # "openai" | "comfyui"
    image_model: str


class ImageGenError(Exception):
    """Base image-generation failure.

    ``pre_generation`` is True only when generation is known NOT to have started
    (no accepted response / no generation event yet), so failing over to another
    account or falling back to ComfyUI cannot duplicate work or quota. Anything
    that happens after a 2xx or the first generation event is post-generation
    and must NOT be retried or fallen back.
    """

    pre_generation: bool = False


class ImageBackendUnavailableError(ImageGenError):
    """The backend is not configured/usable at all (structural)."""

    pre_generation = True


class ImageQuotaError(ImageGenError):
    """usage_limit_reached / account disabled / pool exhausted — account-scoped,
    pre-generation, eligible for failover and ComfyUI fallback."""

    pre_generation = True


class ImageTransportError(ImageGenError):
    """5xx / connection / protocol failure. Pre-generation only when it happened
    before an accepted response; a mid-stream break after 2xx is post-generation
    (constructed with ``pre_generation=False``)."""

    def __init__(self, message: str, *, pre_generation: bool = True) -> None:
        super().__init__(message)
        self.pre_generation = pre_generation


class ImageRequestError(ImageGenError):
    """Content-policy refusal, invalid parameters, or malformed image output.
    A property of the request/response itself — never turned into a ComfyUI
    fallback, which would silently bypass the selected service's semantics."""

    pre_generation = False


class ImageBackend(ABC):
    """A single image-generation backend."""

    name: str

    @abstractmethod
    async def generate(self, *, prompt: str, size: str | None = None, **opts) -> ImageResult:
        """Generate one image or raise an :class:`ImageGenError` subclass."""
        raise NotImplementedError
