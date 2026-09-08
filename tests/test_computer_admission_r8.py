"""Public admission reports are bounded evidence, not configurable permission."""
import pytest

from src.computer.admission import CompositorIdentity, InputAdmission, InputAdmissionError


def identity():
    return CompositorIdentity("Mutter", "46.2", "nested-x11", "fixture-build")


def refused(**kwargs):
    return InputAdmission("refused", "owned_button_release_failed",
                          "Owned button release was not delivered after sender EOF.",
                          "Install a compositor build containing the upstream release fix.",
                          **kwargs)


def test_public_refusal_names_stack_reason_remedy_and_scope():
    report = refused(compositor=identity(), probe_scope="same_stack_disposable",
                     checks=("sender_eof_button_release_failed",))
    public = report.public()
    assert public["state"] == "refused"
    assert public["compositor"] == identity().public()
    assert public["probe_scope"] == "same_stack_disposable"
    assert "sender EOF" in public["reason"]
    assert "Install" in public["remedy"]
    public["checks"].clear()
    assert report.checks == ("sender_eof_button_release_failed",)
    assert "Mutter 46.2 (nested-x11)" in str(InputAdmissionError(report))


@pytest.mark.parametrize("value", ["", "a" * 161, "line\nfeed", "nul\0", "delete\x7f", "\ud800", 1])
def test_identity_rejects_invalid_labels(value):
    with pytest.raises(ValueError):
        CompositorIdentity(value, "1", "native", "fixture")


@pytest.mark.parametrize("kwargs", [
    {"state": "pass"}, {"code": "x\n"}, {"code": ""}, {"reason": ""},
    {"reason": "x" * 769}, {"remedy": "\ud800"}, {"compositor": {}},
    {"probe_scope": "assumed"}, {"checks": []}, {"checks": ("x",) * 17},
    {"checks": ("\0",)}, {"state": "eligible"},
    {"state": "eligible", "compositor": identity(), "checks": ("pass",)},
])
def test_malformed_or_unmeasured_eligibility_rejected(kwargs):
    values = dict(state="refused", code="not_qualified", reason="Not qualified.",
                  remedy="Run the bounded isolated qualification.")
    values.update(kwargs)
    with pytest.raises(ValueError):
        InputAdmission(**values)


def test_measured_report_is_explicit_about_its_scope():
    report = InputAdmission("eligible", "release_probe_passed", "Probe passed.",
                            "Requalification is required when the session changes.",
                            identity(), "same_stack_disposable", ("sender_eof_release",))
    assert report.public()["probe_scope"] != "active_session"
    with pytest.raises(ValueError):
        InputAdmissionError(report)
    with pytest.raises(ValueError):
        InputAdmissionError({})
    unknown = refused()
    assert "Unidentified compositor" in str(InputAdmissionError(unknown))


@pytest.mark.parametrize("outcome", [
    "eligible", "refused", "unknown_lifecycle", "changed_platform",
])
async def test_controller_uses_post_start_measurement_not_constructor_claim(tmp_path, outcome):
    from src.computer.controller import ComputerController
    from src.computer.models import BackendCapabilities, ComputerError, RequestContext
    from src.computer.store import ComputerStore
    from tests.test_computer_contract_r1 import Stub

    backend = Stub()
    backend.capabilities = BackendCapabilities("wayland", "existing_session")
    backend.input_supported = False
    report = refused(compositor=identity())

    async def start(_sid):
        if outcome == "refused":
            raise InputAdmissionError(report)
        backend.capabilities = BackendCapabilities(
            "x11" if outcome == "changed_platform" else "wayland", "existing_session",
            "shared", "shared", "unknown" if outcome == "unknown_lifecycle" else "verified",
            "verified")
        backend.input_supported = True
        backend.input_admission = InputAdmission(
            "eligible", "probe_passed", "Measured release passed.", "Reprobe on session change.",
            identity(), "same_stack_disposable", ("owned_button_release",))
        return {}

    backend.start = start
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    ctx = RequestContext("owner", "channel", "turn", "host")
    try:
        if outcome == "eligible":
            result = await controller.session(ctx, {"operation": "start"})
            assert result["backend_capabilities"]["owned_input_release"] == "verified"
            assert result["input_admission"] == backend.input_admission.public()
            assert result["input_supported"] is True
            status = await controller.session(ctx, {
                "operation": "status", "session_id": result["session_id"]})
            assert status["input_admission"] == result["input_admission"]
        elif outcome == "refused":
            with pytest.raises(InputAdmissionError, match="Mutter 46.2") as caught:
                await controller.session(ctx, {"operation": "start"})
            assert caught.value.admission == report
            assert backend.detached
        else:
            with pytest.raises(ComputerError, match="start_unavailable"):
                await controller.session(ctx, {"operation": "start"})
            assert backend.detached
    finally:
        await controller.close()
        store.close()


async def test_untyped_backend_admission_is_not_public(tmp_path):
    from src.computer.controller import ComputerController
    from src.computer.models import RequestContext
    from src.computer.store import ComputerStore
    from tests.test_computer_contract_r1 import Stub

    backend = Stub()
    backend.input_admission = {"raw": "private backend data"}
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    try:
        result = await controller.session(RequestContext("o", "c", "t", "h"),
                                          {"operation": "start", "app": "xed"})
        assert "input_admission" not in result
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("platform,portal_closed,ei_closed,complete", [
    ("wayland", True, True, True), ("wayland", True, False, False),
    ("wayland", False, True, False), ("x11", True, True, False),
])
async def test_portal_owned_device_receipt_requires_both_connections(
        tmp_path, platform, portal_closed, ei_closed, complete):
    from src.computer.controller import ComputerController
    from src.computer.models import BackendCapabilities, LiveSession, RequestContext
    from src.computer.store import ComputerStore
    from tests.test_computer_contract_r1 import Stub

    backend = Stub()
    backend.capabilities = BackendCapabilities(platform, "existing_session")
    original = backend.detach

    async def detach():
        return {**await original(), "owned_devices": "portal_owned_connections_closed",
                "portal_session_closed": portal_closed, "ei_connection_closed": ei_closed}

    backend.detach = detach
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, None, lambda _: True, enabled=True)
    grant = store.create_session(RequestContext("o", "c", "t", "h"), "xed",
                                 platform=platform, environment="existing_session")
    controller._live[grant.session_id] = LiveSession(backend, 99999999,
                                                   capabilities=backend.capabilities)
    try:
        result = await controller._stop(grant.session_id, "closed")
        assert result["cleanup"]["complete"] is complete
        assert result["cleanup"]["owned_devices"] == "portal_owned_connections_closed"
        assert result["cleanup"]["portal_session_closed"] is portal_closed
        assert result["cleanup"]["ei_connection_closed"] is ei_closed
    finally:
        backend.detach = original
        await controller.close()
        store.close()
