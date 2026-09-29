import json
from unittest.mock import AsyncMock

import pytest
from aiohttp import _http_writer
from multidict import CIMultiDict

from src.tools.mcp import protocol as p
from src.tools.mcp.client import MCPServerConnection, _render_tool_result


def test_union_header_annotation_excludes_only_invalid_tool():
    schema = {"properties": {"value": {"type": ["string", "null"], "x-mcp-header": "value"}}}
    check = p.extract_header_params(schema)
    assert not check.ok
    assert "only applies" in check.reason
    assert p.extract_header_params({"properties": {"value": {
        "type": "string", "x-mcp-header": "value"}}}).ok


async def test_real_discovery_keeps_valid_tools_beside_union_header():
    conn = MCPServerConnection("fake", "http", url="https://unused.invalid/mcp")
    conn.connected = True
    conn.era = p.ERA_MODERN
    conn.negotiated_version = "2026-07-28"
    conn._request = AsyncMock(return_value={"tools": [
        {"name": "bad", "inputSchema": {"type": "object", "properties": {
            "value": {"type": ["string", "null"], "x-mcp-header": "value"}}}},
        {"name": "good", "inputSchema": {"type": "object", "properties": {}}},
    ]})
    discovery = await conn.discover_tools()
    assert discovery.tools[0].excluded
    assert not discovery.tools[1].excluded


@pytest.mark.parametrize("newline", ["\n", "\r", "\r\n"])
def test_header_validation_rejects_terminal_newline_and_encodes_values(newline):
    assert not p.extract_header_params({"properties": {"value": {
        "type": "string", "x-mcp-header": "value" + newline}}}).ok
    encoded = p.encode_header_value("ordinary" + newline)
    assert encoded.startswith("=?base64?")
    # The real HTTP serializer accepts the encoded header without a socket.
    _http_writer._serialize_headers("GET / HTTP/1.1", CIMultiDict({"Mcp-Param-value": encoded}))


def test_structured_records_survive_text_summary():
    records = {"results": [{"id": "record-17", "value": "substantive"}]}
    text, error = _render_tool_result({"content": [{"type": "text", "text": "Found results"}],
                                       "structuredContent": records})
    assert not error
    assert "Found results" in text and "record-17" in text


def test_structured_json_text_copy_is_not_duplicated():
    records = {"results": [{"id": "record-17"}]}
    copy = json.dumps(records)
    text, _ = _render_tool_result({"content": [{"type": "text", "text": copy}],
                                  "structuredContent": records})
    assert text == copy
