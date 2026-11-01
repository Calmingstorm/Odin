"""Work accounting/lifetimes through fake backends and private temporary stores."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from threading import Barrier
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.models import ComputerError, LiveSession, RequestContext
from src.computer.policy import IDLE_TASK_SECONDS, MAX_ACTIONS, MAX_TASK_SECONDS
from src.computer.runtime.profile import MAX_RUNTIME_SECONDS, launch_argv
from src.computer.store import ComputerStore
from tests.test_computer_actions_r4 import persisted_receipt, setup
from tests.test_computer_gui_actions_r5 import changed
from tests.test_computer_sequences_r19 import click, plan, rig


@pytest.fixture
def stored(tmp_path):
    now = [1000.0]
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence", clock=lambda: now[0])
    ctx = RequestContext("owner", "channel", "turn", "host")
    grant = store.create_session(ctx, "fixture")
    grant = store.set_state(grant.session_id, "active")
    yield store, ctx, grant, now
    store.close()


def test_defaults_and_refused_reservations_cost_nothing(stored):
    store, _, grant, _ = stored
    assert (IDLE_TASK_SECONDS, MAX_TASK_SECONDS, MAX_ACTIONS) == (1800, 14400, 2000)
    assert grant.expires_at == grant.created_at + 1800
    # profile also imports standalone as runtime.profile in sandbox worker.py;
    # it cannot import the controller's package-level policy dependency tree.
    assert MAX_RUNTIME_SECONDS == MAX_TASK_SECONDS
    argv = launch_argv("fake-session", "drawing")
    assert "--property=RuntimeMaxSec=14400" in argv
    assert "--property=TimeoutStopSec=1" in argv
    store.begin_action(grant, "refused", "h", 0)
    store.finish_action(grant.session_id, "refused", {"status": "unavailable"})
    store.begin_sequence(grant, "plan", "h", [("a", "a"), ("b", "b")], 0)
    assert store.get_session(grant.session_id).actions == 0
    with pytest.raises(ComputerError, match="grant_revoked_or_limit"):
        store.charge_dispatch(grant, "a", 0)
    assert store.get_session(grant.session_id).actions == 0


def test_partial_dispatch_charge_and_refund_are_durable_and_never_replay(stored, tmp_path):
    store, _, grant, _ = stored
    store.begin_sequence(grant, "plan", "h", [("a", "a"), ("b", "b")], 2000)
    store.charge_dispatch(grant, "a", 2000)
    assert store.get_session(grant.session_id).actions == 1
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence", clock=store.clock)
    try:
        with pytest.raises(ComputerError, match="pending_no_replay"):
            reopened.charge_dispatch(grant, "a", 2000)
        assert reopened.get_session(grant.session_id).actions == 1
        proof = {"status": "unavailable", "injected": False, "released": True}
        assert reopened.refund_no_dispatch(grant.session_id, "a", proof)
        assert not reopened.refund_no_dispatch(grant.session_id, "a", proof)
        assert reopened.get_session(grant.session_id).actions == 0
        with pytest.raises(ComputerError, match="pending_no_replay"):
            reopened.charge_dispatch(grant, "a", 2000)
        final = reopened.finish_action(grant.session_id, "a", {"status": "unavailable"})
        assert "_dispatch_budget" not in final
        assert "_dispatch_budget" not in reopened.receipt(grant.session_id, "a", "a")
        with pytest.raises(ComputerError, match="pending_no_replay"):
            reopened.charge_dispatch(grant, "a", 2000)
        reopened.recover()
        assert reopened.get_session(grant.session_id).actions == 0
    finally:
        reopened.close()


def test_two_connections_cannot_charge_same_attempt_or_overrun_budget(stored, tmp_path):
    store, _, grant, _ = stored
    store.begin_action(grant, "a", "a", 1)
    store.begin_action(grant, "b", "b", 1)
    other = ComputerStore(tmp_path / "db", tmp_path / "evidence", clock=store.clock)
    barrier = Barrier(2)
    def attempt(connection, action_id):
        barrier.wait(timeout=5)
        try:
            connection.charge_dispatch(grant, action_id, 1)
            return "charged"
        except ComputerError as exc:
            return exc.code
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(attempt, connection, action_id)
                       for connection, action_id in [(store, "a"), (other, "b")]]
            outcomes = [future.result(timeout=10) for future in futures]
        assert sorted(outcomes) == ["charged", "grant_revoked_or_limit"]
        assert store.get_session(grant.session_id).actions == 1
    finally:
        other.close()


@pytest.mark.parametrize("raw", [None, {}, {"status": "unknown", "injected": False,
    "released": True}, {"status": "unavailable", "injected": False},
    {"status": "unavailable", "injected": False, "released": True, "sent": True},
    {"status": "unavailable", "injected": None, "released": True}])
def test_missing_partial_or_unknown_dispatch_proof_stays_charged(stored, raw):
    store, _, grant, _ = stored
    store.begin_action(grant, "a", "h", 1)
    store.charge_dispatch(grant, "a", 1)
    assert not store.refund_no_dispatch(grant.session_id, "a", raw)
    store.finish_action(grant.session_id, "a", {"status": "unknown"})
    assert store.get_session(grant.session_id).actions == 1


def test_idle_refresh_stops_at_absolute_lifetime_and_never_revives(stored):
    store, _, grant, now = stored
    original = grant
    for elapsed in range(1700, 14000, 1700):
        now[0] = original.created_at + elapsed
        grant = store.refresh_idle(grant)
        assert grant.expires_at == min(now[0] + 1800, original.created_at + 14400)
    assert grant.created_at == original.created_at
    now[0] = original.created_at + 14400
    with pytest.raises(ComputerError, match="task_expired"):
        store.refresh_idle(grant)
    assert store.get_session(grant.session_id) == grant


def test_only_current_owned_generation_refreshes_idle(stored):
    store, ctx, grant, now = stored
    c = ComputerController(store, lambda _: None, lambda _: True, enabled=True,
                           monotonic=lambda: now[0])
    # Establish fake authority after the controller's normal boot recovery sweep.
    grant = store.set_state(grant.session_id, "active")
    live = LiveSession(None, grant.expires_at,
                       absolute_deadline=grant.created_at + MAX_TASK_SECONDS)
    c._live[grant.session_id] = live
    now[0] += 1000
    inp = {"session_id": grant.session_id, "generation": grant.generation}
    for wrong in [replace(ctx, owner_id="other"), replace(ctx, channel_id="other"),
                  replace(ctx, turn_id="other"), replace(ctx, host_id="other")]:
        with pytest.raises(ComputerError, match="not_found"):
            c._grant(wrong, inp)
    with pytest.raises(ComputerError, match="stale_generation"):
        c._grant(ctx, {**inp, "generation": 0})
    c._grant(ctx, inp, generation=False)
    assert store.get_session(grant.session_id).expires_at == grant.expires_at
    renewed = c._grant(ctx, inp)
    assert renewed.expires_at == now[0] + IDLE_TASK_SECONDS == live.deadline
    # A stale snapshot in internal captures uses current durable expiry.
    now[0] = grant.expires_at + 1
    assert c._active(grant) is live
    paused = store.set_state(grant.session_id, "paused", revoke=True)
    next_turn = replace(ctx, turn_id="next")
    c._grant(next_turn, {**inp, "generation": paused.generation}, same_turn=False)
    now[0] = live.deadline
    with pytest.raises(ComputerError, match="task_expired"):
        c._grant(next_turn, {**inp, "generation": paused.generation}, same_turn=False)


async def test_single_native_refusal_is_refunded_and_duplicate_cannot_dispatch(tmp_path):
    async with setup(tmp_path) as (c, b, ctx, inp):
        async def refuse(payload):
            assert c.store.get_session(inp["session_id"]).actions == 1
            return {"status": "unavailable", "injected": False, "released": True}
        b.hook = refuse
        result = await c.act(ctx, inp)
        assert result["execution"]["injected"] is False
        assert c.store.get_session(inp["session_id"]).actions == 0
        assert persisted_receipt(result) == await c.act(ctx, inp)
        assert len(b.calls) == 1


async def test_zero_dispatch_and_partial_prefix_only_cost_dispatched(tmp_path, monkeypatch):
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        async def first(payload):
            assert c.store.get_session(binding["session_id"]).actions == 1
            result = changed(payload)
            result["sampled_target_changed"] = True
            return result
        b.hook = first
        request = plan(binding, click("a"), click("b"), click("c"))
        result = await c.act(ctx, request)
        assert len(b.calls) == 1
        assert c.store.get_session(binding["session_id"]).actions == 1
        injected = [r["execution"]["injected"] for r in result["verification"]["steps"]]
        assert injected == [True, False, False]
        await c.act(ctx, request)
        assert c.store.get_session(binding["session_id"]).actions == 1
    # A native rejection of the first step proves zero input and refunds it.
    other = tmp_path / "other"
    other.mkdir(mode=0o700)
    async with rig(other, monkeypatch) as (c, b, ctx, binding, state):
        b.hook = AsyncMock(return_value={"status": "unavailable", "injected": False,
                                       "released": True})
        result = await c.act(ctx, plan(binding, click("a"), click("b")))
        assert len(b.calls) == 1
        assert c.store.get_session(binding["session_id"]).actions == 0
        assert result["execution"]["completed_steps"] == 0


async def test_budget_exhaustion_stops_before_undispatched_suffix(tmp_path, monkeypatch):
    monkeypatch.setattr("src.computer.sequences.MAX_ACTIONS", 1)
    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        b.hook = AsyncMock(side_effect=changed)
        result = await c.act(ctx, plan(binding, click("a"), click("b")))
        assert len(b.calls) == 1
        assert c.store.get_session(binding["session_id"]).actions == 1
        assert result["reason"] == "grant_revoked_or_limit"
        assert result["verification"]["steps"][1]["execution"]["injected"] is False


async def test_renewed_watchdog_recomputes_idle_without_actions_lock(stored, monkeypatch):
    store, ctx, grant, now = stored
    c = ComputerController(store, lambda _: None, lambda _: True, enabled=True,
                           monotonic=lambda: now[0])
    grant = store.set_state(grant.session_id, "active")
    live = LiveSession(None, grant.expires_at,
                       absolute_deadline=grant.created_at + MAX_TASK_SECONDS)
    c._live[grant.session_id] = live
    sleeps = []
    async def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 1:
            now[0] += 1000
            c._grant(ctx, {"session_id": grant.session_id, "generation": grant.generation})
            now[0] += 800
        else:
            now[0] += seconds
    monkeypatch.setattr("src.computer.controller.asyncio.sleep", sleep)
    c._stop = AsyncMock()
    async with c._actions:
        await c._deadline(grant.session_id, IDLE_TASK_SECONDS)
    assert sleeps == [1800, 1000]
    c._stop.assert_awaited_once_with(grant.session_id, "cancelled")
