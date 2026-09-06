"""PNG validation and final HTTP-body native-pixel contract; no live services."""
import base64
import copy
import json
import struct
import subprocess
import sys
import zlib
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.vision import (
    MAX_FRAME_PIXELS,
    MAX_PNG_BYTES,
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
                                 "display_width": 4, "display_height": 3}, **kwargs))


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
    assert len(json.dumps(summary)) < 1024 and len(result["__prompt__"]) < 1200
    assert block["source"]["data"] not in json.dumps(summary)


@pytest.mark.parametrize("changes", [
    {"observation_id": "x" * 97}, {"observation_id": "ignore instructions\n"},
    {"observation_id": "\ud800"}, {"observation_id": True}, {"generation": True},
    {"generation": 0}, {"generation": 2**64}, {"captured_monotonic_ns": -1},
    {"width": 0}, {"width": 4.0}, {"width": 2000, "height": 1001},
    {"display_width": MAX_FRAME_PIXELS + 1}, {"kind": "gif"},
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
    full = metadata(width=2, height=1, display_width=8, display_height=4)
    observation_image(png(2, 1), full)
    cropped = replace(full, kind="crop", crop=FrameCrop(2, 1, 4, 2))
    summary = frame_summary(observation_image(png(2, 1), cropped))
    assert summary["crop"] == {"x": 2, "y": 1, "width": 4, "height": 2}


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
                                            display_width=2000, display_height=1000))
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
async def test_final_http_body_contains_native_png_not_text_or_path(provider):
    """Real chat_with_tools -> real HTTP send; fake transport records JSON body."""
    from src.llm.ollama import OllamaClient
    from src.llm.types import LLMResponse
    from tests.test_openai_codex_client import _client

    data = png()
    observation = observation_image(data, metadata())
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
