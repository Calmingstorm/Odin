"""Durable turn state: checkpoints, side-effect ledger, leases, tombstones.

One SQLite database (design settled with Odin, 2026-07-30) so checkpoint and
ledger transitions can be atomic — deliberately NOT sessions (compacted
user-facing history), trajectories/audit (append-only observability), or the
command workspace (disposable). Large payloads live beside it as
content-addressed blobs.

Identity and fencing:

- Primary key ``source + channel_id + message_id``; a content hash is NOT
  identity (identical text collides, edits change it).
- A random ``turn_generation`` minted at first admission, a monotonic
  ``revision``, and a ``lease_token``. Every state write is conditional on
  ALL THREE (round-3 clarification: generation+revision alone lets an
  expired owner win a write before the new owner advances the revision).
  A fence mismatch raises :class:`StaleTurnError` — the caller lost
  ownership and must stop immediately.

Fail-closed contract:

- Store-init failure at startup → ``available`` False, checkpointing is off
  for the process (loud log; turns run legacy).
- Once a turn runs WITH durability, any persistence failure raises
  :class:`TurnStateUnavailableError` and the caller must halt further generation
  or mutation — never silently fall back to the legacy discard path.

Time discipline (round-3): the recovery budget's live arithmetic is
monotonic and lives in ``src/llm/recovery.py``; THIS store persists absolute
UTC timestamps only (``time.time()``), so a reboot reconstructs remaining
budgets without monotonic-epoch nonsense. Lease heartbeats and checkpoint
rewrites do NOT advance ``last_progress_at`` — only real progress
(``progressed=True``) does.

Three retention clocks (``ttl_sweep``): resumable 24h from last real
progress; diagnostic payloads 7d then tombstone; ledger rows ≥90d — with
``OUTCOME_UNKNOWN``/``MANUAL_RESOLUTION_REQUIRED`` never auto-expiring.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("turn_state")

SCHEMA_VERSION = 1

DEFAULT_LEASE_TTL = 120.0
DEFAULT_RESUME_TTL_HOURS = 24.0
DEFAULT_PAYLOAD_RETENTION_DAYS = 7.0
DEFAULT_LEDGER_RETENTION_DAYS = 90.0


class TurnStatus:
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    TERMINAL_COMPLETED = "TERMINAL_COMPLETED"
    TERMINAL_CANCELLED = "TERMINAL_CANCELLED"
    TERMINAL_FAILED = "TERMINAL_FAILED"
    TERMINAL_REJECTED = "TERMINAL_REJECTED"
    TERMINAL_EXPIRED = "TERMINAL_EXPIRED"

    TERMINAL = frozenset({
        TERMINAL_COMPLETED, TERMINAL_CANCELLED, TERMINAL_FAILED,
        TERMINAL_REJECTED, TERMINAL_EXPIRED,
    })


class OpState:
    PREPARED = "PREPARED"
    RUNNING = "RUNNING"
    APPLIED = "APPLIED"
    DEFINITELY_FAILED = "DEFINITELY_FAILED"
    OUTCOME_UNKNOWN = "OUTCOME_UNKNOWN"
    RECONCILED_APPLIED = "RECONCILED_APPLIED"
    RECONCILED_NOT_APPLIED = "RECONCILED_NOT_APPLIED"
    MANUAL_RESOLUTION_REQUIRED = "MANUAL_RESOLUTION_REQUIRED"

    # Rows in these states are evidence of possibly-unreconciled external
    # effects and must never expire automatically.
    NEVER_EXPIRE = frozenset({OUTCOME_UNKNOWN, MANUAL_RESOLUTION_REQUIRED})


class TurnStateUnavailableError(RuntimeError):
    """A durability write failed while durability was enabled — fail closed."""


class StaleTurnError(RuntimeError):
    """A fenced write lost: another owner holds this turn now. Stop."""


class LedgerIntentError(ValueError):
    """Malformed tool-call intents (empty/duplicate ids) — fail BEFORE execution."""


@dataclass(frozen=True)
class TurnKey:
    source: str
    channel_id: str
    message_id: str


@dataclass
class TurnLease:
    """Ownership handle for one admitted turn. ``revision`` tracks the last
    successfully fenced write and is advanced by the store."""

    key: TurnKey
    generation: str
    token: str
    revision: int


def effect_fingerprint(tool_name: str, tool_input: dict) -> str:
    """Handler-derived effect fingerprint (secondary reconciliation evidence,
    NEVER the primary dedup key — deliberate identical invocations are
    legitimate). v1 fingerprints the effective invocation; per-handler
    resolved-resource identity is a declared follow-up."""
    try:
        canonical = json.dumps(
            {"tool": tool_name, "input": tool_input}, sort_keys=True, default=str
        )
    except Exception:
        canonical = f"{tool_name}:{tool_input!r}"
    return hashlib.sha256(canonical.encode("utf-8", "replace")).hexdigest()


_DDL = """
CREATE TABLE IF NOT EXISTS turns (
    source TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    turn_generation TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT,
    lease_expires_at REAL,
    status TEXT NOT NULL,
    recovery_deadline_utc REAL,
    last_progress_at REAL NOT NULL,
    created_at REAL NOT NULL,
    suspended_at REAL,
    guild_id TEXT,
    user_id TEXT,
    content_digest TEXT,
    code_version TEXT,
    schema_version INTEGER NOT NULL,
    prompt_policy_hash TEXT,
    tool_catalog_hash TEXT,
    session_snapshot TEXT,
    payload TEXT,
    PRIMARY KEY (source, channel_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_turns_status ON turns(status);
CREATE TABLE IF NOT EXISTS operations (
    source TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    turn_generation TEXT NOT NULL,
    generation_seq INTEGER NOT NULL,
    tool_call_id TEXT NOT NULL,
    state TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    iteration INTEGER,
    effect_fingerprint TEXT,
    result TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (source, channel_id, message_id, turn_generation,
                 generation_seq, tool_call_id)
);
CREATE INDEX IF NOT EXISTS idx_ops_state ON operations(state);
"""


class TurnStateStore:
    """Sync sqlite bodies behind ``asyncio.to_thread``-style callers.

    Follows the KnowledgeStore conventions: one long-lived connection, WAL,
    busy_timeout, a write lock, and an ``available`` property that degrades
    the whole feature (not the process) when init fails.
    """

    def __init__(
        self,
        db_path: str | Path,
        *,
        blob_dir: str | Path | None = None,
        lease_ttl: float = DEFAULT_LEASE_TTL,
    ) -> None:
        self.db_path = str(db_path)
        self.lease_ttl = lease_ttl
        self._blob_dir = Path(blob_dir) if blob_dir else Path(self.db_path).parent / "blobs"
        self._write_lock = threading.Lock()
        self._conn: sqlite3.Connection | None = None
        try:
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
            self._blob_dir.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=30000")
            conn.executescript(_DDL)
            conn.commit()
            self._conn = conn
            swept = self._boot_sweep_sync()
            if swept["turns"] or swept["ops"]:
                log.warning(
                    "Turn-state boot sweep: %d stale ACTIVE turn(s) suspended, "
                    "%d in-flight op(s) marked OUTCOME_UNKNOWN",
                    swept["turns"], swept["ops"],
                )
        except Exception:
            log.exception(
                "TurnStateStore init failed — checkpoint durability DISABLED "
                "for this process (turns run legacy, work is not preserved)"
            )
            self._conn = None

    @property
    def available(self) -> bool:
        return self._conn is not None

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    # ── internals ────────────────────────────────────────────────────

    def _require(self) -> sqlite3.Connection:
        if self._conn is None:
            raise TurnStateUnavailableError("turn-state store is not available")
        return self._conn

    def _fenced_update(
        self, lease: TurnLease, set_sql: str, params: list, *, bump_revision: bool = True
    ) -> None:
        """Run one UPDATE fenced on (generation, revision, lease token)."""
        conn = self._require()
        new_revision = lease.revision + 1 if bump_revision else lease.revision
        sql = (
            f"UPDATE turns SET {set_sql}, revision=? "
            "WHERE source=? AND channel_id=? AND message_id=? "
            "AND turn_generation=? AND revision=? AND lease_token=?"
        )
        try:
            with self._write_lock:
                cur = conn.execute(
                    sql,
                    [*params, new_revision, lease.key.source, lease.key.channel_id,
                     lease.key.message_id, lease.generation, lease.revision,
                     lease.token],
                )
                conn.commit()
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"turn-state write failed: {exc}") from exc
        if cur.rowcount != 1:
            raise StaleTurnError(
                f"turn {lease.key} generation {lease.generation[:8]} "
                f"rev {lease.revision}: fence lost"
            )
        lease.revision = new_revision

    def _op_where(self, lease: TurnLease) -> tuple[str, list]:
        return (
            "source=? AND channel_id=? AND message_id=? AND turn_generation=?",
            [lease.key.source, lease.key.channel_id, lease.key.message_id,
             lease.generation],
        )

    def _verify_lease(self, lease: TurnLease) -> None:
        """Ops-table writes are fenced indirectly: verify the turns row still
        carries this lease before touching operations."""
        conn = self._require()
        try:
            row = conn.execute(
                "SELECT lease_token, turn_generation FROM turns "
                "WHERE source=? AND channel_id=? AND message_id=?",
                [lease.key.source, lease.key.channel_id, lease.key.message_id],
            ).fetchone()
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"turn-state read failed: {exc}") from exc
        if row is None or row[0] != lease.token or row[1] != lease.generation:
            raise StaleTurnError(f"turn {lease.key}: lease no longer held")

    # ── admission / lifecycle (sync bodies) ──────────────────────────

    def admit_turn_sync(
        self,
        key: TurnKey,
        *,
        guild_id: str | None,
        user_id: str | None,
        content_digest: str | None,
        code_version: str | None,
        prompt_policy_hash: str | None,
        tool_catalog_hash: str | None,
        session_snapshot: dict | None,
    ) -> TurnLease | None:
        """Admit a fresh turn. Returns a lease, or None when this message
        already has a row (redelivery/crash artifact — caller runs legacy,
        loudly) or when the store is unavailable (caller runs legacy)."""
        if self._conn is None:
            return None
        now = time.time()
        generation = secrets.token_hex(16)
        token = secrets.token_hex(16)
        try:
            with self._write_lock:
                try:
                    self._conn.execute(
                        "INSERT INTO turns (source, channel_id, message_id, "
                        "turn_generation, revision, lease_token, lease_expires_at, "
                        "status, last_progress_at, created_at, guild_id, user_id, "
                        "content_digest, code_version, schema_version, "
                        "prompt_policy_hash, tool_catalog_hash, session_snapshot) "
                        "VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        [key.source, key.channel_id, key.message_id, generation,
                         token, now + self.lease_ttl, TurnStatus.ACTIVE, now, now,
                         guild_id, user_id, content_digest, code_version,
                         SCHEMA_VERSION, prompt_policy_hash, tool_catalog_hash,
                         json.dumps(session_snapshot or {})],
                    )
                    self._conn.commit()
                except sqlite3.IntegrityError:
                    log.warning(
                        "Turn %s already has a state row — running without "
                        "durability for this turn", key,
                    )
                    return None
        except sqlite3.Error:
            log.exception("Turn admission failed — running without durability")
            return None
        return TurnLease(key=key, generation=generation, token=token, revision=0)

    def checkpoint_sync(
        self,
        lease: TurnLease,
        payload: dict,
        *,
        progressed: bool,
        recovery_deadline_utc: float | None = None,
    ) -> None:
        """Persist the turn payload (fenced). ``progressed`` advances
        ``last_progress_at``; recovery waits and rewrites must pass False."""
        sets = ["payload=?", "lease_expires_at=?"]
        params: list = [json.dumps(payload), time.time() + self.lease_ttl]
        if progressed:
            sets.append("last_progress_at=?")
            params.append(time.time())
        if recovery_deadline_utc is not None:
            sets.append("recovery_deadline_utc=?")
            params.append(recovery_deadline_utc)
        self._fenced_update(lease, ", ".join(sets), params)

    def heartbeat_sync(self, lease: TurnLease) -> None:
        """Extend the lease. Never advances last_progress_at, never bumps the
        revision (a heartbeat is not a state change)."""
        self._fenced_update(
            lease, "lease_expires_at=?", [time.time() + self.lease_ttl],
            bump_revision=False,
        )

    def suspend_sync(self, lease: TurnLease, payload: dict) -> None:
        now = time.time()
        self._fenced_update(
            lease,
            "payload=?, status=?, suspended_at=?, lease_token=NULL, "
            "lease_expires_at=NULL",
            [json.dumps(payload), TurnStatus.SUSPENDED, now],
        )

    def finish_sync(self, lease: TurnLease, status: str = TurnStatus.TERMINAL_COMPLETED) -> None:
        """Terminal transition. The payload is compacted immediately
        (identity + ledger tombstones retained)."""
        if status not in TurnStatus.TERMINAL:
            raise ValueError(f"finish_sync requires a terminal status, got {status}")
        self._fenced_update(
            lease,
            "status=?, payload=NULL, lease_token=NULL, lease_expires_at=NULL",
            [status],
        )

    # ── ledger (sync bodies) ─────────────────────────────────────────

    def record_intents_sync(
        self,
        lease: TurnLease,
        generation_seq: int,
        intents: list[dict],
        *,
        iteration: int | None = None,
    ) -> None:
        """Persist PREPARED rows for one generation's tool calls.

        Validates Odin's rule up front: tool-call ids nonempty and unique
        within the generation — malformed duplicates fail BEFORE execution.
        """
        ids = [str(i.get("tool_call_id") or "") for i in intents]
        if any(not i for i in ids):
            raise LedgerIntentError("empty tool_call_id in intents")
        if len(set(ids)) != len(ids):
            raise LedgerIntentError("duplicate tool_call_id in generation")
        conn = self._require()
        self._verify_lease(lease)
        now = time.time()
        rows = [
            (lease.key.source, lease.key.channel_id, lease.key.message_id,
             lease.generation, generation_seq, str(i["tool_call_id"]),
             OpState.PREPARED, str(i.get("tool_name") or "unknown"), iteration,
             effect_fingerprint(str(i.get("tool_name") or ""), i.get("tool_input") or {}),
             None, now, now)
            for i in intents
        ]
        try:
            with self._write_lock:
                conn.executemany(
                    "INSERT OR REPLACE INTO operations VALUES "
                    "(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    rows,
                )
                conn.commit()
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"ledger intent write failed: {exc}") from exc

    def mark_running_sync(self, lease: TurnLease, generation_seq: int, tool_call_id: str) -> None:
        self._set_op_state(lease, generation_seq, tool_call_id, OpState.RUNNING, None)

    def settle_op_sync(
        self,
        lease: TurnLease,
        generation_seq: int,
        tool_call_id: str,
        *,
        state: str,
        result_text: str | None,
    ) -> None:
        # OUTCOME_UNKNOWN is a legitimate settlement: a timed-out or
        # interrupted execution may have applied its external effect — the
        # ledger must never claim DEFINITELY_FAILED for it (round-2 replay
        # rule: ambiguous outcomes stop, never rerun).
        if state not in (OpState.APPLIED, OpState.DEFINITELY_FAILED, OpState.OUTCOME_UNKNOWN):
            raise ValueError(f"settle_op_sync: invalid terminal state {state}")
        self._set_op_state(lease, generation_seq, tool_call_id, state, result_text)

    def settle_interrupted_sync(
        self,
        lease: TurnLease,
        generation_seq: int,
        tool_call_id: str,
        *,
        result_text: str | None,
    ) -> None:
        """OUTCOME_UNKNOWN settle for an interrupted execution.

        Guarded so it can race the tool's own settle at a cancellation
        boundary: it never downgrades an already-settled row, and a missing
        row (e.g. a parse-error call that had no intent) is tolerated.
        """
        conn = self._require()
        self._verify_lease(lease)
        where, params = self._op_where(lease)
        try:
            with self._write_lock:
                conn.execute(
                    f"UPDATE operations SET state=?, result=?, updated_at=? "
                    f"WHERE {where} AND generation_seq=? AND tool_call_id=? "
                    "AND state IN (?, ?)",
                    [OpState.OUTCOME_UNKNOWN, result_text, time.time(), *params,
                     generation_seq, tool_call_id, OpState.PREPARED, OpState.RUNNING],
                )
                conn.commit()
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"ledger write failed: {exc}") from exc

    def _set_op_state(
        self,
        lease: TurnLease,
        generation_seq: int,
        tool_call_id: str,
        state: str,
        result_text: str | None,
    ) -> None:
        conn = self._require()
        self._verify_lease(lease)
        where, params = self._op_where(lease)
        try:
            with self._write_lock:
                if result_text is None:
                    cur = conn.execute(
                        f"UPDATE operations SET state=?, updated_at=? WHERE {where} "
                        "AND generation_seq=? AND tool_call_id=?",
                        [state, time.time(), *params, generation_seq, tool_call_id],
                    )
                else:
                    cur = conn.execute(
                        f"UPDATE operations SET state=?, result=?, updated_at=? "
                        f"WHERE {where} AND generation_seq=? AND tool_call_id=?",
                        [state, result_text, time.time(), *params, generation_seq,
                         tool_call_id],
                    )
                conn.commit()
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"ledger write failed: {exc}") from exc
        if cur.rowcount != 1:
            raise StaleTurnError(
                f"op {tool_call_id} gen_seq {generation_seq}: no PREPARED row to update"
            )

    # ── resume (sync bodies) ─────────────────────────────────────────

    def load_resumable_sync(self, key: TurnKey) -> dict | None:
        """Return the SUSPENDED row (payload + validation columns + ops) or None."""
        if self._conn is None:
            return None
        row = self._conn.execute(
            "SELECT turn_generation, revision, payload, guild_id, user_id, "
            "content_digest, code_version, schema_version, prompt_policy_hash, "
            "tool_catalog_hash, session_snapshot, recovery_deadline_utc, "
            "last_progress_at, suspended_at FROM turns "
            "WHERE source=? AND channel_id=? AND message_id=? AND status=?",
            [key.source, key.channel_id, key.message_id, TurnStatus.SUSPENDED],
        ).fetchone()
        if row is None or row[2] is None:
            return None
        ops = self._conn.execute(
            "SELECT generation_seq, tool_call_id, state, tool_name, result "
            "FROM operations WHERE source=? AND channel_id=? AND message_id=? "
            "AND turn_generation=? ORDER BY generation_seq, tool_call_id",
            [key.source, key.channel_id, key.message_id, row[0]],
        ).fetchall()
        return {
            "generation": row[0],
            "revision": row[1],
            "payload": json.loads(row[2]),
            "guild_id": row[3],
            "user_id": row[4],
            "content_digest": row[5],
            "code_version": row[6],
            "schema_version": row[7],
            "prompt_policy_hash": row[8],
            "tool_catalog_hash": row[9],
            "session_snapshot": json.loads(row[10] or "{}"),
            "recovery_deadline_utc": row[11],
            "last_progress_at": row[12],
            "suspended_at": row[13],
            "operations": [
                {"generation_seq": o[0], "tool_call_id": o[1], "state": o[2],
                 "tool_name": o[3], "result": o[4]}
                for o in ops
            ],
        }

    def acquire_resume_lease_sync(self, key: TurnKey, expected_generation: str) -> TurnLease | None:
        """Reclaim a SUSPENDED turn: same generation (the logical turn's
        lineage), fresh lease token. Conditional on status+generation so two
        resumers can't both win."""
        if self._conn is None:
            return None
        token = secrets.token_hex(16)
        now = time.time()
        try:
            with self._write_lock:
                cur = self._conn.execute(
                    "UPDATE turns SET status=?, lease_token=?, lease_expires_at=? "
                    "WHERE source=? AND channel_id=? AND message_id=? "
                    "AND status=? AND turn_generation=?",
                    [TurnStatus.ACTIVE, token, now + self.lease_ttl,
                     key.source, key.channel_id, key.message_id,
                     TurnStatus.SUSPENDED, expected_generation],
                )
                self._conn.commit()
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"resume-lease write failed: {exc}") from exc
        if cur.rowcount != 1:
            return None
        row = self._conn.execute(
            "SELECT revision FROM turns WHERE source=? AND channel_id=? AND message_id=?",
            [key.source, key.channel_id, key.message_id],
        ).fetchone()
        return TurnLease(
            key=key, generation=expected_generation, token=token,
            revision=int(row[0]),
        )

    def reject_resumable_sync(self, key: TurnKey, reason: str) -> None:
        """A SUSPENDED turn failed resume validation (deleted/edited message,
        author mismatch, policy change): terminal, payload compacted."""
        if self._conn is None:
            return
        try:
            with self._write_lock:
                self._conn.execute(
                    "UPDATE turns SET status=?, payload=NULL, lease_token=NULL, "
                    "lease_expires_at=NULL WHERE source=? AND channel_id=? "
                    "AND message_id=? AND status=?",
                    [TurnStatus.TERMINAL_REJECTED, key.source, key.channel_id,
                     key.message_id, TurnStatus.SUSPENDED],
                )
                self._conn.commit()
            log.info("Resumable turn %s rejected: %s", key, reason)
        except sqlite3.Error:
            log.exception("reject_resumable failed (non-fatal)")

    def list_suspended_sync(self, source: str | None = None) -> list[dict]:
        if self._conn is None:
            return []
        sql = (
            "SELECT source, channel_id, message_id, turn_generation, "
            "last_progress_at, suspended_at FROM turns WHERE status=?"
        )
        params: list = [TurnStatus.SUSPENDED]
        if source:
            sql += " AND source=?"
            params.append(source)
        rows = self._conn.execute(sql, params).fetchall()
        return [
            {"source": r[0], "channel_id": r[1], "message_id": r[2],
             "generation": r[3], "last_progress_at": r[4], "suspended_at": r[5]}
            for r in rows
        ]

    # ── sweeps ───────────────────────────────────────────────────────

    def _boot_sweep_sync(self) -> dict:
        """Crash recovery at construction: expired-lease ACTIVE turns become
        SUSPENDED; their PREPARED/RUNNING ops become OUTCOME_UNKNOWN (we
        cannot know whether the external effect happened — never rerun)."""
        conn = self._require()
        now = time.time()
        with self._write_lock:
            stale = conn.execute(
                "SELECT source, channel_id, message_id, turn_generation FROM turns "
                "WHERE status=? AND (lease_expires_at IS NULL OR lease_expires_at < ?)",
                [TurnStatus.ACTIVE, now],
            ).fetchall()
            ops = 0
            for source, channel_id, message_id, generation in stale:
                cur = conn.execute(
                    "UPDATE operations SET state=?, updated_at=? "
                    "WHERE source=? AND channel_id=? AND message_id=? "
                    "AND turn_generation=? AND state IN (?, ?)",
                    [OpState.OUTCOME_UNKNOWN, now, source, channel_id, message_id,
                     generation, OpState.PREPARED, OpState.RUNNING],
                )
                ops += cur.rowcount
                conn.execute(
                    "UPDATE turns SET status=?, suspended_at=?, lease_token=NULL, "
                    "lease_expires_at=NULL WHERE source=? AND channel_id=? "
                    "AND message_id=?",
                    [TurnStatus.SUSPENDED, now, source, channel_id, message_id],
                )
            conn.commit()
        return {"turns": len(stale), "ops": ops}

    def ttl_sweep_sync(
        self,
        *,
        resume_ttl_hours: float = DEFAULT_RESUME_TTL_HOURS,
        payload_retention_days: float = DEFAULT_PAYLOAD_RETENTION_DAYS,
        ledger_retention_days: float = DEFAULT_LEDGER_RETENTION_DAYS,
    ) -> dict:
        """The three retention clocks. Returns counts for observability."""
        if self._conn is None:
            return {}
        conn = self._conn
        now = time.time()
        expired = payloads = ledger = 0
        try:
            with self._write_lock:
                # Clock 1: resumable window — 24h from last REAL progress.
                cur = conn.execute(
                    "UPDATE turns SET status=? WHERE status=? AND last_progress_at < ?",
                    [TurnStatus.TERMINAL_EXPIRED, TurnStatus.SUSPENDED,
                     now - resume_ttl_hours * 3600.0],
                )
                expired = cur.rowcount
                # Clock 2: diagnostic payload retention — 7d, then tombstone.
                cur = conn.execute(
                    "UPDATE turns SET payload=NULL WHERE payload IS NOT NULL "
                    "AND status IN (?, ?, ?, ?, ?) AND last_progress_at < ?",
                    [*sorted(TurnStatus.TERMINAL),
                     now - payload_retention_days * 86400.0],
                )
                payloads = cur.rowcount
                # Clock 3: ledger — ≥90d for rows of terminal turns, EXCEPT
                # OUTCOME_UNKNOWN / MANUAL_RESOLUTION_REQUIRED (never expire).
                cur = conn.execute(
                    "DELETE FROM operations WHERE state NOT IN (?, ?) "
                    "AND updated_at < ? AND (source, channel_id, message_id) IN "
                    "(SELECT source, channel_id, message_id FROM turns "
                    " WHERE status IN (?, ?, ?, ?, ?))",
                    [*sorted(OpState.NEVER_EXPIRE),
                     now - ledger_retention_days * 86400.0,
                     *sorted(TurnStatus.TERMINAL)],
                )
                ledger = cur.rowcount
                conn.commit()
        except sqlite3.Error:
            log.exception("turn-state TTL sweep failed (non-fatal)")
        return {"expired_turns": expired, "compacted_payloads": payloads,
                "ledger_rows_deleted": ledger}

    # ── blobs ────────────────────────────────────────────────────────

    def store_blob_sync(self, data: bytes) -> str:
        """Content-addressed blob write (tmp+rename). Returns 'blob:<sha256>'."""
        digest = hashlib.sha256(data).hexdigest()
        path = self._blob_dir / digest
        if not path.exists():
            tmp = path.with_suffix(".tmp")
            try:
                tmp.write_bytes(data)
                os.replace(tmp, path)
            except OSError as exc:
                raise TurnStateUnavailableError(f"blob write failed: {exc}") from exc
        return f"blob:{digest}"

    def load_blob_sync(self, ref: str) -> bytes:
        digest = ref.split(":", 1)[1] if ref.startswith("blob:") else ref
        path = self._blob_dir / digest
        try:
            return path.read_bytes()
        except OSError as exc:
            raise TurnStateUnavailableError(f"blob read failed: {ref}") from exc
