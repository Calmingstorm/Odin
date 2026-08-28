"""Era-agnostic MCP protocol core: versions, eras, message model, bounds.

The protocol matrix (docs/plans/mcp-wiring-plan.md) is normative; this module
is its executable form. Two eras exist:

- **Modern** (revision 2026-07-28): stateless; no initialize handshake; every
  request carries ``_meta`` (protocolVersion / clientInfo /
  clientCapabilities); ``server/discover`` is mandatory on servers; every
  result carries a required ``resultType``.
- **Legacy** (2024-11-05 … 2025-11-25): ``initialize`` → negotiated version →
  ``notifications/initialized`` → operations. 2025-03-26 additionally permits
  JSON-RPC batch arrays on the wire (receive side only for us).

Nothing here does I/O.
"""

from __future__ import annotations

import base64
import json
import math
import re
from dataclasses import dataclass
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

ERA_MODERN = "modern"
ERA_LEGACY = "legacy"

# Exact supported version sets, in preference order (newest first). An
# unknown counteroffer is never accepted, even if it "looks newer".
MODERN_VERSIONS: tuple[str, ...] = ("2026-07-28",)
LEGACY_VERSIONS_STDIO: tuple[str, ...] = (
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
)
# 2024-11-05 over HTTP is the deprecated HTTP+SSE dual-endpoint transport,
# which is out of scope — the legacy HTTP floor is 2025-03-26.
LEGACY_VERSIONS_HTTP: tuple[str, ...] = (
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
)

SUPPORTED_VERSIONS: frozenset[str] = frozenset(MODERN_VERSIONS) | frozenset(LEGACY_VERSIONS_STDIO)

# The one legacy revision whose wire shape permits JSON-RPC batch arrays.
BATCH_WIRE_VERSION = "2025-03-26"

CLIENT_INFO: dict[str, str] = {"name": "odin", "version": "2.0.0"}

META_PREFIX = "io.modelcontextprotocol/"
META_PROTOCOL_VERSION = META_PREFIX + "protocolVersion"
META_CLIENT_INFO = META_PREFIX + "clientInfo"
META_CLIENT_CAPABILITIES = META_PREFIX + "clientCapabilities"
META_SERVER_INFO = META_PREFIX + "serverInfo"

# Recognized modern JSON-RPC error codes (2026-07-28 allocation).
ERROR_HEADER_MISMATCH = -32020
ERROR_MISSING_CLIENT_CAPABILITY = -32021
ERROR_UNSUPPORTED_PROTOCOL_VERSION = -32022
MODERN_ERROR_CODES: frozenset[int] = frozenset(
    {
        ERROR_HEADER_MISMATCH,
        ERROR_MISSING_CLIENT_CAPABILITY,
        ERROR_UNSUPPORTED_PROTOCOL_VERSION,
    }
)
ERROR_METHOD_NOT_FOUND = -32601

RESULT_TYPE_COMPLETE = "complete"
RESULT_TYPE_INPUT_REQUIRED = "input_required"

# ---------------------------------------------------------------------------
# Bounds (plan §9). Wire-level bounds apply BEFORE parsing; model-facing caps
# (description, published counts) are enforced at publication time.
# ---------------------------------------------------------------------------
WIRE_RESULT_CEILING = 4 * 1024 * 1024  # one JSON body / SSE data accumulation
MAX_STDOUT_LINE_BYTES = WIRE_RESULT_CEILING
MAX_SSE_EVENT_BYTES = WIRE_RESULT_CEILING
MAX_STDERR_STORE_BYTES = 64 * 1024
MAX_LIST_PAGES = 32
MAX_DISCOVERED_TOOLS = 128
MAX_PUBLISHED_TOOLS_PER_SERVER = 40
MAX_PUBLISHED_TOOLS_GLOBAL = 40
MAX_SCHEMA_BYTES_PER_TOOL = 32 * 1024
MAX_SCHEMA_BYTES_PER_SERVER = 256 * 1024
MAX_SCHEMA_DEPTH = 20
MAX_SCHEMA_NODES = 2048
MAX_DESCRIPTION_CHARS = 1024
MAX_INSTRUCTIONS_CHARS = 4096  # UI-only display bound; never prompt-injected

_JS_SAFE_INT_MAX = 2**53 - 1
_JS_SAFE_INT_MIN = -(2**53) + 1


def build_request_meta(version: str) -> dict[str, Any]:
    """The ``_meta`` block every modern request carries."""
    return {
        META_PROTOCOL_VERSION: version,
        META_CLIENT_INFO: dict(CLIENT_INFO),
        META_CLIENT_CAPABILITIES: {},
    }


# ---------------------------------------------------------------------------
# Message model
# ---------------------------------------------------------------------------

KIND_REQUEST = "request"
KIND_RESPONSE = "response"
KIND_NOTIFICATION = "notification"
KIND_INVALID = "invalid"


def message_kind(msg: Any) -> str:
    """Classify one JSON-RPC message object."""
    if not isinstance(msg, dict) or msg.get("jsonrpc") != "2.0":
        return KIND_INVALID
    has_id = "id" in msg and msg["id"] is not None
    has_method = isinstance(msg.get("method"), str) and bool(msg.get("method"))
    if has_method and has_id:
        return KIND_REQUEST
    if has_method:
        return KIND_NOTIFICATION
    if has_id and ("result" in msg or "error" in msg):
        return KIND_RESPONSE
    return KIND_INVALID


def parse_wire_payload(raw: bytes | str, *, negotiated_version: str | None) -> list[dict]:
    """Parse one wire payload (a stdout line or an HTTP/SSE body) into
    messages.

    A JSON array is a batch, legal on the receive side ONLY when the
    negotiated version is 2025-03-26 (or negotiation has not completed yet,
    where we must be tolerant enough to read the handshake reply). Every
    other shape must be a single JSON object.
    """
    from .errors import MCPProtocolError

    if isinstance(raw, bytes):
        if len(raw) > WIRE_RESULT_CEILING:
            raise MCPProtocolError(f"wire payload exceeds {WIRE_RESULT_CEILING} bytes")
        raw = raw.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise MCPProtocolError(f"invalid JSON on the wire: {e}") from e

    if isinstance(parsed, list):
        if negotiated_version is not None and negotiated_version != BATCH_WIRE_VERSION:
            raise MCPProtocolError(
                "JSON-RPC batch received but the negotiated version "
                f"{negotiated_version} does not permit batches"
            )
        if not parsed:
            raise MCPProtocolError("empty JSON-RPC batch")
        out: list[dict] = []
        for item in parsed:
            if message_kind(item) == KIND_INVALID:
                raise MCPProtocolError("invalid message inside JSON-RPC batch")
            out.append(item)
        return out

    if message_kind(parsed) == KIND_INVALID:
        raise MCPProtocolError("invalid JSON-RPC message")
    return [parsed]


# ---------------------------------------------------------------------------
# Modern error recognition and version selection
# ---------------------------------------------------------------------------


def rpc_error(msg: dict) -> dict | None:
    """The ``error`` object of a response, if this is an error response."""
    err = msg.get("error")
    return err if isinstance(err, dict) else None


def is_recognized_modern_error(err: dict | None) -> bool:
    """A JSON-RPC error that only a modern (2026-07-28+) server emits."""
    return err is not None and err.get("code") in MODERN_ERROR_CODES


def supported_versions_from_error(err: dict) -> list[str]:
    """The advertised ``supported`` list of an UnsupportedProtocolVersion
    error, empty when absent/malformed."""
    data = err.get("data")
    if not isinstance(data, dict):
        return []
    supported = data.get("supported")
    if not isinstance(supported, list):
        return []
    return [v for v in supported if isinstance(v, str)]


@dataclass(frozen=True)
class VersionSelection:
    """Outcome of modern version selection against an advertised list."""

    version: str | None
    reason: str


def select_modern_version(advertised: Any) -> VersionSelection:
    """Deterministically select a modern version from a server-advertised
    list, per the plan: validate the list, intersect with OUR exact modern
    set, choose by our preference order.

    A malformed, empty, or legacy-only list is **modern-incompatible** —
    never grounds for sending modern metadata under a legacy version, and
    never grounds for an ``initialize`` fallback (the server already proved
    it is modern-era).
    """
    if not isinstance(advertised, list) or not advertised:
        return VersionSelection(None, "server advertised no protocol versions")
    versions = [v for v in advertised if isinstance(v, str)]
    if len(versions) != len(advertised):
        return VersionSelection(None, "server advertised a malformed version list")
    for candidate in MODERN_VERSIONS:
        if candidate in versions:
            return VersionSelection(candidate, "selected")
    return VersionSelection(
        None,
        "server is modern-era but advertises no mutually supported modern "
        f"revision (advertised: {', '.join(versions[:8])})",
    )


def select_legacy_version(counteroffer: str, *, transport: str) -> str | None:
    """Accept a legacy server's negotiated version only from our exact set
    for that transport; unknown counteroffers are rejected."""
    allowed = LEGACY_VERSIONS_STDIO if transport == "stdio" else LEGACY_VERSIONS_HTTP
    return counteroffer if counteroffer in allowed else None


# ---------------------------------------------------------------------------
# resultType (modern-strict; legacy ignores the field entirely)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ResultTypeCheck:
    ok: bool
    input_required: bool
    reason: str


def check_result_type(result: Any, *, era: str) -> ResultTypeCheck:
    """Validate a result's ``resultType`` per era.

    Modern: the field is REQUIRED. ``complete`` passes; ``input_required``
    is an explicit unsupported/incomplete outcome (MRTR is deferred) that the
    caller surfaces as a failure and never replays; missing or unknown
    values are protocol violations. Legacy: the treat-missing-as-complete
    rule applies — the field is ignored.
    """
    if not isinstance(result, dict):
        return ResultTypeCheck(False, False, "result is not an object")
    if era != ERA_MODERN:
        return ResultTypeCheck(True, False, "")
    rt = result.get("resultType")
    if rt == RESULT_TYPE_COMPLETE:
        return ResultTypeCheck(True, False, "")
    if rt == RESULT_TYPE_INPUT_REQUIRED:
        return ResultTypeCheck(
            False,
            True,
            "server requested additional input (MRTR), which this client does not support",
        )
    if rt is None:
        return ResultTypeCheck(False, False, "modern result missing required resultType")
    return ResultTypeCheck(False, False, f"unknown resultType {rt!r}")


# ---------------------------------------------------------------------------
# Tool schema validation (bounded JSON Schema OBJECT — not a literal
# root ``type: object``; composition/$ref may establish object semantics)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SchemaCheck:
    ok: bool
    reason: str
    byte_size: int = 0


def validate_tool_schema(schema: Any) -> SchemaCheck:
    """Validate a bounded Draft 2020-12 schema that establishes object input.

    Bounds are checked before metaschema validation so adversarial listings
    cannot make the validator traverse unbounded input. Object semantics may
    be established through local ``$ref`` or composition; a literal root
    ``type: object`` is deliberately not required.
    """
    if not isinstance(schema, dict):
        return SchemaCheck(False, "inputSchema is not a JSON Schema object")
    try:
        encoded = json.dumps(schema, allow_nan=False)
    except (TypeError, ValueError):
        return SchemaCheck(False, "inputSchema is not valid JSON")
    size = len(encoded.encode("utf-8"))
    if size > MAX_SCHEMA_BYTES_PER_TOOL:
        return SchemaCheck(
            False,
            f"inputSchema exceeds {MAX_SCHEMA_BYTES_PER_TOOL} bytes",
            size,
        )
    nodes = 0
    stack: list[tuple[Any, int]] = [(schema, 1)]
    while stack:
        value, depth = stack.pop()
        if depth > MAX_SCHEMA_DEPTH:
            return SchemaCheck(False, f"inputSchema deeper than {MAX_SCHEMA_DEPTH}", size)
        nodes += 1
        if nodes > MAX_SCHEMA_NODES:
            return SchemaCheck(False, f"inputSchema has more than {MAX_SCHEMA_NODES} nodes", size)
        if isinstance(value, dict):
            if any(not isinstance(key, str) for key in value):
                return SchemaCheck(False, "inputSchema object keys must be strings", size)
            stack.extend((child, depth + 1) for child in value.values())
        elif isinstance(value, list):
            stack.extend((child, depth + 1) for child in value)
        elif isinstance(value, float) and not math.isfinite(value):
            return SchemaCheck(False, "inputSchema contains a non-finite number", size)
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as exc:
        detail = exc.message[:200] if exc.message else "invalid JSON Schema"
        return SchemaCheck(False, f"inputSchema is invalid: {detail}", size)
    if not _schema_establishes_object(schema, schema, set()):
        return SchemaCheck(False, "inputSchema does not establish object input semantics", size)
    return SchemaCheck(True, "", size)


def _schema_establishes_object(node: Any, root: dict, seen_refs: set[str]) -> bool:
    """Conservative proof that every accepted instance is an object.

    This intentionally does not attempt full satisfiability. It recognizes
    the ordinary JSON Schema ways MCP tool schemas establish their object
    input contract while rejecting ambiguous schemas that also accept scalar
    or array arguments.
    """
    if not isinstance(node, dict):
        return False
    declared = node.get("type")
    if declared == "object" or declared == ["object"]:
        return True
    const = node.get("const", object())
    if isinstance(const, dict):
        return True
    enum = node.get("enum")
    if isinstance(enum, list) and enum and all(isinstance(item, dict) for item in enum):
        return True
    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#") and ref not in seen_refs:
        target = _resolve_local_ref(root, ref)
        if target is not None:
            return _schema_establishes_object(target, root, seen_refs | {ref})
    all_of = node.get("allOf")
    if isinstance(all_of, list) and any(
        _schema_establishes_object(branch, root, seen_refs) for branch in all_of
    ):
        return True
    for keyword in ("anyOf", "oneOf"):
        branches = node.get(keyword)
        if (
            isinstance(branches, list)
            and branches
            and all(_schema_establishes_object(branch, root, seen_refs) for branch in branches)
        ):
            return True
    return False


def _resolve_local_ref(root: dict, ref: str) -> Any | None:
    if ref == "#":
        return root
    if not ref.startswith("#/"):
        return None
    current: Any = root
    for raw_part in ref[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


# ---------------------------------------------------------------------------
# x-mcp-header (modern Streamable HTTP — client support is MANDATORY)
# ---------------------------------------------------------------------------

_TCHAR_RE = re.compile(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$")
_HEADER_SAFE_RE = re.compile(r"^[\x21-\x7e]([\x20\x09\x21-\x7e]*[\x21-\x7e])?$")
_B64_SENTINEL_RE = re.compile(r"^=\?base64\?.*\?=$", re.DOTALL)

_PRIMITIVE_HEADER_TYPES = frozenset({"string", "integer", "boolean"})


@dataclass(frozen=True)
class HeaderParam:
    """One ``x-mcp-header`` annotation: mirror the value at ``path`` into
    ``Mcp-Param-{name}``."""

    name: str
    path: tuple[str, ...]


@dataclass(frozen=True)
class HeaderParamsCheck:
    ok: bool
    reason: str
    params: tuple[HeaderParam, ...] = ()


def extract_header_params(schema: dict) -> HeaderParamsCheck:
    """Collect and validate every ``x-mcp-header`` annotation in a tool's
    inputSchema.

    Constraints (2026-07-28): non-empty RFC 9110 token; case-insensitively
    unique; only on primitive string/integer/boolean properties (never
    ``number``); only on properties statically reachable through chains of
    ``properties`` keys (no array/composition/conditional keywords, no
    ``$ref`` in the chain). ANY violation invalidates the WHOLE tool — the
    caller excludes it from publication.
    """
    if "x-mcp-header" in schema:
        return HeaderParamsCheck(False, "x-mcp-header is invalid at the schema root")
    found: list[HeaderParam] = []
    seen_lower: set[str] = set()

    def visit(node: Any, path: tuple[str, ...]) -> str | None:
        """Walk ONLY the statically reachable region: chains of
        ``properties`` keys. Validates and collects annotations found
        there."""
        if not isinstance(node, dict):
            return None
        annotation = node.get("x-mcp-header")
        if annotation is not None:
            if not isinstance(annotation, str) or not annotation:
                return "x-mcp-header value must be a non-empty string"
            if not _TCHAR_RE.match(annotation):
                return f"x-mcp-header value {annotation!r} is not a valid token"
            if annotation.lower() in seen_lower:
                return f"duplicate x-mcp-header value {annotation!r}"
            prop_type = node.get("type")
            if prop_type not in _PRIMITIVE_HEADER_TYPES:
                return (
                    "x-mcp-header only applies to string/integer/boolean "
                    f"properties, got {prop_type!r}"
                )
            seen_lower.add(annotation.lower())
            found.append(HeaderParam(annotation, path))
        props = node.get("properties")
        if isinstance(props, dict):
            for key, child in props.items():
                if not isinstance(key, str):
                    continue
                err = visit(child, path + (key,))
                if err:
                    return err
        return None

    def count_all_annotations(node: Any) -> int:
        """Every annotation anywhere in the schema, reachable or not."""
        total = 0
        stack: list[Any] = [node]
        while stack:
            cur = stack.pop()
            if isinstance(cur, dict):
                if "x-mcp-header" in cur:
                    total += 1
                stack.extend(cur.values())
            elif isinstance(cur, list):
                stack.extend(cur)
        return total

    err = visit(schema, ())
    if err is None and count_all_annotations(schema) != len(found):
        # An annotation exists outside a pure `properties` chain (inside
        # items/oneOf/anyOf/allOf/not/if/then/else/$ref targets/definitions/
        # anything else). The spec invalidates the whole tool for ANY such
        # placement, not only the named composition keywords.
        err = "x-mcp-header on a property not statically reachable"
    if err:
        return HeaderParamsCheck(False, err)
    return HeaderParamsCheck(True, "", tuple(found))


def header_param_value(arguments: dict, param: HeaderParam) -> str | None:
    """Read the instance value at the annotation's exact property path and
    encode it; ``None`` when absent or null (header omitted)."""
    cur: Any = arguments
    for key in param.path:
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    if cur is None:
        return None
    if isinstance(cur, bool):
        text = "true" if cur else "false"
    elif isinstance(cur, int):
        if not (_JS_SAFE_INT_MIN <= cur <= _JS_SAFE_INT_MAX):
            return None
        text = str(cur)
    elif isinstance(cur, str):
        text = cur
    else:
        return None
    return encode_header_value(text)


def encode_header_value(value: str) -> str:
    """RFC-safe header value: plain when already header-safe (and not
    sentinel-shaped), else the Base64 sentinel ``=?base64?…?=`` form."""
    if _HEADER_SAFE_RE.match(value) and not _B64_SENTINEL_RE.match(value):
        return value
    encoded = base64.b64encode(value.encode("utf-8")).decode("ascii")
    return f"=?base64?{encoded}?="


# ---------------------------------------------------------------------------
# Wire message builders
# ---------------------------------------------------------------------------


def build_request(
    req_id: int | str,
    method: str,
    params: dict | None,
    *,
    era: str,
    version: str,
) -> dict:
    body: dict[str, Any] = {"jsonrpc": "2.0", "id": req_id, "method": method}
    if era == ERA_MODERN:
        merged = dict(params or {})
        merged["_meta"] = build_request_meta(version)
        body["params"] = merged
    elif params is not None:
        body["params"] = params
    return body


def build_notification(method: str, params: dict | None = None) -> dict:
    body: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        body["params"] = params
    return body


def build_error_response(req_id: Any, code: int, message: str) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": code, "message": message},
    }
