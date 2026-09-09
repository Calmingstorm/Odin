"""Negotiated MCP media ingress and adversarial renderer checkpoint pins."""

from __future__ import annotations

import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiohttp.test_utils import TestServer

from src.discord.mcp_dispatch import dispatch_mcp_tool, uncertain_outcome
from src.tools.mcp.client import (
    MAX_BINARY_PARTS,
    MAX_VISION_IMAGES,
    MCPServerConnection,
    _render_tool_result,
)
from src.tools.mcp.protocol import WIRE_RESULT_CEILING
from src.tools.media_result import append_image_messages, image_result_parts, tool_image_content
from src.tools.result_validator import ToolResult
from tests.fakes.mcp_http import make_app

# A tiny PNG and a signature-only JPEG: recognition is not full image decode.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII="
)
JPEG = b"\xff\xd8\xff\xe0checkpoint-jpeg"
PAYLOAD = b"\x00binary-checkpoint\xff\x80\x00"


def encoded(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def mixed_result(*, error=False):
    return {
        "isError": error,
        "content": [
            {"type": "text", "text": "before first"},
            {"type": "image", "mimeType": "application/incorrect", "data": encoded(PNG)},
            {"type": "text", "text": "between images"},
            {"type": "image", "mimeType": "image/png", "data": encoded(JPEG)},
            {"type": "resource", "resource": {
                "uri": "file:///must-not-be-opened", "text": "resource text",
                "mimeType": "application/octet-stream", "blob": encoded(PAYLOAD),
            }},
            {"type": "audio", "mimeType": "audio/wav", "data": encoded(PAYLOAD)},
            {"type": "text", "text": "after last"},
        ],
    }


@pytest.mark.parametrize("mode", ["modern", "modern-sse", "legacy-stateless", "legacy-sse"])
@pytest.mark.parametrize("error", [False, True])
async def test_negotiated_mixed_media_reaches_typed_dispatch_once(mode, error):
    app, state = make_app(mode)
    state["tool_result"] = mixed_result(error=error)
    server = TestServer(app)
    await server.start_server()
    conn = MCPServerConnection("media", "http", url=str(server.make_url("/mcp")))
    try:
        await conn.connect()
        discovery = await conn.discover_tools()
        tool = next(t for t in discovery.tools if t.name == "echo")
        outcome = await conn.call_tool(tool, {}, generation=7)
        manager = SimpleNamespace(execute=AsyncMock(return_value=outcome))
        result = await dispatch_mcp_tool(manager, "mcp_media_echo", {})
        manager.execute.assert_awaited_once()
        assert state["calls"]["tools/call"] == 1
        assert outcome.status == ("failed" if error else "ok")
        assert result.ok is not error
        assert not uncertain_outcome(result)
        assert result.audit_metadata["outcome"] == outcome.status
        assert result.audit_metadata["config_generation"] == 7
        assert result.image_blocks == outcome.image_blocks
        assert [b["source"]["media_type"] for b in result.image_blocks] == [
            "image/png", "image/jpeg",
        ]
        assert [base64.b64decode(b["source"]["data"]) for b in result.image_blocks] == [PNG, JPEG]
        assert [a.content_index for a in result.attachments] == [2, 4, 5, 6]
        assert [a.kind for a in result.attachments] == ["image", "image", "resource", "audio"]
        assert [a.data for a in result.attachments] == [PNG, JPEG, PAYLOAD, PAYLOAD]
        positions = [result.output.index(t) for t in (
            "before first", "content item 2", "between images", "content item 4",
            "resource text", "after last",
        )]
        assert positions == sorted(positions)
        for rendered in (result.output, str(result), repr(result),
                         json.dumps(result.as_dict()), repr(outcome),
                         json.dumps(result.audit_metadata), repr(result.attachments)):
            for data in (PNG, JPEG, PAYLOAD):
                assert encoded(data) not in rendered
                assert repr(data) not in rendered
    finally:
        await conn.disconnect()
        await server.close()


@pytest.mark.parametrize("bad", [None, 12, {}, "not-base64!", "YW Jj", "\u00e9", "a"])
@pytest.mark.parametrize("kind,key", [("image", "data"), ("audio", "data"), ("resource", "blob")])
def test_corrupt_media_is_explicit_not_echoed_or_promoted(bad, kind, key):
    item = {key: bad, "mimeType": "image/png"}
    item = {"type": kind, "resource": item} if kind == "resource" else {"type": kind, **item}
    images, attachments = [], []
    text, error = _render_tool_result(
        {"content": [{"type": "text", "text": "valid text"}, item]},
        images=images, attachments=attachments,
    )
    assert not error
    assert "valid text" in text and "no bytes available" in text
    assert not images and not attachments
    if isinstance(bad, str) and len(bad) > 1:
        assert bad not in text


@pytest.mark.parametrize("data", [b"<svg>unsupported</svg>", b"BMbitmap", b"not an image", b""])
def test_unsupported_raster_remains_byte_faithful_attachment(data):
    images, attachments = [], []
    text, error = _render_tool_result(
        {"isError": True, "content": [
            {"type": "image", "mimeType": "image/png", "data": encoded(data)},
        ]}, images=images, attachments=attachments,
    )
    assert error and not images
    assert "not sent to vision" in text
    assert attachments[0].data == data


@pytest.mark.parametrize("data,mime", [
    (PNG, "image/png"), (JPEG, "image/jpeg"),
    (b"GIF87asignature-only", "image/gif"), (b"GIF89asignature-only", "image/gif"),
    (b"RIFF1234WEBPsignature-only", "image/webp"),
])
def test_supported_signatures_override_untrusted_declared_mime(data, mime):
    images, attachments = [], []
    _render_tool_result({"content": [
        {"type": "image", "mimeType": "text/plain", "data": encoded(data)},
    ]}, images=images, attachments=attachments)
    assert images[0]["source"]["media_type"] == mime
    assert attachments[0].media_type == "text/plain"
    assert attachments[0].data == data


def test_image_resource_is_file_not_vision_and_uris_are_only_descriptions():
    images, attachments = [], []
    text, _ = _render_tool_result({"content": [{"type": "resource", "resource": {
        "uri": "https://169.254.169.254/do-not-fetch", "mimeType": "image/png",
        "text": "inline resource", "blob": encoded(PNG),
    }}]}, images=images, attachments=attachments)
    assert not images and attachments[0].data == PNG
    assert "inline resource" in text and "https://169.254.169.254/do-not-fetch" in text


def test_media_limits_are_explicit_and_keep_accepted_content_order():
    image = {"type": "image", "mimeType": "image/png", "data": encoded(PNG)}
    images, attachments = [], []
    text, _ = _render_tool_result({"content": [image] * (MAX_BINARY_PARTS + 3)},
                                images=images, attachments=attachments)
    assert len(images) == MAX_VISION_IMAGES == 16
    assert len(attachments) == MAX_BINARY_PARTS == 64
    assert [a.content_index for a in attachments] == list(range(1, 65))
    assert text.count("Binary part limit 64 exceeded") == 1
    assert "MCP content item 17 (image): not sent to vision" in text
    assert encoded(PNG) not in text


def test_no_sink_or_oversized_data_never_silently_disappears():
    text, _ = _render_tool_result(mixed_result())
    assert "binary delivery unavailable" in text
    assert encoded(PNG) not in text
    images, attachments = [], []
    text, _ = _render_tool_result({"content": [
        {"type": "image", "data": "a" * (WIRE_RESULT_CEILING + 1)},
    ]}, images=images, attachments=attachments)
    assert "missing/oversized base64 data" in text
    assert not images and not attachments


@pytest.mark.parametrize("value", [None, "text only", {}, {"__image_blocks__": "invalid"},
                                  ToolResult("text only")])
def test_non_media_results_do_not_become_vision(value):
    assert image_result_parts(value) is None


@pytest.mark.parametrize("with_prompt", [False, True])
def test_plural_native_marker_preserves_real_text_and_disconnected_call_groups(with_prompt):
    blocks = [{"type": "image", "source": {
        "type": "base64", "media_type": "image/png", "data": encoded(data),
    }} for data in (PNG, JPEG)]
    marker = {"__image_blocks__": blocks, "__text__": "real tool text"}
    if with_prompt:
        marker["__prompt__"] = "inspect both"
    text, images = image_result_parts(marker)
    assert text.startswith("real tool text") and images == blocks
    assert ("inspect both" in text) is with_prompt
    messages = []
    append_image_messages(messages, [
        *tool_image_content(images, "native_one", "call-one"),
        *tool_image_content(images[:1], "native_two", "call-two"),
    ])
    assert len(messages) == 2
    assert "call-one" in messages[0]["content"][0]["text"]
    assert "call-two" in messages[1]["content"][0]["text"]
    assert messages[0]["content"][1:] == blocks
    assert messages[1]["content"][1:] == blocks[:1]
    assert "__tool_image_count__" not in json.dumps(messages)


def test_plural_marker_without_text_has_explicit_placeholder():
    assert image_result_parts({"__image_blocks__": []}) == ("[0 image(s) loaded.]", [])
    messages = []
    append_image_messages(messages, tool_image_content([], "native_empty", "empty"))
    assert "call empty" in messages[0]["content"][0]["text"]


@pytest.mark.parametrize("mode", ["modern", "modern-sse"])
async def test_aggregate_wire_limit_rejects_whole_result_without_replay(mode):
    app, state = make_app(mode)
    part = {"type": "audio", "mimeType": "audio/wav",
            "data": "YWFh" * (WIRE_RESULT_CEILING // 8)}
    state["tool_result"] = {"content": [part, part, part]}
    server = TestServer(app)
    await server.start_server()
    conn = MCPServerConnection("media", "http", url=str(server.make_url("/mcp")))
    try:
        await conn.connect()
        tool = next(t for t in (await conn.discover_tools()).tools if t.name == "echo")
        outcome = await conn.call_tool(tool, {})
        assert not outcome.ok
        assert not outcome.image_blocks and not outcome.attachments
        assert state["calls"]["tools/call"] == 1
        assert len(outcome.text) < 1000
        assert part["data"] not in outcome.text
    finally:
        await conn.disconnect()
        await server.close()
