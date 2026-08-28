"""Pure-unit pins for src/tools/mcp/protocol.py — versions, eras, message
model, resultType strictness, schema bounds, x-mcp-header, naming."""

from __future__ import annotations

import base64

import pytest

from src.tools.mcp import protocol as proto
from src.tools.mcp.errors import MCPProtocolError
from src.tools.mcp.manager import make_published_name
from src.tools.mcp.outcomes import MCPToolOutcome


class TestVersionSets:
    def test_exact_supported_set(self):
        assert proto.MODERN_VERSIONS == ("2026-07-28",)
        assert proto.LEGACY_VERSIONS_STDIO == (
            "2025-11-25",
            "2025-06-18",
            "2025-03-26",
            "2024-11-05",
        )
        # HTTP floor is 2025-03-26 — 2024-11-05 HTTP is the dropped
        # HTTP+SSE transport.
        assert "2024-11-05" not in proto.LEGACY_VERSIONS_HTTP
        assert proto.SUPPORTED_VERSIONS == {
            "2026-07-28",
            "2025-11-25",
            "2025-06-18",
            "2025-03-26",
            "2024-11-05",
        }

    def test_legacy_counteroffer_exact_set_only(self):
        assert proto.select_legacy_version("2025-06-18", transport="stdio")
        assert proto.select_legacy_version("2024-11-05", transport="stdio")
        assert proto.select_legacy_version("2024-11-05", transport="http") is None
        # Unknown counteroffers are never accepted — even future-looking ones.
        assert proto.select_legacy_version("2027-01-01", transport="stdio") is None
        assert proto.select_legacy_version("", transport="stdio") is None


class TestModernVersionSelection:
    def test_selects_by_our_preference(self):
        sel = proto.select_modern_version(["2026-07-28", "2025-11-25"])
        assert sel.version == "2026-07-28"

    def test_legacy_only_list_is_modern_incompatible(self):
        sel = proto.select_modern_version(["2025-11-25", "2025-06-18"])
        assert sel.version is None
        assert "modern" in sel.reason

    def test_empty_list_rejected(self):
        assert proto.select_modern_version([]).version is None

    def test_malformed_lists_rejected(self):
        assert proto.select_modern_version(None).version is None
        assert proto.select_modern_version("2026-07-28").version is None
        assert proto.select_modern_version([42, "2026-07-28"]).version is None

    def test_unknown_future_version_not_accepted(self):
        assert proto.select_modern_version(["2099-01-01"]).version is None


class TestModernErrorRecognition:
    def test_recognized_codes(self):
        for code in (-32020, -32021, -32022):
            assert proto.is_recognized_modern_error({"code": code})

    def test_plain_errors_not_recognized(self):
        assert not proto.is_recognized_modern_error({"code": -32601})
        assert not proto.is_recognized_modern_error({"code": -32602})
        assert not proto.is_recognized_modern_error(None)

    def test_supported_versions_extraction(self):
        err = {"code": -32022, "data": {"supported": ["2026-07-28", 42]}}
        assert proto.supported_versions_from_error(err) == ["2026-07-28"]
        assert proto.supported_versions_from_error({"code": -32022}) == []


class TestMessageKind:
    def test_kinds(self):
        assert proto.message_kind({"jsonrpc": "2.0", "id": 1, "method": "x"}) == "request"
        assert proto.message_kind({"jsonrpc": "2.0", "method": "x"}) == "notification"
        assert proto.message_kind({"jsonrpc": "2.0", "id": 1, "result": {}}) == "response"
        assert proto.message_kind({"jsonrpc": "2.0", "id": 1, "error": {}}) == "response"

    def test_invalid_shapes(self):
        assert proto.message_kind({}) == "invalid"
        assert proto.message_kind({"jsonrpc": "1.0", "method": "x"}) == "invalid"
        assert proto.message_kind({"jsonrpc": "2.0", "id": None, "result": {}}) == "invalid"
        assert proto.message_kind("nope") == "invalid"


class TestWirePayloadParsing:
    def test_single_object(self):
        msgs = proto.parse_wire_payload(
            '{"jsonrpc":"2.0","id":1,"result":{}}', negotiated_version="2025-06-18"
        )
        assert len(msgs) == 1

    def test_batch_allowed_only_on_2025_03_26(self):
        batch = '[{"jsonrpc":"2.0","id":1,"result":{}},{"jsonrpc":"2.0","method":"n"}]'
        msgs = proto.parse_wire_payload(batch, negotiated_version="2025-03-26")
        assert len(msgs) == 2

    @pytest.mark.parametrize("version", ["2024-11-05", "2025-06-18", "2025-11-25", "2026-07-28"])
    def test_batch_rejected_on_other_versions(self, version):
        batch = '[{"jsonrpc":"2.0","id":1,"result":{}}]'
        with pytest.raises(MCPProtocolError, match="batch"):
            proto.parse_wire_payload(batch, negotiated_version=version)

    def test_batch_tolerated_before_negotiation(self):
        batch = '[{"jsonrpc":"2.0","id":1,"result":{}}]'
        assert proto.parse_wire_payload(batch, negotiated_version=None)

    def test_empty_batch_rejected(self):
        with pytest.raises(MCPProtocolError):
            proto.parse_wire_payload("[]", negotiated_version="2025-03-26")

    def test_invalid_json_rejected(self):
        with pytest.raises(MCPProtocolError):
            proto.parse_wire_payload("not json", negotiated_version=None)

    def test_oversized_bytes_rejected(self):
        blob = b"x" * (proto.WIRE_RESULT_CEILING + 1)
        with pytest.raises(MCPProtocolError, match="exceeds"):
            proto.parse_wire_payload(blob, negotiated_version=None)


class TestResultTypeStrictness:
    def test_modern_complete_passes(self):
        check = proto.check_result_type({"resultType": "complete"}, era="modern")
        assert check.ok and not check.input_required

    def test_modern_missing_rejected(self):
        check = proto.check_result_type({}, era="modern")
        assert not check.ok and "missing" in check.reason

    def test_modern_unknown_rejected(self):
        check = proto.check_result_type({"resultType": "partial"}, era="modern")
        assert not check.ok

    def test_modern_input_required_flagged_never_ok(self):
        check = proto.check_result_type({"resultType": "input_required"}, era="modern")
        assert not check.ok and check.input_required

    def test_legacy_missing_treated_complete(self):
        assert proto.check_result_type({}, era="legacy").ok

    def test_legacy_ignores_the_field(self):
        assert proto.check_result_type({"resultType": "whatever"}, era="legacy").ok


class TestSchemaValidation:
    def test_plain_object_schema_ok(self):
        check = proto.validate_tool_schema(
            {"type": "object", "properties": {"a": {"type": "string"}}}
        )
        assert check.ok

    def test_composition_without_literal_object_root_ok(self):
        # A valid JSON Schema OBJECT, not a literal root type — composition
        # may establish object semantics (plan §2).
        check = proto.validate_tool_schema(
            {"allOf": [{"type": "object", "properties": {"a": {"type": "string"}}}]}
        )
        assert check.ok

    def test_non_dict_rejected(self):
        assert not proto.validate_tool_schema(["not", "a", "schema"]).ok
        assert not proto.validate_tool_schema(None).ok

    def test_depth_bound(self):
        schema: dict = {"type": "object"}
        node = schema
        for _ in range(proto.MAX_SCHEMA_DEPTH + 2):
            node["properties"] = {"n": {"type": "object"}}
            node = node["properties"]["n"]
        assert not proto.validate_tool_schema(schema).ok

    def test_node_bound(self):
        schema = {
            "type": "object",
            "properties": {f"p{i}": {"type": "string"} for i in range(proto.MAX_SCHEMA_NODES)},
        }
        assert not proto.validate_tool_schema(schema).ok

    def test_byte_bound(self):
        schema = {"type": "object", "description": "x" * proto.MAX_SCHEMA_BYTES_PER_TOOL}
        assert not proto.validate_tool_schema(schema).ok


class TestHeaderParams:
    def test_extraction_happy_path(self):
        schema = {
            "type": "object",
            "properties": {
                "region": {"type": "string", "x-mcp-header": "Region"},
                "count": {"type": "integer", "x-mcp-header": "Count"},
                "plain": {"type": "string"},
            },
        }
        check = proto.extract_header_params(schema)
        assert check.ok
        assert {p.name for p in check.params} == {"Region", "Count"}

    def test_nested_properties_chain_reachable(self):
        schema = {
            "type": "object",
            "properties": {
                "outer": {
                    "type": "object",
                    "properties": {"inner": {"type": "string", "x-mcp-header": "In"}},
                }
            },
        }
        check = proto.extract_header_params(schema)
        assert check.ok and check.params[0].path == ("outer", "inner")

    def test_number_type_invalid(self):
        schema = {
            "type": "object",
            "properties": {"n": {"type": "number", "x-mcp-header": "N"}},
        }
        assert not proto.extract_header_params(schema).ok

    def test_duplicate_case_insensitive_invalid(self):
        schema = {
            "type": "object",
            "properties": {
                "a": {"type": "string", "x-mcp-header": "Region"},
                "b": {"type": "string", "x-mcp-header": "region"},
            },
        }
        assert not proto.extract_header_params(schema).ok

    def test_non_token_name_invalid(self):
        schema = {
            "type": "object",
            "properties": {"a": {"type": "string", "x-mcp-header": "bad name"}},
        }
        assert not proto.extract_header_params(schema).ok

    def test_annotation_inside_composition_invalid(self):
        schema = {
            "type": "object",
            "oneOf": [{"properties": {"a": {"type": "string", "x-mcp-header": "A"}}}],
        }
        assert not proto.extract_header_params(schema).ok

    def test_annotation_inside_items_invalid(self):
        schema = {
            "type": "object",
            "properties": {
                "arr": {
                    "type": "array",
                    "items": {"properties": {"a": {"type": "string", "x-mcp-header": "A"}}},
                }
            },
        }
        assert not proto.extract_header_params(schema).ok

    def test_value_extraction_and_types(self):
        param = proto.HeaderParam("Region", ("region",))
        assert proto.header_param_value({"region": "us-west1"}, param) == "us-west1"
        assert proto.header_param_value({"region": None}, param) is None
        assert proto.header_param_value({}, param) is None
        count = proto.HeaderParam("C", ("c",))
        assert proto.header_param_value({"c": 42}, count) == "42"
        assert proto.header_param_value({"c": True}, count) == "true"
        assert proto.header_param_value({"c": 2**53}, count) is None  # JS-unsafe

    def test_base64_sentinel_encoding(self):
        assert proto.encode_header_value("us-west1") == "us-west1"
        encoded = proto.encode_header_value("Hello, 世界")
        assert encoded.startswith("=?base64?") and encoded.endswith("?=")
        inner = encoded[len("=?base64?") : -2]
        assert base64.b64decode(inner).decode() == "Hello, 世界"
        # Padded values and sentinel-shaped plain values must be encoded.
        assert proto.encode_header_value(" padded ").startswith("=?base64?")
        assert proto.encode_header_value("=?base64?literal?=") != "=?base64?literal?="


class TestPublishedNames:
    def test_plain_names_stay_readable(self):
        assert make_published_name("gh", "list_issues") == "mcp_gh_list_issues"

    def test_deterministic(self):
        assert make_published_name("s", "weird/tool") == make_published_name("s", "weird/tool")

    def test_unsafe_chars_get_digest_suffix(self):
        name = make_published_name("s", "weird/tool")
        assert name.startswith("mcp_s_weird_tool_")
        assert len(name) <= 64

    def test_distinct_tools_never_merge(self):
        a = make_published_name("s", "a/b")
        b = make_published_name("s", "a_b")
        assert a != b

    def test_length_bound(self):
        name = make_published_name("server", "t" * 200)
        assert len(name) <= 64


class TestOutcomeType:
    def test_valid_statuses(self):
        for status in ("ok", "failed", "uncertain"):
            outcome = MCPToolOutcome(status=status, text="x", server="s", tool="t")
            assert outcome.status == status

    def test_invalid_status_rejected(self):
        with pytest.raises(ValueError):
            MCPToolOutcome(status="maybe", text="x", server="s", tool="t")

    def test_flags(self):
        assert MCPToolOutcome(status="ok", text="", server="s", tool="t").ok
        assert MCPToolOutcome(status="uncertain", text="", server="s", tool="t").uncertain


class TestRequestBuilders:
    def test_modern_request_carries_meta(self):
        req = proto.build_request(
            1, "tools/call", {"name": "x"}, era="modern", version="2026-07-28"
        )
        meta = req["params"]["_meta"]
        assert meta[proto.META_PROTOCOL_VERSION] == "2026-07-28"
        assert meta[proto.META_CLIENT_INFO]["name"] == "odin"
        assert meta[proto.META_CLIENT_CAPABILITIES] == {}

    def test_legacy_request_has_no_meta(self):
        req = proto.build_request(1, "tools/list", {}, era="legacy", version="2025-06-18")
        assert "_meta" not in (req.get("params") or {})

    def test_error_response_shape(self):
        resp = proto.build_error_response("abc", -32601, "nope")
        assert resp["id"] == "abc" and resp["error"]["code"] == -32601


class TestHeaderParamsStrayPlacements:
    def test_annotation_under_definitions_invalidates(self):
        # The spec invalidates the tool for an annotation ANYWHERE outside a
        # pure `properties` chain — not only composition keywords.
        schema = {
            "type": "object",
            "properties": {"a": {"type": "string"}},
            "definitions": {"aux": {"properties": {"b": {"type": "string", "x-mcp-header": "B"}}}},
        }
        assert not proto.extract_header_params(schema).ok

    def test_annotation_under_pattern_properties_invalidates(self):
        schema = {
            "type": "object",
            "patternProperties": {"^x": {"type": "string", "x-mcp-header": "X"}},
        }
        assert not proto.extract_header_params(schema).ok


class TestStrictSchemaValidation:
    @pytest.mark.parametrize(
        "schema",
        [
            {"type": "string"},
            {"type": "object", "properties": []},
            {"type": "definitely-not-a-type"},
            {"$ref": 42},
            {"type": ["object", "string"]},
            {},
        ],
    )
    def test_invalid_or_non_object_schemas_rejected(self, schema):
        assert not proto.validate_tool_schema(schema).ok

    def test_local_ref_can_establish_object_semantics(self):
        schema = {
            "$ref": "#/$defs/args",
            "$defs": {"args": {"type": "object", "properties": {"q": {"type": "string"}}}},
        }
        assert proto.validate_tool_schema(schema).ok

    def test_all_union_branches_must_be_objects(self):
        assert proto.validate_tool_schema(
            {"oneOf": [{"type": "object"}, {"type": "object", "properties": {}}]}
        ).ok
        assert not proto.validate_tool_schema(
            {"oneOf": [{"type": "object"}, {"type": "string"}]}
        ).ok

    def test_root_header_annotation_rejected(self):
        schema = {"type": "object", "x-mcp-header": "Root", "properties": {}}
        assert not proto.extract_header_params(schema).ok
