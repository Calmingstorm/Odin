"""Read-only observability snapshot over the durable turn-state store.

The store's own connection serializes every mutation under a write lock and a
three-part fence; this module deliberately shares NONE of that machinery. It
opens its own SQLite connection with ``mode=ro`` and ``PRAGMA query_only=ON``,
reads one bounded snapshot, and closes immediately.

Current recovery posture and historical diagnostics are separate domains:
``turns`` contains active/suspended work plus genuine manual-resolution rows,
while old ``OUTCOME_UNKNOWN`` evidence remains available only as bounded
aggregate diagnostics. Historical ambiguity is not manufactured operator work.
"""

from __future__ import annotations

import sqlite3
import time
import urllib.parse
from pathlib import Path

from .store import OpState, TurnStatus

_PENDING_OP_STATES = (OpState.PREPARED, OpState.RUNNING)
_MANUAL_OP_STATES = (OpState.MANUAL_RESOLUTION_REQUIRED,)
_DIAGNOSTIC_OP_STATES = (OpState.OUTCOME_UNKNOWN,)

_MAX_OPS_PER_TURN = 50
_MAX_DIAGNOSTIC_TOOLS = 20


def _connect_read_only(db_path: str) -> sqlite3.Connection:
    """Open a dedicated read-only connection; the caller must close it."""
    quoted = urllib.parse.quote(str(Path(db_path)))
    conn = sqlite3.connect(f"file:{quoted}?mode=ro", uri=True, timeout=1.0)
    conn.row_factory = sqlite3.Row
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
        # Compatibility field: actionable operation evidence is now manual
        # resolution only, never historical OUTCOME_UNKNOWN residue.
        "attention_operations_count": row["manual_resolution_operations"],
        "outcome_unknown_operations": row["outcome_unknown_operations"],
        "manual_resolution_operations": row["manual_resolution_operations"],
        "more_attention_evidence": False,
        "more_diagnostic_evidence": False,
        "expired_lease": bool(row["expired_lease"]),
        "requires_attention": bool(row["requires_attention"]),
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
    """Return one coherent, bounded recovery-posture snapshot.

    The principal row set contains all ACTIVE and SUSPENDED turns plus terminal
    turns carrying MANUAL_RESOLUTION_REQUIRED effects. Attention is narrower:
    suspended work, expired/missing ACTIVE leases, and genuine manual effects.
    Healthy ACTIVE work remains visible posture but is not a red operator task.

    OUTCOME_UNKNOWN is retained as forensic evidence and counted in a bounded
    diagnostic split. It neither admits terminal rows to the principal page nor
    contributes to Attention.
    """
    conn = _connect_read_only(db_path)
    try:
        conn.execute("BEGIN")
        now = time.time()

        evidence_cte = """
            WITH evidence AS (
                SELECT source, channel_id, message_id,
                       SUM(CASE WHEN state = ? THEN 1 ELSE 0 END)
                           AS manual_resolution_operations,
                       SUM(CASE WHEN state = ? THEN 1 ELSE 0 END)
                           AS outcome_unknown_operations
                FROM operations
                WHERE state IN (?, ?)
                GROUP BY source, channel_id, message_id
            )
        """
        evidence_params = (
            OpState.MANUAL_RESOLUTION_REQUIRED,
            OpState.OUTCOME_UNKNOWN,
            OpState.MANUAL_RESOLUTION_REQUIRED,
            OpState.OUTCOME_UNKNOWN,
        )
        match_where = (
            "t.status IN (?, ?) OR "
            "COALESCE(e.manual_resolution_operations, 0) > 0"
        )
        attention_expr = (
            "(t.status = ? OR "
            "(t.status = ? AND (t.lease_expires_at IS NULL OR t.lease_expires_at < ?)) OR "
            "COALESCE(e.manual_resolution_operations, 0) > 0)"
        )

        total_matching = conn.execute(
            evidence_cte
            + f"""
                SELECT COUNT(*) FROM turns AS t
                LEFT JOIN evidence AS e USING (source, channel_id, message_id)
                WHERE {match_where}
            """,
            (*evidence_params, TurnStatus.ACTIVE, TurnStatus.SUSPENDED),
        ).fetchone()[0]

        rows = conn.execute(
            evidence_cte
            + f"""
                SELECT t.source, t.channel_id, t.message_id,
                       t.turn_generation, t.revision, t.status,
                       t.lease_expires_at, t.recovery_deadline_utc,
                       t.last_progress_at, t.created_at, t.suspended_at,
                       t.guild_id, t.user_id, t.code_version, t.schema_version,
                       (t.payload IS NOT NULL) AS has_checkpoint,
                       COALESCE(e.manual_resolution_operations, 0)
                           AS manual_resolution_operations,
                       COALESCE(e.outcome_unknown_operations, 0)
                           AS outcome_unknown_operations,
                       CASE WHEN t.status = ? AND
                           (t.lease_expires_at IS NULL OR t.lease_expires_at < ?)
                           THEN 1 ELSE 0 END AS expired_lease,
                       CASE WHEN {attention_expr} THEN 1 ELSE 0 END
                           AS requires_attention
                FROM turns AS t
                LEFT JOIN evidence AS e USING (source, channel_id, message_id)
                WHERE {match_where}
                ORDER BY
                    CASE
                        WHEN COALESCE(e.manual_resolution_operations, 0) > 0 THEN 0
                        WHEN t.status = ? AND
                             (t.lease_expires_at IS NULL OR t.lease_expires_at < ?) THEN 1
                        WHEN t.status = ? THEN 2
                        WHEN t.status = ? THEN 3
                        ELSE 4
                    END,
                    t.last_progress_at DESC
                LIMIT ?
            """,
            (
                *evidence_params,
                TurnStatus.ACTIVE,
                now,
                TurnStatus.SUSPENDED,
                TurnStatus.ACTIVE,
                now,
                TurnStatus.ACTIVE,
                TurnStatus.SUSPENDED,
                TurnStatus.ACTIVE,
                now,
                TurnStatus.SUSPENDED,
                TurnStatus.ACTIVE,
                limit,
            ),
        ).fetchall()
        turns = [_turn_row(row) for row in rows]

        evidence_states = (*_MANUAL_OP_STATES, *_DIAGNOSTIC_OP_STATES)
        evidence_marks = ",".join("?" for _ in evidence_states)
        pending_marks = ",".join("?" for _ in _PENDING_OP_STATES)
        for turn in turns:
            key = (turn["source"], turn["channel_id"], turn["message_id"])
            evidence_ops = conn.execute(
                f"""
                SELECT state, tool_name, tool_call_id, iteration,
                       created_at, updated_at
                FROM operations
                WHERE source=? AND channel_id=? AND message_id=?
                  AND state IN ({evidence_marks})
                ORDER BY CASE WHEN state=? THEN 0 ELSE 1 END,
                         updated_at DESC
                LIMIT ?
                """,
                (
                    *key,
                    *evidence_states,
                    OpState.MANUAL_RESOLUTION_REQUIRED,
                    _MAX_OPS_PER_TURN,
                ),
            ).fetchall()
            manual_visible = sum(
                op["state"] == OpState.MANUAL_RESOLUTION_REQUIRED for op in evidence_ops
            )
            unknown_visible = sum(
                op["state"] == OpState.OUTCOME_UNKNOWN for op in evidence_ops
            )
            turn["more_attention_evidence"] = (
                turn["manual_resolution_operations"] > manual_visible
            )
            turn["more_diagnostic_evidence"] = (
                turn["outcome_unknown_operations"] > unknown_visible
            )
            pending_budget = max(0, _MAX_OPS_PER_TURN - len(evidence_ops))
            pending_ops = conn.execute(
                f"""
                SELECT state, tool_name, tool_call_id, iteration,
                       created_at, updated_at
                FROM operations
                WHERE source=? AND channel_id=? AND message_id=?
                  AND state IN ({pending_marks})
                ORDER BY updated_at DESC LIMIT ?
                """,
                (*key, *_PENDING_OP_STATES, pending_budget + 1),
            ).fetchall()
            visible_ops = [*evidence_ops, *pending_ops[:pending_budget]]
            visible_ops.sort(key=lambda row: row["updated_at"], reverse=True)
            turn["operations"] = [_op_row(op) for op in visible_ops]
            turn["operations_truncated"] = (
                turn["more_attention_evidence"]
                or turn["more_diagnostic_evidence"]
                or len(pending_ops) > pending_budget
            )

        def _count_turns(status: str) -> int:
            return conn.execute(
                "SELECT COUNT(*) FROM turns WHERE status=?", (status,)
            ).fetchone()[0]

        def _count_ops(state: str) -> int:
            return conn.execute(
                "SELECT COUNT(*) FROM operations WHERE state=?", (state,)
            ).fetchone()[0]

        attention_turns = conn.execute(
            evidence_cte
            + f"""
                SELECT COUNT(*) FROM turns AS t
                LEFT JOIN evidence AS e USING (source, channel_id, message_id)
                WHERE {attention_expr}
            """,
            (
                *evidence_params,
                TurnStatus.SUSPENDED,
                TurnStatus.ACTIVE,
                now,
            ),
        ).fetchone()[0]
        expired_active = conn.execute(
            "SELECT COUNT(*) FROM turns WHERE status=? AND "
            "(lease_expires_at IS NULL OR lease_expires_at < ?)",
            (TurnStatus.ACTIVE, now),
        ).fetchone()[0]
        outcome_unknown_turns = conn.execute(
            "SELECT COUNT(*) FROM (SELECT 1 FROM operations WHERE state=? "
            "GROUP BY source, channel_id, message_id)",
            (OpState.OUTCOME_UNKNOWN,),
        ).fetchone()[0]
        diagnostic_tool_count = conn.execute(
            "SELECT COUNT(DISTINCT tool_name) FROM operations WHERE state=?",
            (OpState.OUTCOME_UNKNOWN,),
        ).fetchone()[0]
        diagnostic_tools = [
            {"tool_name": row[0], "operations": row[1]}
            for row in conn.execute(
                "SELECT tool_name, COUNT(*) AS operations FROM operations "
                "WHERE state=? GROUP BY tool_name "
                "ORDER BY operations DESC, tool_name ASC LIMIT ?",
                (OpState.OUTCOME_UNKNOWN, _MAX_DIAGNOSTIC_TOOLS),
            )
        ]

        included_attention = sum(turn["requires_attention"] for turn in turns)
        unknown_operations = _count_ops(OpState.OUTCOME_UNKNOWN)
        return {
            "counts": {
                "active": _count_turns(TurnStatus.ACTIVE),
                "suspended": _count_turns(TurnStatus.SUSPENDED),
                "expired_active": expired_active,
                "attention_required": attention_turns,
                "outcome_unknown_operations": unknown_operations,
                "outcome_unknown_turns": outcome_unknown_turns,
                "manual_resolution_operations": _count_ops(
                    OpState.MANUAL_RESOLUTION_REQUIRED
                ),
            },
            "turns": turns,
            "truncated": total_matching > len(turns),
            "omitted_turns": max(0, total_matching - len(turns)),
            "omitted_attention_turns": max(0, attention_turns - included_attention),
            "diagnostics": {
                "outcome_unknown": {
                    "operations": unknown_operations,
                    "turns": outcome_unknown_turns,
                    "by_tool": diagnostic_tools,
                    "tools_truncated": diagnostic_tool_count > len(diagnostic_tools),
                    "omitted_tools": max(0, diagnostic_tool_count - len(diagnostic_tools)),
                }
            },
        }
    finally:
        if conn.in_transaction:
            conn.rollback()
        conn.close()
