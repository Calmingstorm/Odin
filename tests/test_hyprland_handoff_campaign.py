"""Durable native-output handoff wiring, without a compositor."""

from types import SimpleNamespace

import pytest

from src.computer.controller import ComputerController
from src.computer.models import BackendCapabilities, ComputerError, RequestContext
from src.computer.runtime.hyprland_backend import HyprlandRuntimeBackend
from src.computer.store import ComputerStore


def _identity():
    return {
        "pid": 42,
        "uid": 1000,
        "start_ticks": 9,
        "exe": "/usr/bin/xed",
        "exe_identity": [1, 2],
    }


def _controller(tmp_path):
    store = ComputerStore(tmp_path / "state.db", tmp_path / "evidence")
    return ComputerController(store, lambda app: None, lambda context: True, enabled=True)


def test_native_start_persists_selected_output_and_exact_application(tmp_path):
    controller = _controller(tmp_path)
    try:
        context = RequestContext("owner", "channel", "turn", "host")
        grant = controller.store.create_session(
            context, platform="wayland", environment="existing_session", backend="hyprland"
        )
        backend = SimpleNamespace(
            hyprland_handoff_binding={
                "output_name": "DP-1",
                "source_id": "opaque-output-7",
                "application_identity": _identity(),
            }
        )
        live = SimpleNamespace(
            capabilities=BackendCapabilities("wayland", "existing_session", backend="hyprland"),
            backend=backend,
        )

        recorded = controller._record_hyprland_start_grant(grant, live)

        assert recorded.output_name == "DP-1"
        assert recorded.source_id == "opaque-output-7"
        assert recorded.application_identity == _identity()
        assert controller.store.hyprland_output_grants(grant.session_id) == (recorded,)
    finally:
        controller.store.close()


def test_hyprland_start_refuses_input_when_native_binding_is_missing(tmp_path):
    controller = _controller(tmp_path)
    try:
        context = RequestContext("owner", "channel", "turn", "host")
        grant = controller.store.create_session(
            context, platform="wayland", environment="existing_session", backend="hyprland"
        )
        live = SimpleNamespace(
            capabilities=BackendCapabilities("wayland", "existing_session", backend="hyprland"),
            backend=SimpleNamespace(hyprland_handoff_binding=None),
        )
        with pytest.raises(ComputerError, match="hyprland_handoff_binding_unavailable"):
            controller._record_hyprland_start_grant(grant, live)
    finally:
        controller.store.close()


def test_backend_keeps_opaque_selected_output_as_delivered_source():
    backend = object.__new__(HyprlandRuntimeBackend)
    backend._selected = "opaque-output-7"
    backend._output = SimpleNamespace(name="DP-1", oriented_size=(1920, 1080))
    backend._application_pin = _identity()
    backend._selected_binding = {"window_id": "window-7", "plugin_epoch": "plugin-3"}
    backend._identity = SimpleNamespace(digest="compositor-2")

    assert backend.sources()[0]["source_id"] == "opaque-output-7"
    assert backend.hyprland_handoff_binding == {
        "output_name": "DP-1",
        "source_id": "opaque-output-7",
        "application_identity": _identity(),
        "window_id": "window-7",
        "plugin_epoch": "plugin-3",
        "compositor_digest": "compositor-2",
    }


