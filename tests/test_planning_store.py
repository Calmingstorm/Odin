"""Coverage for src/planning/store.py (RFC-006 P18, safe).

Real PlanStore against a tmp JSON path — create/get_pending/list_pending, the
mark_* state transitions, expiry pruning, persistence round-trips, the
corrupt-file load guard, and the ExecutionPlan dataclass helpers. SAFE: pure
dataclass logic + tmp-file I/O only; no network, no execution.
"""
from __future__ import annotations

import pytest

from src.planning.store import ExecutionPlan, PlanStore


@pytest.fixture
def store(tmp_path):
    return PlanStore(persist_path=str(tmp_path / "plans.json"))


def _mk(store, **kw):
    params = dict(user_id="u1", channel_id="c1", original_request="do X", summary="X")
    params.update(kw)
    return store.create(**params)


class TestCreateAndQuery:
    def test_create_and_get_pending(self, store):
        p = _mk(store)
        got = store.get_pending("u1", "c1")
        assert got is not None and got.plan_id == p.plan_id
        assert store.get_pending("u2", "c1") is None  # different user → none

    def test_most_recent_pending_wins(self, store):
        p1 = _mk(store)
        p2 = _mk(store)
        store._plans[p2.plan_id].created_at = store._plans[p1.plan_id].created_at + 100
        assert store.get_pending("u1", "c1").plan_id == p2.plan_id

    def test_list_pending_filters(self, store):
        _mk(store, user_id="u1", channel_id="c1")
        _mk(store, user_id="u1", channel_id="c2")
        _mk(store, user_id="u2", channel_id="c1")
        assert len(store.list_pending()) == 3
        assert len(store.list_pending(user_id="u1")) == 2
        assert len(store.list_pending(channel_id="c1")) == 2
        assert len(store.list_pending(user_id="u1", channel_id="c1")) == 1


class TestStateTransitions:
    def test_mark_executing_completed_cancelled(self, store):
        p = _mk(store)
        assert store.mark_executing(p.plan_id) is True
        assert store.mark_executing(p.plan_id) is False   # no longer pending
        store.mark_completed(p.plan_id)
        assert store._plans[p.plan_id].status == "completed"
        p2 = _mk(store, channel_id="c2")
        store.mark_cancelled(p2.plan_id)
        assert store._plans[p2.plan_id].status == "cancelled"

    def test_mark_missing_plan_is_noop(self, store):
        assert store.mark_executing("nope") is False
        store.mark_completed("nope")   # no raise
        store.mark_cancelled("nope")   # no raise

    def test_expired_is_pruned(self, store):
        p = _mk(store, expiry_seconds=1)
        store._plans[p.plan_id].expires_at = 1.0   # far in the past
        assert store.get_pending("u1", "c1") is None
        assert store._plans[p.plan_id].status == "expired"
        assert store.list_pending() == []


class TestPersistence:
    def test_roundtrip(self, tmp_path):
        path = str(tmp_path / "plans.json")
        s1 = PlanStore(persist_path=path)
        s1.create(user_id="u1", channel_id="c1", original_request="remember this", summary="X")
        s2 = PlanStore(persist_path=path)   # reads from disk
        got = s2.get_pending("u1", "c1")
        assert got is not None and got.original_request == "remember this"

    def test_corrupt_file_tolerated(self, tmp_path):
        path = tmp_path / "plans.json"
        path.write_text("{ not valid json")
        s = PlanStore(persist_path=str(path))   # warning caught, starts empty
        assert s.list_pending() == []


class TestExecutionPlan:
    def test_is_expired_and_dict_roundtrip(self):
        p = ExecutionPlan(plan_id="p", user_id="u", channel_id="c",
                          original_request="r", summary="s", expires_at=1.0)
        assert p.is_expired() is True
        d = p.to_dict()
        assert d["plan_id"] == "p"
        # from_dict filters unknown keys
        restored = ExecutionPlan.from_dict({**d, "bogus_field": 123})
        assert restored.plan_id == "p" and not hasattr(restored, "bogus_field")
