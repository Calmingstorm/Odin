"""Fake-only focus admission: no X server or live desktop is used."""

from types import SimpleNamespace

import pytest

from src.computer.runtime import x11_guardian as guardian
from src.computer.runtime.x11_app_scope import AppScope, ScopeFailure
from src.computer.runtime.x11_attached import X11AttachedBackend


class FakeScope:
    def __init__(self, binding):
        self.binding = binding
        self.refuse = None
        self.focused = False
        self.point_checks = []

    def focus_candidates(self, monitor):
        return [self.binding]

    def _window(self, wid):
        return wid

    def _snapshot(self, monitor, *, candidate, allow_unfocused):
        return {**self.binding, "focused": self.focused}

    def assert_focus_candidate(self, token, monitor, point, **kw):
        self.point_checks.append((point, kw))
        if self.refuse:
            raise ScopeFailure(self.refuse)
        assert token == X11AttachedBackend._binding_token(self.binding)
        return self.binding

    def snapshot(self, monitor):
        return {**self.binding, "focused": self.focused}


class FakeNative:
    independent_pointer = False
    keyboard_mapping_identity = "fake"

    def __init__(self):
        self.position = (0, 0)
        self.closed = False

    def identity(self):
        return "fake-device"

    def pointer(self):
        return self.position

    def query_pointer(self, wid):
        return None

    def owned_release_state(self):
        return {"buttons": set(), "keys": set()}

    def close(self):
        self.closed = True


@pytest.fixture
def fake(monkeypatch):
    binding = {
        "window": 11, "focus_window": 11, "keyboard_focus": 99,
        "rect": [100, 200, 600, 400], "window_rect": [100, 200, 600, 400],
        "focused": False, "modal": False, "window_kind": "normal",
    }
    scope = FakeScope(binding)
    native = FakeNative()
    helper = SimpleNamespace(process=SimpleNamespace(poll=lambda: 0))
    monkeypatch.setattr("src.computer.runtime.x11_owned_device.open_input", lambda *a, **k: native)
    monkeypatch.setattr(guardian, "InjectionHelper", lambda *a, **k: helper)
    monkeypatch.setattr(guardian, "assert_admitted_identity", lambda *a: None)
    monkeypatch.setattr("src.computer.runtime.x11_attached.worker_environment", lambda *a: {})
    connection = SimpleNamespace(power_status=lambda: "on", topology=lambda: "topology")
    request = {
        "action": {"type": "focus", "x": 340, "y": 370},
        "expected_candidate": X11AttachedBackend._binding_token(binding),
        "expected_keyboard_focus": 99, "input_mode": "shared",
        "expected_device_identity": "fake-device",
    }
    return scope, native, connection, request


@pytest.mark.parametrize("change", ["window", "geometry", "focus", "close", "overlay"])
def test_focus_preflight_mismatch_never_dispatches(fake, monkeypatch, change):
    scope, native, connection, request = fake
    monkeypatch.setattr(guardian, "Guardian", lambda *a, **kw: pytest.fail("dispatched"))
    if change == "window":
        scope.binding["window"] = 12
    elif change == "geometry":
        scope.binding["window_rect"] = [110, 200, 600, 400]
    elif change == "focus":
        scope.binding["keyboard_focus"] = 98
    elif change == "close":
        request["action"]["y"] = 215
    else:
        scope.binding["modal"] = True
    result = guardian._focus_only(
        request, {"display_name": ":177", "xauthority": "fake"},
        connection, "topology", SimpleNamespace(), scope,
        controller_fd=0, authorize=None,
    )
    assert result["injected"] is False and result["status"] == "unavailable"
    assert native.closed is False


@pytest.mark.parametrize("refuse", [None, "focus_anchor_unsafe", "application_scope_changed"])
def test_focus_guard_checks_anchor_before_button_and_postfocus(fake, monkeypatch, refuse):
    scope, native, connection, request = fake
    scope.refuse = refuse
    events = []

    class SimulatedGuardian:
        def __init__(self, native, helper, validate, **kwargs):
            self.validate = validate

        def run(self, steps):
            for step in steps:
                self.validate(step)
                events.append(step)
                if step[0] == "move":
                    native.position = step[1:]
                elif step == ("button", 1, False):
                    scope.focused = True
            return {"status": "executed", "injected": True, "released": True}

    monkeypatch.setattr(guardian, "Guardian", SimulatedGuardian)
    if refuse:
        with pytest.raises(ScopeFailure, match=refuse):
            guardian._focus_only(request, {"display_name": ":177", "xauthority": "fake"},
                                 connection, "topology", SimpleNamespace(), scope,
                                 controller_fd=0, authorize=None)
        assert events == [("move", 340, 370)]  # No button-down.
    else:
        result = guardian._focus_only(
            request, {"display_name": ":177", "xauthority": "fake"},
            connection, "topology", SimpleNamespace(), scope,
            controller_fd=0, authorize=None,
        )
        assert result["focus_confirmed"] is True
        assert result["focus_confirmed_binding"] == request["expected_candidate"]
        assert len(scope.point_checks) == 2


def test_close_strip_is_rejected_by_native_hit_guard(monkeypatch):
    from src.computer.runtime import x11_app_scope

    scope = AppScope.__new__(AppScope)
    scope.connection = SimpleNamespace(screen=lambda: SimpleNamespace(root=SimpleNamespace(id=1)))
    scope._topology = lambda root, monitor: ([0, 0, 800, 600], None)
    scope._snapshot = lambda monitor, **kwargs: {
        "window_rect": [100, 100, 600, 400], "window_kind": "normal",
        "focused": False, "modal": False, "keyboard_focus": 99,
    }
    monkeypatch.setattr(x11_app_scope, "_xid", lambda window: getattr(window, "id", window))
    window = SimpleNamespace(id=11)
    scope._window = lambda wid: window
    def pointer(wid):
        return SimpleNamespace(same_screen=True, root_x=150, root_y=130,
                               child=window if wid == 1 else None)
    token = X11AttachedBackend._binding_token(scope._snapshot(None))
    with pytest.raises(ScopeFailure, match="focus_anchor_unsafe"):
        scope.assert_focus_candidate(token, None, (150, 130), pointer_query=pointer,
                                     expected_keyboard_focus=99)
