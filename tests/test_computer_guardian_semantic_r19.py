"""Execute semantic guardian effects/readback through its actual lease machinery."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import (
    x11_accessibility,
    x11_app_scope,
    x11_attached,
    x11_attached_worker,
    x11_guardian,
    x11_owned_device,
)


@pytest.mark.parametrize(
    "case",
    [
        "success",
        "readback_failed",
        "wrong_target",
        "wrong_observation",
        "restore_rejected",
        "execute_failed",
    ],
)
def test_semantic_effect_is_guarded_readback_is_not_invented(monkeypatch, case):
    from src.computer.runtime.accessibility import PrimitiveError

    native = Mock(independent_pointer=False)
    native.identity.return_value = (71, 72)
    native.held.return_value = {"keys": set(), "buttons": set()}
    native.physical_held.return_value = {"keys": set(), "buttons": set()}
    native.physical_events.return_value = []
    native.owned_release_state.return_value = {"keys": set(), "buttons": set()}
    selected = {"index": 0, "name": "screen"}
    monitor = SimpleNamespace(x=0, y=0, width=100, height=100)
    topology = SimpleNamespace(monitors=[monitor])
    connection = SimpleNamespace(
        power_status=lambda: "on",
        topology=lambda: topology,
        named_sources=lambda *_: [selected],
        _display=object(),
        close=Mock(),
    )
    scope = SimpleNamespace(assert_snapshot=Mock())
    helper = SimpleNamespace(
        process=SimpleNamespace(poll=lambda: None), fence=Mock(return_value=True)
    )
    config = {"display_name": ":991", "xauthority": "", "monitor_names": ["screen"]}
    monkeypatch.setattr(x11_attached, "attachment_configuration", lambda *args: config)
    monkeypatch.setattr(x11_attached, "worker_environment", lambda *args: {})
    monkeypatch.setattr(x11_attached_worker, "AttachedConnection", lambda *args: connection)
    monkeypatch.setattr(x11_app_scope, "AppScope", lambda *args: scope)
    monkeypatch.setattr(x11_owned_device, "open_input", lambda *args, **kwargs: native)
    monkeypatch.setattr(x11_guardian, "InjectionHelper", lambda *args, **kwargs: helper)
    actual = {"text": "before", "text_complete": True}
    observed = []

    def restore(reference, guard):
        guard()
        if case == "restore_rejected":
            raise PrimitiveError("rejected", "stale")

    def execute(action, window, guard, *, before_effect):
        guard()
        before_effect()
        observed.append("effect")
        actual["text"] = action["text"]
        if case == "execute_failed":
            raise PrimitiveError("failed", "readback")

    def read_field(target, window, guard):
        guard()
        assert helper.fence.called
        if case == "readback_failed":
            raise RuntimeError("native readback unavailable")
        return actual.copy()

    accessibility = SimpleNamespace(
        restore=restore, execute=execute, read_field=read_field, close=Mock()
    )
    monkeypatch.setattr(x11_accessibility, "AttachedAccessibility", lambda *args: accessibility)
    request = {
        **config,
        "selected": selected,
        "scope": {"rect": [0, 0, 100, 100], "focus_window": 91},
        "input_mode": "shared",
        "expected_device_identity": (71, 72),
        "action": {
            "type": "replace_field",
            "target": "field",
            "observation_id": "view",
            "text": "after",
        },
        "accessible_reference": {"handle": "field", "observation_id": "view", "window": {}},
    }
    if case == "wrong_target":
        request["action"]["target"] = "other"
    if case == "wrong_observation":
        request["action"]["observation_id"] = "old"
    receipt = x11_guardian.execute(request, controller_fd=None)
    assert receipt["released"] and helper.fence.called
    assert accessibility.close.called and native.close.called and connection.close.called
    if case in {"wrong_target", "wrong_observation", "restore_rejected"}:
        assert receipt["status"] == "unavailable" and not observed
        assert receipt["reason"] == "accessible_target_changed"
        assert receipt["diagnostics"]["steps_completed"] == 0
    elif case == "execute_failed":
        assert receipt["status"] == "unknown" and observed == ["effect"]
        assert receipt["reason"] == "native_field_failed"
        assert receipt["diagnostics"]["steps_completed"] == 0
    else:
        assert receipt["status"] == "executed" and observed == ["effect"]
        assert receipt["diagnostics"]["steps_completed"] == 1
    if case == "success":
        assert receipt["field_observation"] == {
            "target": "field",
            "text": "after",
            "text_complete": True,
        }
    else:
        assert "field_observation" not in receipt
