"""Regression test: re-indexing a session must be idempotent.

sqlite-vec ``vec0`` virtual tables do NOT honor ``INSERT OR REPLACE`` conflict
resolution — re-inserting an existing primary key raises "UNIQUE constraint
failed" instead of replacing. The startup archive backfill keys its
"already-indexed" check on ``session_archives``, so a doc_id present only in
``session_vec`` was re-indexed and errored on every startup. The fix is
delete-then-insert in the vec write path.
"""
from __future__ import annotations

import pytest

from src.search.vectorstore import VECTOR_DIM, SessionVectorStore


def test_session_vec_reindex_is_idempotent(tmp_path):
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    if not store._has_vec:
        pytest.skip("sqlite-vec not available")

    doc_id = "ch1_1700000000"
    # First index.
    store._write_session_sync(doc_id, "hello world", "ch1", 1000.0, 3, [0.1] * VECTOR_DIM)
    # Re-index the SAME doc_id with a different vector + metadata. Before the fix
    # this raised "UNIQUE constraint failed on session_vec primary key".
    store._write_session_sync(doc_id, "hello world updated", "ch1", 2000.0, 5, [0.9] * VECTOR_DIM)

    # Exactly one vec row for the doc_id (replaced, not duplicated).
    (vec_count,) = store._conn.execute(
        "SELECT COUNT(*) FROM session_vec WHERE doc_id = ?", (doc_id,)
    ).fetchone()
    assert vec_count == 1

    # Metadata was updated to the second write.
    (msg_count,) = store._conn.execute(
        "SELECT message_count FROM session_archives WHERE doc_id = ?", (doc_id,)
    ).fetchone()
    assert msg_count == 5

    store.close() if hasattr(store, "close") else store._conn.close()


def test_session_vec_write_without_vector_is_safe(tmp_path):
    """A None vector (embed failure) must still write metadata without touching vec."""
    store = SessionVectorStore(str(tmp_path / "sessions.db"))
    doc_id = "ch2_1700000001"
    store._write_session_sync(doc_id, "no embedding", "ch2", 1000.0, 2, None)
    (msg_count,) = store._conn.execute(
        "SELECT message_count FROM session_archives WHERE doc_id = ?", (doc_id,)
    ).fetchone()
    assert msg_count == 2
    store._conn.close()
