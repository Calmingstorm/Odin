"""Bounded private pipe protocol. Image data must never be emitted to audit."""

from __future__ import annotations

import base64
import json

MAX_WIRE_BYTES = 24 * 1024 * 1024


def encode(message: dict) -> bytes:
    data = json.dumps(message, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode()
    if len(data) > MAX_WIRE_BYTES:
        raise ValueError("desktop message exceeds wire cap")
    return data + b"\n"


def decode(data: bytes, *, cap: int = MAX_WIRE_BYTES) -> dict:
    if len(data) > cap or not data.endswith(b"\n"):
        raise ValueError("invalid desktop wire frame")
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError("duplicate desktop JSON key")
            value[key] = item
        return value
    def invalid_constant(_):
        raise ValueError("nonfinite JSON")
    value = json.loads(data, object_pairs_hook=pairs, parse_constant=invalid_constant)
    if not isinstance(value, dict):
        raise ValueError("desktop message must be an object")
    return value


def pack_blob(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def unpack_blob(data: str, *, cap: int) -> bytes:
    if not isinstance(data, str) or len(data) > ((cap + 2) // 3) * 4:
        raise ValueError("desktop blob exceeds cap")
    raw = base64.b64decode(data, validate=True)
    if len(raw) > cap:
        raise ValueError("desktop blob exceeds cap")
    return raw
