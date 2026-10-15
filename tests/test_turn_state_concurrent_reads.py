"""Concurrent checkpoint reads on the turn-state store's shared connection stay intact.

Ported from Odin Desktop's ``test_desktop_checkpoint_concurrency.py``.
"""
import threading
from concurrent.futures import ThreadPoolExecutor

from src.turn_state.store import TurnKey, TurnStateStore, TurnStatus, _payload_digest


def test_concurrent_resume_reads_keep_exact_payload_and_digest(tmp_path):
    """CPython 3.12 statement-cache races must not reject valid durable bytes.

    Auto-resume, ``/resume`` and status checks read through ``asyncio.to_thread``
    on one shared connection. When the same SELECT runs concurrently, the
    statement cache can mix columns or return empty rows (python/cpython#118172),
    which would reject an intact checkpoint.
    """
    store = TurnStateStore(tmp_path / "turns.sqlite3")
    key = TurnKey("discord", "test-channel", "test-message")
    try:
        lease, disposition = store.admit_turn_sync(
            key, guild_id=None, user_id="owner", content_digest="content",
            code_version="test", prompt_policy_hash="prompt",
            tool_catalog_hash="tools", session_snapshot={})
        assert disposition == "admitted" and lease is not None
        payload = {"messages": [{"role": "user", "content": "preserved request"}],
                   "consumed_guard": True, "cap": 1}
        store.suspend_sync(lease, payload)

        def persisted_bytes():
            return store._conn.execute(
                "SELECT payload, payload_digest FROM turns WHERE source=? "
                "AND channel_id=? AND message_id=?",
                (key.source, key.channel_id, key.message_id)).fetchone()

        persisted = persisted_bytes()
        assert persisted[1] == _payload_digest(persisted[0])
        barrier = threading.Barrier(8)

        def read_checkpoint():
            barrier.wait(timeout=5)
            for _ in range(250):
                row = store.load_resumable_sync(key)
                assert row is not None
                assert row["generation"] == lease.generation
                assert row["payload"] == payload
                assert row["operations"] == []

        with ThreadPoolExecutor(max_workers=8) as workers:
            futures = [workers.submit(read_checkpoint) for _ in range(8)]
            for future in futures:
                future.result(timeout=30)
        assert store.turn_status_sync(key) == TurnStatus.SUSPENDED
        assert persisted_bytes() == persisted
    finally:
        store.close()
