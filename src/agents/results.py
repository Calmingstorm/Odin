"""Durable result snapshots alongside trajectories; bounded UTF-8 continuation.

New result records have the same retention as trajectories (no automatic deletion).
Cursors bind an immutable result body and byte offset, not requester authority.
Every page must independently pass the caller's ownership check.
"""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

from ..llm.secret_scrubber import scrub_output_secrets


def result_path(directory: Path, agent_id: str) -> Path:
    key = hashlib.sha256(agent_id.encode("utf-8")).hexdigest()
    return directory / "results" / f"{key}.json"


def publish_result(directory: Path, snapshot: dict) -> None:
    path = result_path(directory, snapshot["id"])
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=".result-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(snapshot, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        parent_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def read_result(directory: Path, agent_id: str) -> dict | None:
    try:
        snapshot = json.loads(result_path(directory, agent_id).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    if not isinstance(snapshot, dict) or snapshot.get("id") != agent_id:
        raise ValueError("Invalid durable agent result record")
    return snapshot


def serialize_page(page: dict) -> str:
    """The native handler's production serialization, also used for budgeting."""
    return json.dumps(page, ensure_ascii=False)


def canonical_result(snapshot: dict) -> tuple[bytes, bytes]:
    """Scrub before slicing, including secrets spanning a future page boundary."""
    return (scrub_output_secrets(snapshot.get("result") or "").encode("utf-8"),
            scrub_output_secrets(snapshot.get("error") or "").encode("utf-8"))


def result_page(
    snapshot: dict, cursor: str = "", limit: int = 4000, *, max_chars: int | None = None,
) -> dict:
    """Largest UTF-8 prefix fitting both byte limit and complete delivery budget."""
    from ..tools.output_delivery import get_delivery_budget

    if max_chars is None:
        max_chars = get_delivery_budget()
    if isinstance(limit, bool) or not isinstance(limit, int) or not 4 <= limit <= 8000:
        raise ValueError("limit must be an integer between 4 and 8000 UTF-8 bytes")
    result, error = canonical_result(snapshot)
    body = result + error
    digest = hashlib.sha256(body).hexdigest()
    offset = 0
    if cursor:
        version, separator, raw_offset = cursor.partition(":")
        if not separator or version != digest or not raw_offset.isdecimal():
            raise ValueError("Invalid or stale result cursor")
        offset = int(raw_offset)
    if offset > len(body):
        raise ValueError("Result cursor exceeds original length")
    try:
        body[:offset].decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Result cursor is not a UTF-8 boundary") from exc
    tools = snapshot.get("tools_used", [])
    page = {
        "id": snapshot["id"],
        "label": scrub_output_secrets(snapshot.get("label", snapshot["id"]))[:200],
        "status": snapshot["status"], "preview": "",
        "original_bytes": len(body), "result_bytes": len(result), "error_bytes": len(error),
        "source_original_bytes": sum(len((snapshot.get(k) or "").encode("utf-8"))
                                     for k in ("result", "error")),
        "offset": offset, "end": offset, "truncated": offset < len(body),
        "cursor": f"{digest}:{offset}" if offset < len(body) else None,
        "iteration_count": snapshot.get("iteration_count", 0),
        "runtime_seconds": snapshot.get("runtime_seconds", 0),
        "tools_used": [], "tools_omitted": len(tools),
    }
    # Optional tool metadata has its own serialized allowance. It must never
    # consume the entire page budget or force a non-advancing cursor.
    allowance = min(2000, max_chars // 4)
    for name in tools[:50]:
        candidate = page["tools_used"] + [scrub_output_secrets(name)[:100]]
        if len(serialize_page({"tools_used": candidate})) > allowance:
            break
        page["tools_used"] = candidate
    page["tools_omitted"] = len(tools) - len(page["tools_used"])
    text = body[offset:offset + limit].decode("utf-8", errors="ignore")

    def candidate(count: int) -> dict:
        preview = text[:count]
        end = offset + len(preview.encode("utf-8"))
        return {**page, "preview": preview, "end": end, "truncated": end < len(body),
                "cursor": f"{digest}:{end}" if end < len(body) else None}

    # The terminal envelope drops its cursor; try it first (the size decrease
    # at EOF would otherwise violate the binary search's monotonic predicate).
    full = candidate(len(text))
    if len(serialize_page(full)) <= max_chars:
        return full
    for field, empty in (("tools_used", []), ("label", "")):
        if len(serialize_page(candidate(min(1, len(text))))) <= max_chars:
            break
        page[field] = empty
        page["tools_omitted"] = len(tools) - len(page["tools_used"])
    if len(serialize_page(candidate(min(1, len(text))))) > max_chars:
        raise ValueError("Agent result envelope exceeds delivery budget; reduce metadata.")
    full = candidate(len(text))
    if len(serialize_page(full)) <= max_chars:
        return full
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if len(serialize_page(candidate(mid))) <= max_chars:
            lo = mid
        else:
            hi = mid - 1
    if text and lo == 0:
        raise ValueError("Agent result envelope exceeds delivery budget; no UTF-8 progress.")
    return candidate(lo)
