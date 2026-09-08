"""Real-scope admission failures stay observable, never become input authority."""

# ruff: noqa: F811 - imported pytest fixture
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.controller import ComputerController
from src.computer.runtime import x11_app_scope as scope
from src.computer.runtime import x11_attached_worker as worker
from src.computer.runtime.x11_attached import AttachedFailure, X11AttachedBackend
from tests.test_computer_operator_auth_r5 import harness
from tests.test_computer_x11_app_scope_r5 import app  # noqa: F401 - shared fixture


@pytest.mark.parametrize("reason", sorted(scope.SCOPE_REASONS))
def test_static_scope_reasons_are_retained(app, monkeypatch, reason):
    _, checker, monitor = app

    def fail(*args):
        raise scope.ScopeFailure(reason)

    monkeypatch.setattr(checker, "_snapshot", fail)
    assert checker.inspect(monitor) == (None, reason)
    assert checker.snapshot(monitor) is None


@pytest.mark.parametrize(
    "error,reason",
    [
        (PermissionError("private proc path"), "application_process_unreadable"),
        (ValueError("private window title"), "application_scope_unavailable"),
        (scope.ScopeFailure("unrecognized private data"), "application_scope_unavailable"),
    ],
)
def test_exception_text_never_leaves_scope(app, monkeypatch, error, reason):
    _, checker, monitor = app

    def fail(*args):
        raise error

    monkeypatch.setattr(checker, "_snapshot", fail)
    assert checker.inspect(monitor) == (None, reason)


@pytest.mark.asyncio
@pytest.mark.parametrize("eligible", [True, False])
async def test_start_selects_eligible_monitor_and_reports_real_readiness(monkeypatch, eligible):
    backend = X11AttachedBackend(
        enabled=True,
        display_name=":177",
        xauthority="/dev/null",
        monitor_names=["left", "right"],
        input_enabled=True,
    )
    monitors = [
        {"name": name, "index": i, "width": 800, "height": 600}
        for i, name in enumerate(["left", "right"])
    ]
    calls = []

    async def read(operation, **kwargs):
        calls.append(operation)
        if operation == "sources":
            return {"sources": monitors}
        if operation == "scope_readiness":
            return {
                "scope_readiness": [
                    {
                        "name": "left",
                        "eligible": False,
                        "reason": "focused_application_outside_source",
                    },
                    {
                        "name": "right",
                        "eligible": eligible,
                        "reason": None if eligible else "application_uid_mismatch",
                    },
                ]
            }
        assert operation == "input_capabilities"
        return {
            "released": True,
            "pointer": "shared",
            "keyboard_focus": "shared",
            "persistent_input_devices": False,
            "owned_devices": "not_created",
            "device_identity": [11, 12],
        }

    monkeypatch.setattr(backend, "_read_worker", read)
    monkeypatch.setattr(backend, "_start_device_lifecycle", lambda: read("input_capabilities"))
    monkeypatch.setattr(backend, "_start_topology", AsyncMock())
    result = await backend.start("r13-scope-fixture")
    assert result["input_supported"] is eligible
    assert result["capture_only"] is not eligible
    assert result["input_readiness"] == ("target_available" if eligible else "no_input_target")
    assert backend._sources[backend._selected]["name"] == ("right" if eligible else "left")
    assert calls == ["sources", "scope_readiness", "input_capabilities"]
    # A readiness boolean cannot replace pixel-bound evidence.
    with pytest.raises(AttachedFailure, match="fresh_app_scoped_observation_required"):
        await backend.act({"type": "click"})
    await backend.detach()


def test_readiness_is_not_denied_by_application_name(app):
    display, checker, monitor = app
    display.windows[20].props["WM_CLASS"] = b"terminal"
    binding, reason = checker.inspect(monitor)
    assert binding["focused"] is True
    assert reason is None


@pytest.mark.parametrize(
    "state,age,expected",
    [
        ("active", 0, "target_available"),
        ("active", 6, "observation_required"),
        ("paused", 0, "inactive"),
        ("cancelled", 0, "inactive"),
    ],
)
def test_controller_readiness_never_reuses_expired_or_inactive_authority(state, age, expected):
    owner = SimpleNamespace(monotonic=lambda: 100)
    live = SimpleNamespace(
        revoked=False,
        backend=SimpleNamespace(
            input_readiness="target_available", input_supported=True, input_blocker=None
        ),
        observations={"one": SimpleNamespace(captured_at=100 - age)},
    )
    result = ComputerController._input_status(owner, live, SimpleNamespace(state=state))
    assert result["input_readiness"] == expected
    assert result["input_supported"] is (expected == "target_available")


@pytest.mark.parametrize(
    "blocker,visible", [("application_uid_mismatch", True), ("private process details", False)]
)
async def test_http_retains_only_known_scope_failure_reasons(tmp_path, blocker, visible):
    async with harness(tmp_path) as h:
        original = h.backend.operator_status

        async def status(**actor):
            return {
                **await original(**actor),
                "backend": {
                    "platform": "x11",
                    "environment": "existing_session",
                    "input_supported": False,
                    "readiness": "no_input_target",
                    "input_blocker": blocker,
                },
            }

        h.backend.operator_status = status
        response = await h.client.get("/api/computer", headers=h.headers)
        assert response.status == 200
        backend = (await response.json())["backend"]
        assert backend["input_supported"] is False
        assert backend["readiness"] == "no_input_target"
        assert ("input_blocker" in backend) is visible
        if visible:
            assert backend["input_blocker"] == blocker


def test_worker_readiness_discovers_targets_without_capture_or_input(monkeypatch):
    selected = [{"index": 0, "name": "left"}, {"index": 1, "name": "right"}]
    connection = Mock(spec=worker.AttachedConnection, _display=object())
    connection.named_sources.return_value = selected
    capture = Mock(_connection=connection)
    monitors = [object(), object()]
    capture.topology.return_value = SimpleNamespace(monitors=monitors, event_revision=1)
    capture.power_status.return_value = "on"
    checker = Mock()
    checker.inspect.side_effect = [
        (None, "focused_application_outside_source"),
        ({"private_native_id": 123}, None),
    ]
    monkeypatch.setattr(scope, "AppScope", lambda *_: checker)
    reply = worker.run(
        {
            "display_name": ":177",
            "xauthority": "/dev/null",
            "monitor_names": ["left", "right"],
            "operation": "scope_readiness",
        },
        capture,
    )
    assert reply["scope_readiness"] == [
        {"name": "left", "eligible": False, "reason": "focused_application_outside_source"},
        {"name": "right", "eligible": True, "reason": None},
    ]
    capture.capture.assert_not_called()
    capture.close.assert_not_called()
    assert "private_native_id" not in str(reply)
