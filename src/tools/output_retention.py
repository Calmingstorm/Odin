"""Immutable scrubbed evidence with a fixed 24-hour TTL."""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from ..llm.secret_scrubber import scrub_output_secrets


@dataclass(frozen=True)
class Snapshot:
    result_id: str
    text: str
    owner: str
    channel: str
    tool: str
    hosts: tuple[str, ...]
    expires_at: float
    status: str
    boundaries: tuple[int, ...] = ()


class RetentionError(ValueError):
    pass


class OutputStore:
    def __init__(self, path, *, per_result_bytes=4194304, global_bytes=67108864, clock=time.time):
        self.path = Path(path)
        self.per_result_bytes, self.global_bytes, self.clock = per_result_bytes, global_bytes, clock

    @contextmanager
    def _db(self):
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(fd)
        os.chmod(self.path, 0o600)
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.execute("PRAGMA synchronous=FULL")
            db.execute("PRAGMA secure_delete=ON")
            db.execute("""CREATE TABLE IF NOT EXISTS outputs (
                id TEXT PRIMARY KEY, text TEXT, owner TEXT, channel TEXT, tool TEXT,
                hosts TEXT, expires REAL, status TEXT, size INTEGER, boundaries TEXT)""")
            with db:
                yield db
        finally:
            db.close()

    def retain(self, text, *, owner, channel, tool, hosts=(), status="succeeded"):
        if not owner:
            raise RetentionError("No originating authorization scope.")
        matches = getattr(text, "matches", ())
        boundaries = []
        if matches:
            parts = [scrub_output_secrets(str(part)) for part in matches]
            text = "\n\n".join(parts)
            total = 0
            for i, part in enumerate(parts):
                total += len(part) + (2 if i < len(parts)-1 else 0)
                boundaries.append(total)
        else:
            text = scrub_output_secrets(str(text))
        size = len(text.encode("utf-8"))
        if size > self.per_result_bytes:
            raise RetentionError("Per-result retention quota exceeded.")
        now = self.clock()
        snapshot = Snapshot(uuid.uuid4().hex, text, owner, channel, tool, tuple(hosts),
                            now + 86400, status, tuple(boundaries))
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM outputs WHERE expires <= ?", (now,))
            used = db.execute("SELECT COALESCE(SUM(size),0) FROM outputs").fetchone()[0]
            if used + size > self.global_bytes:
                raise RetentionError("Global retention quota exhausted.")
            db.execute("INSERT INTO outputs VALUES (?,?,?,?,?,?,?,?,?,?)", (
                snapshot.result_id, text, owner, channel, tool, json.dumps(hosts),
                snapshot.expires_at, status, size, json.dumps(boundaries)))
        return snapshot

    def read(self, cursor, *, owner, channel, authorize):
        try:
            result_id, raw_offset = cursor.split(":")
            if len(result_id) != 32 or any(c not in "0123456789abcdef" for c in result_id):
                raise ValueError
            offset = int(raw_offset)
        except (ValueError, AttributeError):
            raise RetentionError("Invalid output cursor.") from None
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM outputs WHERE expires <= ?", (self.clock(),))
            db.commit()
            meta = db.execute(
                "SELECT owner,channel,tool,hosts,expires FROM outputs WHERE id=?", (result_id,)
            ).fetchone()
            if meta is None or meta[4] <= self.clock():
                raise RetentionError("Retention expired or unavailable; no continuation exists.")
            hosts = tuple(json.loads(meta[3]))
            if not owner or meta[:2] != (owner, channel) or not authorize(meta[2], hosts):
                raise RetentionError(
                    "Permission denied: originating output scope is no longer authorized.")
            row = db.execute("SELECT * FROM outputs WHERE id=?", (result_id,)).fetchone()
        snapshot = Snapshot(row[0], row[1], row[2], row[3], row[4], hosts,
                            row[6], row[7], tuple(json.loads(row[9])))
        if offset < 0 or offset > len(snapshot.text):
            raise RetentionError("Invalid output cursor offset.")
        return snapshot, offset
