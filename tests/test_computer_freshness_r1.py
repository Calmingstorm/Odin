"""Capture delay cannot turn old pixels into apparently fresh observations."""

from dataclasses import replace

import pytest

from src.computer.controller import ComputerController
from src.computer.models import CaptureScope, ComputerError, RequestContext
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub


class Clock:
    value = 100.0

    def __call__(self):
        return self.value


class Delayed(Stub):
    delay = 0.0

    def __init__(self, clock):
        super().__init__()
        self.clock = clock

    async def observe(self):
        result = await super().observe()
        self.clock.value += self.delay
        return result


async def test_capture_uses_request_lower_bound_and_refuses_old_verification(tmp_path):
    clock = Clock()
    backend = Delayed(clock)
    controller = ComputerController(ComputerStore(tmp_path / "db", tmp_path / "evidence"),
                                    lambda _: backend, lambda _: True,
                                    enabled=True, monotonic=clock)
    ctx = RequestContext("owner", "channel", "turn", "host")
    try:
        grant = await controller.session(ctx, {"operation": "start", "app": "fixture"})
        backend.delay = 4.9
        clock.value = 104.9
        observation = await controller.observe(ctx, {
            "session_id": grant["session_id"], "generation": grant["generation"]})
        assert observation["captured_monotonic_ns"] == 104_900_000_000
        assert observation["capture_time_basis"] == "request_start_lower_bound"
        observation["frame_metadata"]["source_id"] = "tampered"
        saved = controller._live[grant["session_id"]].observations[observation["observation_id"]]
        assert saved.public()["frame_metadata"]["source_id"] == "opaque"
        with pytest.raises(ComputerError, match="stale_observation"):
            await controller.validate_action_binding(
                controller.store.get_session(grant["session_id"]), observation["observation_id"])
    finally:
        await controller.close()


async def test_coherent_same_size_source_replacement_reaches_binding_check(tmp_path):
    backend = Stub()
    original_observe = backend.observe

    async def coherent_observe():
        result = await original_observe()
        replacement = replace(result.source, source_id="replacement")
        scope = CaptureScope(1, frozenset({"replacement"}), frozenset({"replacement"}))
        return replace(result, source=replacement, scope=scope)

    controller = ComputerController(ComputerStore(tmp_path / "db", tmp_path / "evidence"),
                                    lambda _: backend, lambda _: True, enabled=True)
    ctx = RequestContext("owner", "channel", "turn", "host")
    try:
        grant = await controller.session(ctx, {"operation": "start", "app": "fixture"})
        observation = await controller.observe(
            ctx, {"session_id": grant["session_id"], "generation": 1})
        backend.observe = coherent_observe
        with pytest.raises(ComputerError, match="stale_source_binding"):
            await controller.validate_action_binding(
                controller.store.get_session(grant["session_id"]), observation["observation_id"])
    finally:
        await controller.close()
