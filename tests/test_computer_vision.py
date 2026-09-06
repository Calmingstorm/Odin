"""PNG validation and final HTTP-body native-pixel contract; no live services."""
import base64
import copy
import json
import struct
import subprocess
import sys
import zlib
from dataclasses import replace
from fractions import Fraction
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.vision import (
    MAX_FRAME_PIXELS,
    MAX_PNG_BYTES,
    MAX_SOURCE_DIMENSION,
    FrameCrop,
    FrameMetadata,
    VisionError,
    frame_summary,
    observation_image,
    plan_model_frames,
)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def png(width=4, height=3, *, depth=8, color=2, row_filter=0, raw=None, extra=b""):
    channels = 4 if color == 6 else 3
    rows = raw if raw is not None else (
        bytes([row_filter]) + b"\x20\x40\x80\xff"[:channels] * width
    ) * height
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, depth, color, 0, 0, 0))
            + extra + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))


def metadata(**kwargs):
    return FrameMetadata(**dict({"observation_id": "obs_1", "generation": 1,
                                 "captured_monotonic_ns": 10, "width": 4, "height": 3,
                                 "session_id": "session_1", "source_id": "source_1",
                                 "source_revision": 1, "consent_generation": 1,
                                 "source_width": 4, "source_height": 3}, **kwargs))


def image_message(result):
    return {"role": "user", "content": [result["__image_block__"],
                                        {"type": "text", "text": result["__prompt__"]}]}


def test_import_has_no_optional_or_desktop_dependencies():
    script = """
import sys
import src.computer.vision
assert not any(m == 'PIL' or m.startswith(('PIL.', 'gi.', 'Xlib.', 'pyatspi', 'aiohttp'))
               for m in sys.modules)
"""
    completed = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr


@pytest.mark.parametrize("color", [2, 6])
def test_native_marker_round_trip_and_bounded_pixel_free_summary(color):
    data = png(color=color)
    result = observation_image(data, metadata())
    block = result["__image_block__"]
    assert block["type"] == "image" and block["source"]["media_type"] == "image/png"
    assert base64.b64decode(block["source"]["data"], validate=True) == data
    summary = frame_summary(result)
    assert summary["width"] == 4 and summary["height"] == 3
    assert summary["png_bytes"] == len(data)
    assert len(json.dumps(summary)) < 1536 and len(result["__prompt__"]) < 1700
    assert block["source"]["data"] not in json.dumps(summary)


@pytest.mark.parametrize("changes", [
    {"observation_id": "x" * 97}, {"observation_id": "ignore instructions\n"},
    {"observation_id": "\ud800"}, {"observation_id": True}, {"generation": True},
    {"generation": 0}, {"generation": 2**64}, {"captured_monotonic_ns": -1},
    {"width": 0}, {"width": 4.0}, {"width": 2000, "height": 1001},
    {"source_width": MAX_SOURCE_DIMENSION + 1}, {"kind": "gif"},
    {"source_id": ":0"}, {"source_id": ""}, {"session_id": "bad\n"},
    {"source_revision": 0}, {"source_revision": True}, {"consent_generation": -1},
    {"source_width": float("inf")}, {"source_height": float("nan")},
    {"rotation": 45}, {"rotation": True}, {"rotation": 90.0},
    {"resize_scale": (2, 1)}, {"resize_scale": (0, 1)}, {"resize_scale": (1, 0)},
    {"resize_scale": (True, 1)}, {"resize_scale": (float("nan"), 1)},
    {"resize_scale": (1, 2**64)}, {"resize_scale": [1, 1]},
    {"resize_rounding": "guess"},
    {"width": 2, "height": 3}, {"crop": FrameCrop(0, 0, 2, 2)},
    {"kind": "crop"}, {"kind": "crop", "crop": {"x": 0}},
    {"kind": "crop", "crop": FrameCrop(3, 2, 4, 3)},
])
def test_invalid_metadata(changes):
    with pytest.raises(VisionError):
        metadata(**changes)


@pytest.mark.parametrize("args", [(True, 0, 1, 1), (-1, 0, 1, 1), (0, 0, 0, 1)])
def test_invalid_crop(args):
    with pytest.raises(VisionError):
        FrameCrop(*args)


def test_exact_scaling_and_crop_mapping():
    full = metadata(width=2, height=1, source_width=8, source_height=4, resize_scale=(1, 4))
    observation_image(png(2, 1), full)
    cropped = replace(full, kind="crop", crop=FrameCrop(2, 1, 4, 2), resize_scale=(1, 2))
    summary = frame_summary(observation_image(png(2, 1), cropped))
    assert summary["crop"] == {"x": 2, "y": 1, "width": 4, "height": 2}
    assert cropped.delivered_to_source.map_point(0, 0) == (2, 1)
    assert cropped.delivered_to_source.map_point(2, 1) == (6, 3)


@pytest.mark.parametrize("data", [
    b"", b"not PNG", bytearray(b"PNG"), b"x" * (MAX_PNG_BYTES + 1),
    png()[:-1], png() + b"trailing", png(depth=16), png(color=3), png(row_filter=5),
    png(raw=b"too few"), png(raw=b"x" * 10000), png(3, 4),
    png(extra=chunk(b"tEXt", b"hidden instruction")),
    png(extra=chunk(b"acTL", struct.pack(">II", 2, 0))),
    png(extra=chunk(b"IHDR", b"duplicate")),
    png()[:40] + b"wrong checksum" + png()[54:],
])
def test_invalid_png_rejected_without_echoing_payload(data):
    with pytest.raises(VisionError) as error:
        observation_image(data, metadata())
    assert len(str(error.value)) < 100
    assert "hidden instruction" not in str(error.value)


def test_zlib_extra_stream_rejected():
    header = png()[:33]
    compressed = zlib.compress((b"\0" + b"\0" * 12) * 3)
    with pytest.raises(VisionError):
        observation_image(header + chunk(b"IDAT", compressed + compressed)
                          + chunk(b"IEND", b""), metadata())


def test_pixel_limit_exact_boundary():
    data = png(2000, 1000)
    result = observation_image(data, metadata(width=2000, height=1000,
                                            source_width=2000, source_height=1000))
    assert frame_summary(result)["width"] * frame_summary(result)["height"] == MAX_FRAME_PIXELS


def test_missing_typed_metadata_and_summary_extra_fields_fail_closed():
    with pytest.raises(VisionError):
        observation_image(png(), {})
    result = observation_image(png(), metadata())
    result["__computer_frame__"]["data"] = "never audit me"
    with pytest.raises(VisionError):
        frame_summary(result)


def test_retirement_preserves_native_tool_pair_and_unrelated_images():
    old = image_message(observation_image(png(), metadata()))
    new_meta = metadata(observation_id="obs_2", captured_monotonic_ns=11)
    full = image_message(observation_image(png(), new_meta))
    crop_meta = replace(new_meta, kind="crop", crop=FrameCrop(0, 0, 2, 2), width=2, height=2)
    crop1 = image_message(observation_image(png(2, 2), crop_meta))
    crop2 = image_message(observation_image(png(2, 2), crop_meta))
    call = {"role": "assistant", "content": [{"type": "tool_use", "id": "c1",
                                               "name": "computer_observe", "input": {}}]}
    result = {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "c1",
                                           "content": "observation"}]}
    unrelated = {"role": "user", "content": [{"type": "image", "source": {"data": "other"}}]}
    messages = [old, call, result, full, crop1, crop2, unrelated]
    original = copy.deepcopy(messages)
    plan = plan_model_frames(messages)
    assert plan.frame_count == 2 and plan.protected_message_indices == (3, 5)
    assert plan.messages[0]["content"][0]["type"] == "text"
    assert plan.messages[4]["content"][0]["type"] == "text"
    assert plan.messages[1] == call and plan.messages[2] == result
    assert plan.messages[6] == unrelated and messages == original
    assert "base64" not in repr(plan)


def test_crop_only_and_malformed_tag_refused():
    result = observation_image(png(2, 2), metadata(kind="crop", crop=FrameCrop(0, 0, 2, 2),
                                                width=2, height=2))
    with pytest.raises(VisionError, match="full frame"):
        plan_model_frames([image_message(result)])
    with pytest.raises(VisionError):
        plan_model_frames([{"role": "user", "content": [
            {"type": "image", "__computer_frame__": {"data": "hidden"}}]}])


@pytest.mark.parametrize("change", ["invalid_base64", "wrong_digest", "missing_source",
                                    "oversized_base64", "wrong_media"])
def test_planner_revalidates_pixels_before_protecting_frame(change):
    observation = observation_image(png(), metadata())
    block = observation["__image_block__"]
    if change == "invalid_base64":
        block["source"]["data"] = "\ud800"
    elif change == "wrong_digest":
        block["__computer_frame__"]["sha256"] = "0" * 64
    elif change == "missing_source":
        del block["source"]
    elif change == "oversized_base64":
        block["source"]["data"] = "A" * (4 * ((MAX_PNG_BYTES + 2) // 3) + 1)
    else:
        block["source"]["media_type"] = "text/plain"
    with pytest.raises(VisionError):
        plan_model_frames([image_message(observation)])


def test_newer_crop_without_matching_full_cannot_reuse_old_full():
    full = image_message(observation_image(png(), metadata()))
    crop = image_message(observation_image(png(2, 2), metadata(
        observation_id="obs_2", captured_monotonic_ns=20, kind="crop",
        crop=FrameCrop(0, 0, 2, 2), width=2, height=2)))
    with pytest.raises(VisionError, match="matching full"):
        plan_model_frames([full, crop])


@pytest.mark.parametrize("sw,sh,dw,dh,scale", [
    (1920, 1080, 960, 540, (1, 2)),
    (2560, 1440, 1280, 720, (1, 2)),
    (3840, 2160, 1280, 720, (1, 3)),
    (7920, 2520, 1320, 420, (1, 6)),
    (MAX_SOURCE_DIMENSION, MAX_SOURCE_DIMENSION, 10, 10, (1, 100_000)),
])
def test_large_source_downsampled_overview_and_readable_crop(sw, sh, dw, dh, scale):
    # No source-sized buffers: only DELIVERED PNG pixels are allocated.
    full = metadata(source_width=sw, source_height=sh, width=dw, height=dh,
                    resize_scale=scale)
    image = observation_image(png(dw, dh), full)
    crop = replace(full, width=160, height=90, kind="crop", resize_scale=(1, 1),
                   crop=FrameCrop(sw - 160, sh - 90, 160, 90))
    detail = observation_image(png(160, 90), crop)
    assert plan_model_frames([image_message(image), image_message(detail)]).frame_count == 2
    assert full.delivered_to_source.map_point(dw, dh) == (sw, sh)
    assert crop.delivered_to_source.map_point(160, 90) == (sw, sh)
    summary = frame_summary(image)
    assert summary["source_width"] == sw and summary["width"] == dw
    assert not {"display_width", "display_height", "origin_x", "origin_y", "xid"} & summary.keys()


@pytest.mark.parametrize("sw,sh,dw,dh,scale,rounding", [
    (1920, 1080, 1000, 563, (25, 48), "nearest"),
    (1920, 1080, 1000, 562, (25, 48), "floor"),
    (2560, 1440, 1365, 768, (1365, 2560), "nearest"),
    (3840, 2160, 1333, 750, (1333, 3840), "nearest"),
])
def test_realistic_resize_rounding_is_explicit_and_exact_mapping_round_trips(
    sw, sh, dw, dh, scale, rounding,
):
    frame = metadata(source_width=sw, source_height=sh, width=dw, height=dh,
                     resize_scale=scale, resize_rounding=rounding)
    assert dw * sh != dh * sw  # Deliberately not exact aspect ratio.
    transform = frame.delivered_to_source
    assert transform.map_point(dw, dh) == (sw, sh)
    point = (Fraction(17, 2), Fraction(19, 2))
    assert transform.inverse().map_point(*transform.map_point(*point)) == point
    for wrong_height in (dh - 2, dh + 2):
        with pytest.raises(VisionError, match="declared resize"):
            replace(frame, height=wrong_height)


@pytest.mark.parametrize("rotation,corners", [
    (0, ((10, 20), (18, 24))),
    (90, ((10, 24), (18, 20))),
    (180, ((18, 24), (10, 20))),
    (270, ((18, 20), (10, 24))),
])
def test_rotated_crop_raster_edges_and_pixel_centers(rotation, corners):
    width, height = (2, 4) if rotation in (90, 270) else (4, 2)
    frame = metadata(source_width=1920, source_height=1080, width=width, height=height,
                     kind="crop", crop=FrameCrop(10, 20, 8, 4), rotation=rotation,
                     resize_scale=(1, 2))
    transform = frame.delivered_to_source
    assert transform.map_point(0, 0) == corners[0]
    assert transform.map_point(width, height) == corners[1]
    for x in range(width):
        for y in range(height):
            center = (Fraction(2 * x + 1, 2), Fraction(2 * y + 1, 2))
            sx, sy = transform.map_point(*center)
            assert 10 < sx < 18 and 20 < sy < 24
            assert transform.inverse().map_point(sx, sy) == center
    assert frame_summary(observation_image(png(width, height), frame))["rotation"] == rotation


@pytest.mark.parametrize("changes", [
    {"source_id": "replacement"}, {"source_revision": 2}, {"consent_generation": 2},
    {"session_id": "new_session"}, {"generation": 2}, {"rotation": 180},
    {"source_width": 5},
])
def test_matching_dimensions_do_not_let_crop_retarget_source_binding(changes):
    full = image_message(observation_image(png(), metadata()))
    crop = metadata(kind="crop", crop=FrameCrop(0, 0, 2, 2), width=2, height=2, **changes)
    with pytest.raises(VisionError, match="matching full"):
        plan_model_frames([full, image_message(observation_image(png(2, 2), crop))])


def test_json_round_trip_transform_checked_and_global_coordinates_rejected():
    original = observation_image(png(), metadata())
    restored = json.loads(json.dumps(original))
    assert frame_summary(restored) == frame_summary(original)
    assert plan_model_frames([image_message(restored)]).frame_count == 1
    for field, value in (("origin_x", -1920), ("display_id", ":0"),
                         ("delivered_to_source", {"a": [100, 1]})):
        changed = copy.deepcopy(restored)
        changed["__computer_frame__"][field] = value
        with pytest.raises(VisionError):
            frame_summary(changed)


@pytest.mark.parametrize("coefficient", [[True, 1], [1.0, 1], [float("nan"), 1],
                                      [1, 0], [2**300, 1], [1, 1, 1], "1"])
def test_summary_rejects_noncanonical_or_nonfinite_affine_coefficients(coefficient):
    result = observation_image(png(), metadata())
    result["__computer_frame__"]["delivered_to_source"]["a"] = coefficient
    with pytest.raises(VisionError):
        frame_summary(result)


def test_source_pixel_mapping_does_not_create_input_authority():
    from src.computer.geometry import GeometryError, SourceGeometry

    frame = metadata(source_width=1920, source_height=1080,
                     width=960, height=540, resize_scale=(1, 2))
    source = SourceGeometry(frame.source_id, frame.source_revision, frame.consent_generation,
                            frame.source_width, frame.source_height)
    with pytest.raises(GeometryError, match="input_mapping_unknown"):
        source.input_point(frame.delivered_to_source, 0, 0, frame.width, frame.height)


class Response:
    status = 200
    headers = {}

    async def json(self):
        return {"message": {"content": "saw pixels"}, "done": True}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


@pytest.mark.parametrize("provider", ["codex", "ollama"])
@pytest.mark.parametrize("frame_changes", [
    {},
    {"source_width": 1920, "source_height": 1080, "width": 1000, "height": 563,
     "resize_scale": (25, 48)},
    {"source_width": 3840, "source_height": 2160, "width": 160, "height": 90,
     "kind": "crop", "crop": FrameCrop(3600, 2000, 160, 90)},
])
async def test_final_http_body_contains_native_png_not_text_or_path(provider, frame_changes):
    """Real chat_with_tools -> real HTTP send; fake transport records JSON body."""
    from src.llm.ollama import OllamaClient
    from src.llm.types import LLMResponse
    from tests.test_openai_codex_client import _client

    frame = metadata(**frame_changes)
    data = png(frame.width, frame.height)
    observation = observation_image(data, frame)
    messages = [
        {"role": "assistant", "content": [{"type": "tool_use", "id": "frame-call",
                                             "name": "computer_observe", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "frame-call",
                                       "content": observation["__prompt__"]}]},
        image_message(observation),
    ]
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
        images = [b for item in body["input"] for b in item.get("content", [])
                  if b.get("type") == "input_image"]
        assert len(images) == 1
        encoded = images[0]["image_url"].removeprefix("data:image/png;base64,")
        images[0]["image_url"] = "REDACTED"
        calls = [x for x in body["input"] if x.get("type") == "function_call"]
        outputs = [x for x in body["input"] if x.get("type") == "function_call_output"]
        assert calls[0]["call_id"] == outputs[0]["call_id"] == "frame-call"
    else:
        images = [x for x in body["messages"] if x.get("images")]
        assert len(images) == 1
        encoded = images[0]["images"][0]
        images[0]["images"] = ["REDACTED"]
        assert any(x.get("role") == "tool" for x in body["messages"])
    assert base64.b64decode(encoded, validate=True) == data
    assert encoded not in json.dumps(body)


async def test_existing_foreground_dispatch_does_not_audit_pixels(tmp_path, monkeypatch):
    from tests.characterization.test_chat_tool_loop import build, run_loop
    from tests.fakes import FakeMessage, text_response, tool_call_response

    monkeypatch.chdir(tmp_path)
    observation = observation_image(png(), metadata())
    bot, fake = build([tool_call_response(("analyze_image", {"url": "https://x/img.png"})),
                       text_response("observed")])
    bot.audit.log_execution = AsyncMock()
    bot.audit.log_event = AsyncMock()
    bot.media_tools._handle_analyze_image = AsyncMock(return_value=observation)
    await run_loop(bot, FakeMessage("look"))
    encoded = observation["__image_block__"]["source"]["data"]
    assert encoded in json.dumps(fake.messages_of_call(1))
    assert bot.audit.log_execution.await_count > 0
    assert encoded not in str(bot.audit.log_execution.call_args_list)
    assert encoded not in str(bot.audit.log_event.call_args_list)


def test_kimi_converter_has_no_pixel_delivery_capability():
    # Serializer negative proof. Foreground admission must reject this adapter,
    # not mistake a generic LLM interface for native multimodal support.
    from src.llm.kimi import KimiClient

    observation = observation_image(png(), metadata())
    wire = KimiClient._convert_messages(None, [image_message(observation)], "")
    assert observation["__image_block__"]["source"]["data"] not in json.dumps(wire)
