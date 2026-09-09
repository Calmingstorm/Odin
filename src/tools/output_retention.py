"""Immutable scrubbed text and opaque binary attachments with a fixed 24-hour TTL."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
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


@dataclass(frozen=True)
class BinarySnapshot:
    result_id: str
    data: bytes = field(repr=False)
    owner: str
    channel: str
    tool: str
    hosts: tuple
    expires_at: float
    status: str
    media_type: str
    content_index: int
    kind: str
    sha256: str


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
            db.execute("""CREATE TABLE IF NOT EXISTS output_blobs (
                id TEXT PRIMARY KEY, data BLOB, owner TEXT, channel TEXT, tool TEXT,
                hosts TEXT, expires REAL, status TEXT, size INTEGER, media_type TEXT,
                content_index INTEGER, kind TEXT, sha256 TEXT)""")
            with db:
                yield db
        finally:
            db.close()

    def _prune(self, db, now):
        db.execute("DELETE FROM outputs WHERE expires <= ?", (now,))
        db.execute("DELETE FROM output_blobs WHERE expires <= ?", (now,))

    def _used(self, db, now):
        return db.execute(
            "SELECT (SELECT COALESCE(SUM(size),0) FROM outputs WHERE expires > ?) + "
            "(SELECT COALESCE(SUM(size),0) FROM output_blobs WHERE expires > ?)",
            (now, now),
        ).fetchone()[0]

    def retain(self, text, *, owner, channel, tool, hosts=(), status="succeeded"):
        if not owner:
            raise RetentionError("No originating authorization scope.")
        matches = getattr(text, "matches", ())
        # Reject known-unretainable input before scrubbing. Bounded UTF-8
        # encodings avoid allocating another full copy of oversized output.
        raw_size = max(0, len(matches)-1)*2
        for part in matches or (text,):
            if raw_size + len(part) > self.per_result_bytes:
                raise RetentionError("Per-result retention quota exceeded.")
            for start in range(0, len(part), 65536):
                raw_size += len(part[start:start+65536].encode("utf-8"))
                if raw_size > self.per_result_bytes:
                    raise RetentionError("Per-result retention quota exceeded.")
        # Avoid full scrubbing when the global quota is already exhausted.
        # The write transaction below still arbitrates concurrent admissions.
        now = self.clock()
        with self._db() as db:
            used = self._used(db, now)
            if used + raw_size > self.global_bytes:
                raise RetentionError("Global retention quota exhausted.")
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
            self._prune(db, now)
            used = self._used(db, now)
            if used + size > self.global_bytes:
                raise RetentionError("Global retention quota exhausted.")
            db.execute("INSERT INTO outputs VALUES (?,?,?,?,?,?,?,?,?,?)", (
                snapshot.result_id, text, owner, channel, tool, json.dumps(hosts),
                snapshot.expires_at, status, size, json.dumps(boundaries)))
        return snapshot

    def retain_binary_bundle(self, attachments, *, owner, channel, tool, hosts=(),
                             status="succeeded"):
        """Atomically retain opaque bytes AND their discoverable manifest.

        Never decode them as text or pass base64 through the text scrubber:
        either would silently corrupt arbitrary files. The same private store,
        fixed TTL, combined global quota and live retrieval fences apply.
        """
        from .output_delivery import binary_reference

        if not owner:
            raise RetentionError("No originating authorization scope.")
        if not 1 <= len(attachments) <= 64:
            raise RetentionError("Invalid attachment bundle size.")
        if sum(len(item.data) for item in attachments) > self.per_result_bytes:
            raise RetentionError("Per-result retention quota exceeded.")
        now = self.clock()
        blobs = [BinarySnapshot(
            uuid.uuid4().hex, item.data, owner, channel, tool, tuple(hosts), now + 86400,
            status, item.media_type, item.content_index, item.kind,
            hashlib.sha256(item.data).hexdigest(),
        ) for item in attachments]
        text = json.dumps({"attachments": [binary_reference(blob) for blob in blobs]},
                          ensure_ascii=True, separators=(",", ":"))
        manifest_size = len(text.encode("utf-8"))
        if manifest_size > self.per_result_bytes:
            raise RetentionError("Attachment manifest quota exceeded.")
        # Empty/tiny files still cost rows and metadata; otherwise repeated
        # zero-byte attachments evade the global quota entirely.
        charge = manifest_size + sum(len(blob.data) + 512 for blob in blobs)
        manifest = Snapshot(uuid.uuid4().hex, text, owner, channel, tool, tuple(hosts),
                            now + 86400, status)
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            self._prune(db, now)
            if self._used(db, now) + charge > self.global_bytes:
                raise RetentionError("Global retention quota exhausted.")
            for blob in blobs:
                db.execute("INSERT INTO output_blobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    blob.result_id, blob.data, owner, channel, tool, json.dumps(hosts),
                    blob.expires_at, status, len(blob.data) + 512, blob.media_type,
                    blob.content_index, blob.kind, blob.sha256,
                ))
            db.execute("INSERT INTO outputs VALUES (?,?,?,?,?,?,?,?,?,?)", (
                manifest.result_id, text, owner, channel, tool, json.dumps(hosts),
                manifest.expires_at, status, manifest_size, "[]",
            ))
        return manifest

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
            self._prune(db, self.clock())
            meta = db.execute(
                "SELECT owner,channel,tool,hosts,expires FROM outputs WHERE id=?", (result_id,)
            ).fetchone()
            binary = meta is None
            if binary:
                meta = db.execute(
                    "SELECT owner,channel,tool,hosts,expires FROM output_blobs WHERE id=?",
                    (result_id,),
                ).fetchone()
            if meta is None or meta[4] <= self.clock():
                raise RetentionError("Retention expired or unavailable; no continuation exists.")
            hosts = tuple(json.loads(meta[3]))
            if not owner or meta[:2] != (owner, channel) or not authorize(meta[2], hosts):
                raise RetentionError(
                    "Permission denied: originating output scope is no longer authorized.")
            if binary:
                row = db.execute("SELECT * FROM output_blobs WHERE id=?", (result_id,)).fetchone()
            else:
                row = db.execute("SELECT * FROM outputs WHERE id=?", (result_id,)).fetchone()
        if binary:
            blob = BinarySnapshot(row[0], row[1], row[2], row[3], row[4], hosts,
                                  row[6], row[7], row[9], row[10], row[11], row[12])
            if offset < 0 or offset > len(blob.data):
                raise RetentionError("Invalid output cursor offset.")
            return blob, offset
        snapshot = Snapshot(row[0], row[1], row[2], row[3], row[4], hosts,
                            row[6], row[7], tuple(json.loads(row[9])))
        if offset < 0 or offset > len(snapshot.text):
            raise RetentionError("Invalid output cursor offset.")
        return snapshot, offset
