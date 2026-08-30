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

# Both pending posture and unresolved-effect evidence are bounded on the wire.
# Attention counts and explicit omission flags preserve the truth whenever the
# representative rows cannot all fit in the per-turn display cap.
_PENDING_OP_STATES = (OpState.PREPARED, OpState.RUNNING)
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
        "attention_operations_count": row["attention_operations_count"],
        "outcome_unknown_operations": row["outcome_unknown_operations"],
        "manual_resolution_operations": row["manual_resolution_operations"],
        "more_attention_evidence": False,
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
    """One coherent, bounded posture snapshot over the matching turn set.

    Matching set (design-settled): every ACTIVE turn, every SUSPENDED turn,
    and any turn — terminal included — carrying an OUTCOME_UNKNOWN or
    MANUAL_RESOLUTION_REQUIRED operation. Attention-carrying turns sort ahead
    of newest-first healthy posture, bounded by *limit* with explicit omitted
    turn counts. Per-turn evidence is bounded too; exact attention counts and
    ``more_attention_evidence`` prevent silent loss or misleading labels.
    Synchronous by design; call it through ``asyncio.to_thread``.
    """
    conn = _connect_read_only(db_path)
    try:
        # A sequence of SELECTs on an autocommit connection is not one snapshot:
        # a WAL writer may commit between the match count, rows, operation
        # evidence, and aggregates. BEGIN pins all reads below to one coherent
        # SQLite snapshot without taking the store's write lock.
        conn.execute("BEGIN")

        attention_marks = ",".join("?" for _ in _ATTENTION_OP_STATES)
        attention_cte = f"""
            WITH attention AS (
                SELECT source, channel_id, message_id,
                       COUNT(*) AS attention_operations_count,
                       SUM(CASE WHEN state = ? THEN 1 ELSE 0 END)
                           AS outcome_unknown_operations,
                       SUM(CASE WHEN state = ? THEN 1 ELSE 0 END)
                           AS manual_resolution_operations
                FROM operations
                WHERE state IN ({attention_marks})
                GROUP BY source, channel_id, message_id
            )
        """
        attention_params = (
            OpState.OUTCOME_UNKNOWN,
            OpState.MANUAL_RESOLUTION_REQUIRED,
            *_ATTENTION_OP_STATES,
        )

        total_matching = conn.execute(
            attention_cte
            + """
                SELECT COUNT(*)
                FROM turns AS t
                LEFT JOIN attention AS a
                  USING (source, channel_id, message_id)
                WHERE t.status IN (?, ?) OR a.attention_operations_count IS NOT NULL
            """,
            (*attention_params, TurnStatus.ACTIVE, TurnStatus.SUSPENDED),
        ).fetchone()[0]

        # Unresolved external-effect evidence owns the page ahead of ordinary
        # newest-first active/suspended posture.  If attention alone exceeds
        # the page cap, explicit omitted_attention_turns metadata below tells
        # the operator that older evidence remains rather than silently
        # substituting newer healthy rows.
        turns = [
            _turn_row(row)
            for row in conn.execute(
                attention_cte
                + """
                    SELECT t.source, t.channel_id, t.message_id,
                           t.turn_generation, t.revision, t.status,
                           t.lease_expires_at, t.recovery_deadline_utc,
                           t.last_progress_at, t.created_at, t.suspended_at,
                           t.guild_id, t.user_id, t.code_version,
                           t.schema_version,
                           (t.payload IS NOT NULL) AS has_checkpoint,
                           COALESCE(a.attention_operations_count, 0)
                               AS attention_operations_count,
                           COALESCE(a.outcome_unknown_operations, 0)
                               AS outcome_unknown_operations,
                           COALESCE(a.manual_resolution_operations, 0)
                               AS manual_resolution_operations
                    FROM turns AS t
                    LEFT JOIN attention AS a
                      USING (source, channel_id, message_id)
                    WHERE t.status IN (?, ?) OR a.attention_operations_count IS NOT NULL
                    ORDER BY
                        CASE WHEN a.attention_operations_count IS NULL THEN 1 ELSE 0 END,
                        t.created_at DESC
                    LIMIT ?
                """,
                (*attention_params, TurnStatus.ACTIVE, TurnStatus.SUSPENDED, limit),
            )
        ]

        attention_op_marks = ",".join("?" for _ in _ATTENTION_OP_STATES)
        pending_op_marks = ",".join("?" for _ in _PENDING_OP_STATES)
        for turn in turns:
            key = (turn["source"], turn["channel_id"], turn["message_id"])
            attention_ops = conn.execute(
                f"""
                SELECT state, tool_name, tool_call_id, iteration,
                       created_at, updated_at
                FROM operations
                WHERE source = ? AND channel_id = ? AND message_id = ?
                  AND state IN ({attention_op_marks})
                ORDER BY updated_at DESC LIMIT ?
                """,
                (*key, *_ATTENTION_OP_STATES, _MAX_OPS_PER_TURN),
            ).fetchall()

            # Attention gets first claim on the bounded evidence budget.
            # Counts came from the same read snapshot, so omission remains
            # exact and explicit without scanning or serializing every row.
            attention_count = turn["attention_operations_count"]
            turn["more_attention_evidence"] = attention_count > len(attention_ops)
            pending_budget = max(0, _MAX_OPS_PER_TURN - len(attention_ops))
            pending_ops = conn.execute(
                f"""
                SELECT state, tool_name, tool_call_id, iteration,
                       created_at, updated_at
                FROM operations
                WHERE source = ? AND channel_id = ? AND message_id = ?
                  AND state IN ({pending_op_marks})
                ORDER BY updated_at DESC LIMIT ?
                """,
                (*key, *_PENDING_OP_STATES, pending_budget + 1),
            ).fetchall()
            visible_ops = [*attention_ops, *pending_ops[:pending_budget]]
            visible_ops.sort(key=lambda row: row["updated_at"], reverse=True)
            turn["operations"] = [_op_row(op) for op in visible_ops]
            turn["operations_truncated"] = (
                turn["more_attention_evidence"] or len(pending_ops) > pending_budget
            )

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
            SELECT COUNT(*) FROM (
                SELECT 1 FROM operations WHERE state IN ({attention_marks})
                GROUP BY source, channel_id, message_id
            )
            """,
            _ATTENTION_OP_STATES,
        ).fetchone()[0]

        return {
            "counts": {
                "active": _count_turns(TurnStatus.ACTIVE),
                "suspended": _count_turns(TurnStatus.SUSPENDED),
                "attention_required": attention_turns,
                "outcome_unknown_operations": _count_ops(OpState.OUTCOME_UNKNOWN),
                "manual_resolution_operations": _count_ops(OpState.MANUAL_RESOLUTION_REQUIRED),
            },
            "turns": turns,
            "truncated": total_matching > len(turns),
            "omitted_turns": max(0, total_matching - len(turns)),
            "omitted_attention_turns": max(
                0,
                attention_turns
                - sum(1 for turn in turns if turn["attention_operations_count"] > 0),
            ),
        }
    finally:
        if conn.in_transaction:
            conn.rollback()
        conn.close()
