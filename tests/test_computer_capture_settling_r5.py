from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.models import AffineTransform
from src.computer.runtime import x11_attached_worker as worker


@pytest.mark.parametrize("snapshots,expected_captures,passes", [
    ([{"window": 1}, {"window": 2}, {"window": 2}, {"window": 2}], 2, True),
    ([{"window": n} for n in range(6)], 3, False),
    ([None, None], 1, True),  # Capture-only evidence, never an input grant.
])
def test_capture_discards_raced_pixels_without_weakening_binding(
        monkeypatch, snapshots, expected_captures, passes):
    from src.computer.runtime import x11_app_scope

    selected = {"index": 0}
    connection = Mock(spec=worker.AttachedConnection, _display=object())
    connection.named_sources.return_value = [selected]
    backend = Mock(_connection=connection)
    backend.topology.return_value = SimpleNamespace(monitors=[object()], event_revision=1)
    backend.power_status.return_value = "on"
    frames = [SimpleNamespace(source=SimpleNamespace(pixel_width=100, pixel_height=100),
        width=100, height=100, delivered_to_source=AffineTransform(), resize_scale=(1, 1),
        image_bytes=bytes([n]), crop=None) for n in range(3)]
    backend.capture.side_effect = frames
    scope = Mock()
    scope.snapshot.side_effect = snapshots
    scope.inspect.return_value = (None, "application_scope_unavailable")
    monkeypatch.setattr(worker, "X11MonitorCapture", lambda *a, **k: backend)
    monkeypatch.setattr(x11_app_scope, "AppScope", lambda *a: scope)
    monkeypatch.setattr(worker.time, "sleep", lambda _: None)
    request = {"display_name": ":177", "xauthority": "/dev/null", "monitor_names": ["screen"],
               "app_profile": "xed", "input_enabled": True, "operation": "capture",
               "selected": selected}
    if passes:
        reply = worker.run(request)
        import base64
        assert base64.b64decode(reply["image"]) == frames[expected_captures - 1].image_bytes
        assert reply["input_scope"] == snapshots[-1]
    else:
        with pytest.raises(ValueError, match="application changed during capture"):
            worker.run(request)
    assert backend.capture.call_count == expected_captures
    backend.close.assert_called_once()
