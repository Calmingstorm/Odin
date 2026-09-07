"""Deterministic controller proof only: no display, process, or desktop runtime."""

import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace

import pytest

from src.computer.controller import ComputerController
from src.computer.geometry import AffineTransform, SourceGeometry
from src.computer.models import BackendCapabilities, ComputerError, RequestContext
from src.computer.store import ComputerStore, canonical_hash
from src.tools.defs.computer import computer_definitions
from tests.test_computer_contract_r1 import Stub


class Backend(Stub):
    def __init__(self):
        super().__init__()
        self.calls = []
        self.hook = None
        self.capture_hook = None
        self.modal = None
        self.focused = True
        self.capture_count = 0

    async def observe(self):
        self.capture_count += 1
        if self.capture_hook:
            self.capture_hook(self)
        return replace(await super().observe(), modal=self.modal, focused=self.focused)

    async def act(self, payload):
        self.calls.append(payload)
        if self.hook:
            return await self.hook(payload)
        return self.result(payload)

    def result(self, payload):
        point = self.source.input_point(AffineTransform(), payload["x"], payload["y"], 2, 2)
        return {"status": "executed", "injected": True, "released": True,
                "postcondition": {"status": "satisfied", "type": "pointer_at",
                                  "method": "pointer_query_after_release",
                                  "target_window_matches": True,
                                  "actual": {"x": int(point[0]), "y": int(point[1])},
                                  **{key: payload[key] for key in
                                     ("source_id", "source_revision", "consent_generation")}}}


@asynccontextmanager
async def setup(tmp_path, *, deliver=True, authorize=None, monotonic=None):
    backend = Backend()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, authorize or (lambda _: True),
                                    enabled=True, **({"monotonic": monotonic} if monotonic else {}))
    ctx = RequestContext("owner", "channel", "turn", "host")
    try:
        grant = await controller.session(ctx, {"operation": "start", "app": "fixture"})
        observed = await controller.observe(
            ctx, {"session_id": grant["session_id"], "generation": 1})
        obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
        if deliver:
            await controller.validate_observation_delivery(
                ctx, obs.frame_metadata, obs.image_sha256)
        inp = {"session_id": grant["session_id"], "generation": 1, "consent_generation": 1,
               "source_id": "opaque", "source_revision": 1, "action_id": "action-1",
               "observation_id": obs.observation_id, "operation": "click", "x": 1, "y": 0,
               "expect": {"type": "pointer_at", "x": 1, "y": 0}}
        yield controller, backend, ctx, inp
    finally:
        await controller.close()
        store.close()


async def test_pending_durable_before_input_and_private_postcondition_evidence(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        async def check_pending(payload):
            row = controller.store.db.execute("SELECT status FROM receipts").fetchone()
            assert row[0] == "pending"
            assert controller.store.get_session(inp["session_id"]).actions == 1
            return backend.result(payload)
        backend.hook = check_pending
        result = await controller.act(ctx, inp)
        assert result["status"] == "verified"
        assert result["verification"]["scope"] == "pointer_location_only"
        assert result["verification"]["actual"] == {"x": 1, "y": 0}
        assert controller.store.read_evidence(ctx, result["verification"]["evidence_id"])[0]
        assert controller._delivered_observations.get(inp["session_id"]) is None
        assert result == await controller.act(ctx, inp)
        assert len(backend.calls) == 1
        assert controller.store.get_session(inp["session_id"]).actions == 1
        with pytest.raises(ComputerError, match="action_id_conflict"):
            await controller.act(ctx, {
                **inp, "x": 0, "expect": {"type": "pointer_at", "x": 0, "y": 0}})


async def test_real_adapter_contract_with_fake_wire_no_gui(tmp_path):
    from unittest.mock import AsyncMock

    from src.computer.runtime.backend import LinuxDesktopBackend
    from src.computer.runtime.protocol import pack_blob

    backend = LinuxDesktopBackend()
    backend.start = AsyncMock(return_value={})
    backend.stop = AsyncMock(return_value={"stopped": True})
    injected = []

    async def rpc(operation, **kwargs):
        if operation == "observe":
            return {"observation": {
                "image": pack_blob(bytes(12)), "raster_mode": "RGB", "width": 2, "height": 2,
                "window": {"id": 17}, "observation_id": "worker-observation",
                "source_revision": 1, "focused": True, "modal_id": None}}
        assert operation == "act"
        payload = kwargs["action"]
        injected.append(payload)
        return {"receipt": {"status": "executed", "injected": True, "released": True,
                            "postcondition": {"status": "satisfied", "type": "pointer_at",
                                              "method": "pointer_query_after_release",
                                              "target_window_matches": True,
                                              "actual": {"x": 1, "y": 0}}}}

    backend._rpc = rpc
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    ctx = RequestContext("owner", "channel", "turn", "host")
    try:
        grant = await controller.session(ctx, {"operation": "start", "app": "xed"})
        observed = await controller.observe(ctx, {"session_id": grant["session_id"],
                                                 "generation": 1})
        obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        inp = {"session_id": grant["session_id"], "generation": 1, "consent_generation": 1,
               "source_id": obs.source.source_id, "source_revision": 1, "action_id": "click",
               "observation_id": obs.observation_id, "operation": "click", "x": 1, "y": 0,
               "expect": {"type": "pointer_at", "x": 1, "y": 0}}
        result = await controller.act(ctx, inp)
        assert result["status"] == "verified"
        assert result == await controller.act(ctx, inp)
        assert len(injected) == 1 and injected[0]["x"] == 1
        assert "window" not in str(result)
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("wrong_window", [False, True])
async def test_native_adapter_controller_pointer_binding_chain(tmp_path, wrong_window):
    import threading
    from unittest.mock import AsyncMock

    from src.computer.runtime.backend import LinuxDesktopBackend
    from src.computer.runtime.protocol import pack_blob
    from tests.test_computer_runtime_grounding_r4 import Desktop

    native = Desktop()
    if wrong_window:
        native.after_release = lambda: setattr(native, "pointer_window", 18)
    backend = LinuxDesktopBackend()
    backend.start = AsyncMock(return_value={})
    backend.stop = AsyncMock(return_value={"stopped": True})

    async def rpc(operation, **kwargs):
        if operation == "observe":
            raw = native.snapshot(packed=True)
            raw["image"] = pack_blob(raw.pop("image_bytes"))
            return {"observation": raw}
        assert operation == "act"
        return {"receipt": native.grounded_execute(kwargs["action"], threading.Event())}

    backend._rpc = rpc
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    ctx = RequestContext("owner", "channel", "turn", "host")
    try:
        grant = await controller.session(ctx, {"operation": "start", "app": "xed"})
        observed = await controller.observe(ctx, {"session_id": grant["session_id"],
                                                 "generation": 1})
        obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        inp = {"session_id": grant["session_id"], "generation": 1, "consent_generation": 1,
               "source_id": obs.source.source_id, "source_revision": 1, "action_id": "click",
               "observation_id": obs.observation_id, "operation": "click", "x": 25, "y": 26,
               "expect": {"type": "pointer_at", "x": 25, "y": 26}}
        result = await controller.act(ctx, inp)
        assert result["status"] == ("not_satisfied" if wrong_window else "verified")
        assert result["verification"]["target_binding_matches"] is (not wrong_window)
        assert native.commands.count("mousedown") == 1
        assert result == await controller.act(ctx, inp)
        assert native.commands.count("mousedown") == 1
    finally:
        await controller.close()
        store.close()


async def test_schema_supported_subset_is_declared(tmp_path):
    import jsonschema
    async with setup(tmp_path) as (_, _, _, inp):
        schema = next(tool["input_schema"] for tool in computer_definitions()
                      if tool["name"] == "computer_act")
        jsonschema.validate(inp, schema)


@pytest.mark.parametrize("change", [
    {"x": True}, {"x": -1}, {"x": 2}, {"y": 0.1}, {"generation": True},
    {"consent_generation": 2}, {"source_revision": 2}, {"source_id": "other"},
    {"action_id": "a" * 97}, {"action_id": "bad\x00id"}, {"action_id": "\ud800"},
    {"button": "right"}, {"text": "not permitted"}, {"target_id": "terminal"},
    {"operation": "key"}, {"operation": "semantic"}, {"operation": "type_text"},
    {"operation": "double_click"}, {"operation": "scroll"}, {"operation": "polyline"},
    {"operation": "move"}, {"expect": {"type": "text_equals", "text": "forged"}},
    {"expect": {"type": "pointer_at", "x": True, "y": 0}},
    {"expect": {"type": "pointer_at", "x": 0, "y": 0}},
    {"expect": {"type": "pointer_at", "x": 1, "y": 0, "status": "verified"}},
    {"expect": []}, {"postcondition": {"status": "verified"}},
])
async def test_invalid_or_unsupported_payload_never_injects(tmp_path, change):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        with pytest.raises(ComputerError):
            await controller.act(ctx, {**inp, **change})
        assert not backend.calls
        assert controller.store.get_session(inp["session_id"]).actions == 0


@pytest.mark.parametrize("field", ["owner_id", "channel_id", "turn_id", "host_id"])
async def test_owner_fences_actions_and_receipt_lookup(tmp_path, field):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        await controller.act(ctx, inp)
        with pytest.raises(ComputerError, match="not_found"):
            await controller.act(replace(ctx, **{field: "different"}), inp)
        assert len(backend.calls) == 1


async def test_native_delivery_required_and_observation_consumed(tmp_path):
    async with setup(tmp_path, deliver=False) as (controller, backend, ctx, inp):
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await controller.act(ctx, inp)
        live = controller._live[inp["session_id"]]
        obs = live.observations[inp["observation_id"]]
        await controller.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        await controller.act(ctx, inp)
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await controller.act(ctx, {**inp, "action_id": "different"})
        assert len(backend.calls) == 1


@pytest.mark.parametrize("problem", ["source", "focus", "mapping", "modal", "revision", "region"])
async def test_pre_injection_grounding_changes_fail_closed(tmp_path, problem):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        if problem == "focus":
            backend.focused = False
        elif problem == "modal":
            backend.modal = "unexpected"
        elif problem == "mapping":
            backend.source = SourceGeometry("opaque", 1, 1, 2, 2)
        else:
            fields = {"source": {"source_id": "different"}, "revision": {"source_revision": 2},
                      "region": {"input_region_id": "new-device"}}
            backend.source = replace(backend.source, **fields[problem])
        with pytest.raises(ComputerError):
            await controller.act(ctx, inp)
        assert not backend.calls
        if problem == "modal":
            assert controller.store.get_session(inp["session_id"]).state != "active"


@pytest.mark.parametrize("where", ["original", "capture", "authorization"])
async def test_expired_grounding_denies_input(tmp_path, where):
    now = [100.0]
    async with setup(tmp_path, monotonic=lambda: now[0]) as (controller, backend, ctx, inp):
        if where == "original":
            now[0] += 5.01
        elif where == "capture":
            backend.capture_hook = lambda _: now.__setitem__(0, now[0] + 5.01)
        else:
            def authorize(_):
                if backend.capture_count >= 3:
                    now[0] += 5.01
                return True
            controller.authorize = authorize
        with pytest.raises(ComputerError, match="stale_observation"):
            await controller.act(ctx, inp)
        assert not backend.calls


@pytest.mark.parametrize("gate", [
    "existing", "count", "task_deadline", "wall_deadline", "disabled"])
async def test_environment_counts_and_deadlines(tmp_path, gate):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        live = controller._live[inp["session_id"]]
        if gate == "existing":
            live.capabilities = BackendCapabilities("x11", "existing_session", "shared", "shared",
                                                    "verified", "verified")
        elif gate == "count":
            controller.store.db.execute("UPDATE sessions SET actions=200")
        elif gate == "task_deadline":
            live.deadline = 0
        elif gate == "wall_deadline":
            controller.store.db.execute("UPDATE sessions SET expires_at=0")
        else:
            controller.enabled = False
        with pytest.raises(ComputerError):
            await controller.act(ctx, inp)
        assert not backend.calls


@pytest.mark.parametrize("case,status", [
    ("ok_only", "unknown"), ("verdict_only", "executed"), ("wrong_actual", "not_satisfied"),
    ("source", "unknown"), ("revision_bool", "unknown"), ("method", "unknown"),
    ("actual_bool", "unknown"), ("unreleased", "unknown"), ("refused", "unavailable"),
    ("wrong_pointer_window", "not_satisfied"), ("missing_pointer_window", "unknown"),
    ("nonboolean_pointer_window", "unknown"),
])
async def test_only_measured_matching_postconditions_verify(tmp_path, case, status):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        async def receipt(payload):
            result = backend.result(payload)
            if case == "ok_only":
                return {"ok": True, "status": "verified"}
            if case == "verdict_only":
                result.pop("postcondition")
                result["status"] = "verified"
            elif case == "wrong_actual":
                result["postcondition"]["actual"]["x"] = 0
            elif case == "source":
                result["postcondition"]["source_id"] = "unrelated"
            elif case == "revision_bool":
                result["postcondition"]["source_revision"] = True
            elif case == "method":
                result["postcondition"]["method"] = "input_exit_code"
            elif case == "actual_bool":
                result["postcondition"]["actual"]["x"] = True
            elif case == "wrong_pointer_window":
                result["status"] = "not_satisfied"
                result["postcondition"]["status"] = "not_satisfied"
                result["postcondition"]["target_window_matches"] = False
            elif case == "missing_pointer_window":
                result["postcondition"].pop("target_window_matches")
            elif case == "nonboolean_pointer_window":
                result["postcondition"]["target_window_matches"] = 1
            elif case == "unreleased":
                result["released"] = False
            elif case == "refused":
                return {"status": "unavailable", "injected": False, "released": True}
            return result
        backend.hook = receipt
        result = await controller.act(ctx, inp)
        assert result["status"] == status
        assert await controller.act(ctx, inp) == result
        assert len(backend.calls) == 1
        if status == "unknown":
            assert backend.stopped


async def test_changed_post_action_source_makes_success_unknown(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        async def action(payload):
            result = backend.result(payload)
            backend.source = replace(backend.source, source_revision=2)
            return result
        backend.hook = action
        result = await controller.act(ctx, inp)
        assert result["status"] == "unknown" and backend.stopped


async def test_changed_visual_target_requires_new_delivery(tmp_path):
    from tests.test_computer_runtime_primitives import png
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        original = backend.observe

        async def changed():
            raw = await original()
            return replace(raw, image_bytes=png(width=2, height=2, color=6))

        backend.observe = changed
        with pytest.raises(ComputerError, match="visual_target_changed"):
            await controller.act(ctx, inp)
        assert not backend.calls


async def test_concurrent_stop_during_injection_unknown_and_not_replayed(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        entered, release = asyncio.Event(), asyncio.Event()

        async def waiting(payload):
            entered.set()
            await release.wait()
            return backend.result(payload)

        backend.hook = waiting
        task = asyncio.create_task(controller.act(ctx, inp))
        await entered.wait()
        await controller.session(ctx, {"operation": "stop", "session_id": inp["session_id"]})
        release.set()
        result = await task
        assert result["status"] == "unknown"
        assert (await controller.act(ctx, inp)) == result
        assert len(backend.calls) == 1


async def test_payload_snapshot_cannot_change_across_capture_await(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        original_hash = canonical_hash(inp)

        def mutate(_):
            inp["x"] = 0
            inp["expect"]["x"] = 0

        backend.capture_hook = mutate
        result = await controller.act(ctx, inp)
        assert result["status"] == "verified"
        assert backend.calls[0]["x"] == 1
        assert controller.store.receipt(inp["session_id"], inp["action_id"], original_hash)


@pytest.mark.parametrize("failure", ["exception", "cancel", "timeout", "revoke", "auth"])
async def test_pending_failure_unknown_never_replayed(tmp_path, monkeypatch, failure):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        async def action(payload):
            if failure == "exception":
                raise RuntimeError("sensitive backend output must not persist")
            if failure == "cancel":
                raise asyncio.CancelledError
            if failure == "timeout":
                await asyncio.Event().wait()
            if failure == "revoke":
                controller.store.set_state(inp["session_id"], "paused", revoke=True)
            if failure == "auth":
                controller.authorize = lambda _: False
            return backend.result(payload)
        if failure == "timeout":
            monkeypatch.setattr("src.computer.controller.MAX_INPUT_SECONDS", 0.01)
        backend.hook = action
        if failure == "cancel":
            with pytest.raises(asyncio.CancelledError):
                await controller.act(ctx, inp)
        else:
            assert (await controller.act(ctx, inp))["status"] == "unknown"
        controller.authorize = lambda _: True
        receipt = await controller.act(ctx, inp)
        assert receipt["status"] == "unknown"
        assert "sensitive" not in str(receipt)
        assert len(backend.calls) == 1 and backend.stopped


async def test_pending_crash_recovery_and_concurrent_duplicate(tmp_path):
    async with setup(tmp_path) as (controller, backend, ctx, inp):
        results = await asyncio.gather(controller.act(ctx, inp), controller.act(ctx, dict(inp)))
        assert results[0] == results[1] and len(backend.calls) == 1
        pending = {**inp, "action_id": "lost-action"}
        grant = controller.store.get_session(inp["session_id"])
        controller.store.begin_action(grant, pending["action_id"], canonical_hash(pending), 200)
        assert (await controller.act(ctx, pending))["reason"] == "pending_no_replay"
        controller.store.recover()
        assert (await controller.act(ctx, pending))["reason"] == "controller_lost"
        assert len(backend.calls) == 1
