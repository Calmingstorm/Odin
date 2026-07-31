"""Pins for the durability lease heartbeat (round-2 blocker #1, PR #242).

The PRODUCTION beat loop is exercised directly: it keeps a long-lived
lease alive, exits cleanly when the lease is stolen (StaleTurnError) or
the store dies (TurnStateUnavailableError), and always stops on terminal
settlement.
"""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest

import src.turn_state.durability as dur
from src.turn_state import TurnKey, TurnStateStore
from src.turn_state.durability import TurnDurability


@pytest.fixture(autouse=True)
def _fast_beats(monkeypatch):
    monkeypatch.setattr(dur, "_HEARTBEAT_FLOOR_SECONDS", 0.05)


def make_store(tmp_path, ttl=0.4):
    return TurnStateStore(
        tmp_path / "hb" / "turns.sqlite3", blob_dir=tmp_path / "hb" / "b",
        lease_ttl=ttl,
    )


def FakeMsg():  # noqa: N802 — message-shaped factory
    return SimpleNamespace(
        channel=SimpleNamespace(id="c1"),
        author=SimpleNamespace(id="u1"),
        id="m1",
        guild=None,
        content="hello",
    )


async def admit(store):
    handle = await TurnDurability.admit(
        store, message=FakeMsg(), system_prompt="s", tools=[], session_snapshot=None
    )
    assert handle.enabled
    return handle


async def test_beats_keep_the_lease_alive_past_the_ttl(tmp_path):
    store = make_store(tmp_path, ttl=0.3)
    handle = await admit(store)

    def expiry() -> float:
        (value,) = store._conn.execute(
            "SELECT lease_expires_at FROM turns"
        ).fetchone()
        return float(value)

    # Observe RENEWALS rather than sampling liveness at one instant: under
    # coverage instrumentation a beat can land late, and an instantaneous
    # "expires > now" check then fails for a lease that is being renewed
    # perfectly well. The contract is that beats keep pushing the deadline
    # out past the original TTL.
    original = expiry()  # the deadline the turn would die on unaided
    renewals = 0
    renewed_past_original = False
    last = original
    deadline = time.monotonic() + 10.0
    while time.monotonic() < deadline:
        await asyncio.sleep(0.05)
        current = expiry()
        if current > last:
            renewals += 1
            last = current
            if time.time() > original:
                # A renewal recorded AFTER the original deadline had
                # already passed: the lease outlived it because beats
                # kept pushing it out.
                renewed_past_original = True
        if renewals >= 2 and renewed_past_original:
            break
    assert renewals >= 2, "heartbeat never renewed the lease twice"
    assert renewed_past_original, "lease was never renewed past its first deadline"

    await handle.settle_terminal(cancelled=False, is_error=False)
    assert handle._heartbeat_task is None  # stopped on settlement
    store.close()


async def test_beat_exits_when_the_lease_is_stolen(tmp_path):
    store = make_store(tmp_path, ttl=0.3)
    handle = await admit(store)
    task = handle._heartbeat_task
    assert task is not None
    store._conn.execute("UPDATE turns SET lease_token='stolen'")
    store._conn.commit()
    await asyncio.wait_for(task, timeout=5)  # StaleTurnError branch → clean exit
    handle._stop_heartbeats()
    store.close()


async def test_beat_exits_when_the_store_dies(tmp_path):
    store = make_store(tmp_path, ttl=0.3)
    handle = await admit(store)
    task = handle._heartbeat_task
    assert task is not None
    store._conn.close()  # TurnStateUnavailableError branch
    await asyncio.wait_for(task, timeout=5)
    handle._stop_heartbeats()


async def test_mark_ops_manual_swallows_store_death(tmp_path):
    store = make_store(tmp_path)
    await admit(store)
    store._conn.close()
    assert store.mark_ops_manual_sync(TurnKey("discord", "c1", "m1"), "g") == 0


async def test_concurrent_checkpoints_and_heartbeats_never_false_stale(tmp_path):
    """Round-3 deviation #1 (PR #242): the in-memory revision advances under
    the same lock as the DB mutation, so a heartbeat interleaved with
    checkpoints can never read a stale revision and falsely lose the lease."""
    import json

    store = make_store(tmp_path, ttl=30.0)
    handle = await admit(store)
    handle._stop_heartbeats()  # drive beats manually, interleaved
    lease = handle.lease

    async def checkpoints():
        for i in range(40):
            await asyncio.to_thread(
                store.checkpoint_sync, lease, {"n": i}, progressed=False
            )

    async def heartbeats():
        for _ in range(40):
            await asyncio.to_thread(store.heartbeat_sync, lease)

    await asyncio.gather(checkpoints(), heartbeats())  # no StaleTurnError
    (payload,) = store._conn.execute("SELECT payload FROM turns").fetchone()
    assert json.loads(payload)["n"] == 39
    store.close()


async def test_wired_store_that_died_refuses_admission(tmp_path):
    """Round-3 deviation #2 (PR #242): a store that WAS wired available but
    has since died must refuse execution, not run legacy."""
    store = make_store(tmp_path)
    store.close()  # available -> False after successful wiring
    handle = await TurnDurability.admit(
        store, message=FakeMsg(), system_prompt="s", tools=[], session_snapshot=None
    )
    assert handle.enabled is False
    assert handle.blocked == "admission_error"
