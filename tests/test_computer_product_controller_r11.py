"""General attached sessions, truthful crop binding and durable provenance."""

import json
from dataclasses import asdict, replace

import pytest

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, BackendObservation, CaptureScope, ComputerError
from src.computer.render import render_frame
from src.computer.store import ComputerStore
from src.computer.vision import FrameCrop
from tests.test_computer_actions_r4 import persisted_receipt
from tests.test_computer_contract_r1 import RequestContext, Stub


class Desktop(Stub):
    capabilities = BackendCapabilities(
        "x11", "existing_session", "shared", "shared", "verified", "verified"
    )
    input_supported = True
    application_provenance = {
        "pid": 42,
        "uid": 1000,
        "start_ticks": 123,
        "exe_basename": "user-application",
        "exe_identity": [1, 42],
        "cmdline_digest": "a" * 64,
        "trusted_executable": False,
        "wm_class": "UserApplication",
        "script_identity": None,
    }

    def __init__(self):
        super().__init__()
        self.crops = []
        self.ignore_crop = False
        self.injected = 0

    async def observe(self, *, crop=None):
        self.crops.append(crop)
        rendered = render_frame(
            b"\x00" * 12,
            self.source,
            mode="RGB",
            observation_id="native",
            session_id="fixture",
            generation=1,
            captured_monotonic_ns=1,
            crop=None if self.ignore_crop or crop is None else FrameCrop(**crop),
        )
        metadata = rendered.metadata
        return BackendObservation(
            self.source,
            CaptureScope(1, frozenset({"opaque"}), frozenset({"opaque"})),
            metadata.width,
            metadata.height,
            metadata.delivered_to_source,
            rendered.png,
            focused=True,
            crop=tuple(asdict(metadata.crop).values()) if metadata.crop else None,
            resize_scale=metadata.resize_scale,
        )

    async def act(self, payload):
        self.injected += 1
        return {"status": "executed", "injected": True, "released": True}


async def test_attached_start_without_app_crop_action_and_receipt(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    requested = []

    def factory(app):
        requested.append(app)
        return backend

    controller = ComputerController(store, factory, lambda _: True, enabled=True)
    context = RequestContext("operator", "channel", "turn", "host")
    try:
        grant = await controller.session(context, {"operation": "start"})
        assert requested == [None] and grant["app"] is None
        assert store.get_session(grant["session_id"]).app == "attached"
        assert "application_profile" not in grant
        assert grant["application_provenance"] == backend.application_provenance
        args = {"session_id": grant["session_id"], "generation": 1}
        crop = {"x": 1, "y": 0, "width": 1, "height": 2}
        observed = await controller.observe(context, {**args, "crop": crop})
        obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
        assert observed["frame_metadata"]["crop"] == crop
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        action = {
            **args,
            "action_id": "one",
            "observation_id": obs.observation_id,
            "consent_generation": 1,
            "source_id": "opaque",
            "source_revision": 1,
            "operation": "type",
            "text": "é",
            "expect": {"type": "visual_change"},
        }
        result = await controller.act(context, action)
        assert result["status"] == "executed"
        assert result["application_provenance"] == backend.application_provenance
        assert backend.crops[-3:] == [crop, crop, crop]
        assert result["next_observation"]["image_bytes"]
        assert await controller.act(context, action) == persisted_receipt(result)
        assert backend.injected == 1
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize(
    "crop",
    [
        None,
        {},
        {"x": -1, "y": 0, "width": 1, "height": 1},
        {"x": 0, "y": 0, "width": True, "height": 1},
        {"x": 0, "y": 0, "width": 0, "height": 1},
    ],
)
async def test_invalid_crop_does_not_capture(tmp_path, crop):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    try:
        with pytest.raises(ComputerError):
            await controller.observe(
                RequestContext("o", "c", "t", "h"),
                {"session_id": "none", "generation": 1, "crop": crop},
            )
        assert backend.crops == []
    finally:
        await controller.close()
        store.close()


async def test_backend_must_return_requested_crop(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(context, {"operation": "start"})
        backend.ignore_crop = True
        with pytest.raises(ComputerError, match="capture_crop_mismatch"):
            await controller.observe(
                context,
                {
                    "session_id": grant["session_id"],
                    "generation": 1,
                    "crop": {"x": 0, "y": 0, "width": 1, "height": 1},
                },
            )
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("state", ["pending", "unknown", "unavailable", "verified"])
def test_provenance_survives_no_replay_and_recovery(tmp_path, state):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    try:
        grant = store.create_session(
            RequestContext("o", "c", "t", "h"), environment="existing_session"
        )
        grant = store.set_state(grant.session_id, "active")
        provenance = dict(Desktop.application_provenance)
        store.begin_action(grant, "id", "hash", 5, provenance=provenance)
        provenance["pid"] = 99
        if state != "pending":
            store.finish_action(grant.session_id, "id", {"status": state})
        else:
            receipt = store.receipt(grant.session_id, "id", "hash")
            assert receipt["status"] == "unknown" and receipt["reason"] == "pending_no_replay"
        store.recover()
        receipt = store.receipt(grant.session_id, "id", "hash")
        assert receipt["application_provenance"] == Desktop.application_provenance
        assert receipt["status"] == ("unknown" if state == "pending" else state)
        if state == "pending":
            assert receipt["reason"] == "controller_lost"
        assert (
            json.loads(store.db.execute("SELECT result FROM receipts").fetchone()[0])[
                "application_provenance"
            ]
            == Desktop.application_provenance
        )
    finally:
        store.close()


async def test_isolated_start_still_requires_launch_profile(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    backend.capabilities = replace(backend.capabilities, environment="isolated")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    try:
        with pytest.raises(ComputerError, match="isolated_app_required"):
            await controller.session(RequestContext("o", "c", "t", "h"), {"operation": "start"})
        assert not controller._live
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("platform", ["x11", "wayland"])
@pytest.mark.parametrize("app", ["xed", "drawing"])
async def test_explicit_isolated_request_refused_before_attached_start(tmp_path, platform, app):
    from unittest.mock import AsyncMock, Mock

    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    backend.capabilities = replace(backend.capabilities, platform=platform)
    backend.start = AsyncMock()
    store.create_session = Mock(wraps=store.create_session)
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    try:
        with pytest.raises(ComputerError, match="isolated_request_conflicts.*omit app"):
            await controller.session(
                RequestContext("o", "c", "t", "h"), {"operation": "start", "app": app}
            )
        backend.start.assert_not_awaited()
        store.create_session.assert_not_called()
        assert not controller._live
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("reason", ["display_asleep", "topology_changed", "portal_closed"])
async def test_capture_lifecycle_failure_retires_delivered_pixels(tmp_path, reason):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(context, {"operation": "start"})
        sid = grant["session_id"]
        observed = await controller.observe(context, {"session_id": sid, "generation": 1})
        obs = controller._live[sid].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )

        async def unavailable():
            raise ComputerError(reason)

        backend.observe = unavailable
        with pytest.raises(ComputerError, match=reason):
            await controller.observe(context, {"session_id": sid, "generation": 1})
        assert not controller._live[sid].observations
        assert sid not in controller._delivered_observations
        assert backend.injected == 0
    finally:
        await controller.close()
        store.close()


async def test_attached_document_transition_is_not_unknown_input(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(context, {"operation": "start"})
        sid = grant["session_id"]
        observed = await controller.observe(context, {"session_id": sid, "generation": 1})
        obs = controller._live[sid].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )

        async def close_document(payload):
            backend.source = replace(backend.source, source_revision=2)
            backend.injected += 1
            return {"status": "executed", "injected": True, "released": True}

        backend.act = close_document
        action = {
            "session_id": sid,
            "generation": 1,
            "action_id": "close",
            "observation_id": obs.observation_id,
            "consent_generation": 1,
            "source_id": "opaque",
            "source_revision": 1,
            "operation": "key",
            "key": "ctrl+w",
            "expect": {"type": "visual_change"},
        }
        result = await controller.act(context, action)
        assert result["status"] == "not_satisfied"
        assert result["execution"] == {"sent": True, "injected": True, "released": True}
        assert result["verification"]["reason"] == "target_changed_observe_again"
        assert store.get_session(sid).state == "active"
        assert sid not in controller._delivered_observations
        assert result["next_observation"]["image_bytes"]
        assert await controller.act(context, action) == persisted_receipt(result)
        assert backend.injected == 1
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await controller.act(context, {**action, "action_id": "new"})
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("codepoint", [233, "U+00E9"])
async def test_unicode_preflight_details_are_durable_known_no_input(tmp_path, codepoint):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(context, {"operation": "start"})
        sid = grant["session_id"]
        observed = await controller.observe(context, {"session_id": sid, "generation": 1})
        obs = controller._live[sid].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )

        async def rejected(payload):
            return {
                "status": "unavailable",
                "injected": False,
                "released": True,
                "reason": "unsupported_character",
                "unsupported_characters": [{"index": 0, "codepoint": codepoint}],
            }

        backend.act = rejected
        action = {
            "session_id": sid,
            "generation": 1,
            "action_id": "text",
            "observation_id": obs.observation_id,
            "consent_generation": 1,
            "source_id": "opaque",
            "source_revision": 1,
            "operation": "type",
            "text": "é",
            "expect": {"type": "visual_change"},
        }
        result = await controller.act(context, action)
        assert result["status"] == "unavailable"
        assert result["reason"] == "unsupported_character"
        assert result["unsupported_characters"] == [{"index": 0, "codepoint": "U+00E9"}]
        assert result["execution"] == {"sent": False, "injected": False, "released": True}
        assert store.get_session(sid).state == "active"
        assert await controller.act(context, action) == result
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("reason", ["invalid_bounds", "display_asleep", "input_focus_unavailable"])
async def test_failed_post_capture_preserves_acknowledged_execution(tmp_path, reason):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Desktop()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(context, {"operation": "start"})
        sid = grant["session_id"]
        observed = await controller.observe(context, {"session_id": sid, "generation": 1})
        obs = controller._live[sid].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )

        async def unavailable():
            raise ComputerError(reason)

        async def executed(payload):
            backend.observe = unavailable
            backend.injected += 1
            return {"status": "executed", "injected": True, "released": True}

        backend.act = executed
        action = {
            "session_id": sid,
            "generation": 1,
            "action_id": "close",
            "observation_id": obs.observation_id,
            "consent_generation": 1,
            "source_id": "opaque",
            "source_revision": 1,
            "operation": "key",
            "key": "ctrl+w",
            "expect": {"type": "visual_change"},
        }
        result = await controller.act(context, action)
        assert result["status"] == "executed"
        assert result["verification"]["status"] == "unavailable"
        assert result["verification"]["reason"] == reason
        assert result["verification"]["next_action"] == "observe_again_without_crop"
        assert result["execution"] == {"sent": True, "injected": True, "released": True}
        assert store.get_session(sid).state == "active"
        assert not controller._live[sid].observations
        assert sid not in controller._delivered_observations
        assert await controller.act(context, action) == result
        assert backend.injected == 1
    finally:
        await controller.close()
        store.close()
