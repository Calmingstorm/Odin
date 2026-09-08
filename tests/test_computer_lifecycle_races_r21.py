"""Gated controller transitions cannot resurrect or strand native authority."""

import asyncio
from dataclasses import replace

import pytest

from src.computer.controller import ComputerController
from src.computer.geometry import AffineTransform
from src.computer.models import BackendObservation, CaptureScope, ComputerError, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub, png


class Backend(Stub):
    async def pause(self):
        return {"released": True}

    async def resume(self, *, consent_generation):
        self.source = replace(self.source, consent_generation=consent_generation)

    async def observe(self):
        return BackendObservation(
            self.source,
            CaptureScope(
                self.source.consent_generation, frozenset({"opaque"}), frozenset({"opaque"})
            ),
            2,
            2,
            AffineTransform(),
            png(),
            True,
        )


@pytest.fixture
def setup(tmp_path):
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    backend = Backend()
    context = RequestContext("owner", "channel", "turn", "host")
    controller = ComputerController(store, lambda app: backend, lambda ctx: True, enabled=True)
    yield store, backend, controller, context
    store.close()


@pytest.mark.asyncio
async def test_start_rechecks_generation_after_async_authorization(setup):
    store, backend, controller, context = setup
    entered, release = asyncio.Event(), asyncio.Event()
    calls = 0

    async def authorize(ctx):
        nonlocal calls
        calls += 1
        if calls == 2:
            entered.set()
            await release.wait()
        return True

    controller.authorize = authorize
    task = asyncio.create_task(
        controller.session(context, {"operation": "start", "app": "fixture"})
    )
    try:
        await asyncio.wait_for(entered.wait(), 2)
        stopped = await controller.session(context, {"operation": "stop"})
        assert stopped["state"] == "cancelled"
        release.set()
        with pytest.raises(ComputerError):
            await task
        assert store.find_session(context).state == "cancelled"
        assert not controller._live
        assert not controller._watchdogs
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
        await controller.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["denied", "cancelled", "capture"])
async def test_resume_failure_after_native_resume_stops_backend(setup, failure):
    store, backend, controller, context = setup
    try:
        await controller.session(context, {"operation": "start", "app": "fixture"})
        paused = await controller.session(context, {"operation": "pause"})
        calls = 0

        async def authorize(ctx):
            nonlocal calls
            calls += 1
            if calls == 2:
                if failure == "cancelled":
                    raise asyncio.CancelledError
                if failure == "denied":
                    return False
            return True

        async def broken_capture():
            raise OSError("capture failed")

        controller.authorize = authorize
        if failure == "capture":
            backend.observe = broken_capture
        with pytest.raises((ComputerError, asyncio.CancelledError, OSError)):
            await controller.session(
                context, {"operation": "resume", "generation": paused["generation"]}
            )
        assert backend.stopped
        assert not controller._live
        assert store.find_session(context).state == "cancelled"
    finally:
        await controller.close()


@pytest.mark.asyncio
async def test_pause_response_reflects_concurrent_stop(setup):
    store, backend, controller, context = setup
    entered, release = asyncio.Event(), asyncio.Event()

    async def pause():
        entered.set()
        await release.wait()
        return {"released": True}

    backend.pause = pause
    await controller.session(context, {"operation": "start", "app": "fixture"})
    task = asyncio.create_task(controller.session(context, {"operation": "pause"}))
    try:
        await asyncio.wait_for(entered.wait(), 2)
        stopped = await controller.session(context, {"operation": "stop"})
        release.set()
        result = await task
        assert result["state"] == stopped["state"] == "cancelled"
        assert result["generation"] == stopped["generation"]
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
        await controller.close()
