"""R5 synthetic native-pixel evidence. Loopback HTTP is NOT provider acceptance."""
from __future__ import annotations

import base64
import copy
import io
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer
from PIL import Image

from src.computer.capabilities import native_transport_evidence
from src.computer.geometry import SourceGeometry
from src.computer.render import render_frame
from src.computer.vision import (
    MAX_FRAME_PIXELS,
    MAX_PNG_BYTES,
    FrameCrop,
    frame_summary,
    observation_image,
    plan_model_frames,
)
from src.llm.openai_codex import CodexChatClient
from tests.test_openai_codex_client import _BareAuth


def client(model="gpt-5.6-sol"):
    return CodexChatClient(auth=_BareAuth(), model=model, max_retries=1)


def serving(c, model=None):
    return SimpleNamespace(provider="codex", client=c, model=model or c.model)


def frame(capture="capture", crop=None):
    # Entire raster is synthetic: 64x32 pixels, distinct left/right colors.
    row = b"\xff\x00\x00" * 32 + b"\x00\xff\x00" * 32
    if capture == "old":
        row = b"\x00\x00\xff" * 64
    return render_frame(
        row * 32, SourceGeometry("synthetic", 1, 1, 64, 32), mode="RGB",
        observation_id=capture, session_id="synthetic-session", generation=1,
        captured_monotonic_ns=1 if capture == "old" else 2, crop=crop,
        max_size=(32, 16) if crop is None else (16, 16),
    )


def message(f):
    image = observation_image(f.png, f.metadata)
    return {"role": "user", "content": [
        {"type": "text", "text": image["__prompt__"]}, image["__image_block__"]]}


@pytest.mark.parametrize("model", ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-astra",
                                   "future-name-not-an-acceptance-claim"])
def test_transport_evidence_is_not_a_model_name_allowlist(model):
    evidence = native_transport_evidence(serving(client(model)))
    assert evidence.model == model
    assert evidence.native_images == 1 and evidence.correlation_preserved
    assert evidence.provider_acceptance == "unverified"
    assert "base64" not in repr(evidence)


@pytest.mark.parametrize("provider,model,c", [
    ("ollama", "gpt-5.6-sol", None), ("codex", "gpt-5.6-sol", object()),
    ("codex", "", None), ("codex", " model ", None),
])
def test_transport_evidence_refuses_unknown_adapter_and_bad_snapshot(provider, model, c):
    with pytest.raises(PermissionError):
        native_transport_evidence(SimpleNamespace(provider=provider, model=model,
                                                  client=c or client()))


@pytest.mark.parametrize("fault", ["drop-image", "stringify", "break-correlation", "raise"])
def test_transport_evidence_checks_converter_not_class_membership(monkeypatch, fault):
    c = client()
    convert = c._convert_messages_with_tools

    def broken(messages):
        wire = convert(messages)
        if fault == "raise":
            raise ValueError("private-pixel-payload")
        for item in wire:
            if fault == "break-correlation" and item.get("type") == "function_call_output":
                item["call_id"] = "wrong"
            for block in item.get("content", []):
                if block.get("type") == "input_image":
                    if fault == "drop-image":
                        block.clear()
                    elif fault == "stringify":
                        item["content"].append({"type": "input_text", "text": block["image_url"]})
                        break
        return wire

    monkeypatch.setattr(c, "_convert_messages_with_tools", broken)
    with pytest.raises(PermissionError) as error:
        native_transport_evidence(serving(c))
    assert "private-pixel-payload" not in str(error.value)
    assert "base64" not in str(error.value)


@pytest.mark.parametrize("model,override", [
    ("gpt-5.6-sol", None), ("gpt-5.6-terra", None), ("gpt-5.6-luna", None),
    ("gpt-6-astra", None),
    ("gpt-5.5", "gpt-5.6-sol"),
])
async def test_real_aiohttp_serialized_request_preserves_pixels_and_correlation(
    monkeypatch, model, override,
):
    """Actual client + aiohttp JSON encoding + socket; synthetic response only.

    Unlike replacing session.post, this captures bytes AFTER HTTP serialization.
    It deliberately does not contact or claim acceptance by the upstream provider.
    """
    overview = frame()
    detail = frame(crop=FrameCrop(40, 4, 8, 8))
    stale = frame("old")
    superseded = frame(crop=FrameCrop(0, 0, 8, 8))
    legacy = {"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png",
         "data": base64.b64encode(frame(crop=FrameCrop(0, 0, 2, 2)).png).decode()}}]}
    messages = [
        {"role": "assistant", "content": [{"type": "tool_use", "id": "observe-1",
         "name": "computer_observe", "input": {}}]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "observe-1",
         "content": "pixel-free observation receipt"}]},
        message(stale), message(overview), message(superseded), message(detail), legacy,
    ]
    before = copy.deepcopy(messages)
    plan = plan_model_frames(messages)
    assert messages == before
    assert plan.frame_count == 2 and plan.protected_message_indices == (3, 5)
    assert plan.messages[:2] == messages[:2] and plan.messages[-1] == legacy
    received = []

    async def receive(request):
        received.append(await request.read())
        events = [{"type": "response.output_text.delta", "delta": "synthetic response"},
                  {"type": "response.completed", "response": {}}]
        return web.Response(text="".join(f"data: {json.dumps(e)}\n\n" for e in events),
                            content_type="text/event-stream")

    app = web.Application(client_max_size=8 * 1024 * 1024)
    app.router.add_post("/responses", receive)
    async with TestServer(app) as server, aiohttp.ClientSession() as session:
        monkeypatch.setattr("src.llm.openai_codex.CODEX_API_URL",
                            str(server.make_url("/responses")))
        c = client(model)
        c._get_session = AsyncMock(return_value=session)
        result = await c.chat_with_tools(plan.messages, "Synthetic test only", [], model=override)
    assert result.text == "synthetic response" and len(received) == 1
    body = json.loads(received[0])
    for retired in (stale, superseded):
        assert base64.b64encode(retired.png) not in received[0]
    assert body["model"] == result.provenance_model == (override or model)
    assert body["store"] is False
    calls = [x for x in body["input"] if x.get("type") == "function_call"]
    results = [x for x in body["input"] if x.get("type") == "function_call_output"]
    assert calls[0]["call_id"] == results[0]["call_id"] == "observe-1"
    images = [b for item in body["input"] for b in item.get("content", [])
              if b.get("type") == "input_image"]
    assert len(images) == 3  # two computer frames, untouched legacy analyze_image
    decoded = [base64.b64decode(b["image_url"].split(",", 1)[1], validate=True) for b in images]
    assert decoded[:2] == [overview.png, detail.png]
    for data, f in zip(decoded, [overview, detail], strict=False):
        assert len(data) <= MAX_PNG_BYTES
        with Image.open(io.BytesIO(data)) as image:
            assert image.width * image.height <= MAX_FRAME_PIXELS
            assert image.size == (f.metadata.width, f.metadata.height)
    with Image.open(io.BytesIO(decoded[0])) as image:
        assert image.getpixel((0, 0)) == (255, 0, 0)
        assert image.getpixel((31, 0)) == (0, 255, 0)
    with Image.open(io.BytesIO(decoded[1])) as image:
        assert image.tobytes() == b"\x00\xff\x00" * 64
    assert overview.metadata.binding == detail.metadata.binding
    assert detail.metadata.delivered_to_source.map_point(0, 0) == (40, 4)
    for block in images:
        block["image_url"] = "native-pixels-removed"
    without_pixels = json.dumps(body)
    for f in (stale, overview, superseded, detail):
        encoded = base64.b64encode(f.png).decode()
        assert encoded not in without_pixels
        assert encoded not in json.dumps(frame_summary(observation_image(f.png, f.metadata)))
    assert "__computer_frame__" not in without_pixels
    assert "data:image/" not in without_pixels


def test_native_pixels_externalized_from_checkpoint_not_rearmed_on_resume():
    from src.discord.tool_loop import _ChatTurn
    from src.turn_state.codec import snapshot_chat_turn
    from tests.test_turn_checkpoint_codec import _blob_dict, _full_turn

    f = frame()
    image = observation_image(f.png, f.metadata)
    turn = _full_turn()
    turn.messages = [message(f)]
    turn.pending_image_blocks = [image["__image_block__"]]
    turn._computer_frame_error = False
    blobs, store, _load = _blob_dict()
    payload = snapshot_chat_turn(turn, store_blob=store, generation_seq=1)
    encoded = image["__image_block__"]["source"]["data"]
    assert encoded not in json.dumps(payload)
    assert "_computer_frame_error" not in payload["fields"]
    assert _ChatTurn.__dataclass_fields__["_computer_frame_error"].default is True
    # Existing image blob externalization is evidence storage, NOT a pixel-free
    # claim for the separate blob store. It intentionally retains image bytes.
    assert blobs
