"""Local pointer-target raster checks, after exact source/focus revalidation.

Unrelated animation is not target movement. Compare a bounded neighbourhood of
the intended point; allow only a small changed-pixel footprint there, such as a
caret blink. This is visual stability evidence, not element semantics.
"""
from io import BytesIO

from .models import ComputerError

POINTER_OPERATIONS = frozenset({"click", "double_click", "right_click", "middle_click", "scroll"})
TARGET_RADIUS = 24
MAX_CHANGED_FRACTION = .02
MAX_CHANGED_PIXELS = 48
CHANNEL_TOLERANCE = 12


def pointer_target_stable(before: bytes, after: bytes, x: int, y: int) -> bool:
    from PIL import Image, ImageChops

    try:
        with Image.open(BytesIO(before)) as old, Image.open(BytesIO(after)) as new:
            if old.size != new.size or not (0 <= x < old.width and 0 <= y < old.height):
                return False
            box = (max(0, x - TARGET_RADIUS), max(0, y - TARGET_RADIUS),
                   min(old.width, x + TARGET_RADIUS + 1),
                   min(old.height, y + TARGET_RADIUS + 1))
            difference = ImageChops.difference(old.crop(box).convert("RGB"),
                                               new.crop(box).convert("RGB"))
            r, g, b = difference.split()
            maximum = ImageChops.lighter(ImageChops.lighter(r, g), b)
            changed = sum(maximum.histogram()[CHANNEL_TOLERANCE + 1:])
            allowed = min(MAX_CHANGED_PIXELS,
                          int(maximum.width * maximum.height * MAX_CHANGED_FRACTION))
            return changed <= allowed
    except (OSError, ValueError):
        raise ComputerError("visual_target_unavailable") from None
