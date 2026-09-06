"""Durable, append-only Usage & Activity aggregation.

Trajectories and the HMAC audit log remain the source evidence.  This module
indexes only bounded, non-content facts into its own SQLite database so WebUI
reads never scan multi-gigabyte JSONL history.  Fact inserts are idempotent;
observer failures are swallowed and a resumable backfill repairs gaps.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sqlite3
import threading
import time
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO, Literal

from ..odin_log import get_logger

log = get_logger("usage")

_SCHEMA_VERSION = 2
# Declared column layouts the store is willing to operate on.  Validation
# inspects the real table shape (PRAGMA table_info) before AND after any
# migration — the metadata row is a claim, the table is the fact.
_GENERATION_COLUMNS_V1: dict[str, str] = {
    "fact_id": "TEXT",
    "turn_fact_id": "TEXT",
    "occurred_at": "REAL",
    "ordinal": "INTEGER",
    "provider": "TEXT",
    "model": "TEXT",
    "effort": "TEXT",
    "input_tokens": "INTEGER",
    "input_provenance": "TEXT",
    "output_tokens": "INTEGER",
    "output_provenance": "TEXT",
    "duration_ms": "INTEGER",
}
_GENERATION_COLUMNS_V2: dict[str, str] = {
    **_GENERATION_COLUMNS_V1,
    "cached_tokens": "INTEGER",
    "cache_write_tokens": "INTEGER",
}


class UsageSchemaError(RuntimeError):
    """The on-disk usage store is not a layout this code can operate on."""
_BACKFILL_RECORDS = 250
_BACKFILL_BYTES = 4 * 1024 * 1024
_BACKFILL_PAUSE_SECONDS = 0.05
_TAIL_INTERVAL_SECONDS = 10.0
_ALLOWED_RANGES = {"24h": 24, "7d": 24 * 7, "30d": 24 * 30, "all": None}


def _table_columns(conn: sqlite3.Connection, table: str) -> dict[str, str]:
    return {
        str(row[1]): str(row[2] or "").upper()
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }


def _require_columns(conn: sqlite3.Connection, table: str, expected: dict[str, str]) -> None:
    actual = _table_columns(conn, table)
    if actual != expected:
        missing = sorted(set(expected) - set(actual))
        extra = sorted(set(actual) - set(expected))
        mismatched = sorted(
            name for name in expected if name in actual and actual[name] != expected[name]
        )
        raise UsageSchemaError(
            f"{table} layout is incompatible (missing={missing}, extra={extra}, "
            f"type_mismatch={mismatched})"
        )


def _stored_schema_version(conn: sqlite3.Connection) -> int | None:
    row = conn.execute("SELECT value FROM usage_meta WHERE key='schema_version'").fetchone()
    if row is None:
        return None
    text = str(row[0]).strip()
    if not text.isdigit():
        raise UsageSchemaError(f"malformed usage schema_version {row[0]!r}")
    return int(text)


def _parse_timestamp(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return number if number >= 0 else None
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.timestamp()
    except (TypeError, ValueError, OverflowError):
        return None


def _nonnegative_int(value: object) -> int | None:
    return value if type(value) is int and value >= 0 else None


def _bounded_text(value: object, limit: int = 160) -> str:
    return str(value or "")[:limit]


def _source_surface(record: dict, kind: str) -> str:
    if kind == "agent":
        return "agent"
    raw = str(record.get("source") or "discord").lower()
    if raw in {"loop", "autonomous_loop"}:
        return "loop"
    if raw in {"web", "api"}:
        return "web"
    if raw in {"scheduled", "schedule", "background"}:
        return "scheduled"
    if raw in {"discord", "chat"}:
        return "chat"
    return "other"


def _turn_identity(record: dict, kind: str) -> str | None:
    if kind == "agent":
        owner = record.get("agent_id")
        if not isinstance(owner, str) or not owner:
            return None
        return f"agent:{owner}"
    message_id = record.get("message_id")
    if not isinstance(message_id, str) or not message_id:
        return None
    source = _source_surface(record, kind)
    channel = str(record.get("channel_id") or "")
    loop_id = str(record.get("loop_id") or "")
    return f"turn:{source}:{channel}:{loop_id}:{message_id}"


def _generation_tokens(row: dict) -> tuple[int | None, str, int | None, str]:
    """Resolve one generation without blessing legacy estimates as truth."""
    has_new_input = "input_token_provenance" in row
    has_new_output = "output_token_provenance" in row

    input_prov = str(row.get("input_token_provenance") or "")
    server_input = _nonnegative_int(row.get("server_input_tokens"))
    estimated_input = _nonnegative_int(row.get("estimated_input_tokens"))
    input_tokens: int | None
    if has_new_input:
        if input_prov == "provider_reported" and server_input is not None:
            input_tokens, input_prov = server_input, "provider_reported"
        elif input_prov in {"estimated_context_v1", "estimated_legacy_4char"}:
            if estimated_input is not None:
                input_tokens = estimated_input
            else:
                input_tokens = _nonnegative_int(row.get("input_tokens"))
            if input_tokens is None:
                input_prov = "unknown"
        else:
            input_tokens, input_prov = None, "unknown"
    else:
        input_tokens = _nonnegative_int(row.get("input_tokens"))
        input_prov = "legacy_estimated" if input_tokens is not None else "unknown"

    output_prov = str(row.get("output_token_provenance") or "")
    server_output = _nonnegative_int(row.get("server_output_tokens"))
    output_tokens: int | None
    if has_new_output:
        if output_prov == "provider_reported" and server_output is not None:
            output_tokens, output_prov = server_output, "provider_reported"
        elif output_prov in {
            "estimated_text_v1",
            "estimated_context_v1",
            "estimated_legacy_4char",
        }:
            output_tokens = _nonnegative_int(row.get("output_tokens"))
            if output_tokens is None:
                output_prov = "unknown"
        else:
            output_tokens, output_prov = None, "unknown"
    else:
        output_tokens = _nonnegative_int(row.get("output_tokens"))
        output_prov = "legacy_estimated" if output_tokens is not None else "unknown"

    return input_tokens, input_prov, output_tokens, output_prov


def _previous_line(
    handle: BinaryIO,
    end: int,
    *,
    max_bytes: int = _BACKFILL_BYTES,
) -> tuple[int, bytes] | None:
    """Return the previous complete line, bounded by ``max_bytes``.

    Oversized rows are returned as a bounded malformed sentinel while the
    cursor still advances past them. Statistics are never worth allocating a
    90 MiB trajectory row, much less the whole 3.4 GiB archive in one gulp.
    """
    if end <= 0:
        return None
    line_end = end
    handle.seek(line_end - 1)
    if handle.read(1) == b"\n":
        line_end -= 1
    if line_end <= 0:
        return (0, b"")
    pos = line_end
    scanned = 0
    block_size = 64 * 1024
    while pos > 0:
        start = max(0, pos - block_size)
        handle.seek(start)
        block = handle.read(pos - start)
        idx = block.rfind(b"\n")
        if idx >= 0:
            line_start = start + idx + 1
            length = line_end - line_start
            if length > max_bytes:
                return line_start, b"<oversized usage row>"
            handle.seek(line_start)
            return line_start, handle.read(length)
        scanned += len(block)
        if scanned > max_bytes:
            # Continue locating the boundary without retaining row bytes.
            while start > 0:
                pos = start
                start = max(0, pos - block_size)
                handle.seek(start)
                block = handle.read(pos - start)
                idx = block.rfind(b"\n")
                if idx >= 0:
                    return start + idx + 1, b"<oversized usage row>"
            return 0, b"<oversized usage row>"
        pos = start
    handle.seek(0)
    return 0, handle.read(line_end)


class UsageRollup:
    """Owns the independent SQLite rollup and its background reconciler."""

    def __init__(
        self,
        directory: str,
        *,
        trajectory_directory: str,
        agent_trajectory_directory: str,
        audit,
    ) -> None:
        self.directory = Path(directory)
        self.db_path = self.directory / "usage.sqlite3"
        self.trajectory_directory = Path(trajectory_directory)
        self.agent_trajectory_directory = Path(agent_trajectory_directory)
        self.audit = audit
        self.available = False
        self.error: str | None = None
        self._lock = threading.RLock()
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._observer_tasks: set[asyncio.Task] = set()
        self._source_scan_errors = 0
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            self._initialize()
            self.available = True
        except Exception as exc:  # feature absence must never block boot
            self.error = f"{type(exc).__name__}: {exc}"
            log.exception("Usage rollup unavailable; history will remain unindexed")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=0.1)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _initialize(self) -> None:
        with self._lock, closing(self._connect()) as conn:
            existing = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
            fresh = "usage_meta" not in existing and "generation_facts" not in existing
            if not fresh:
                # An existing store: enforce its declared version BEFORE any
                # DDL touches it, then migrate additively inside one
                # transaction.  Unknown layouts fail here instead of being
                # silently blessed by CREATE TABLE IF NOT EXISTS.
                self._migrate_existing(conn, existing)
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS usage_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS turn_facts (
                    fact_id TEXT PRIMARY KEY,
                    occurred_at REAL NOT NULL,
                    surface TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    iteration_count INTEGER NOT NULL,
                    is_error INTEGER NOT NULL,
                    agent_final_state TEXT,
                    recovery_attempts INTEGER NOT NULL DEFAULT 0,
                    agent_depth INTEGER,
                    parent_id TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_usage_turn_time ON turn_facts(occurred_at);
                CREATE INDEX IF NOT EXISTS idx_usage_turn_surface
                    ON turn_facts(surface, occurred_at);
                CREATE TABLE IF NOT EXISTS generation_facts (
                    fact_id TEXT PRIMARY KEY,
                    turn_fact_id TEXT NOT NULL,
                    occurred_at REAL NOT NULL,
                    ordinal INTEGER NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    effort TEXT,
                    input_tokens INTEGER,
                    input_provenance TEXT NOT NULL,
                    output_tokens INTEGER,
                    output_provenance TEXT NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    cached_tokens INTEGER,
                    cache_write_tokens INTEGER,
                    FOREIGN KEY(turn_fact_id) REFERENCES turn_facts(fact_id)
                );
                CREATE INDEX IF NOT EXISTS idx_usage_generation_time
                    ON generation_facts(occurred_at);
                CREATE INDEX IF NOT EXISTS idx_usage_generation_model
                    ON generation_facts(provider, model, effort, occurred_at);
                CREATE TABLE IF NOT EXISTS tool_facts (
                    fact_id TEXT PRIMARY KEY,
                    occurred_at REAL NOT NULL,
                    tool_name TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    is_error INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_usage_tool_time ON tool_facts(occurred_at);
                CREATE INDEX IF NOT EXISTS idx_usage_tool_name
                    ON tool_facts(tool_name, occurred_at);
                CREATE TABLE IF NOT EXISTS ingestion_cursors (
                    source_id TEXT PRIMARY KEY,
                    source_kind TEXT NOT NULL,
                    display_path TEXT NOT NULL,
                    device INTEGER NOT NULL,
                    inode INTEGER NOT NULL,
                    low_offset INTEGER NOT NULL,
                    high_offset INTEGER NOT NULL,
                    initial_size INTEGER NOT NULL,
                    initial_complete INTEGER NOT NULL DEFAULT 0,
                    malformed_rows INTEGER NOT NULL DEFAULT 0,
                    scan_errors INTEGER NOT NULL DEFAULT 0,
                    updated_at REAL NOT NULL
                );
                """
            )
            if fresh:
                conn.execute(
                    "INSERT INTO usage_meta(key, value) VALUES('schema_version', ?)",
                    (str(_SCHEMA_VERSION),),
                )
            conn.commit()
            _require_columns(conn, "generation_facts", _GENERATION_COLUMNS_V2)
            if _stored_schema_version(conn) != _SCHEMA_VERSION:
                raise UsageSchemaError("schema_version did not settle at the current version")
            # Availability means writable: a store another process holds
            # exclusively fails here (bounded by the busy timeout) instead of
            # failing on the first ingest much later.
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("COMMIT")

    @staticmethod
    def _migrate_existing(conn: sqlite3.Connection, existing: set[str]) -> None:
        if "usage_meta" not in existing or "generation_facts" not in existing:
            raise UsageSchemaError("existing usage store is missing its core tables")
        version = _stored_schema_version(conn)
        if version is None:
            raise UsageSchemaError("existing usage store declares no schema_version")
        if version < 1:
            raise UsageSchemaError(f"unsupported usage schema_version {version}")
        if version > _SCHEMA_VERSION:
            raise UsageSchemaError(
                f"usage store schema_version {version} is newer than supported {_SCHEMA_VERSION}"
            )
        if version == _SCHEMA_VERSION:
            _require_columns(conn, "generation_facts", _GENERATION_COLUMNS_V2)
            return
        # version == 1: additive v1 → v2 under one transaction.  Any failure —
        # a DDL error, a column that does not appear, the metadata update —
        # rolls back both the schema change and the version advance.
        _require_columns(conn, "generation_facts", _GENERATION_COLUMNS_V1)
        conn.execute("BEGIN IMMEDIATE")
        try:
            for column in ("cached_tokens", "cache_write_tokens"):
                conn.execute(f"ALTER TABLE generation_facts ADD COLUMN {column} INTEGER")
            _require_columns(conn, "generation_facts", _GENERATION_COLUMNS_V2)
            updated = conn.execute(
                "UPDATE usage_meta SET value=? WHERE key='schema_version'",
                (str(_SCHEMA_VERSION),),
            ).rowcount
            if updated != 1:
                raise UsageSchemaError("schema_version row vanished during migration")
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        log.info("Usage store migrated from schema v1 to v%d", _SCHEMA_VERSION)

    def schedule_trajectory(self, record: dict, kind: Literal["turn", "agent"]) -> None:
        """Queue a post-persistence observer without extending settlement latency."""
        if not self.available:
            return
        try:
            task = asyncio.create_task(
                self.observe_trajectory(record, kind),
                name=f"usage_observe_{kind}",
            )
            self._observer_tasks.add(task)
            task.add_done_callback(self._observer_tasks.discard)
        except Exception:
            log.debug("Could not schedule usage observer; backfill will reconcile", exc_info=True)

    async def observe_trajectory(self, record: dict, kind: str) -> None:
        try:
            await asyncio.to_thread(self._ingest_trajectory, record, kind)
        except Exception:
            log.exception("Usage trajectory observer failed (non-fatal; backfill will retry)")

    def _ingest_trajectory(self, record: dict, kind: str, conn=None) -> bool:
        if not isinstance(record, dict):
            return False
        # New writers identify non-terminal checkpoints explicitly. Legacy
        # rows predate the marker and retain their historical settled meaning.
        if record.get("usage_settled") is False:
            return True
        fact_id = _turn_identity(record, kind)
        occurred = _parse_timestamp(record.get("timestamp"))
        iterations = record.get("iterations")
        if fact_id is None or occurred is None or not isinstance(iterations, list):
            return False
        surface = _source_surface(record, kind)
        if kind == "agent":
            final_state = _bounded_text(record.get("final_state"), 64).lower()
            outcome = final_state or "unknown"
            is_error = final_state in {"failed", "timeout", "killed", "cancelled"}
        else:
            final_state = ""
            is_error = bool(record.get("is_error"))
            outcome = "error" if is_error else "completed"
        duration = _nonnegative_int(record.get("total_duration_ms")) or 0
        iteration_count = _nonnegative_int(record.get("iteration_count"))
        if iteration_count is None:
            iteration_count = len(iterations)
        recovery_attempts = _nonnegative_int(record.get("recovery_attempts")) or 0
        depth = _nonnegative_int(record.get("depth")) if kind == "agent" else None
        parent_id = _bounded_text(record.get("parent_id"), 160) or None

        owns = conn is None
        if owns:
            self._lock.acquire()
            conn = self._connect()
        try:
            conn.execute(
                """INSERT OR IGNORE INTO turn_facts(
                    fact_id, occurred_at, surface, outcome, duration_ms,
                    iteration_count, is_error, agent_final_state,
                    recovery_attempts, agent_depth, parent_id
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    fact_id, occurred, surface, outcome, duration,
                    iteration_count, int(is_error), final_state or None,
                    recovery_attempts, depth, parent_id,
                ),
            )
            for index, row in enumerate(iterations):
                if not isinstance(row, dict):
                    continue
                input_tokens, input_prov, output_tokens, output_prov = _generation_tokens(row)
                ordinal = _nonnegative_int(row.get("iteration"))
                if ordinal is None:
                    ordinal = index + 1
                generation_id = f"{fact_id}:generation:{index}:{ordinal}"
                conn.execute(
                    """INSERT OR IGNORE INTO generation_facts(
                        fact_id, turn_fact_id, occurred_at, ordinal, provider,
                        model, effort, input_tokens, input_provenance,
                        output_tokens, output_provenance, duration_ms,
                        cached_tokens, cache_write_tokens
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        generation_id, fact_id, occurred, ordinal,
                        _bounded_text(row.get("provider") or "unknown", 80),
                        _bounded_text(row.get("model") or "unknown", 160),
                        _bounded_text(row.get("reasoning_effort"), 40) or None,
                        input_tokens, input_prov, output_tokens, output_prov,
                        _nonnegative_int(row.get("duration_ms")) or 0,
                        _nonnegative_int(row.get("cached_tokens")),
                        _nonnegative_int(row.get("cache_write_tokens")),
                    ),
                )
            if owns:
                conn.commit()
            return True
        finally:
            if owns:
                conn.close()
                self._lock.release()

    @staticmethod
    def _tool_fact(raw: bytes) -> tuple | None:
        try:
            record = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        if not isinstance(record, dict):
            return None
        # Generic audit events also carry ``tool_name=action`` for search
        # compatibility. They are not tool executions and must not inflate the
        # Usage screen. AuditLogger.log_execution has no ``type`` field.
        if record.get("type") not in (None, "tool_execution") or record.get("audit_observer"):
            return None
        tool_name = record.get("tool_name")
        occurred = _parse_timestamp(record.get("timestamp"))
        if not isinstance(tool_name, str) or not tool_name or occurred is None:
            return None
        digest = record.get("_hmac")
        if not isinstance(digest, str) or not digest:
            digest = hashlib.sha256(raw).hexdigest()
        fact_id = f"audit:{digest}"
        raw_metadata = record.get("metadata")
        metadata: dict = raw_metadata if isinstance(raw_metadata, dict) else {}
        duration = (
            _nonnegative_int(record.get("execution_time_ms"))
            or _nonnegative_int(metadata.get("duration_ms"))
            or _nonnegative_int(record.get("duration_ms"))
            or _nonnegative_int(metadata.get("elapsed_ms"))
            or 0
        )
        error = bool(record.get("error") or metadata.get("error"))
        return (
            fact_id,
            occurred,
            _bounded_text(tool_name, 180),
            _bounded_text(record.get("type") or "tool_execution", 80),
            duration,
            int(error),
        )

    @staticmethod
    def _last_complete_offset(handle: BinaryIO, size: int) -> int:
        """Return the byte after the last newline, preserving a torn suffix."""
        pos = size
        while pos > 0:
            start = max(0, pos - 64 * 1024)
            handle.seek(start)
            chunk = handle.read(pos - start)
            index = chunk.rfind(b"\n")
            if index >= 0:
                return start + index + 1
            pos = start
        return 0

    def _source_cursor(
        self,
        conn,
        kind: str,
        path: str,
        stat: os.stat_result,
        *,
        initial_high_offset: int | None = None,
    ) -> sqlite3.Row:
        source_id = f"{kind}:{stat.st_dev}:{stat.st_ino}"
        row = conn.execute(
            "SELECT * FROM ingestion_cursors WHERE source_id=?", (source_id,)
        ).fetchone()
        if row is None:
            now = time.time()
            conn.execute(
                """INSERT INTO ingestion_cursors(
                    source_id, source_kind, display_path, device, inode,
                    low_offset, high_offset, initial_size, initial_complete, updated_at
                ) VALUES(?,?,?,?,?,?,?,?,0,?)""",
                (
                    source_id, kind, path, stat.st_dev, stat.st_ino,
                    stat.st_size,
                    stat.st_size if initial_high_offset is None else initial_high_offset,
                    stat.st_size,
                    now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM ingestion_cursors WHERE source_id=?", (source_id,)
            ).fetchone()
        return row

    def _apply_raw_rows(
        self,
        conn,
        raws: list[bytes],
        *,
        trajectory_kind: str | None,
    ) -> tuple[int, int]:
        accepted = malformed = 0
        for raw in raws:
            if not raw.strip():
                continue
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                malformed += 1
                continue
            if trajectory_kind is None:
                fact = self._tool_fact(raw)
                if fact is None:
                    # Valid non-tool audit rows are intentionally outside this screen.
                    continue
                conn.execute(
                    """INSERT OR IGNORE INTO tool_facts(
                        fact_id, occurred_at, tool_name, event_type, duration_ms, is_error
                    ) VALUES(?,?,?,?,?,?)""",
                    fact,
                )
                accepted += 1
            elif isinstance(parsed, dict) and self._ingest_trajectory(
                parsed, trajectory_kind, conn=conn
            ):
                accepted += 1
            else:
                malformed += 1
        return accepted, malformed

    def _consume_reverse_batch(
        self,
        *,
        handle: BinaryIO,
        stat: os.stat_result,
        kind: str,
        display_path: str,
        trajectory_kind: str | None,
    ) -> bool:
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            cursor = self._source_cursor(conn, kind, display_path, stat)
            low = min(int(cursor["low_offset"]), stat.st_size)
            raws: list[bytes] = []
            consumed_bytes = 0
            while low > 0 and len(raws) < _BACKFILL_RECORDS:
                previous = _previous_line(handle, low)
                if previous is None:
                    low = 0
                    break
                start, raw = previous
                size = low - start
                if raws and consumed_bytes + size > _BACKFILL_BYTES:
                    break
                raws.append(raw)
                consumed_bytes += size
                low = start
            _, malformed = self._apply_raw_rows(
                conn, raws, trajectory_kind=trajectory_kind
            )
            complete = int(low == 0)
            conn.execute(
                """UPDATE ingestion_cursors SET low_offset=?, initial_complete=?,
                    malformed_rows=malformed_rows+?, updated_at=? WHERE source_id=?""",
                (low, complete, malformed, time.time(), cursor["source_id"]),
            )
            conn.commit()
            return bool(complete)

    def _consume_tail(
        self,
        *,
        handle: BinaryIO,
        stat: os.stat_result,
        kind: str,
        display_path: str,
        trajectory_kind: str | None,
    ) -> None:
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            cursor = self._source_cursor(
                conn,
                kind,
                display_path,
                stat,
                initial_high_offset=self._last_complete_offset(handle, stat.st_size),
            )
            high = int(cursor["high_offset"])
            if high > stat.st_size:
                # Same inode truncated: do not invent continuity.  Re-read its
                # current bytes; fact identities make the replay idempotent.
                high = 0
            if high >= stat.st_size:
                conn.commit()
                return
            handle.seek(high)
            data = handle.read(min(stat.st_size - high, _BACKFILL_BYTES + 1))
            newline = data.rfind(b"\n")
            if newline < 0:
                conn.commit()
                return
            complete = data[: newline + 1]
            if len(complete) > _BACKFILL_BYTES and b"\n" not in data[:_BACKFILL_BYTES]:
                first_newline = complete.find(b"\n")
                raws = [b"<oversized usage row>"] + complete[first_newline + 1 :].splitlines()
            else:
                raws = complete.splitlines()
            _, malformed = self._apply_raw_rows(
                conn, raws, trajectory_kind=trajectory_kind
            )
            high += newline + 1
            conn.execute(
                """UPDATE ingestion_cursors SET high_offset=?,
                    malformed_rows=malformed_rows+?, updated_at=? WHERE source_id=?""",
                (high, malformed, time.time(), cursor["source_id"]),
            )
            conn.commit()

    def _trajectory_snapshots(self) -> list[tuple[str, str, BinaryIO, os.stat_result, str]]:
        snapshots: list[tuple[str, str, BinaryIO, os.stat_result, str]] = []
        seen: set[tuple[int, int]] = set()
        for kind, directory, trajectory_kind in (
            ("agent", self.agent_trajectory_directory, "agent"),
            ("trajectory", self.trajectory_directory, "turn"),
        ):
            try:
                paths = sorted(directory.glob("*.jsonl"), reverse=True)
            except OSError:
                self._source_scan_errors += 1
                continue
            for path in paths:
                try:
                    handle = open(path, "rb")
                    stat = os.fstat(handle.fileno())
                except OSError:
                    self._source_scan_errors += 1
                    continue
                identity = (stat.st_dev, stat.st_ino)
                if identity in seen:
                    handle.close()
                    continue
                seen.add(identity)
                snapshots.append((kind, str(path), handle, stat, trajectory_kind))
        return snapshots

    async def _audit_snapshots(
        self,
    ) -> list[tuple[str, str, BinaryIO, os.stat_result, str | None]]:
        if self.audit is None:
            return []
        try:
            opened = await self.audit.open_read_snapshot()
        except Exception:
            self._source_scan_errors += 1
            log.exception("Usage audit snapshot failed (non-fatal)")
            return []
        return [
            ("audit", str(getattr(self.audit, "path", "audit.jsonl")), handle, stat, None)
            for handle, stat in opened
        ]

    async def _one_backfill_pass(self) -> bool:
        trajectory = await asyncio.to_thread(self._trajectory_snapshots)
        audit = await self._audit_snapshots()
        # Global newest-first order across chat, agent, and rotated audit
        # generations.  The snapshot metadata is stable even if pathnames move.
        snapshots = sorted(
            trajectory + audit,
            key=lambda item: (item[3].st_mtime_ns, item[3].st_size),
            reverse=True,
        )
        if not snapshots:
            complete = self._source_scan_errors == 0
            self._set_backfill_state(complete)
            return complete
        try:
            # Tail first so events written after a cursor's initial snapshot do
            # not wait behind gigabytes of historical backfill.
            for kind, path, handle, stat, record_kind in snapshots:
                await asyncio.to_thread(
                    self._consume_tail,
                    handle=handle,
                    stat=stat,
                    kind=kind,
                    display_path=path,
                    trajectory_kind=record_kind,
                )
            target = None
            with self._lock, closing(self._connect()) as conn:
                for item in snapshots:  # already newest source generations first
                    kind, _path, _handle, stat, _record_kind = item
                    source_id = f"{kind}:{stat.st_dev}:{stat.st_ino}"
                    row = conn.execute(
                        "SELECT initial_complete FROM ingestion_cursors WHERE source_id=?",
                        (source_id,),
                    ).fetchone()
                    if row is None or not bool(row[0]):
                        target = item
                        break
            if target is not None:
                kind, path, handle, stat, record_kind = target
                await asyncio.to_thread(
                    self._consume_reverse_batch,
                    handle=handle,
                    stat=stat,
                    kind=kind,
                    display_path=path,
                    trajectory_kind=record_kind,
                )
            with self._lock, closing(self._connect()) as conn:
                complete = all(
                    bool(
                        conn.execute(
                            "SELECT initial_complete FROM ingestion_cursors WHERE source_id=?",
                            (f"{kind}:{stat.st_dev}:{stat.st_ino}",),
                        ).fetchone()[0]
                    )
                    for kind, _path, _handle, stat, _record_kind in snapshots
                )
            self._set_backfill_state(complete)
            return complete
        finally:
            for _kind, _path, handle, _stat, _record_kind in snapshots:
                try:
                    handle.close()
                except OSError:
                    pass

    def _set_backfill_state(self, complete: bool) -> None:
        if not self.available:
            return
        try:
            with self._lock, closing(self._connect()) as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO usage_meta(key,value) VALUES('backfill_complete',?)",
                    ("1" if complete else "0",),
                )
                conn.execute(
                    "INSERT OR REPLACE INTO usage_meta(key,value) VALUES('backfill_checked_at',?)",
                    (str(time.time()),),
                )
                conn.commit()
        except Exception:
            log.debug("Failed to publish usage backfill state", exc_info=True)

    async def _backfill_loop(self) -> None:
        while not self._stop.is_set():
            try:
                complete = await self._one_backfill_pass()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Usage backfill pass failed (non-fatal; will resume)")
                complete = False
            delay = _TAIL_INTERVAL_SECONDS if complete else _BACKFILL_PAUSE_SECONDS
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=delay)
            except TimeoutError:
                pass

    async def start(self) -> None:
        """Start bounded reconciliation without waiting for any source scan."""
        if not self.available or (self._task is not None and not self._task.done()):
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._backfill_loop(), name="usage_backfill")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None
        pending = list(self._observer_tasks)
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        self._observer_tasks.clear()

    def _ro_connect(self) -> sqlite3.Connection:
        uri = f"file:{self.db_path.resolve()}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=5.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only=ON")
        return conn

    async def summary(self, range_name: str = "7d") -> dict:
        if not self.available:
            return {
                "available": False,
                "reason": self.error or "usage store not enabled",
                "range": range_name if range_name in _ALLOWED_RANGES else "7d",
            }
        selected = range_name if range_name in _ALLOWED_RANGES else "7d"
        try:
            return await asyncio.to_thread(self._summary_sync, selected)
        except Exception as exc:
            log.exception("Usage summary read failed")
            return {
                "available": False,
                "reason": f"read failed: {type(exc).__name__}",
                "range": selected,
            }

    @staticmethod
    def _token_totals(rows: list[sqlite3.Row]) -> dict:
        reported = estimated = legacy = total = 0
        unknown = 0
        for row in rows:
            tokens = row["tokens"]
            count = int(row["count"] or 0)
            provenance = str(row["provenance"])
            if tokens is None:
                unknown += count
                continue
            value = int(tokens)
            total += value
            if provenance == "provider_reported":
                reported += value
            elif provenance == "legacy_estimated":
                legacy += value
            else:
                estimated += value
        known = reported + estimated + legacy
        return {
            "total": total,
            "provider_reported": reported,
            "estimated": estimated,
            "legacy_estimated": legacy,
            "unknown_generations": unknown,
            "provider_reported_percent": round((reported / known) * 100, 1) if known else 0.0,
            "approximate": bool(estimated or legacy or unknown),
        }

    def _summary_sync(self, range_name: str) -> dict:
        hours = _ALLOWED_RANGES[range_name]
        since = None if hours is None else time.time() - hours * 3600
        where = "" if since is None else " WHERE occurred_at >= ?"
        args: tuple = () if since is None else (since,)
        with closing(self._ro_connect()) as conn:
            conn.execute("BEGIN")
            # Historical writers used zero for missing timing. Preserve the
            # append-only facts byte-for-byte and interpret only positive values
            # as recorded evidence at query time. There is no durable duration
            # provenance bit, so zero cannot honestly be presented as elapsed
            # work or included in an average.
            turn = conn.execute(
                f"""SELECT COUNT(*) turns,
                    SUM(CASE WHEN duration_ms > 0 THEN duration_ms END) duration_ms,
                    COUNT(CASE WHEN duration_ms > 0 THEN 1 END) duration_samples,
                    COALESCE(SUM(iteration_count),0) iterations,
                    COALESCE(SUM(is_error),0) errors
                    FROM turn_facts{where}""",
                args,
            ).fetchone()
            generations = conn.execute(
                f"SELECT COUNT(*) count FROM generation_facts{where}", args
            ).fetchone()[0]
            input_rows = conn.execute(
                f"""SELECT input_provenance provenance, SUM(input_tokens) tokens,
                    COUNT(*) count FROM generation_facts{where}
                    GROUP BY input_provenance""",
                args,
            ).fetchall()
            output_rows = conn.execute(
                f"""SELECT output_provenance provenance, SUM(output_tokens) tokens,
                    COUNT(*) count FROM generation_facts{where}
                    GROUP BY output_provenance""",
                args,
            ).fetchall()
            cache = conn.execute(
                f"""SELECT COALESCE(SUM(cached_tokens),0) cached,
                    COALESCE(SUM(cache_write_tokens),0) written,
                    COUNT(cached_tokens) reported
                    FROM generation_facts{where}""",
                args,
            ).fetchone()
            activity = conn.execute(
                f"""SELECT surface, outcome, COUNT(*) count,
                    SUM(CASE WHEN duration_ms > 0 THEN duration_ms END) duration_ms,
                    COUNT(CASE WHEN duration_ms > 0 THEN 1 END) duration_samples
                    FROM turn_facts{where} GROUP BY surface, outcome
                    ORDER BY count DESC""",
                args,
            ).fetchall()
            timeline = conn.execute(
                f"""SELECT strftime('%Y-%m-%d', occurred_at, 'unixepoch') bucket,
                    surface, COUNT(*) count, COALESCE(SUM(is_error),0) errors
                    FROM turn_facts{where} GROUP BY bucket, surface
                    ORDER BY bucket""",
                args,
            ).fetchall()
            serving = conn.execute(
                f"""SELECT g.provider, g.model, g.effort, COUNT(*) generations,
                    COALESCE(SUM(g.input_tokens),0) input_tokens,
                    COALESCE(SUM(g.output_tokens),0) output_tokens,
                    SUM(CASE WHEN g.duration_ms > 0 THEN g.duration_ms END) duration_ms,
                    COUNT(CASE WHEN g.duration_ms > 0 THEN 1 END) duration_samples,
                    COUNT(DISTINCT CASE WHEN t.is_error THEN t.fact_id END) terminal_error_turns
                    FROM generation_facts g JOIN turn_facts t ON t.fact_id=g.turn_fact_id
                    {('WHERE g.occurred_at >= ?' if since is not None else '')}
                    GROUP BY g.provider, g.model, g.effort
                    ORDER BY generations DESC LIMIT 25""",
                args,
            ).fetchall()
            tools_all = conn.execute(
                f"""SELECT tool_name, COUNT(*) executions, COALESCE(SUM(is_error),0) errors,
                    SUM(CASE WHEN duration_ms > 0 THEN duration_ms END) duration_ms,
                    COUNT(CASE WHEN duration_ms > 0 THEN 1 END) duration_samples
                    FROM tool_facts{where} GROUP BY tool_name
                    ORDER BY executions DESC""",
                args,
            ).fetchall()
            automation = conn.execute(
                f"""SELECT COALESCE(agent_final_state,'unknown') state, COUNT(*) count,
                    COALESCE(SUM(recovery_attempts),0) recovery_attempts
                    FROM turn_facts{where + (' AND' if where else ' WHERE')} surface='agent'
                    GROUP BY agent_final_state ORDER BY count DESC""",
                args,
            ).fetchall()
            oldest = conn.execute("SELECT MIN(occurred_at) FROM turn_facts").fetchone()[0]
            meta = dict(conn.execute("SELECT key,value FROM usage_meta").fetchall())
            cursor = conn.execute(
                """SELECT COALESCE(SUM(malformed_rows),0), COALESCE(SUM(scan_errors),0),
                    COUNT(*), COALESCE(SUM(initial_complete),0) FROM ingestion_cursors"""
            ).fetchone()
            conn.commit()

        top_tools = [dict(row) for row in tools_all[:12]]
        if len(tools_all) > 12:
            rest = tools_all[12:]
            duration_samples = sum(int(r["duration_samples"] or 0) for r in rest)
            top_tools.append(
                {
                    "tool_name": "Other",
                    "executions": sum(int(r["executions"]) for r in rest),
                    "errors": sum(int(r["errors"]) for r in rest),
                    "duration_ms": (
                        sum(int(r["duration_ms"] or 0) for r in rest)
                        if duration_samples
                        else None
                    ),
                    "duration_samples": duration_samples,
                }
            )
        for row in top_tools:
            count = int(row["executions"] or 0)
            duration_samples = int(row["duration_samples"] or 0)
            row["error_rate_percent"] = (
                round(int(row["errors"] or 0) / count * 100, 1) if count else 0
            )
            row["avg_duration_ms"] = (
                round(int(row["duration_ms"]) / duration_samples)
                if row["duration_ms"] is not None and duration_samples
                else None
            )

        complete = meta.get("backfill_complete") == "1" and self._source_scan_errors == 0
        return {
            "available": True,
            "range": range_name,
            "observed_at": datetime.now(UTC).isoformat(),
            "coverage": {
                "backfill_complete": complete,
                "oldest_covered_at": (
                    datetime.fromtimestamp(float(oldest), UTC).isoformat()
                    if oldest is not None
                    else None
                ),
                "malformed_rows_skipped": int(cursor[0] or 0),
                "scan_errors": int(cursor[1] or 0) + self._source_scan_errors,
                "sources_indexed": int(cursor[2] or 0),
                "sources_complete": int(cursor[3] or 0),
            },
            "work": {
                "settled_turns": int(turn["turns"] or 0),
                "accepted_generations": int(generations or 0),
                "recorded_processing_ms": (
                    int(turn["duration_ms"]) if turn["duration_ms"] is not None else None
                ),
                "recorded_processing_samples": int(turn["duration_samples"] or 0),
                "iterations": int(turn["iterations"] or 0),
                "explicit_error_turns": int(turn["errors"] or 0),
                "input_tokens": self._token_totals(input_rows),
                "output_tokens": self._token_totals(output_rows),
                # Prompt-cache attribution: subsets of accepted input, never
                # added to the totals above.  Rows the provider reported
                # nothing for (pre-v2 history, non-Codex) are excluded, not
                # counted as zero.
                "cache": {
                    "cached_tokens": int(cache["cached"] or 0),
                    "cache_write_tokens": int(cache["written"] or 0),
                    "generations_reported": int(cache["reported"] or 0),
                },
            },
            "activity": [dict(row) for row in activity],
            "activity_over_time": [dict(row) for row in timeline],
            "serving": [dict(row) for row in serving],
            "tools": top_tools,
            "automation": [dict(row) for row in automation],
            "cost": {
                "modeled_cost_usd": None,
                "actual_spend_usd": None,
                "note": "No invoice truth is available; modeled cost is not shown as actual spend.",
            },
        }

    async def totals(self) -> dict:
        summary = await self.summary("all")
        if not summary.get("available"):
            return summary
        work = summary["work"]
        input_total = work["input_tokens"]["total"]
        output_total = work["output_tokens"]["total"]
        return {
            "available": True,
            "requests": work["accepted_generations"],
            "input_tokens": input_total,
            "output_tokens": output_total,
            "total_tokens": input_total + output_total,
            "cost_usd": None,
            "cost_kind": "unavailable_not_actual_spend",
            "coverage": summary["coverage"],
        }
