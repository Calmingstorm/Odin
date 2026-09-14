"""Local pointer-target raster checks, after exact source/focus revalidation.

Unrelated animation is not target movement. Compare a bounded neighbourhood of
the intended point; allow only a small changed-pixel footprint there, such as a
caret blink. This is visual stability evidence, not element semantics.
"""

from io import BytesIO

from .models import ComputerError
from .policy import FRAME_FRESH_SECONDS, observation_input

STROKE_OPERATIONS = frozenset({"drag", "polyline"})
POINTER_OPERATIONS = frozenset(
    {
        "click",
        "double_click",
        "right_click",
        "middle_click",
        "scroll",
        "replace_field_pixels",
        *STROKE_OPERATIONS,
    }
)
TARGET_RADIUS = 24
MAX_CHANGED_FRACTION = 0.02
MAX_CHANGED_PIXELS = 48
CHANNEL_TOLERANCE = 12


def native_keyboard_focus_trusted(grant, live, original, current, *, now):
    """Raster exemption only, never permission to dispatch or re-arm input.

    The native Hyprland adapter authenticates ownership, native focus and modal
    membership at capture, encoding their binding in source_revision. Require
    that actual adapter's current frame, not a backend/platform label supplied
    by another adapter. Exact geometry includes source, scope, focus and modal.
    Callers still enforce authorization, delivery, deadlines and native leases.
    """
    capabilities = live.capabilities
    if (
        capabilities is None
        or live.revoked
        or grant.environment != "existing_session"
        or capabilities.environment != grant.environment
        or capabilities.platform != grant.platform
        or original.geometry != current.geometry
        or not 0 <= now - current.captured_at <= FRAME_FRESH_SECONDS
    ):
        return False
    try:
        observation_input(grant, live, original)
        observation_input(grant, live, current)
    except ComputerError:
        return False
    if capabilities.platform == "x11":
        return True
    if capabilities.platform != "wayland" or capabilities.backend != "hyprland":
        return False
    from .runtime.hyprland_backend import HyprlandRuntimeBackend

    backend = live.backend
    if not isinstance(backend, HyprlandRuntimeBackend):
        return False
    frame = backend._frame
    scope = backend._scope
    return (
        not backend._paused
        and not backend._closed
        and not backend._release_failed
        and backend._owner_handle is not None
        and frame is not None
        and isinstance(scope, dict)
        and scope.get("authenticated") is True
        and scope.get("native_wayland") is True
        and scope.get("safe_focus") is True
        and frame.source == current.source
        and frame.scope == current.scope
        and frame.width == current.width
        and frame.height == current.height
        and frame.delivered_to_source == current.delivered_to_source
        and frame.focused is True
        and frame.modal == current.modal
        and frame.modal_kind == current.modal_kind
        and (current.modal is None or current.modal_kind == "safe_application")
    )


def pointer_anchor(action):
    """Delivered-image anchor checked once, BEFORE dispatch and button-down.

    A stroke changes its own canvas. Neither this raster comparison nor its
    neighbourhood tolerance belongs in the held-input loop. The native guardian
    still verifies the hit before pressing, source/focus during movement, and
    revocation, overlap, deadlines and unconditional owned-input release.
    """
    if action["operation"] in STROKE_OPERATIONS:
        return action["points"][0]
    if "region" in action:
        region = action["region"]
        return (region["x"] + (region["width"] - 1) // 2, region["y"] + (region["height"] - 1) // 2)
    return action["x"], action["y"]


def pointer_target_stable(before: bytes, after: bytes, x: int, y: int) -> bool:
    from PIL import Image, ImageChops

    try:
        with Image.open(BytesIO(before)) as old, Image.open(BytesIO(after)) as new:
            if old.size != new.size or not (0 <= x < old.width and 0 <= y < old.height):
                return False
            box = (
                max(0, x - TARGET_RADIUS),
                max(0, y - TARGET_RADIUS),
                min(old.width, x + TARGET_RADIUS + 1),
                min(old.height, y + TARGET_RADIUS + 1),
            )
            difference = ImageChops.difference(
                old.crop(box).convert("RGB"), new.crop(box).convert("RGB")
            )
            r, g, b = difference.split()
            maximum = ImageChops.lighter(ImageChops.lighter(r, g), b)
            changed = sum(maximum.histogram()[CHANNEL_TOLERANCE + 1 :])
            allowed = min(
                MAX_CHANGED_PIXELS, int(maximum.width * maximum.height * MAX_CHANGED_FRACTION)
            )
            return changed <= allowed
    except (OSError, ValueError):
        raise ComputerError("visual_target_unavailable") from None
