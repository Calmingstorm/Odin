"""Pixel-grounding tests for the disposable guest controller harness."""
import importlib.util
import io
from pathlib import Path

import pytest
from PIL import Image, ImageDraw


def load():
    path = (Path(__file__).resolve().parents[1]
            / "scripts/computer-feasibility/hyprland-autoload-lab.py")
    spec = importlib.util.spec_from_file_location("autoload_lab", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def png(image):
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def test_receiver_point_is_derived_from_pixels():
    image = Image.new("RGB", (800, 600))
    ImageDraw.Draw(image).rectangle((37, 91, 237, 391), fill=(40, 91, 121))
    assert load().receiver_point(png(image)) == (87, 166, (37, 91, 238, 392))


def test_receiver_point_refuses_absent_receiver():
    with pytest.raises(AssertionError, match="absent"):
        load().receiver_point(png(Image.new("RGB", (800, 600))))


def test_receiver_point_refuses_disconnected_matching_regions():
    image = Image.new("RGB", (800, 600))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 110, 110), fill=(40, 91, 121))
    draw.rectangle((600, 400, 710, 510), fill=(40, 91, 121))
    with pytest.raises(AssertionError):
        load().receiver_point(png(image))
