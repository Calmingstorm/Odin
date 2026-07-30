"""Pins for the durability lease heartbeat (round-2 blocker #1, PR #242).

The PRODUCTION beat loop is exercised directly: it keeps a long-lived
lease alive, exits cleanly when the lease is stolen (StaleTurnError) or
the store dies (TurnStateUnavailableError), and always stops on terminal
settlement.
"""

from __future__ import annotations

import asyncio
import time

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


from types import SimpleNamespace


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
    await asyncio.sleep(0.8)  # ~2.5x TTL, several real beats
    (expires,) = store._conn.execute(
        "SELECT lease_expires_at FROM turns"
    ).fetchone()
    assert expires > time.time()  # still alive
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
