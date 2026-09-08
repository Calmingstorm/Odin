"""Real backend safety fencing with inert portal, scope and dispatch primitives.

No native desktop input, compositor connection or destructive fault injection.
"""

import asyncio
import time

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import wayland_backend as backend
from tests.test_computer_wayland_backend_r8 import SCOPE, action
from tests.test_computer_wayland_backend_r8 import adapter as backend_fixture


@pytest.fixture
def adapter(monkeypatch):
    return backend_fixture.__wrapped__(monkeypatch)


def evidence(fault=None):
    result = {**SCOPE, "observed_monotonic_ns": time.monotonic_ns()}
    if fault == "stale":
        result["observed_monotonic_ns"] -= backend._SCOPE_LEASE_NS * 2
    elif fault == "future":
        result["observed_monotonic_ns"] += 10**9
    elif fault == "missing":
        del result["observed_monotonic_ns"]
    elif fault == "boolean":
        result["observed_monotonic_ns"] = True
    elif fault == "focus":
        result["focus_digest"] = "different"
    return result


@pytest.mark.parametrize("stage", [1, 2])
@pytest.mark.parametrize("fault", ["stale", "future", "missing", "boolean", "hung"])
async def test_scope_preflight_fails_without_dispatch(adapter, stage, fault):
    await adapter.start("fixture")
    frame = await adapter.observe()
    calls = 0
    cancelled = asyncio.Event()

    async def snapshot(metadata):
        nonlocal calls
        calls += 1
        if calls == stage:
            if fault == "hung":
                try:
                    await asyncio.Event().wait()
                finally:
                    cancelled.set()
            return evidence(fault)
        return evidence()

    adapter._scope_provider.snapshot = snapshot
    try:
        with pytest.raises(ComputerError, match="scope_evidence_(stale|expired)"):
            await asyncio.wait_for(adapter.act(action(frame)), 0.8)
        assert adapter._guardian.commands == []
        if fault == "hung":
            await asyncio.wait_for(cancelled.wait(), 0.2)
    finally:
        await adapter.stop()


@pytest.mark.parametrize("kind", ["type", "polyline"])
@pytest.mark.parametrize("fault", ["stale", "focus", "hung", "cancel_slow", "expired"])
async def test_scope_loss_interrupts_dispatch_before_full_action(adapter, kind, fault):
    await adapter.start("fixture")
    adapter._guardian.ready = {"timed_polyline": True}
    frame = await adapter.observe()
    request = (
        action(frame)
        if kind == "type"
        else action(frame, "polyline", points=[[10, 10], [20, 20]], duration=1)
    )
    calls = 0
    progress = []
    closed = asyncio.Event()
    cancelled = asyncio.Event()
    release_snapshot = asyncio.Event()
    close = adapter._guardian.close

    async def snapshot(metadata):
        nonlocal calls
        calls += 1
        if calls <= 2:
            return evidence()
        if fault in {"hung", "cancel_slow"}:
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancelled.set()
                if fault == "hung":
                    raise
                # A cancellation-resistant primitive cannot delay the input fence.
                await release_snapshot.wait()
                return evidence()
        if fault == "expired":
            # Simulate synchronous late delivery: even if the snapshot finishes,
            # evidence arriving beyond the lease must not renew it.
            time.sleep(0.26)
        return evidence(fault)

    async def dispatch(command, **kwargs):
        adapter._guardian.commands.append(command)
        # Inert stand-in for the native typing/stroke dispatch loop. Close is its
        # input fence. A full action would last one second without the watchdog.
        for step in range(100):
            if closed.is_set():
                return {"event": "closed"}
            progress.append(step)
            await asyncio.sleep(0.01)
        return {"event": "action_done"}

    async def fence():
        closed.set()
        return await close()

    adapter._scope_provider.snapshot = snapshot
    adapter._guardian.act = dispatch
    adapter._guardian.close = fence
    started = time.monotonic()
    try:
        with pytest.raises(ComputerError, match="action_revoked_outcome_unknown"):
            await asyncio.wait_for(adapter.act(request), 0.8)
        assert 0 < len(progress) < 100
        assert time.monotonic() - started < 0.7
        assert closed.is_set() and adapter._paused and adapter._frame is None
        assert not adapter._guardian.alive
        if fault in {"hung", "cancel_slow"}:
            await asyncio.wait_for(cancelled.wait(), 0.2)
        if fault == "cancel_slow":
            assert adapter._scope_jobs  # Already revoked despite unacknowledged cancellation.
            release_snapshot.set()
            await asyncio.gather(*tuple(adapter._scope_jobs), return_exceptions=True)
            assert adapter._paused and not adapter._guardian.alive
        with pytest.raises(ComputerError):
            await adapter.act(request)
        assert len(adapter._guardian.commands) == 1
    finally:
        release_snapshot.set()
        await adapter.stop()


async def test_fresh_scope_renews_lease_through_long_dispatch(adapter):
    await adapter.start("fixture")
    frame = await adapter.observe()
    calls = 0

    async def snapshot(metadata):
        nonlocal calls
        calls += 1
        return evidence()

    async def dispatch(command, **kwargs):
        adapter._guardian.commands.append(command)
        await asyncio.sleep(0.6)
        return {"event": "action_done"}

    adapter._scope_provider.snapshot = snapshot
    adapter._guardian.act = dispatch
    try:
        result = await adapter.act(action(frame))
        assert result["status"] == "executed"
        assert calls >= 6
        assert not adapter._paused and not adapter._jobs and not adapter._scope_jobs
    finally:
        await adapter.stop()


async def test_already_expired_lease_never_starts_snapshot(adapter):
    async def forbidden(metadata):
        pytest.fail("Expired scope authority must not initiate acquisition")

    await adapter.start("fixture")
    adapter._scope_provider.snapshot = forbidden
    try:
        with pytest.raises(ComputerError, match="scope_evidence_expired"):
            await adapter._action_scope({}, deadline_ns=time.monotonic_ns() - 1)
        assert not adapter._jobs and not adapter._scope_jobs
    finally:
        await adapter.stop()


@pytest.mark.parametrize("fault", ["generation", "provider", "late_error"])
async def test_refresh_failure_does_not_restore_authority(adapter, fault):
    await adapter.start("fixture")
    original_provider = adapter._scope_provider
    released = asyncio.Event()
    entered = asyncio.Event()

    async def snapshot(metadata):
        entered.set()
        if fault == "late_error":
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                await released.wait()
                raise RuntimeError("inert late provider error") from None
        adapter._generation += 1
        return evidence()

    adapter._scope_provider.snapshot = snapshot
    if fault == "provider":
        adapter._scope_provider = None
    try:
        await asyncio.wait_for(
            adapter._watch_action(
                {}, SCOPE, adapter._generation, [time.monotonic_ns() + backend._SCOPE_LEASE_NS]
            ),
            0.8,
        )
        assert adapter._paused and not adapter._guardian.alive
        if fault == "late_error":
            assert entered.is_set() and adapter._scope_jobs
            pending = tuple(adapter._scope_jobs)
            released.set()
            await asyncio.gather(*pending, return_exceptions=True)
            assert not adapter._scope_jobs
            assert adapter._paused
    finally:
        released.set()
        adapter._scope_provider = original_provider
        await adapter.stop()


async def test_pending_scope_cancellation_cannot_delay_native_cleanup(adapter):
    await adapter.start("fixture")
    frame = await adapter.observe()
    entered = asyncio.Event()
    released = asyncio.Event()

    async def snapshot(metadata):
        entered.set()
        while not released.is_set():
            try:
                await released.wait()
            except asyncio.CancelledError:
                pass  # Harmless stub deliberately delays acknowledging cancellation.
        return evidence()

    adapter._scope_provider.snapshot = snapshot
    dispatch = asyncio.create_task(adapter.act(action(frame)))
    try:
        await entered.wait()
        dispatch.cancel()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(dispatch, 0.5)
        assert adapter._scope_jobs
        # Cancel-slow evidence collection must not gate release of input authority.
        result = await asyncio.wait_for(adapter.stop(), 0.5)
        assert result["stopped"] and not adapter._guardian.alive
        assert not adapter._guardian.commands
    finally:
        released.set()
        await asyncio.gather(*tuple(adapter._scope_jobs), return_exceptions=True)
        await adapter.stop()
