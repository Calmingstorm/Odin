"""Real colored raster tests and native HTTP payloads; no desktop or network."""
import base64
import builtins
import json
import random
import subprocess
import sys
from fractions import Fraction
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer import render
from src.computer.geometry import SourceGeometry
from src.computer.vision import (
    MAX_FRAME_PIXELS,
    MAX_PNG_BYTES,
    FrameCrop,
    VisionError,
    frame_summary,
    observation_image,
    plan_model_frames,
)


def source(width, height):
    return SourceGeometry("source_1", 2, 3, width, height)


def rendered(pixels, geometry, **kwargs):
    return render.render_frame(
        pixels, geometry, observation_id="obs_1", session_id="session_1",
        generation=1, captured_monotonic_ns=1234, **kwargs,
    )


def decode(result):
    image_module = pytest.importorskip("PIL.Image")
    with image_module.open(BytesIO(result.png)) as image:
        image.load()
        return image.copy()


def message(result):
    image = observation_image(result.png, result.metadata)
    return {"role": "user", "content": [image["__image_block__"],
                                         {"type": "text", "text": image["__prompt__"]}]}


def test_import_is_lazy_and_no_native_display_dependencies():
    code = """
import sys
import src.computer.render
assert not any(m == 'PIL' or m.startswith(('PIL.', 'gi.', 'Xlib.', 'pyatspi', 'aiohttp'))
               for m in sys.modules)
"""
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_missing_dependency_explicit_and_pixel_free(monkeypatch):
    original = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "PIL":
            raise ImportError("secret bytes must not escape")
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    assert not render.renderer_available()
    with pytest.raises(render.RenderError,
                       match="^render_dependency_unavailable: Pillow required$"):
        rendered(b"abc", source(1, 1), mode="RGB")


@pytest.mark.parametrize("width,height,mode", [
    (1920, 1080, "RGB"), (2560, 1440, "RGBA"), (3840, 2160, "RGBA"),
    (7920, 2520, "RGB"),
])
def test_actual_monitor_overview_pixels_and_full_resolution_detail(width, height, mode):
    pytest.importorskip("PIL.Image")
    # Synthetic ONE SOURCE, never the bounding plane of multiple monitor grants.
    colors = [bytes((255, 0, 0, 255)[:len(mode)]), bytes((0, 255, 0, 180)[:len(mode)]),
              bytes((0, 0, 255, 120)[:len(mode)]), bytes((255, 255, 0, 60)[:len(mode)])]
    half = width // 2
    top = colors[0] * half + colors[1] * (width - half)
    bottom = colors[2] * half + colors[3] * (width - half)
    pixels = top * (height // 2) + bottom * (height - height // 2)
    assert len(pixels) == render.source_allocation_bytes(width, height, mode)
    geometry = source(width, height)
    overview = rendered(pixels, geometry, mode=mode)
    m = overview.metadata
    assert m.width * m.height <= MAX_FRAME_PIXELS
    assert m.width < width and m.height < height
    assert m.delivered_to_source.map_point(m.width, m.height) == (width, height)
    with decode(overview) as image:
        positions = [(m.width // 4, m.height // 4), (3 * m.width // 4, m.height // 4),
                     (m.width // 4, 3 * m.height // 4),
                     (3 * m.width // 4, 3 * m.height // 4)]
        assert [image.getpixel(p) for p in positions] == [tuple(c) for c in colors]
    crop = FrameCrop(width // 2 - 80, height // 2 - 45, 160, 90)
    detail = rendered(pixels, geometry, mode=mode, crop=crop)
    assert (detail.metadata.width, detail.metadata.height) == (160, 90)
    assert detail.metadata.resize_scale[0] == detail.metadata.resize_scale[1]
    with decode(detail) as image:
        assert image.getpixel((0, 0)) == tuple(colors[0])
        assert image.getpixel((159, 89)) == tuple(colors[3])
    assert plan_model_frames([message(overview), message(detail)]).frame_count == 2


@pytest.mark.parametrize("rotation", [0, 90, 180, 270])
@pytest.mark.parametrize("mode", ["RGB", "RGBA"])
def test_every_colored_pixel_matches_exact_rotated_crop_mapping(rotation, mode):
    pytest.importorskip("PIL.Image")
    width, height = 19, 13
    colors = [tuple((x * 11, y * 17, (x + y) * 7, 50 + x + y)[:len(mode)])
              for y in range(height) for x in range(width)]
    pixels = bytes(channel for color in colors for channel in color)
    result = rendered(pixels, source(width, height), mode=mode, rotation=rotation,
                      crop=FrameCrop(3, 2, 13, 9), max_size=(8, 8))
    m = result.metadata
    # Odd dimensions force half-up rounding and unequal effective axis ratios.
    assert m.width * m.height < 13 * 9
    with decode(result) as image:
        for y in range(m.height):
            for x in range(m.width):
                center = (Fraction(2 * x + 1, 2), Fraction(2 * y + 1, 2))
                sx, sy = m.delivered_to_source.map_point(*center)
                assert image.getpixel((x, y)) == colors[int(sy) * width + int(sx)]
                assert m.delivered_to_source.inverse().map_point(sx, sy) == center
    observation_image(result.png, m)


def test_random_rgba_png_forces_bounded_further_downsampling():
    pytest.importorskip("PIL.Image")
    pixels = random.Random(741).randbytes(2000 * 1000 * 4)
    result = rendered(pixels, source(2000, 1000), mode="RGBA", max_size=(2000, 1000))
    assert 1 < result.encode_attempts <= render.MAX_ENCODE_ATTEMPTS
    assert len(result.png) <= MAX_PNG_BYTES
    assert result.metadata.width * result.metadata.height < 2_000_000
    with decode(result) as image:
        for x, y in [(0, 0), (100, 100), (image.width - 1, image.height - 1)]:
            sx, sy = result.metadata.delivered_to_source.map_point(
                Fraction(2 * x + 1, 2), Fraction(2 * y + 1, 2))
            offset = (int(sy) * 2000 + int(sx)) * 4
            assert image.getpixel((x, y)) == tuple(pixels[offset:offset + 4])
    observation_image(result.png, result.metadata)


def test_encoded_sink_cannot_exceed_cap():
    with render._CappedPNG() as sink:
        sink.write(b"x" * MAX_PNG_BYTES)
        with pytest.raises(render._OutputLimitError):
            sink.write(b"secret")
        assert sink.tell() == MAX_PNG_BYTES


def test_retry_loop_is_finite(monkeypatch):
    calls = []

    def unavailable(*args):
        calls.append(1)
        raise render._OutputLimitError

    monkeypatch.setattr(render, "_image_module", lambda: object())
    monkeypatch.setattr(render, "_sample", unavailable)
    with pytest.raises(render.RenderError, match="png_budget_unachievable"):
        rendered(b"abc" * 64 * 64, source(64, 64), mode="RGB")
    assert len(calls) == render.MAX_ENCODE_ATTEMPTS


@pytest.mark.parametrize("width,height,mode", [
    (True, 10, "RGB"), (10.0, 10, "RGB"), (0, 10, "RGB"), (-1, 10, "RGB"),
    (10, 1_000_001, "RGB"), (10, 10, "L"), (10, 10, ["RGB"]),
    (4096, 4097, "RGBA"), (7920, 2520, "RGBA"),
])
def test_source_preflight_refuses_before_allocation(width, height, mode):
    with pytest.raises(render.RenderError):
        render.source_allocation_bytes(width, height, mode)


def test_exact_source_cap_and_pillow_never_gets_large_source(monkeypatch):
    assert render.source_allocation_bytes(4096, 4096, "RGBA") == 64 * 1024 * 1024
    monkeypatch.setattr(render, "_image_module", lambda: pytest.fail("must reject first"))
    with pytest.raises(render.RenderError, match="source_allocation_limit"):
        rendered(b"", source(4096, 4097), mode="RGBA")


def test_pillow_only_allocates_the_delivered_raster(monkeypatch):
    image_module = pytest.importorskip("PIL.Image")
    original = image_module.frombytes
    seen = []

    def bounded(mode, size, data, *args, **kwargs):
        seen.append(size)
        assert size[0] * size[1] <= MAX_FRAME_PIXELS
        assert len(data) == size[0] * size[1] * len(mode)
        return original(mode, size, data, *args, **kwargs)

    monkeypatch.setattr(image_module, "frombytes", bounded)
    result = rendered(b"abc" * 1920 * 1080, source(1920, 1080), mode="RGB")
    assert seen == [(result.metadata.width, result.metadata.height)]


def test_bad_provenance_rejected_before_allocating_delivered_pixels(monkeypatch):
    monkeypatch.setattr(render, "_sample", lambda *args: pytest.fail("must reject first"))
    with pytest.raises(VisionError, match="Invalid observation or source identity"):
        render.render_frame(b"abc", source(1, 1), mode="RGB", observation_id="unsafe identity",
                            session_id="session_1", generation=1, captured_monotonic_ns=1)


def test_encoding_errors_never_include_pixels_or_encoder_details(monkeypatch):
    def broken(*args):
        raise OSError("secret raster bytes")

    monkeypatch.setattr(render, "_image_module", lambda: object())
    monkeypatch.setattr(render, "_sample", broken)
    with pytest.raises(render.RenderError, match="^raster_render_failed$"):
        rendered(b"abc", source(1, 1), mode="RGB")


@pytest.mark.parametrize("kwargs", [
    {"pixels": bytearray(b"abc" * 4)}, {"pixels": memoryview(b"abc" * 4)},
    {"pixels": b"secret"}, {"geometry": {}}, {"mode": "BGR"},
    {"rotation": True}, {"rotation": 90.0}, {"rotation": 45},
    {"crop": (0, 0, 1, 1)}, {"crop": FrameCrop(1, 1, 2, 2)},
    {"max_size": [2, 2]}, {"max_size": (True, 2)}, {"max_size": (0, 2)},
])
def test_strict_validation_before_dependency_or_image_allocation(kwargs, monkeypatch):
    monkeypatch.setattr(render, "_image_module", lambda: pytest.fail("must reject first"))
    args = {"pixels": b"abc" * 4, "geometry": source(2, 2), "mode": "RGB"} | kwargs
    with pytest.raises(VisionError) as error:
        rendered(**args)
    assert "secret" not in str(error.value) and "abc" not in str(error.value)


@pytest.mark.parametrize("provider", ["codex", "ollama"])
async def test_actual_rendered_pixels_in_final_serialized_native_request(provider):
    pytest.importorskip("PIL.Image")
    from src.llm.ollama import OllamaClient
    from src.llm.types import LLMResponse
    from tests.test_computer_vision import Response
    from tests.test_openai_codex_client import _client

    pixels = b"\xff\x00\x00" * 30 + b"\x00\xff\x00" * 30
    geometry = source(10, 6)
    overview = rendered(pixels, geometry, mode="RGB", rotation=90, max_size=(4, 8))
    detail = rendered(pixels, geometry, mode="RGB", rotation=90, crop=FrameCrop(2, 2, 4, 3))
    messages = plan_model_frames([message(overview), message(detail)]).messages
    captured = []

    def post(_url, **kwargs):
        captured.append(json.loads(json.dumps(kwargs["json"])))
        return Response()

    client = _client() if provider == "codex" else OllamaClient(model="test")
    client._get_session = AsyncMock(return_value=SimpleNamespace(post=post))
    if provider == "codex":
        client._read_tool_stream = AsyncMock(return_value=LLMResponse(text="saw pixels"))
    result = await client.chat_with_tools(messages, "test", [])
    assert result.text == "saw pixels" and len(captured) == 1
    body = captured[0]
    if provider == "codex":
        encoded = [b["image_url"].removeprefix("data:image/png;base64,")
                   for item in body["input"] for b in item.get("content", [])
                   if b.get("type") == "input_image"]
    else:
        encoded = [data for item in body["messages"] for data in item.get("images", [])]
    assert [base64.b64decode(data, validate=True) for data in encoded] == [
        overview.png, detail.png]
    for frame in (overview, detail):
        summary = frame_summary(observation_image(frame.png, frame.metadata))
        assert "source_id" in summary and "origin_x" not in summary
        assert base64.b64encode(frame.png).decode() not in json.dumps(summary)
        assert repr(frame.png) not in repr(frame)
