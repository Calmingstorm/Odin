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


def result_page(snapshot: dict, cursor: str = "", limit: int = 1500) -> dict:
    """Page the result and error separately using a bounded total UTF-8 budget."""
    if isinstance(limit, bool) or not isinstance(limit, int) or not 4 <= limit <= 8000:
        raise ValueError("limit must be an integer between 4 and 8000 UTF-8 bytes")
    result = (snapshot.get("result") or "").encode("utf-8")
    error = (snapshot.get("error") or "").encode("utf-8")
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
    chunk = body[offset:offset + limit].decode("utf-8", errors="ignore").encode("utf-8")
    end = offset + len(chunk)
    return {
        "id": snapshot["id"], "label": snapshot.get("label", snapshot["id"])[:200],
        "status": snapshot["status"], "preview": chunk.decode("utf-8"),
        "original_bytes": len(body), "result_bytes": len(result), "error_bytes": len(error),
        "offset": offset, "end": end, "truncated": end < len(body),
        "cursor": f"{digest}:{end}" if end < len(body) else None,
        "iteration_count": snapshot.get("iteration_count", 0),
        "runtime_seconds": snapshot.get("runtime_seconds", 0),
        "tools_used": [name[:100] for name in snapshot.get("tools_used", [])[:50]],
        "tools_omitted": max(0, len(snapshot.get("tools_used", [])) - 50),
    }
