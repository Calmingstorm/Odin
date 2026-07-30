"""Pins for the durable turn-state store (src/turn_state/store.py).

The load-bearing properties, each from the settled design:
- three-part write fencing (generation, revision, lease token);
- heartbeats extend the lease but never advance last_progress_at and never
  bump the revision;
- boot sweep: stale ACTIVE turns suspend, in-flight ops become
  OUTCOME_UNKNOWN (never rerun);
- three TTL clocks, with OUTCOME_UNKNOWN ledger rows never auto-expiring;
- terminal payload compaction (tombstones keep identity + ledger).
"""

from __future__ import annotations

import time

import pytest

from src.turn_state import (
    LedgerIntentError,
    OpState,
    StaleTurnError,
    TurnKey,
    TurnStateStore,
    TurnStatus,
    effect_fingerprint,
)

KEY = TurnKey(source="discord", channel_id="c1", message_id="m1")


@pytest.fixture
def store(tmp_path):
    s = TurnStateStore(tmp_path / "turns.sqlite3", blob_dir=tmp_path / "blobs")
    yield s
    s.close()


def _admit(store, key=KEY):
    lease, disposition = store.admit_turn_sync(
        key,
        guild_id="g1",
        user_id="u1",
        content_digest="digest",
        code_version="test",
        prompt_policy_hash="pp",
        tool_catalog_hash="tc",
        session_snapshot={"messages": 3},
    )
    assert disposition == "admitted"
    assert lease is not None
    return lease


def _row(store, key=KEY, cols="status, revision, payload, last_progress_at"):
    return store._conn.execute(
        f"SELECT {cols} FROM turns WHERE source=? AND channel_id=? AND message_id=?",
        [key.source, key.channel_id, key.message_id],
    ).fetchone()


class TestAdmissionAndCheckpoint:
    def test_admit_and_checkpoint_roundtrip(self, store):
        lease = _admit(store)
        assert lease.revision == 0
        store.checkpoint_sync(lease, {"iteration": 1}, progressed=True)
        assert lease.revision == 1
        store.checkpoint_sync(lease, {"iteration": 2}, progressed=True)
        assert lease.revision == 2
        status, revision, payload, _ = _row(store)
        assert status == TurnStatus.ACTIVE
        assert revision == 2
        assert '"iteration": 2' in payload

    def _readmit(self, store):
        return store.admit_turn_sync(
            KEY, guild_id=None, user_id=None, content_digest=None,
            code_version=None, prompt_policy_hash=None, tool_catalog_hash=None,
            session_snapshot=None,
        )

    def test_existing_identity_dispositions(self, store):
        # Review blocker #2 (PR #242): an existing identity must REFUSE
        # fresh execution — it must never mean "run without durability".
        lease = _admit(store)
        assert self._readmit(store) == (None, "in_progress")  # live lease

        store.suspend_sync(lease, {"p": 1})
        assert self._readmit(store) == (None, "resumable")

        new_lease = store.acquire_resume_lease_sync(KEY, lease.generation)
        store.finish_sync(new_lease)
        assert self._readmit(store) == (None, "already_processed")

    def test_expired_active_readmission_sweeps_to_resumable(self, store):
        import time as _time

        lease = _admit(store)
        store.record_intents_sync(
            lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
        )
        store.mark_running_sync(lease, 0, "c1")
        store._conn.execute(
            "UPDATE turns SET lease_expires_at=?", [_time.time() - 10]
        )
        store._conn.commit()
        assert self._readmit(store) == (None, "resumable")
        row = store._conn.execute("SELECT status FROM turns").fetchone()
        assert row[0] == TurnStatus.SUSPENDED
        op = store._conn.execute("SELECT state FROM operations").fetchone()
        assert op[0] == OpState.OUTCOME_UNKNOWN

    def test_unavailable_store_admits_none(self, tmp_path):
        # A file where the DB directory should be → init fails → degraded.
        blocker = tmp_path / "blocked"
        blocker.write_text("not a directory")
        s = TurnStateStore(blocker / "turns.sqlite3")
        assert s.available is False
        assert s.admit_turn_sync(
            KEY, guild_id=None, user_id=None, content_digest=None,
            code_version=None, prompt_policy_hash=None, tool_catalog_hash=None,
            session_snapshot=None,
        ) == (None, "store_unavailable")

    def test_recovery_deadline_persisted_utc(self, store):
        lease = _admit(store)
        deadline = time.time() + 300.0
        store.checkpoint_sync(
            lease, {}, progressed=False, recovery_deadline_utc=deadline
        )
        (stored,) = _row(store, cols="recovery_deadline_utc")
        assert abs(stored - deadline) < 0.001


class TestFencing:
    def test_wrong_token_is_stale(self, store):
        lease = _admit(store)
        import dataclasses

        thief = dataclasses.replace(lease)
        thief.token = "someone-else"
        with pytest.raises(StaleTurnError):
            store.checkpoint_sync(thief, {}, progressed=False)

    def test_old_revision_is_stale(self, store):
        lease = _admit(store)
        store.checkpoint_sync(lease, {"n": 1}, progressed=False)
        import dataclasses

        old = dataclasses.replace(lease)
        old.revision = 0  # an expired owner replaying its last known revision
        with pytest.raises(StaleTurnError):
            store.checkpoint_sync(old, {"stale": True}, progressed=False)
        # The current owner still works.
        store.checkpoint_sync(lease, {"n": 2}, progressed=False)

    def test_resumed_turn_fences_out_old_owner(self, store):
        lease = _admit(store)
        store.checkpoint_sync(lease, {"n": 1}, progressed=True)
        store.suspend_sync(lease, {"n": 1})
        new_lease = store.acquire_resume_lease_sync(KEY, lease.generation)
        assert new_lease is not None
        # The pre-suspension owner wakes up and tries to write: fenced out
        # (its token was cleared at suspension; the new owner holds a fresh one).
        with pytest.raises(StaleTurnError):
            store.checkpoint_sync(lease, {"zombie": True}, progressed=False)
        store.checkpoint_sync(new_lease, {"n": 2}, progressed=True)


class TestHeartbeat:
    def test_heartbeat_extends_lease_only(self, store):
        lease = _admit(store)
        store.checkpoint_sync(lease, {"n": 1}, progressed=True)
        _, rev_before, _, progress_before = _row(store)
        (lease_before,) = _row(store, cols="lease_expires_at")
        time.sleep(0.01)
        store.heartbeat_sync(lease)
        status, rev_after, _, progress_after = _row(store)
        (lease_after,) = _row(store, cols="lease_expires_at")
        assert lease_after > lease_before  # extended
        assert rev_after == rev_before  # NOT a state change
        assert progress_after == progress_before  # never fake progress

    def test_waits_do_not_advance_progress(self, store):
        lease = _admit(store)
        store.checkpoint_sync(lease, {"n": 1}, progressed=True)
        (progress_before,) = _row(store, cols="last_progress_at")
        time.sleep(0.01)
        store.checkpoint_sync(lease, {"n": 1, "waiting": True}, progressed=False)
        (progress_after,) = _row(store, cols="last_progress_at")
        assert progress_after == progress_before


class TestSuspendResumeReject:
    def test_suspend_and_load_resumable(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0,
            [{"tool_call_id": "call_1", "tool_name": "run_command",
              "tool_input": {"command": "ls"}}],
            iteration=0,
        )
        store.settle_op_sync(lease, 0, "call_1", state=OpState.APPLIED,
                             result_text="file.txt")
        store.suspend_sync(lease, {"messages": ["m"]})
        resumable = store.load_resumable_sync(KEY)
        assert resumable is not None
        assert resumable["generation"] == lease.generation
        assert resumable["payload"] == {"messages": ["m"]}
        assert resumable["content_digest"] == "digest"
        assert resumable["session_snapshot"] == {"messages": 3}
        ops = resumable["operations"]
        assert len(ops) == 1
        assert ops[0]["state"] == OpState.APPLIED
        assert ops[0]["result"] == "file.txt"

    def test_resume_lease_single_winner(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {})
        first = store.acquire_resume_lease_sync(KEY, lease.generation)
        second = store.acquire_resume_lease_sync(KEY, lease.generation)
        assert first is not None
        assert second is None  # already ACTIVE under the first resumer

    def test_resume_lease_wrong_generation_loses(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {})
        assert store.acquire_resume_lease_sync(KEY, "not-the-generation") is None

    def test_reject_resumable_is_terminal_and_compacted(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {"payload": True})
        store.reject_resumable_sync(KEY, "message edited")
        status, _, payload, _ = _row(store)
        assert status == TurnStatus.TERMINAL_REJECTED
        assert payload is None
        assert store.load_resumable_sync(KEY) is None

    def test_finish_compacts_payload_keeps_ledger(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
        )
        store.settle_op_sync(lease, 0, "c1", state=OpState.APPLIED, result_text="r")
        store.checkpoint_sync(lease, {"big": "payload"}, progressed=True)
        store.finish_sync(lease)
        status, _, payload, _ = _row(store)
        assert status == TurnStatus.TERMINAL_COMPLETED
        assert payload is None  # compacted immediately
        count = store._conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0]
        assert count == 1  # ledger tombstone retained

    def test_finish_requires_terminal_status(self, store):
        lease = _admit(store)
        with pytest.raises(ValueError):
            store.finish_sync(lease, "ACTIVE")


class TestLedger:
    def test_intent_validation(self, store):
        lease = _admit(store)
        with pytest.raises(LedgerIntentError):
            store.record_intents_sync(
                lease, 0, [{"tool_call_id": "", "tool_name": "t", "tool_input": {}}]
            )
        with pytest.raises(LedgerIntentError):
            store.record_intents_sync(
                lease, 0,
                [{"tool_call_id": "dup", "tool_name": "t", "tool_input": {}},
                 {"tool_call_id": "dup", "tool_name": "t2", "tool_input": {}}],
            )

    def test_state_machine_prepared_running_applied(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
        )
        store.mark_running_sync(lease, 0, "c1")
        store.settle_op_sync(lease, 0, "c1", state=OpState.APPLIED, result_text="ok")
        row = store._conn.execute(
            "SELECT state, result FROM operations WHERE tool_call_id='c1'"
        ).fetchone()
        assert row == (OpState.APPLIED, "ok")

    def test_settle_rejects_non_terminal_states(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
        )
        with pytest.raises(ValueError):
            store.settle_op_sync(lease, 0, "c1", state=OpState.RUNNING, result_text=None)

    def test_settle_missing_row_is_stale(self, store):
        lease = _admit(store)
        with pytest.raises(StaleTurnError):
            store.settle_op_sync(lease, 0, "ghost", state=OpState.APPLIED,
                                 result_text="x")

    def test_ledger_writes_require_live_lease(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {})  # releases the lease
        with pytest.raises(StaleTurnError):
            store.record_intents_sync(
                lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
            )


class TestBootSweep:
    def test_stale_active_suspends_and_ops_go_unknown(self, tmp_path):
        db = tmp_path / "turns.sqlite3"
        s = TurnStateStore(db, blob_dir=tmp_path / "blobs")
        lease = _admit(s)
        s.record_intents_sync(
            lease, 0,
            [{"tool_call_id": "c1", "tool_name": "run_command", "tool_input": {}},
             {"tool_call_id": "c2", "tool_name": "run_command", "tool_input": {}}],
        )
        s.mark_running_sync(lease, 0, "c1")
        # Simulate crash: expire the lease on disk, drop the handle, reopen.
        s._conn.execute("UPDATE turns SET lease_expires_at = ?", [time.time() - 10])
        s._conn.commit()
        s.close()

        reopened = TurnStateStore(db, blob_dir=tmp_path / "blobs")
        row = reopened._conn.execute("SELECT status FROM turns").fetchone()
        assert row[0] == TurnStatus.SUSPENDED
        states = {
            r[0] for r in reopened._conn.execute(
                "SELECT state FROM operations"
            ).fetchall()
        }
        assert states == {OpState.OUTCOME_UNKNOWN}
        reopened.close()

    def test_fast_restart_inside_lease_ttl_still_suspends(self, tmp_path):
        # Deliberate amendment (review blocker #4, PR #242): the store is
        # single-process, so at construction NO turn can legitimately be
        # in flight — the boot sweep suspends ALL ACTIVE rows, lease expiry
        # notwithstanding (a fast restart used to strand them ACTIVE forever).
        db = tmp_path / "turns.sqlite3"
        s = TurnStateStore(db, blob_dir=tmp_path / "blobs")
        _admit(s)
        s.close()
        reopened = TurnStateStore(db, blob_dir=tmp_path / "blobs")
        row = reopened._conn.execute("SELECT status FROM turns").fetchone()
        assert row[0] == TurnStatus.SUSPENDED
        reopened.close()

    def test_periodic_expired_active_sweep(self, tmp_path):
        import time as _time

        s = TurnStateStore(tmp_path / "t.sqlite3", blob_dir=tmp_path / "blobs")
        _admit(s)
        # Live lease: the periodic sweep must NOT touch a healthy owner.
        assert s.sweep_expired_active_sync() == {"turns": 0, "ops": 0}
        s._conn.execute("UPDATE turns SET lease_expires_at=?", [_time.time() - 5])
        s._conn.commit()
        out = s.sweep_expired_active_sync()
        assert out["turns"] == 1
        row = s._conn.execute("SELECT status FROM turns").fetchone()
        assert row[0] == TurnStatus.SUSPENDED
        s.close()


class TestTtlSweep:
    def _age(self, store, key, *, progress_age_s):
        store._conn.execute(
            "UPDATE turns SET last_progress_at=? WHERE message_id=?",
            [time.time() - progress_age_s, key.message_id],
        )
        store._conn.commit()

    def test_resumable_expires_after_ttl(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {"p": 1})
        self._age(store, KEY, progress_age_s=25 * 3600)
        out = store.ttl_sweep_sync(resume_ttl_hours=24.0)
        assert out["expired_turns"] == 1
        (status,) = _row(store, cols="status")
        assert status == TurnStatus.TERMINAL_EXPIRED
        # Diagnostic payload retained until the 7d clock.
        (payload,) = _row(store, cols="payload")
        assert payload is not None

    def test_diagnostic_payload_compacts_after_seven_days(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {"p": 1})
        self._age(store, KEY, progress_age_s=8 * 86400)
        out = store.ttl_sweep_sync()
        assert out["expired_turns"] == 1
        assert out["compacted_payloads"] == 1
        (payload,) = _row(store, cols="payload")
        assert payload is None

    def test_ledger_expires_except_unknown(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0,
            [{"tool_call_id": "ok", "tool_name": "t", "tool_input": {}},
             {"tool_call_id": "mystery", "tool_name": "t", "tool_input": {}}],
        )
        store.settle_op_sync(lease, 0, "ok", state=OpState.APPLIED, result_text="r")
        store._conn.execute(
            "UPDATE operations SET state=? WHERE tool_call_id='mystery'",
            [OpState.OUTCOME_UNKNOWN],
        )
        store.finish_sync(lease, TurnStatus.TERMINAL_FAILED)
        self._age(store, KEY, progress_age_s=91 * 86400)
        store._conn.execute(
            "UPDATE operations SET updated_at=?", [time.time() - 91 * 86400]
        )
        store._conn.commit()
        out = store.ttl_sweep_sync()
        assert out["ledger_rows_deleted"] == 1
        remaining = store._conn.execute(
            "SELECT tool_call_id, state FROM operations"
        ).fetchall()
        # OUTCOME_UNKNOWN never expires automatically.
        assert remaining == [("mystery", OpState.OUTCOME_UNKNOWN)]


class TestBlobs:
    def test_roundtrip_and_content_addressing(self, store):
        ref1 = store.store_blob_sync(b"image-bytes")
        ref2 = store.store_blob_sync(b"image-bytes")
        assert ref1 == ref2
        assert ref1.startswith("blob:")
        assert store.load_blob_sync(ref1) == b"image-bytes"

    def test_missing_blob_raises_unavailable(self, store):
        from src.turn_state import TurnStateUnavailableError

        with pytest.raises(TurnStateUnavailableError):
            store.load_blob_sync("blob:" + "0" * 64)


def test_effect_fingerprint_is_deterministic_and_sensitive():
    a = effect_fingerprint("run_command", {"command": "ls", "host": "web"})
    b = effect_fingerprint("run_command", {"host": "web", "command": "ls"})
    c = effect_fingerprint("run_command", {"command": "rm", "host": "web"})
    assert a == b  # key order irrelevant
    assert a != c


class TestLedgerFencing:
    """Review blocker #1 (PR #242): operation transitions are single
    atomic statements fenced on generation + expected revision + lease
    token + ACTIVE status + live lease + legal prior op state."""

    def test_settled_op_cannot_reenter_running(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
        )
        store.mark_running_sync(lease, 0, "c1")
        store.settle_op_sync(lease, 0, "c1", state=OpState.APPLIED, result_text="ok")
        with pytest.raises(StaleTurnError):
            store.mark_running_sync(lease, 0, "c1")  # APPLIED→RUNNING illegal
        row = store._conn.execute(
            "SELECT state, result FROM operations WHERE tool_call_id='c1'"
        ).fetchone()
        assert row == (OpState.APPLIED, "ok")  # untouched

    def test_reinsert_never_resets_a_settled_op(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
        )
        store.settle_op_sync(lease, 0, "c1", state=OpState.APPLIED, result_text="ok")
        with pytest.raises(LedgerIntentError):
            store.record_intents_sync(
                lease, 0,
                [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}],
            )
        row = store._conn.execute(
            "SELECT state FROM operations WHERE tool_call_id='c1'"
        ).fetchone()
        assert row[0] == OpState.APPLIED  # never reset to PREPARED

    def test_stale_revision_owner_cannot_mutate_ledger(self, store):
        import dataclasses

        lease = _admit(store)
        store.record_intents_sync(
            lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
        )
        stale = dataclasses.replace(lease)
        store.checkpoint_sync(lease, {"n": 1}, progressed=True)  # revision advances
        with pytest.raises(StaleTurnError):
            store.mark_running_sync(stale, 0, "c1")  # stale revision fenced out
        # The current owner still can.
        store.mark_running_sync(lease, 0, "c1")

    def test_released_lease_cannot_record_intents(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {})
        with pytest.raises(StaleTurnError):
            store.record_intents_sync(
                lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
            )


class TestReleaseAcquired:
    def test_release_returns_to_suspended(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {"p": 1})
        acquired = store.acquire_resume_lease_sync(KEY, lease.generation)
        store.release_acquired_sync(acquired)
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.SUSPENDED
        # Resumable again — a later attempt can win it.
        assert store.acquire_resume_lease_sync(KEY, lease.generation) is not None

    def test_release_with_reason_is_terminal(self, store):
        lease = _admit(store)
        store.suspend_sync(lease, {"p": 1})
        acquired = store.acquire_resume_lease_sync(KEY, lease.generation)
        store.release_acquired_sync(acquired, terminal_reason="checkpoint corrupt")
        status, payload = store._conn.execute(
            "SELECT status, payload FROM turns"
        ).fetchone()
        assert status == TurnStatus.TERMINAL_REJECTED
        assert payload is None

    def test_release_is_fenced(self, store):
        import dataclasses

        lease = _admit(store)
        store.suspend_sync(lease, {"p": 1})
        acquired = store.acquire_resume_lease_sync(KEY, lease.generation)
        thief = dataclasses.replace(acquired)
        thief.token = "not-yours"
        store.release_acquired_sync(thief)  # fenced out — no-op
        (status,) = store._conn.execute("SELECT status FROM turns").fetchone()
        assert status == TurnStatus.ACTIVE


class TestStoragePermissions:
    def test_db_dir_and_blobs_are_owner_only(self, tmp_path):
        import os
        import stat

        s = TurnStateStore(tmp_path / "sec" / "turns.sqlite3",
                           blob_dir=tmp_path / "sec" / "blobs")
        ref = s.store_blob_sync(b"sensitive")
        db_mode = stat.S_IMODE(os.stat(s.db_path).st_mode)
        dir_mode = stat.S_IMODE(os.stat(tmp_path / "sec").st_mode)
        blob_dir_mode = stat.S_IMODE(os.stat(tmp_path / "sec" / "blobs").st_mode)
        blob_mode = stat.S_IMODE(
            os.stat(tmp_path / "sec" / "blobs" / ref.split(":", 1)[1]).st_mode
        )
        assert db_mode == 0o600
        assert dir_mode == 0o700
        assert blob_dir_mode == 0o700
        assert blob_mode == 0o600
        s.close()


class TestFullFenceOnTurnWrites:
    """Round-2 blocker #1 (PR #242): every turn write honors the complete
    live fence — an expired-lease owner can neither checkpoint (which used
    to silently RENEW the lease) nor settle."""

    def _expire(self, store):
        import time as _time

        store._conn.execute("UPDATE turns SET lease_expires_at=?", [_time.time() - 5])
        store._conn.commit()

    def test_expired_lease_checkpoint_is_rejected(self, store):
        lease = _admit(store)
        self._expire(store)
        with pytest.raises(StaleTurnError):
            store.checkpoint_sync(lease, {"continued": True}, progressed=True)
        # And crucially it did NOT renew the lease.
        (expires,) = store._conn.execute(
            "SELECT lease_expires_at FROM turns"
        ).fetchone()
        import time as _time

        assert expires < _time.time()

    def test_expired_lease_settle_is_rejected(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0, [{"tool_call_id": "c1", "tool_name": "t", "tool_input": {}}]
        )
        store.mark_running_sync(lease, 0, "c1")
        self._expire(store)
        with pytest.raises(StaleTurnError):
            store.settle_op_sync(lease, 0, "c1", state=OpState.APPLIED,
                                 result_text="ok")

    def test_heartbeat_extends_across_the_ttl(self, tmp_path):
        import time as _time

        s = TurnStateStore(tmp_path / "hb.sqlite3", blob_dir=tmp_path / "b",
                           lease_ttl=0.5)
        lease = _admit(s)
        _time.sleep(0.3)
        s.heartbeat_sync(lease)
        _time.sleep(0.3)  # past the original expiry, inside the beaten one
        s.checkpoint_sync(lease, {"alive": True}, progressed=True)  # no raise
        s.close()


class TestMarkOpsManual:
    def test_unknowns_move_to_manual(self, store):
        lease = _admit(store)
        store.record_intents_sync(
            lease, 0,
            [{"tool_call_id": "a", "tool_name": "t", "tool_input": {}},
             {"tool_call_id": "b", "tool_name": "t", "tool_input": {}}],
        )
        store.settle_op_sync(lease, 0, "a", state=OpState.APPLIED, result_text="r")
        store._conn.execute(
            "UPDATE operations SET state=? WHERE tool_call_id='b'",
            [OpState.OUTCOME_UNKNOWN],
        )
        store._conn.commit()
        moved = store.mark_ops_manual_sync(KEY, lease.generation)
        assert moved == 1
        states = dict(store._conn.execute(
            "SELECT tool_call_id, state FROM operations"
        ).fetchall())
        assert states["a"] == OpState.APPLIED  # settled rows untouched
        assert states["b"] == OpState.MANUAL_RESOLUTION_REQUIRED


class TestRevisionAbaClosed:
    def test_stale_copy_cannot_regress_the_revision(self, store):
        """Round-4 blocker #1 (PR #242): every revision value (expected
        WHERE, new SET, shared publish) derives from one read under the
        write lock — a stale actor can never pair a fresh WHERE with a
        stale SET and regress the row."""
        import dataclasses

        lease = _admit(store)
        stale = dataclasses.replace(lease)  # captured before the checkpoint
        store.checkpoint_sync(lease, {"n": 1}, progressed=True)  # rev 0 -> 1
        with pytest.raises(StaleTurnError):
            store.heartbeat_sync(stale)  # stale revision fenced out entirely
        (revision,) = store._conn.execute("SELECT revision FROM turns").fetchone()
        assert revision == 1  # never regressed
        assert lease.revision == 1
        # The live owner keeps working.
        store.heartbeat_sync(lease)
        store.checkpoint_sync(lease, {"n": 2}, progressed=True)
        (revision,) = store._conn.execute("SELECT revision FROM turns").fetchone()
        assert revision == 2
