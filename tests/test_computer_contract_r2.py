"""R2 accepts overlap; it does not convert missing damage evidence into a pass."""
from dataclasses import replace

import pytest

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, ComputerError, LiveSession, RequestContext
from src.computer.policy import input_eligible
from src.computer.store import ComputerStore
from tests.test_computer_contract_r1 import Stub


@pytest.mark.parametrize("field", ["owned_input_release", "application_preserving_detach"])
@pytest.mark.parametrize("value", ["unknown", "failed"])
@pytest.mark.parametrize("platform", ["x11", "wayland"])
def test_independent_input_never_substitutes_for_no_damage(field, value, platform):
    caps = BackendCapabilities(platform, "existing_session", "independent", "independent",
                               "verified", "verified")
    with pytest.raises(ComputerError, match="lifecycle"):
        input_eligible(replace(caps, **{field: value}))


@pytest.mark.parametrize("field", ["owned_input_release", "application_preserving_detach"])
@pytest.mark.parametrize("value", [True, False, "yes", "independent", None, [], {}])
def test_lifecycle_capability_is_not_a_truthiness_test(field, value):
    with pytest.raises(ComputerError, match="invalid_input_lifecycle"):
        BackendCapabilities("x11", "existing_session", **{field: value})


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["released", "applications_preserved", "input_revoked",
                                     "capture_revoked", "owned_devices"])
async def test_incomplete_detach_quarantines_instead_of_claiming_clean(tmp_path, missing):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, None, lambda ctx: True, enabled=True)
    grant = store.create_session(RequestContext("o", "c", "t", "h"), "",
                                 platform="x11", environment="existing_session")
    backend = Stub()
    original = backend.detach

    async def incomplete():
        result = await original()
        result.pop(missing)
        return result

    backend.detach = incomplete
    controller._live[grant.session_id] = LiveSession(
        backend, 999999, capabilities=BackendCapabilities("x11", "existing_session"))
    result = await controller._stop(grant.session_id, "closed")
    assert result["state"] == "quarantined"
    assert result["cleanup"]["complete"] is False
    assert backend.detached and not backend.stopped
    assert grant.session_id in controller._live
    assert store.get_session(grant.session_id).generation == 2
    backend.detach = original
    await controller.close()
    store.db.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("devices", ["removed", "retained_inactive"])
async def test_detach_device_disposition_survives_adapter_and_store_close(tmp_path, devices):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, None, lambda ctx: True, enabled=True)
    ctx = RequestContext("o", "c", "t", "h")
    grant = store.create_session(ctx, "", platform="x11", environment="existing_session")
    backend = Stub()
    original = backend.detach

    async def detach():
        result = await original()
        result["owned_devices"] = devices
        result["arbitrary_backend_text"] = "not public evidence"
        return result

    backend.detach = detach
    controller._live[grant.session_id] = LiveSession(
        backend, 999999, capabilities=BackendCapabilities("x11", "existing_session"))
    stopped = await controller._stop(grant.session_id, "closed")
    assert stopped["state"] == "closed"
    assert stopped["cleanup"]["owned_devices"] == devices
    assert stopped["cleanup"]["complete"] is True
    assert "arbitrary_backend_text" not in stopped["cleanup"]
    assert grant.session_id not in controller._live
    store.db.close()
    reopened = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    recovered = ComputerController(reopened, None, lambda ctx: True, enabled=True)
    status = await recovered.session(ctx, {"operation": "status", "session_id": grant.session_id})
    assert status["cleanup"] == stopped["cleanup"]
    await recovered.close()
    reopened.db.close()


@pytest.mark.asyncio
async def test_limitation_evidence_reaches_session_and_observation(tmp_path):
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    backend = Stub()
    controller = ComputerController(store, lambda app: backend, lambda ctx: True, enabled=True)
    ctx = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(ctx, {"operation": "start", "app": "fixture"})
        status = await controller.session(ctx, {
            "operation": "status", "session_id": grant["session_id"]})
        observed = await controller.observe(ctx, {
            "session_id": grant["session_id"], "generation": 1})
        for response in (grant, status, observed):
            assert response["backend_capabilities"] == backend.capabilities.public()
            assert "keyboard_separation_shared" in response["backend_capabilities"]["limitations"]
        # Serializing/discarding a public warning cannot modify the trusted capability.
        observed["backend_capabilities"]["limitations"].clear()
        assert backend.capabilities.public()["limitations"]
        with pytest.raises(ComputerError, match="grounded_actions_unavailable"):
            await controller.act(ctx, {})
    finally:
        await controller.close()
        store.db.close()
