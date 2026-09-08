"""Additive native routing/recovery; disposable controller, no desktop access."""
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from src.computer.controller import ComputerController
from src.computer.integration import ComputerIntegration
from src.computer.models import BackendCapabilities, ComputerError, RequestContext
from src.computer.policy import input_eligible
from src.computer.store import ComputerStore
from src.config.schema import ComputerUseConfig
from tests.test_computer_api import Controller, client
from tests.test_computer_attached_controller_r5 import Attached


def settings(**updates):
    return ComputerUseConfig(**{
        "enabled": True, "platform": "wayland", "environment": "existing_session",
        "wayland_backend": "hyprland", "wayland_uid": 1000,
        "hyprland_runtime_dir": "/run/user/1000", "hyprland_wayland_display": "wayland-1",
        "hyprland_instance_signature": "approved_instance", "hyprland_output_name": "DP-1",
        "hyprland_compositor_pid": 123, "hyprland_compositor_executable": "/usr/bin/Hyprland",
        "hyprland_compositor_sha256": "a" * 64, "hyprland_compositor_commit": "b" * 40,
        "hyprland_compositor_version": "0.54.2", **updates,
    })


def test_defaults_unchanged():
    s = ComputerUseConfig()
    assert (s.platform, s.environment, s.enabled, s.wayland_backend) == (
        "x11", "isolated", False, "portal")


@pytest.mark.parametrize("values", [
    {"hyprland_runtime_dir": "relative"}, {"hyprland_scope_socket": "/a/../b"},
    {"hyprland_wayland_display": "../../wayland-1"}, {"hyprland_output_name": "*"},
    {"hyprland_compositor_pid": True}, {"hyprland_compositor_sha256": "learn-from-peer"},
    {"hyprland_compositor_commit": "latest"}, {"hyprland_compositor_version": "0.1\n"},
])
def test_invalid_target_rejected(values):
    with pytest.raises(ValidationError):
        settings(**values)


def test_factory_native_route_never_constructs_portal(monkeypatch):
    captured = {}
    def backend(**kwargs):
        captured.update(kwargs)
        return "native"
    monkeypatch.setitem(sys.modules, "src.computer.runtime.hyprland_backend", SimpleNamespace(
        HyprlandRuntimeBackend=backend, HyprlandSessionConfig=lambda **kw: kw))
    s = settings()
    facade = ComputerIntegration(SimpleNamespace(config=SimpleNamespace(computer=s)),
                                 controller=object(), settings=s)
    assert facade._backend() == "native"
    assert captured["config"]["expected_uid"] == 1000
    assert captured["config"]["compositor_trust"].sha256 == "a" * 64
    assert captured["config"]["scope_socket"] == "/run/user/1000/odin-hyprland-scope.sock"
    assert "bus_address" not in captured["config"]
    monkeypatch.setattr(sys.modules["src.computer.runtime.hyprland_backend"],
                        "HyprlandRuntimeBackend", lambda **kw: (_ for _ in ()).throw(
                            RuntimeError("native refused")))
    with pytest.raises(RuntimeError, match="native refused"):
        facade._backend()


def test_best_effort_is_hyprland_only():
    cap = BackendCapabilities("wayland", "existing_session", "shared", "shared",
                              "hyprland_best_effort", "verified", backend="hyprland")
    input_eligible(cap)
    assert "hyprland_guardian_sigkill_can_leave_owned_input_held" in cap.public()["limitations"]
    for platform, environment, backend in [
        ("x11", "existing_session", "hyprland"), ("wayland", "isolated", "hyprland"),
        ("wayland", "existing_session", ""), ("wayland", "existing_session", "gnome"),
    ]:
        with pytest.raises(ComputerError):
            BackendCapabilities(platform, environment, owned_input_release="hyprland_best_effort",
                                application_preserving_detach="verified", backend=backend)
    with pytest.raises(ComputerError, match="lifecycle_unproven"):
        input_eligible(BackendCapabilities("wayland", "existing_session"))


class Native(Attached):
    capabilities = BackendCapabilities("wayland", "existing_session", "shared", "shared",
                                       "hyprland_best_effort", "verified", backend="hyprland")
    async def detach(self):
        return {"stopped": True, "released": True, "applications_preserved": True,
                "input_revoked": True, "capture_revoked": True,
                "owned_devices": "hyprland_owned_connections_closed",
                "hyprland_owned_connections_closed": True, "receiver_release_verified": False}


@pytest.mark.parametrize("released", [True, False])
async def test_operator_recovery_fences_and_preserves_truth(tmp_path, released):
    backend = Native()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    owner = RequestContext("owner", "channel", "turn", "host")
    operator = RequestContext("owner", "web-channel", "web-operator", "host", surface="webui")
    try:
        grant = await controller.session(owner, {"operation": "start"})
        sid = grant["session_id"]
        async def recover():
            assert controller._live[sid].revoked is True
            assert store.get_session(sid).state == "paused"
            return {"released": released, "input_revoked": True, "capture_revoked": True}
        backend.recover_owned_input = AsyncMock(side_effect=recover)
        with pytest.raises(ComputerError, match="operator_surface_required"):
            await controller.operator_release_owned_input(owner, sid, grant["generation"])
        with pytest.raises(ComputerError, match="stale_generation"):
            await controller.operator_release_owned_input(operator, sid, grant["generation"] + 1)
        result = await controller.operator_release_owned_input(operator, sid, grant["generation"])
        assert result["state"] == ("paused" if released else "quarantined")
        assert result["owned_input_recovery"]["receiver_release_verified"] is False
        assert result["owned_input_recovery"]["released"] is released
        assert not controller._live[sid].observations
    finally:
        await controller.close()
        store.close()


async def test_native_detach_certificate_keeps_ack_and_residual(tmp_path):
    backend = Native()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(context, {"operation": "start"})
        closed = await controller.session(context, {
            "operation": "close", "session_id": grant["session_id"]})
        assert closed["cleanup"]["complete"] is True
        assert closed["cleanup"]["hyprland_owned_connections_closed"] is True
        assert closed["cleanup"]["receiver_release_verified"] is False
    finally:
        await controller.close()
        store.close()


class RecoveryAPI(Controller):
    async def operator_release_owned_input(self, session_id, generation, **actor):
        self.check(**actor)
        self.calls.append(("release_owned_input", session_id, generation))
        result = await super().operator_status(**actor)
        return {**result, "state": "paused", "backend": {
            "platform": "wayland", "environment": "existing_session", "native_backend": "hyprland"
        }, "owned_input_recovery": {"released": True, "receiver_release_verified": False,
                                     "input_revoked": True, "capture_revoked": True}}


@pytest.mark.parametrize("kwargs,status", [
    ({}, 200), ({"enabled": False}, 200), ({"user": None}, 401),
    ({"tier": "user"}, 403), ({"session": None}, 401), ({"session": "other-session"}, 404),
])
async def test_recovery_api_auth_and_truth(kwargs, status):
    controller = RecoveryAPI()
    async with client(controller, **kwargs) as c:
        response = await c.post("/api/computer/release_owned_input", json={
            "session_id": "computer-session", "generation": 8})
        assert response.status == status
        if status == 200:
            result = await response.json()
            assert result["owned_input_recovery"]["receiver_release_verified"] is False
            assert result["backend"]["input_guarantee"] == "hyprland_best_effort"
        else:
            assert controller.calls == []


@pytest.mark.parametrize("body", [
    {}, [], {"session_id": "computer-session", "generation": True},
    {"session_id": "computer-session", "generation": 8, "output": "other"},
])
async def test_recovery_api_no_target_override(body):
    controller = RecoveryAPI()
    async with client(controller) as c:
        response = await c.post("/api/computer/release_owned_input", json=body)
        assert response.status == 400
    assert controller.calls == []
