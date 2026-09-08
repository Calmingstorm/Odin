"""Offline source-local rendering, not capture, consent or input authority.

Only owned packed RGB/RGBA bytes are accepted. Lazy Pillow sees only the bounded
DELIVERED raster, never a source-sized image or an arbitrary encoded file.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import Literal, cast

from .geometry import MAX_SOURCE_DIMENSION, SourceGeometry
from .vision import MAX_FRAME_PIXELS, MAX_PNG_BYTES, FrameCrop, FrameMetadata, VisionError

MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_ENCODE_ATTEMPTS = 3
DEFAULT_SIZE = (1600, 1000)


class RenderError(VisionError):
    """Static pixel-free capability or resource failure."""


def _image_module():
    try:
        from PIL import Image
    except (ImportError, OSError):
        raise RenderError("render_dependency_unavailable: Pillow required") from None
    return Image


def compact_sequence_receipt(receipt: dict) -> dict:
    """Bound presentation duplication, never rewrite stored per-action evidence.

    The store retains complete execution, provenance and measured postconditions
    for every reserved action. A sequence's tool response needs each step's
    outcome and evidence reference, not eight repeated session/provenance trees.
    Non-sequence receipts remain structurally unchanged.
    """
    verification = receipt.get("verification", {})
    if verification.get("type") != "sequence" or "steps" not in verification:
        return receipt
    summaries = []
    for step in verification["steps"]:
        measured = step.get("verification", {})
        continued_stroke = (
            step.get("status") == "executed"
            and measured.get("continuation_accepted") is True
            and measured.get("visual_review_required") is True
            and measured.get("semantic_mark_verified") is False
        )
        if step.get("status") != "verified" and not continued_stroke:
            # Failures are uncommon and safety-critical: retain diagnostics and
            # uncertainty fields, dropping only duplicated session/provenance.
            summaries.append(
                {
                    key: value
                    for key, value in step.items()
                    if key not in {"session_id", "application_provenance"}
                }
            )
            continue
        summary = {
            key: step[key]
            for key in ("action_id", "status", "reason", "execution", "observation_id")
            if key in step
        }
        summary["verification"] = {
            key: measured[key]
            for key in (
                "type",
                "status",
                "scope",
                "evidence_id",
                "reason",
                "next_action",
                "semantic_mark_verified",
                "continuation_accepted",
                "visual_review_required",
            )
            if key in measured
        }
        if continued_stroke:
            summary["verification"]["path_evidence"] = {
                key: measured["path_evidence"][key]
                for key in (
                    "continuation_supported",
                    "interior_samples_changed",
                    "interior_samples",
                )
                if key in measured.get("path_evidence", {})
            }
        summaries.append(summary)
    return {
        **receipt,
        "verification": {
            **verification,
            "steps": summaries,
            "step_detail": "summary_only_full_evidence_retained",
        },
    }


def renderer_available() -> bool:
    """Explicit dependency probe; importing this module does not probe."""
    try:
        _image_module()
    except RenderError:
        return False
    return True


def source_allocation_bytes(width: int, height: int, mode: str) -> int:
    """Backend preflight BEFORE allocating packed source bytes (no row padding).

    Limit covers the owned packed raster, not total process RSS. Backends must
    separately bound capture buffers and account for native format and stride.
    """
    if any(type(v) is not int or not 1 <= v <= MAX_SOURCE_DIMENSION for v in (width, height)):
        raise RenderError("invalid_source_dimensions")
    if type(mode) is not str or mode not in ("RGB", "RGBA"):
        raise RenderError("unsupported_raster_mode")
    size = width * height * len(mode)
    if size > MAX_SOURCE_BYTES:
        raise RenderError("source_allocation_limit")
    return size


@dataclass(frozen=True)
class RenderedFrame:
    png: bytes = field(repr=False)
    metadata: FrameMetadata
    encode_attempts: int


class _OutputLimitError(Exception):
    pass


class _CappedPNG(BytesIO):
    def write(self, data):
        if self.tell() + len(data) > MAX_PNG_BYTES:
            raise _OutputLimitError
        return super().write(data)


def _dimensions(width, height, numerator, denominator):
    # Exactly FrameMetadata's half-up uniform resize, not Python round().
    return tuple((2 * d * numerator + denominator) // (2 * denominator) for d in (width, height))


def _scale(width, height, max_size):
    if (
        type(max_size) is not tuple
        or len(max_size) != 2
        or any(type(v) is not int or not 1 <= v <= MAX_SOURCE_DIMENSION for v in max_size)
    ):
        raise RenderError("invalid_delivered_bounds")
    denominator = max(width, height)
    lo, hi = 0, denominator
    # <=20 steps given MAX_SOURCE_DIMENSION, even for extreme aspect ratios.
    while lo < hi:
        mid = (lo + hi + 1) // 2
        w, h = _dimensions(width, height, mid, denominator)
        if w <= max_size[0] and h <= max_size[1] and w * h <= MAX_FRAME_PIXELS:
            lo = mid
        else:
            hi = mid - 1
    if not lo or min(_dimensions(width, height, lo, denominator)) < 1:
        raise RenderError("aspect_ratio_cannot_fit_delivered_bounds")
    return lo, denominator


def _sample(pixels, mode, frame):
    """Nearest source pixel at each exact mapped delivered center (ties floor).

    Direct packed-byte sampling avoids a 4-byte/pixel Pillow RGB source
    allocation, full-source rotation, and full-source crop intermediates.
    """
    channels = len(mode)
    stride = frame.source_width * channels
    r = frame.source_rectangle
    dw, dh = frame.width, frame.height

    def forward(count, extent):
        return [(2 * i + 1) * extent // (2 * count) for i in range(count)]

    def reverse(count, extent):
        return [(2 * count * extent - (2 * i + 1) * extent) // (2 * count) for i in range(count)]

    if frame.rotation in (0, 180):
        axis = forward if frame.rotation == 0 else reverse
        columns = [x * channels for x in axis(dw, r.width)]
        rows = [y * stride for y in axis(dh, r.height)]
    else:
        xaxis, yaxis = (reverse, forward) if frame.rotation == 90 else (forward, reverse)
        columns = [y * stride for y in xaxis(dw, r.height)]
        rows = [x * channels for x in yaxis(dh, r.width)]
    origin = r.y * stride + r.x * channels
    delivered = bytearray(dw * dh * channels)
    target = 0
    for row in rows:
        for column in columns:
            offset = origin + row + column
            delivered[target : target + channels] = pixels[offset : offset + channels]
            target += channels
    return delivered


def render_frame(
    pixels: bytes,
    source: SourceGeometry,
    *,
    mode: str,
    observation_id: str,
    session_id: str,
    generation: int,
    captured_monotonic_ns: int,
    crop: FrameCrop | None = None,
    rotation: int = 0,
    max_size: tuple[int, int] = DEFAULT_SIZE,
) -> RenderedFrame:
    """Render one source overview or local detail, crop then rotate clockwise.

    ``rotation`` is requested raster rotation, NOT an implicit replay of
    SourceGeometry.rotation. Pixels must match the supplied source raster extent.
    Overview/detail must share the caller's immutable capture identity. No decode,
    display discovery, global origin, file access, or authority grant.
    """
    if type(source) is not SourceGeometry:
        raise RenderError("source_geometry_required")
    expected = source_allocation_bytes(source.pixel_width, source.pixel_height, mode)
    if type(pixels) is not bytes or len(pixels) != expected:
        raise RenderError("invalid_packed_raster")
    if crop is not None and (
        type(crop) is not FrameCrop
        or crop.x + crop.width > source.pixel_width
        or crop.y + crop.height > source.pixel_height
    ):
        raise RenderError("invalid_source_crop")
    if type(rotation) is not int or rotation not in (0, 90, 180, 270):
        raise RenderError("invalid_render_rotation")
    rectangle = crop or FrameCrop(0, 0, source.pixel_width, source.pixel_height)
    width, height = rectangle.width, rectangle.height
    if rotation in (90, 270):
        width, height = height, width
    numerator, denominator = _scale(width, height, max_size)
    for attempt in range(1, MAX_ENCODE_ATTEMPTS + 1):
        dw, dh = _dimensions(width, height, numerator, denominator)
        if not numerator or min(dw, dh) < 1:
            raise RenderError("aspect_ratio_cannot_fit_png_budget")
        # Validate provenance and delivered geometry BEFORE image allocations.
        frame = FrameMetadata(
            observation_id=observation_id,
            session_id=session_id,
            generation=generation,
            captured_monotonic_ns=captured_monotonic_ns,
            source_id=source.source_id,
            source_revision=source.source_revision,
            consent_generation=source.consent_generation,
            source_width=source.pixel_width,
            source_height=source.pixel_height,
            width=dw,
            height=dh,
            kind="full" if crop is None else "crop",
            crop=crop,
            rotation=cast(Literal[0, 90, 180, 270], rotation),
            resize_scale=(numerator, denominator),
            resize_rounding="nearest",
        )
        image_module = _image_module()
        try:
            raster = _sample(pixels, mode, frame)
            with image_module.frombytes(mode, (dw, dh), raster) as image:
                del raster
                with _CappedPNG() as output:
                    # New image has no inherited text/profile/EXIF/animation.
                    image.save(output, format="PNG", optimize=False, compress_level=6)
                    return RenderedFrame(output.getvalue(), frame, attempt)
        except _OutputLimitError:
            # Resample ORIGINAL pixels; never enlarge or iteratively blur a retry.
            numerator //= 2
        except (OSError, ValueError, MemoryError):
            raise RenderError("raster_render_failed") from None
    raise RenderError("png_budget_unachievable")
