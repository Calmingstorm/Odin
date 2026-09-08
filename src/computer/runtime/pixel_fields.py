"""Explicit pixel-only replacement, never a substitute for AT-SPI identity.

The guardian owns dispatch/release. This module only constructs a fully
preflighted bounded plan; importing it cannot issue native input.
"""


def pixel_field_steps(action, native, *, error):
    """Resolve ALL keys before any input, including clearing an empty value."""
    region, text = action.get("region"), action.get("text")
    if (
        type(region) is not dict
        or set(region) != {"x", "y", "width", "height"}
        or any(type(v) is not int for v in region.values())
        or region["width"] < 1
        or region["height"] < 1
    ):
        raise error("invalid_point")
    if (
        type(text) is not str
        or len(text) > 512
        or any(ord(c) < 32 or 127 <= ord(c) <= 159 or 0xD800 <= ord(c) <= 0xDFFF for c in text)
    ):
        raise error("invalid_text")
    x = region["x"] + (region["width"] - 1) // 2
    y = region["y"] + (region["height"] - 1) // 2
    chords = [native.key_plan(("ctrl",), "a")]
    chords += native.text_keys(text) if text else [native.key_plan((), "BackSpace")]
    return [("move", x, y), ("button", 1, True), ("button", 1, False), ("wait", 0.05)] + [
        event
        for chord in chords
        for event in (
            [("key", code, True) for code in chord]
            + [("key", code, False) for code in reversed(chord)]
        )
    ]


def pixel_field_bounds(action, expected, monitor, *, error):
    """Whole supplied field must be inside the exact observed focused window."""
    region = action["region"]
    x, y, width, height = (region[k] for k in ("x", "y", "width", "height"))
    for left, top, w, h in (
        expected["rect"],
        (monitor.x, monitor.y, monitor.width, monitor.height),
    ):
        if not (left <= x and top <= y and x + width <= left + w and y + height <= top + h):
            raise error("point_outside_application")
