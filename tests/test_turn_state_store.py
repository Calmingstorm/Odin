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
        assert out["expired_turn_keys"] == [(KEY.source, KEY.channel_id, KEY.message_id)]
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
    def test_turn_status_distinguishes_active_terminal_and_absent(self, store):
        lease = _admit(store)
        assert store.turn_status_sync(KEY) == TurnStatus.ACTIVE
        store.finish_sync(lease, TurnStatus.TERMINAL_COMPLETED)
        assert store.turn_status_sync(KEY) == TurnStatus.TERMINAL_COMPLETED
        assert store.turn_status_sync(TurnKey("discord", "other", "missing")) is None

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


class TestMonotonicLeaseExpiry:
    def test_delayed_smaller_renewal_never_regresses_expiry(self, tmp_path):
        """Round-5 blocker #3 (PR #242): renewals are monotonic in SQL —
        a delayed same-owner renewal carrying an EARLIER expiry (both pass
        the fence: same generation/token/revision lineage) must never move
        the expiry backward and expose the turn to a false expiry sweep."""
        s = TurnStateStore(tmp_path / "mono.sqlite3", blob_dir=tmp_path / "b",
                           lease_ttl=100.0)
        lease = _admit(s)
        s.heartbeat_sync(lease)  # newer renewal: now + 100
        (newer,) = s._conn.execute("SELECT lease_expires_at FROM turns").fetchone()
        # The delayed renewal computed from a smaller ttl models an earlier
        # time.time() capture committing late.
        s.lease_ttl = 1.0
        s.heartbeat_sync(lease)
        (after,) = s._conn.execute("SELECT lease_expires_at FROM turns").fetchone()
        assert after >= newer  # never regressed
        # The same monotonicity holds through the checkpoint renewal path.
        s.checkpoint_sync(lease, {"n": 1}, progressed=True)
        (after_ckpt,) = s._conn.execute(
            "SELECT lease_expires_at FROM turns"
        ).fetchone()
        assert after_ckpt >= newer
        # And a false expiry sweep cannot touch the still-live owner.
        assert s.sweep_expired_active_sync() == {"turns": 0, "ops": 0}
        s.close()

class TestCheckpointPayloadIntegrity:
    def test_payload_and_digest_advance_atomically_under_the_fence(self, store):
        import hashlib

        lease = _admit(store)
        store.checkpoint_sync(lease, {"iteration": 1}, progressed=True)
        payload, digest = _row(store, cols="payload, payload_digest")
        assert digest == hashlib.sha256(payload.encode()).hexdigest()

        store.suspend_sync(lease, {"iteration": 2})
        payload, digest = _row(store, cols="payload, payload_digest")
        assert digest == hashlib.sha256(payload.encode()).hexdigest()

    def test_pre_integrity_schema_migrates_existing_payload(self, tmp_path):
        import hashlib
        import sqlite3

        db_dir = tmp_path / "legacy"
        db_dir.mkdir()
        db_path = db_dir / "turns.sqlite3"
        conn = sqlite3.connect(db_path)
        legacy_ddl = _legacy_turns_ddl_without_payload_digest()
        conn.executescript(legacy_ddl)
        payload = '{"fields": {"hedging_retried": true}}'
        conn.execute(
            "INSERT INTO turns (source, channel_id, message_id, turn_generation, "
            "revision, status, last_progress_at, created_at, schema_version, payload) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            ["discord", "c", "m", "g", 0, TurnStatus.SUSPENDED, 1.0, 1.0, 1,
             payload],
        )
        conn.commit()
        conn.close()

        migrated = TurnStateStore(db_path, blob_dir=db_dir / "blobs")
        try:
            columns = {
                row[1]
                for row in migrated._conn.execute("PRAGMA table_info(turns)")
            }
            assert "payload_digest" in columns
            stored_payload, digest = migrated._conn.execute(
                "SELECT payload, payload_digest FROM turns"
            ).fetchone()
            assert stored_payload == payload
            assert digest == hashlib.sha256(payload.encode()).hexdigest()
        finally:
            migrated.close()


def _legacy_turns_ddl_without_payload_digest() -> str:
    """Minimal pre-round-6 schema used to pin the additive migration."""
    return """
    CREATE TABLE turns (
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
    CREATE TABLE operations (
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
    """


class TestEffectClassification:
    def test_interrupted_observation_is_definitely_failed(self, store):
        from src.tools.effect_classifier import ToolEffectClass

        lease = _admit(store)
        store.record_intents_sync(
            lease,
            0,
            [{
                "tool_call_id": "wait",
                "tool_name": "wait_for_agents",
                "tool_input": {"agent_ids": ["a"]},
                "effect_class": ToolEffectClass.EFFECT_FREE_OBSERVATION,
            }],
        )
        store.mark_running_sync(lease, 0, "wait")
        store.settle_interrupted_sync(lease, 0, "wait", result_text="outer timeout")
        assert store._conn.execute(
            "SELECT effect_class, state FROM operations"
        ).fetchone() == (
            ToolEffectClass.EFFECT_FREE_OBSERVATION,
            OpState.DEFINITELY_FAILED,
        )

    def test_unknown_effect_class_fails_closed(self, store):
        from src.tools.effect_classifier import ToolEffectClass

        lease = _admit(store)
        store.record_intents_sync(
            lease,
            0,
            [{
                "tool_call_id": "unknown",
                "tool_name": "future_dynamic_tool",
                "tool_input": {},
                "effect_class": "NOT_A_REAL_CLASS",
            }],
        )
        store.mark_running_sync(lease, 0, "unknown")
        store.settle_interrupted_sync(lease, 0, "unknown", result_text="outer timeout")
        assert store._conn.execute(
            "SELECT effect_class, state FROM operations"
        ).fetchone() == (
            ToolEffectClass.EXTERNAL_EFFECT_CAPABLE,
            OpState.OUTCOME_UNKNOWN,
        )

    def test_sweep_is_effect_aware(self, tmp_path):
        from src.tools.effect_classifier import ToolEffectClass

        db = tmp_path / "effect-sweep.sqlite3"
        s = TurnStateStore(db, blob_dir=tmp_path / "effect-blobs")
        lease = _admit(s)
        s.record_intents_sync(
            lease,
            0,
            [
                {
                    "tool_call_id": "wait",
                    "tool_name": "wait_for_agents",
                    "tool_input": {},
                    "effect_class": ToolEffectClass.EFFECT_FREE_OBSERVATION,
                },
                {
                    "tool_call_id": "command",
                    "tool_name": "run_command",
                    "tool_input": {},
                    "effect_class": ToolEffectClass.EXTERNAL_EFFECT_CAPABLE,
                },
            ],
        )
        s.mark_running_sync(lease, 0, "wait")
        s.mark_running_sync(lease, 0, "command")
        s.close()

        reopened = TurnStateStore(db, blob_dir=tmp_path / "effect-blobs")
        try:
            assert dict(reopened._conn.execute(
                "SELECT tool_call_id, state FROM operations"
            ).fetchall()) == {
                "wait": OpState.DEFINITELY_FAILED,
                "command": OpState.OUTCOME_UNKNOWN,
            }
        finally:
            reopened.close()

    def test_manual_promotion_leaves_effect_free_unknown_alone(self, store):
        from src.tools.effect_classifier import ToolEffectClass

        lease = _admit(store)
        store.record_intents_sync(
            lease,
            0,
            [
                {
                    "tool_call_id": "wait",
                    "tool_name": "wait_for_agents",
                    "tool_input": {},
                    "effect_class": ToolEffectClass.EFFECT_FREE_OBSERVATION,
                },
                {
                    "tool_call_id": "command",
                    "tool_name": "run_command",
                    "tool_input": {},
                    "effect_class": ToolEffectClass.EXTERNAL_EFFECT_CAPABLE,
                },
            ],
        )
        store._conn.execute("UPDATE operations SET state=?", [OpState.OUTCOME_UNKNOWN])
        store._conn.commit()
        assert store.mark_ops_manual_sync(KEY, lease.generation) == 1
        assert dict(store._conn.execute(
            "SELECT tool_call_id, state FROM operations"
        ).fetchall()) == {
            "wait": OpState.OUTCOME_UNKNOWN,
            "command": OpState.MANUAL_RESOLUTION_REQUIRED,
        }

    def test_legacy_reconciliation_is_exact_idempotent_and_non_destructive(self, tmp_path):
        import sqlite3

        from src.tools.effect_classifier import ToolEffectClass

        db_dir = tmp_path / "legacy-effects"
        db_dir.mkdir()
        db = db_dir / "turns.sqlite3"
        conn = sqlite3.connect(db)
        conn.executescript(_legacy_turns_ddl_without_payload_digest())
        for call_id, tool_name, state in (
            ("wait-unknown", "wait_for_agents", OpState.OUTCOME_UNKNOWN),
            ("wait-applied", "wait_for_agents", OpState.APPLIED),
            ("command-unknown", "run_command", OpState.OUTCOME_UNKNOWN),
            ("dynamic-unknown", "future_tool", OpState.OUTCOME_UNKNOWN),
        ):
            conn.execute(
                "INSERT INTO operations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                ["discord", "c", "m", "g", 0, call_id, state, tool_name,
                 1, "fp", None, 1.0, 1.0],
            )
        conn.commit()
        conn.close()

        first = TurnStateStore(db, blob_dir=db_dir / "blobs")
        try:
            assert first.legacy_effect_free_reconciled == 1
            rows = {
                row[0]: row[1:]
                for row in first._conn.execute(
                    "SELECT tool_call_id, tool_name, effect_class, state "
                    "FROM operations"
                )
            }
            assert rows["wait-unknown"] == (
                "wait_for_agents",
                ToolEffectClass.EFFECT_FREE_OBSERVATION,
                OpState.RECONCILED_NOT_APPLIED,
            )
            assert rows["wait-applied"] == (
                "wait_for_agents",
                ToolEffectClass.EFFECT_FREE_OBSERVATION,
                OpState.APPLIED,
            )
            assert rows["command-unknown"] == (
                "run_command",
                ToolEffectClass.EXTERNAL_EFFECT_CAPABLE,
                OpState.OUTCOME_UNKNOWN,
            )
            assert rows["dynamic-unknown"] == (
                "future_tool",
                ToolEffectClass.EXTERNAL_EFFECT_CAPABLE,
                OpState.OUTCOME_UNKNOWN,
            )
            assert first._conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0] == 4
        finally:
            first.close()

        second = TurnStateStore(db, blob_dir=db_dir / "blobs")
        try:
            assert second.legacy_effect_free_reconciled == 0
            assert second._conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0] == 4
        finally:
            second.close()


def test_migrated_store_can_record_new_intent_with_physical_column_order(tmp_path):
    """ALTER TABLE appends effect_class; inserts must name logical columns."""
    import sqlite3

    from src.tools.effect_classifier import ToolEffectClass

    db_dir = tmp_path / "legacy-new-write"
    db_dir.mkdir()
    db = db_dir / "turns.sqlite3"
    conn = sqlite3.connect(db)
    conn.executescript(_legacy_turns_ddl_without_payload_digest())
    conn.close()

    migrated = TurnStateStore(db, blob_dir=db_dir / "blobs")
    try:
        lease = _admit(
            migrated,
            TurnKey(source="discord", channel_id="new-c", message_id="new-m"),
        )
        migrated.record_intents_sync(
            lease,
            7,
            [{
                "tool_call_id": "new-call",
                "tool_name": "wait_for_agents",
                "tool_input": {"agent_ids": ["a"]},
                "effect_class": ToolEffectClass.EFFECT_FREE_OBSERVATION,
            }],
            iteration=9,
        )
        row = migrated._conn.execute(
            "SELECT source, channel_id, message_id, turn_generation, "
            "generation_seq, tool_call_id, state, tool_name, effect_class, "
            "iteration, result, created_at, updated_at FROM operations"
        ).fetchone()
        assert row[:10] == (
            "discord", "new-c", "new-m", lease.generation, 7, "new-call",
            OpState.PREPARED, "wait_for_agents",
            ToolEffectClass.EFFECT_FREE_OBSERVATION, 9,
        )
        assert row[10] is None
        assert row[11] > 0 and row[12] > 0
    finally:
        migrated.close()


def test_empty_effect_free_classifier_migration_is_noop(monkeypatch, tmp_path):
    import sqlite3

    import src.turn_state.store as store_module

    db_dir = tmp_path / "empty-effect-classifier"
    db_dir.mkdir()
    db = db_dir / "turns.sqlite3"
    conn = sqlite3.connect(db)
    conn.executescript(_legacy_turns_ddl_without_payload_digest())
    conn.execute(
        "INSERT INTO operations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ["discord", "c", "m", "g", 0, "call", OpState.OUTCOME_UNKNOWN,
         "wait_for_agents", 1, "fp", None, 1.0, 1.0],
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr(store_module, "effect_free_observation_tools", frozenset)

    migrated = TurnStateStore(db, blob_dir=db_dir / "blobs")
    try:
        assert migrated.legacy_effect_free_reconciled == 0
        assert migrated._conn.execute(
            "SELECT state FROM operations"
        ).fetchone()[0] == OpState.OUTCOME_UNKNOWN
    finally:
        migrated.close()


def test_effect_aware_uncertain_settle_rejects_missing_and_tolerates_race(store):
    lease = _admit(store)
    with pytest.raises(StaleTurnError):
        store.settle_op_sync(
            lease, 0, "missing", state=OpState.OUTCOME_UNKNOWN,
            result_text="interrupted",
        )
    store.settle_interrupted_sync(lease, 0, "missing", result_text="interrupted")


def test_effect_aware_uncertain_settle_wraps_sqlite_error(store, monkeypatch):
    from src.turn_state import TurnStateUnavailableError

    lease = _admit(store)
    store.record_intents_sync(
        lease, 0, [{"tool_call_id": "c", "tool_name": "run_command", "tool_input": {}}]
    )
    store.mark_running_sync(lease, 0, "c")
    monkeypatch.setattr(store, "_op_where", lambda _lease: ("missing_column=?", ["x"]))
    with pytest.raises(TurnStateUnavailableError, match="ledger write failed"):
        store.settle_interrupted_sync(lease, 0, "c", result_text="interrupted")


def test_closed_store_fail_closed_and_sweeps_noop(store):
    from src.turn_state import TurnStateUnavailableError

    store.close()
    assert store.available is False
    with pytest.raises(TurnStateUnavailableError, match="not available"):
        store._require()
    assert store.sweep_expired_active_sync() == {}
    assert store.ttl_sweep_sync() == {}


def test_blob_load_missing_and_digest_mismatch_fail_closed(store):
    from src.turn_state import TurnStateUnavailableError

    with pytest.raises(TurnStateUnavailableError, match="blob read failed"):
        store.load_blob_sync("blob:" + "a" * 64)

    claimed = "b" * 64
    (store._blob_dir / claimed).write_bytes(b"different bytes")
    with pytest.raises(TurnStateUnavailableError, match="blob digest mismatch"):
        store.load_blob_sync("blob:" + claimed)
