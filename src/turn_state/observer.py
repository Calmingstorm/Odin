"""Read-only observability snapshot over the durable turn-state store.

The store's own connection serializes every mutation under a write lock and a
three-part fence; this module deliberately shares NONE of that machinery. It
opens its own SQLite connection with ``mode=ro`` and ``PRAGMA query_only=ON``,
reads one bounded snapshot, and closes immediately — it can never sweep a
lease, validate a payload, or move the ledger, and it never contends the
write path's lock (W3 settled design).

Field exposure is an explicit ALLOWLIST projection: checkpoint payloads,
digests, session snapshots, lease tokens, prompt/catalog hashes, operation
results, and effect fingerprints never leave storage. Presence booleans stand
in where the operator needs to know something exists.
"""

from __future__ import annotations

import sqlite3
import urllib.parse
from pathlib import Path

from .store import OpState, TurnStatus

# Operation states worth an operator's attention in a posture view: the
# not-yet-settled pair plus the never-expire evidence pair. Settled APPLIED /
# DEFINITELY_FAILED / RECONCILED_* rows are history, not posture.
_POSTURE_OP_STATES = (
    OpState.PREPARED,
    OpState.RUNNING,
    OpState.OUTCOME_UNKNOWN,
    OpState.MANUAL_RESOLUTION_REQUIRED,
)

# Never-expire evidence: a turn carrying one of these stays visible even when
# the turn itself is terminal.
_ATTENTION_OP_STATES = (OpState.OUTCOME_UNKNOWN, OpState.MANUAL_RESOLUTION_REQUIRED)

_MAX_OPS_PER_TURN = 50


def _connect_read_only(db_path: str) -> sqlite3.Connection:
    """Open a dedicated read-only connection; the caller must close it."""
    quoted = urllib.parse.quote(str(Path(db_path)))
    conn = sqlite3.connect(f"file:{quoted}?mode=ro", uri=True, timeout=1.0)
    conn.row_factory = sqlite3.Row
    # Belt over the mode=ro braces: even a bug in this module cannot write.
    conn.execute("PRAGMA query_only=ON")
    return conn


def _turn_row(row: sqlite3.Row) -> dict:
    return {
        "source": row["source"],
        "channel_id": row["channel_id"],
        "message_id": row["message_id"],
        "turn_generation": row["turn_generation"],
        "revision": row["revision"],
        "status": row["status"],
        "lease_expires_at": row["lease_expires_at"],
        "recovery_deadline_utc": row["recovery_deadline_utc"],
        "last_progress_at": row["last_progress_at"],
        "created_at": row["created_at"],
        "suspended_at": row["suspended_at"],
        "guild_id": row["guild_id"],
        "user_id": row["user_id"],
        "code_version": row["code_version"],
        "schema_version": row["schema_version"],
        "has_checkpoint": bool(row["has_checkpoint"]),
        "operations": [],
        "operations_truncated": False,
    }


def _op_row(row: sqlite3.Row) -> dict:
    return {
        "state": row["state"],
        "tool_name": row["tool_name"],
        "tool_call_id": row["tool_call_id"],
        "iteration": row["iteration"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def read_turn_snapshot(db_path: str, limit: int) -> dict:
    """One bounded posture snapshot: counts plus the matching turn set.

    Matching set (design-settled): every ACTIVE turn, every SUSPENDED turn,
    and any turn — terminal included — carrying an OUTCOME_UNKNOWN or
    MANUAL_RESOLUTION_REQUIRED operation. Newest first, bounded by *limit*
    with an explicit truncation flag. Synchronous by design; call it through
    ``asyncio.to_thread``.
    """
    conn = _connect_read_only(db_path)
    try:
        attention_marks = ",".join("?" for _ in _ATTENTION_OP_STATES)
        match_where = f"""
            status IN (?, ?)
            OR (source, channel_id, message_id) IN (
                SELECT DISTINCT source, channel_id, message_id
                FROM operations WHERE state IN ({attention_marks})
            )
        """
        match_params = (TurnStatus.ACTIVE, TurnStatus.SUSPENDED, *_ATTENTION_OP_STATES)

        total_matching = conn.execute(
            f"SELECT COUNT(*) FROM turns WHERE {match_where}", match_params
        ).fetchone()[0]

        turns = [
            _turn_row(row)
            for row in conn.execute(
                f"""
                SELECT source, channel_id, message_id, turn_generation, revision,
                       status, lease_expires_at, recovery_deadline_utc,
                       last_progress_at, created_at, suspended_at, guild_id,
                       user_id, code_version, schema_version,
                       (payload IS NOT NULL) AS has_checkpoint
                FROM turns WHERE {match_where}
                ORDER BY created_at DESC LIMIT ?
                """,
                (*match_params, limit),
            )
        ]

        posture_marks = ",".join("?" for _ in _POSTURE_OP_STATES)
        for turn in turns:
            key = (turn["source"], turn["channel_id"], turn["message_id"])
            ops = conn.execute(
                f"""
                SELECT state, tool_name, tool_call_id, iteration,
                       created_at, updated_at
                FROM operations
                WHERE source = ? AND channel_id = ? AND message_id = ?
                  AND state IN ({posture_marks})
                ORDER BY updated_at DESC LIMIT ?
                """,
                (*key, *_POSTURE_OP_STATES, _MAX_OPS_PER_TURN + 1),
            ).fetchall()
            turn["operations"] = [_op_row(op) for op in ops[:_MAX_OPS_PER_TURN]]
            turn["operations_truncated"] = len(ops) > _MAX_OPS_PER_TURN

        def _count_turns(status: str) -> int:
            return conn.execute(
                "SELECT COUNT(*) FROM turns WHERE status = ?", (status,)
            ).fetchone()[0]

        def _count_ops(state: str) -> int:
            return conn.execute(
                "SELECT COUNT(*) FROM operations WHERE state = ?", (state,)
            ).fetchone()[0]

        attention_turns = conn.execute(
            f"""
            SELECT COUNT(DISTINCT source || ':' || channel_id || ':' || message_id)
            FROM operations WHERE state IN ({attention_marks})
            """,
            _ATTENTION_OP_STATES,
        ).fetchone()[0]

        return {
            "counts": {
                "active": _count_turns(TurnStatus.ACTIVE),
                "suspended": _count_turns(TurnStatus.SUSPENDED),
                "attention_required": attention_turns,
                "outcome_unknown_operations": _count_ops(OpState.OUTCOME_UNKNOWN),
                "manual_resolution_operations": _count_ops(
                    OpState.MANUAL_RESOLUTION_REQUIRED
                ),
            },
            "turns": turns,
            "truncated": total_matching > limit,
        }
    finally:
        conn.close()
