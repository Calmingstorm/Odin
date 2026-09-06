"""Exact source-local geometry. Desktop placement is deliberately not an action plane."""

import math
import re
from dataclasses import dataclass
from fractions import Fraction

MAX_SOURCE_DIMENSION = 1_000_000  # Metadata bound, NOT a source allocation budget.


class GeometryError(ValueError):
    pass


def rational(value) -> Fraction:
    if isinstance(value, bool) or not isinstance(value, (int, float, Fraction)):
        raise GeometryError("invalid_rational")
    if isinstance(value, float) and not math.isfinite(value):
        raise GeometryError("invalid_rational")
    result = Fraction(value)
    if max(abs(result.numerator).bit_length(), result.denominator.bit_length()) > 256:
        raise GeometryError("rational_too_large")
    return result


def opaque_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", value):
        raise GeometryError("invalid_opaque_identity")
    return value


def dimension(value):
    if type(value) is not int or not 1 <= value <= MAX_SOURCE_DIMENSION:
        raise GeometryError("invalid_source_dimension")
    return value


@dataclass(frozen=True, init=False)
class AffineTransform:
    """Pixel EDGE coordinates: (a*x+b*y+c, d*x+e*y+f). No rounding to input."""

    a: Fraction = Fraction(1)
    b: Fraction = Fraction(0)
    c: Fraction = Fraction(0)
    d: Fraction = Fraction(0)
    e: Fraction = Fraction(1)
    f: Fraction = Fraction(0)

    def __init__(self, a: int | float | Fraction = 1, b: int | float | Fraction = 0,
                 c: int | float | Fraction = 0, d: int | float | Fraction = 0,
                 e: int | float | Fraction = 1, f: int | float | Fraction = 0) -> None:
        for name, value in zip("abcdef", (a, b, c, d, e, f), strict=True):
            object.__setattr__(self, name, rational(value))
        if not self.a * self.e - self.b * self.d:
            raise GeometryError("singular_transform")

    def map_point(self, x, y):
        x, y = rational(x), rational(y)
        return (self.a*x + self.b*y + self.c, self.d*x + self.e*y + self.f)

    def compose(self, other):
        """Return self(other(point))."""
        return AffineTransform(
            self.a*other.a + self.b*other.d, self.a*other.b + self.b*other.e,
            self.a*other.c + self.b*other.f + self.c,
            self.d*other.a + self.e*other.d, self.d*other.b + self.e*other.e,
            self.d*other.c + self.e*other.f + self.f)

    def inverse(self):
        det = self.a*self.e - self.b*self.d
        return AffineTransform(self.e/det, -self.b/det, (self.b*self.f-self.e*self.c)/det,
                               -self.d/det, self.a/det, (self.d*self.c-self.a*self.f)/det)

    def public(self):
        return {name: [getattr(self, name).numerator, getattr(self, name).denominator]
                for name in "abcdef"}


def crop_transform(x, y, width, height, delivered_width, delivered_height, rotation=0):
    """Delivered raster edges -> source crop edges; clockwise delivered rotation."""
    for value in (width, height, delivered_width, delivered_height):
        dimension(value)
    if type(x) is not int or type(y) is not int or min(x, y) < 0:
        raise GeometryError("invalid_crop")
    if type(rotation) is not int or rotation not in (0, 90, 180, 270):
        raise GeometryError("invalid_rotation")
    sx, sy = Fraction(width, delivered_width), Fraction(height, delivered_height)
    if rotation == 0:
        return AffineTransform(sx, 0, x, 0, sy, y)
    if rotation == 180:
        return AffineTransform(-sx, 0, x+width, 0, -sy, y+height)
    sx, sy = Fraction(width, delivered_height), Fraction(height, delivered_width)
    if rotation == 90:
        return AffineTransform(0, sx, x, -sy, 0, y+height)
    return AffineTransform(0, -sx, x+width, sy, 0, y)


@dataclass(frozen=True)
class SourceGeometry:
    source_id: str
    source_revision: int
    consent_generation: int
    pixel_width: int
    pixel_height: int
    input_region_id: str | None = None
    input_width: Fraction | None = None
    input_height: Fraction | None = None
    pixel_to_input: AffineTransform | None = None
    rotation: int = 0

    def __post_init__(self):
        opaque_id(self.source_id)
        dimension(self.pixel_width)
        dimension(self.pixel_height)
        for value in (self.source_revision, self.consent_generation):
            if type(value) is not int or not 1 <= value < 2**63:
                raise GeometryError("invalid_generation")
        if type(self.rotation) is not int or self.rotation not in (0, 90, 180, 270):
            raise GeometryError("invalid_rotation")
        mapping = (self.input_region_id, self.input_width, self.input_height, self.pixel_to_input)
        if any(v is not None for v in mapping):
            if any(v is None for v in mapping):
                raise GeometryError("incomplete_input_mapping")
            opaque_id(self.input_region_id)
            if type(self.pixel_to_input) is not AffineTransform:
                raise GeometryError("invalid_input_mapping")
            for name in ("input_width", "input_height"):
                extent = rational(getattr(self, name))
                if not 0 < extent <= MAX_SOURCE_DIMENSION:
                    raise GeometryError("invalid_input_extent")
                object.__setattr__(self, name, extent)

    def input_point(self, delivered_to_source, x, y, delivered_width, delivered_height):
        """Delivered integer pixel INDEX -> continuous input at pixel CENTER."""
        if type(delivered_to_source) is not AffineTransform:
            raise GeometryError("invalid_capture_transform")
        dimension(delivered_width)
        dimension(delivered_height)
        if self.pixel_to_input is None:
            raise GeometryError("input_mapping_unknown")
        if type(x) is not int or type(y) is not int:
            raise GeometryError("pixel_index_required")
        if not (0 <= x < delivered_width and 0 <= y < delivered_height):
            raise GeometryError("outside_delivered_image")
        sx, sy = delivered_to_source.map_point(Fraction(2*x+1, 2), Fraction(2*y+1, 2))
        if not (0 <= sx < self.pixel_width and 0 <= sy < self.pixel_height):
            raise GeometryError("outside_source")
        ix, iy = self.pixel_to_input.map_point(sx, sy)
        if not (0 <= ix < self.input_width and 0 <= iy < self.input_height):
            raise GeometryError("outside_input_region")
        return ix, iy

    def public(self):
        def pair(v):
            return None if v is None else [v.numerator, v.denominator]
        return {"source_id": self.source_id, "source_revision": self.source_revision,
                "consent_generation": self.consent_generation,
                "pixel_width": self.pixel_width, "pixel_height": self.pixel_height,
                "input_region_id": self.input_region_id,
                "input_width": pair(self.input_width), "input_height": pair(self.input_height),
                "pixel_to_input": (
                    None if self.pixel_to_input is None else self.pixel_to_input.public()
                ),
                "rotation": self.rotation}
