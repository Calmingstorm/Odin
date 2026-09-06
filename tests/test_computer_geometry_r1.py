from dataclasses import replace
from fractions import Fraction as F  # noqa: N817 - Compact exact-rational test notation.

import pytest

from src.computer.geometry import AffineTransform as A
from src.computer.geometry import GeometryError, SourceGeometry, crop_transform


@pytest.mark.parametrize("rotation", [0, 90, 180, 270])
def test_rotated_pixel_centers_and_edge_roundtrip(rotation):
    dw, dh = (960, 540) if rotation in (0, 180) else (540, 960)
    transform = crop_transform(0, 0, 1920, 1080, dw, dh, rotation)
    source = SourceGeometry("source", 1, 1, 1920, 1080, "region", 1280, 720,
                            A(F(2, 3), 0, 0, 0, F(2, 3), 0), rotation)
    for x, y in [(0, 0), (dw-1, 0), (0, dh-1), (dw-1, dh-1)]:
        ix, iy = source.input_point(transform, x, y, dw, dh)
        assert 0 <= ix < 1280 and 0 <= iy < 720
    for point in [(0, 0), (dw, dh), (F(13, 7), F(17, 3))]:
        assert transform.inverse().map_point(*transform.map_point(*point)) == point


def test_reported_layout_and_negative_origins_are_not_action_plane():
    # Backend-private placement only: no global span or origin is passed to geometry.
    layout = [(1920,1080,2701,1440), (2560,1440,5360,0), (1920,1080,0,213),
              (1920,1080,-1920,-400)]
    for i, (w, h, origin_x, origin_y) in enumerate(layout):
        source = SourceGeometry(f"source-{i}", 1, 1, w, h, f"region-{i}", w, h, A())
        mapping = crop_transform(100, 100, 200, 100, 100, 50)
        assert source.input_point(mapping, 0, 0, 100, 50) == (101, 101)
        assert "origin_x" not in source.public()
        with pytest.raises(GeometryError):
            source.input_point(mapping, 4000, 0, 100, 50)  # monitor gaps aren't pixels


@pytest.mark.parametrize("value", [True, float("nan"), float("inf"), "1", 2**300])
def test_invalid_rational(value):
    with pytest.raises(GeometryError):
        A(a=value)


def test_unknown_mapping_and_revisions():
    source = SourceGeometry("source", 1, 1, 3840, 2160)
    with pytest.raises(GeometryError, match="input_mapping_unknown"):
        source.input_point(A(), 0, 0, 3840, 2160)
    assert source != replace(source, source_revision=2)
    assert source != replace(source, source_id="replacement")
    assert source != replace(source, consent_generation=2)
    with pytest.raises(GeometryError):
        replace(source, source_revision=2**63)


def test_mapping_requires_valid_rational_and_bounds():
    with pytest.raises(GeometryError, match="singular"):
        A(0,0,0,0,0,0)
    source = SourceGeometry("source", 1, 1, 100, 100, "region", 100, 100, A())
    for point in [(-1, 0), (100, 0), (0.5, 0), (True, 0)]:
        with pytest.raises(GeometryError):
            source.input_point(A(), *point, 100, 100)
