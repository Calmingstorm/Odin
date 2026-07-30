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
            # Checkpoints carry the model transcript (user content, tool
            # arguments) — secret-adjacent material. Everything here is
            # owner-only: directories 0700, DB + WAL/SHM + blobs 0600
            # (review blocker #8, PR #242).
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
            self._blob_dir.mkdir(parents=True, exist_ok=True)
            os.chmod(Path(self.db_path).parent, 0o700)
            os.chmod(self._blob_dir, 0o700)
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=30000")
            conn.executescript(_DDL)
            conn.commit()
            self._restrict_db_modes()
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

    def _restrict_db_modes(self) -> None:
        """0600 on the database and its WAL/SHM sidecars (best-effort — the
        sidecars appear lazily; called again from the TTL sweep)."""
        for suffix in ("", "-wal", "-shm"):
            path = Path(self.db_path + suffix)
            try:
                if path.exists():
                    os.chmod(path, 0o600)
            except OSError:
                pass

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
        """Run one UPDATE under the COMPLETE live fence: generation,
        expected revision, lease token, ACTIVE status, and unexpired lease
        (round-2 blocker #1, PR #242 — an expired-lease owner must never
        renew itself through a checkpoint; the fence is identical for turn
        and ledger writes)."""
        conn = self._require()
        sql = (
            f"UPDATE turns SET {set_sql}, revision=? "
            "WHERE source=? AND channel_id=? AND message_id=? "
            "AND turn_generation=? AND revision=? AND lease_token=? "
            "AND status=? AND lease_expires_at > ?"
        )
        try:
            with self._write_lock:
                # EVERY revision value — the expected WHERE revision, the
                # new SET revision, and the shared lease publish — derives
                # from ONE read taken under this lock (round-4 blocker #1,
                # PR #242): a pre-lock capture let a delayed heartbeat pair
                # a fresh WHERE revision with a stale SET revision and
                # REGRESS both the row and the lease.
                expected_revision = lease.revision
                new_revision = expected_revision + 1 if bump_revision else expected_revision
                cur = conn.execute(
                    sql,
                    [*params, new_revision, lease.key.source, lease.key.channel_id,
                     lease.key.message_id, lease.generation, expected_revision,
                     lease.token, TurnStatus.ACTIVE, time.time()],
                )
                conn.commit()
                if cur.rowcount == 1:
                    lease.revision = new_revision
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"turn-state write failed: {exc}") from exc
        if cur.rowcount != 1:
            raise StaleTurnError(
                f"turn {lease.key} generation {lease.generation[:8]} "
                f"rev {lease.revision}: fence lost"
            )

    def _op_where(self, lease: TurnLease) -> tuple[str, list]:
        return (
            "source=? AND channel_id=? AND message_id=? AND turn_generation=?",
            [lease.key.source, lease.key.channel_id, lease.key.message_id,
             lease.generation],
        )

    # The full turn fence as a server-side predicate: every ledger write is
    # ONE statement conditional on the turn's generation, EXPECTED REVISION,
    # current lease token, ACTIVE status, and a live lease — plus a legal
    # prior operation state on the row itself. No read-then-write TOCTOU;
    # a stale-revision or fenced-out owner mutates nothing (review blocker
    # #1, PR #242).
    _TURN_FENCE = (
        "EXISTS (SELECT 1 FROM turns WHERE turns.source=? AND turns.channel_id=? "
        "AND turns.message_id=? AND turns.turn_generation=? AND turns.revision=? "
        "AND turns.lease_token=? AND turns.status=? AND turns.lease_expires_at > ?)"
    )

    def _fence_params(self, lease: TurnLease) -> list:
        return [
            lease.key.source, lease.key.channel_id, lease.key.message_id,
            lease.generation, lease.revision, lease.token, TurnStatus.ACTIVE,
            time.time(),
        ]

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
    ) -> tuple[TurnLease | None, str]:
        """Admit a fresh turn. Returns (lease, disposition).

        Dispositions: ``admitted`` (lease non-None); ``already_processed``
        (a terminal row exists — a redelivered message must REFUSE fresh
        execution, never run unledgered — review blocker #2, PR #242);
        ``in_progress`` (an ACTIVE row with a live lease — another owner);
        ``resumable`` (a SUSPENDED row, or an expired-lease ACTIVE row
        swept to SUSPENDED here — the resume path owns it);
        ``store_unavailable`` (feature off / I/O failure — legacy run).
        """
        if self._conn is None:
            return None, "store_unavailable"
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
                    return None, self._classify_existing_row(key, now)
        except sqlite3.Error:
            log.exception(
                "Turn admission I/O failure — identity unverifiable "
                "(caller fail-closes when the store was wired available)"
            )
            return None, "store_unavailable"
        return (
            TurnLease(key=key, generation=generation, token=token, revision=0),
            "admitted",
        )

    def _classify_existing_row(self, key: TurnKey, now: float) -> str:
        """Disposition for a message whose identity already has a row.
        Lock held by caller."""
        assert self._conn is not None
        row = self._conn.execute(
            "SELECT status, lease_expires_at FROM turns "
            "WHERE source=? AND channel_id=? AND message_id=?",
            [key.source, key.channel_id, key.message_id],
        ).fetchone()
        if row is None:  # deleted between INSERT failure and here — treat as busy
            return "in_progress"
        status, lease_expires_at = row
        if status in TurnStatus.TERMINAL:
            log.warning("Turn %s was already processed — refusing re-execution", key)
            return "already_processed"
        if status == TurnStatus.SUSPENDED:
            return "resumable"
        # ACTIVE: a live lease means another owner; an expired lease is a
        # crash artifact — suspend it here so the resume path owns it.
        if lease_expires_at is not None and lease_expires_at > now:
            return "in_progress"
        self._conn.execute(
            "UPDATE turns SET status=?, suspended_at=?, lease_token=NULL, "
            "lease_expires_at=NULL WHERE source=? AND channel_id=? AND message_id=? "
            "AND status=?",
            [TurnStatus.SUSPENDED, now, key.source, key.channel_id,
             key.message_id, TurnStatus.ACTIVE],
        )
        self._conn.execute(
            "UPDATE operations SET state=?, updated_at=? "
            "WHERE source=? AND channel_id=? AND message_id=? AND state IN (?, ?)",
            [OpState.OUTCOME_UNKNOWN, now, key.source, key.channel_id,
             key.message_id, OpState.PREPARED, OpState.RUNNING],
        )
        self._conn.commit()
        return "resumable"

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

        Tool-call ids must be nonempty and unique within the generation —
        malformed duplicates fail BEFORE execution. Plain INSERTs (never
        OR REPLACE — an existing row, e.g. a settled op from a replayed id,
        must never be reset to PREPARED); each insert is fenced on the turn
        row via INSERT..SELECT..WHERE EXISTS, so a fenced-out owner inserts
        nothing. All rows land in one transaction or none do.
        """
        ids = [str(i.get("tool_call_id") or "") for i in intents]
        if any(not i for i in ids):
            raise LedgerIntentError("empty tool_call_id in intents")
        if len(set(ids)) != len(ids):
            raise LedgerIntentError("duplicate tool_call_id in generation")
        conn = self._require()
        now = time.time()
        try:
            with self._write_lock:
                try:
                    for intent in intents:
                        cur = conn.execute(
                            "INSERT INTO operations "
                            "SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? "
                            f"WHERE {self._TURN_FENCE}",
                            [lease.key.source, lease.key.channel_id,
                             lease.key.message_id, lease.generation,
                             generation_seq, str(intent["tool_call_id"]),
                             OpState.PREPARED,
                             str(intent.get("tool_name") or "unknown"), iteration,
                             effect_fingerprint(
                                 str(intent.get("tool_name") or ""),
                                 intent.get("tool_input") or {},
                             ),
                             None, now, now,
                             *self._fence_params(lease)],
                        )
                        if cur.rowcount != 1:
                            raise StaleTurnError(
                                f"turn {lease.key}: fence lost recording intents"
                            )
                    conn.commit()
                except BaseException:
                    conn.rollback()
                    raise
        except sqlite3.IntegrityError as exc:
            raise LedgerIntentError(
                f"intent already recorded for this generation: {exc}"
            ) from exc
        except StaleTurnError:
            raise
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"ledger intent write failed: {exc}") from exc

    def mark_running_sync(self, lease: TurnLease, generation_seq: int, tool_call_id: str) -> None:
        # Legal source: PREPARED only — a settled op can never re-enter RUNNING.
        self._set_op_state(
            lease, generation_seq, tool_call_id, OpState.RUNNING, None,
            legal_sources=(OpState.PREPARED,),
        )

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
        self._set_op_state(
            lease, generation_seq, tool_call_id, state, result_text,
            legal_sources=(OpState.PREPARED, OpState.RUNNING),
        )

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
        self._set_op_state(
            lease, generation_seq, tool_call_id, OpState.OUTCOME_UNKNOWN,
            result_text,
            legal_sources=(OpState.PREPARED, OpState.RUNNING),
            tolerate_missing=True,
        )

    def _set_op_state(
        self,
        lease: TurnLease,
        generation_seq: int,
        tool_call_id: str,
        state: str,
        result_text: str | None,
        *,
        legal_sources: tuple[str, ...],
        tolerate_missing: bool = False,
    ) -> None:
        """One atomic, fully-fenced operation transition.

        A single UPDATE conditional on the op's legal prior state AND the
        turn fence (generation, expected revision, lease token, ACTIVE
        status, live lease) — no separate verify step, no TOCTOU window,
        and an illegal transition (e.g. APPLIED→RUNNING) matches nothing.
        """
        conn = self._require()
        where, params = self._op_where(lease)
        placeholders = ", ".join("?" for _ in legal_sources)
        try:
            with self._write_lock:
                if result_text is None:
                    cur = conn.execute(
                        f"UPDATE operations SET state=?, updated_at=? WHERE {where} "
                        f"AND generation_seq=? AND tool_call_id=? "
                        f"AND state IN ({placeholders}) AND {self._TURN_FENCE}",
                        [state, time.time(), *params, generation_seq, tool_call_id,
                         *legal_sources, *self._fence_params(lease)],
                    )
                else:
                    cur = conn.execute(
                        f"UPDATE operations SET state=?, result=?, updated_at=? "
                        f"WHERE {where} AND generation_seq=? AND tool_call_id=? "
                        f"AND state IN ({placeholders}) AND {self._TURN_FENCE}",
                        [state, result_text, time.time(), *params, generation_seq,
                         tool_call_id, *legal_sources, *self._fence_params(lease)],
                    )
                conn.commit()
        except sqlite3.Error as exc:
            raise TurnStateUnavailableError(f"ledger write failed: {exc}") from exc
        if cur.rowcount != 1 and not tolerate_missing:
            raise StaleTurnError(
                f"op {tool_call_id} gen_seq {generation_seq}: no legally-"
                f"transitionable row under the current fence"
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
        try:
            payload = json.loads(row[2])
            snapshot = json.loads(row[10] or "{}")
        except (json.JSONDecodeError, TypeError):
            # An unreadable checkpoint can never be resumed — reject it
            # terminally instead of raising into every caller.
            log.exception("Corrupt checkpoint payload for %s — rejecting", key)
            self.reject_resumable_sync(key, "checkpoint payload unreadable")
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
            "payload": payload,
            "guild_id": row[3],
            "user_id": row[4],
            "content_digest": row[5],
            "code_version": row[6],
            "schema_version": row[7],
            "prompt_policy_hash": row[8],
            "tool_catalog_hash": row[9],
            "session_snapshot": snapshot,
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

    def mark_ops_manual_sync(self, key: TurnKey, generation: str) -> int:
        """OUTCOME_UNKNOWN → MANUAL_RESOLUTION_REQUIRED for a turn whose
        continuation is being halted (round-2 blocker #6, PR #242). Both
        states are in the never-auto-expire set; this transition records
        that a human was told and owns the reconciliation now."""
        conn = self._require()
        try:
            with self._write_lock:
                cur = conn.execute(
                    "UPDATE operations SET state=?, updated_at=? "
                    "WHERE source=? AND channel_id=? AND message_id=? "
                    "AND turn_generation=? AND state=?",
                    [OpState.MANUAL_RESOLUTION_REQUIRED, time.time(),
                     key.source, key.channel_id, key.message_id, generation,
                     OpState.OUTCOME_UNKNOWN],
                )
                conn.commit()
            return cur.rowcount
        except sqlite3.Error:
            log.exception("mark_ops_manual failed (non-fatal)")
            return 0

    def release_acquired_sync(
        self, lease: TurnLease, *, terminal_reason: str | None = None
    ) -> None:
        """Fenced abort for a lease acquired but never run (post-acquire
        reconstruction failure — review blocker #5, PR #242).

        With ``terminal_reason`` the turn becomes TERMINAL_REJECTED (payload
        compacted); without, it returns to SUSPENDED for a later attempt.
        Fenced on the lease so only the acquiring owner can abort."""
        conn = self._require()
        if terminal_reason is not None:
            set_sql = "status=?, payload=NULL, lease_token=NULL, lease_expires_at=NULL"
            first_param: list = [TurnStatus.TERMINAL_REJECTED]
        else:
            set_sql = "status=?, lease_token=NULL, lease_expires_at=NULL"
            first_param = [TurnStatus.SUSPENDED]
        try:
            with self._write_lock:
                cur = conn.execute(
                    f"UPDATE turns SET {set_sql} "
                    "WHERE source=? AND channel_id=? AND message_id=? "
                    "AND turn_generation=? AND lease_token=? AND status=?",
                    [*first_param, lease.key.source, lease.key.channel_id,
                     lease.key.message_id, lease.generation, lease.token,
                     TurnStatus.ACTIVE],
                )
                conn.commit()
            if cur.rowcount == 1 and terminal_reason:
                log.info("Acquired turn %s rejected: %s", lease.key, terminal_reason)
        except sqlite3.Error:
            log.exception("release_acquired failed (non-fatal)")

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
        """Crash recovery at construction: ALL ACTIVE turns become SUSPENDED
        — this store serves a single process, so at construction no turn can
        legitimately be in flight, lease expiry notwithstanding (a fast
        restart inside the lease TTL used to strand rows ACTIVE forever —
        review blocker #4, PR #242). Their PREPARED/RUNNING ops become
        OUTCOME_UNKNOWN (we cannot know whether the external effect
        happened — never rerun)."""
        return self._sweep_active_sync(only_expired=False)

    def sweep_expired_active_sync(self) -> dict:
        """Defense-in-depth periodic sweep (housekeeping): any ACTIVE row
        whose lease expired belongs to a dead owner — suspend it so the
        resume path can see it."""
        if self._conn is None:
            return {}
        try:
            return self._sweep_active_sync(only_expired=True)
        except Exception:
            log.exception("expired-active sweep failed (non-fatal)")
            return {}

    def _sweep_active_sync(self, *, only_expired: bool) -> dict:
        conn = self._require()
        now = time.time()
        where = "status=?"
        params: list = [TurnStatus.ACTIVE]
        if only_expired:
            where += " AND (lease_expires_at IS NULL OR lease_expires_at < ?)"
            params.append(now)
        with self._write_lock:
            stale = conn.execute(
                f"SELECT source, channel_id, message_id, turn_generation FROM turns "
                f"WHERE {where}",
                params,
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
        self._restrict_db_modes()  # WAL/SHM sidecars appear lazily
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
        """Content-addressed blob write (tmp+rename, 0600 — the codex_auth
        secure-write discipline). Returns 'blob:<sha256>'."""
        digest = hashlib.sha256(data).hexdigest()
        path = self._blob_dir / digest
        if not path.exists():
            tmp = path.with_suffix(".tmp")
            try:
                fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                try:
                    os.write(fd, data)
                    os.fsync(fd)
                finally:
                    os.close(fd)
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
