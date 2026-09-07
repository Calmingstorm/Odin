"""No desktop required: source contract, action mapping and revoke lifecycle."""
import asyncio
import threading
from types import SimpleNamespace

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import wayland_portal as portal
from tests.test_computer_wayland_backend_r8 import action
from tests.test_computer_wayland_backend_r8 import adapter as adapter_fixture

adapter = adapter_fixture


@pytest.mark.asyncio
async def test_stable_capture_and_crop_do_not_change_source_revision(adapter):
    await adapter.start("session1")
    whole = await adapter.observe()
    again = await adapter.observe()
    cropped = await adapter.observe(crop={"x": 10, "y": 8, "width": 30, "height": 20})
    assert whole.source == again.source == cropped.source
    assert (cropped.width, cropped.height) == (30, 20)
    assert cropped.delivered_to_source.map_point(0, 0) == (10, 8)
    await adapter.act(action(cropped, "right_click", x=0, y=0))
    assert adapter._guardian.commands == ["P 273 10.50000000 8.50000000"]
    await adapter.stop()


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,args,prefix", [
    ("double_click", {"x": 10, "y": 10}, "Q 272"),
    ("middle_click", {"x": 10, "y": 10}, "P 274"),
    ("scroll", {"x": 10, "y": 10, "direction": "left", "count": 20}, "W left 20"),
    ("type", {"text": "héλ"}, "T 68c3a9cebb"),
    ("key", {"chord": "super+shift+F12"}, "J super+shift+F12"),
])
async def test_generic_actions(adapter, kind, args, prefix):
    await adapter.start("session1")
    frame = await adapter.observe()
    await adapter.act(action(frame, kind, **args))
    assert adapter._guardian.commands[0].startswith(prefix)
    await adapter.stop()


@pytest.mark.asyncio
async def test_idle_portal_notification_revokes_and_releases(adapter):
    await adapter.start("session1")
    frame = await adapter.observe()
    adapter._portal.lifecycle_callback({"reason": "portal_closed"})
    await asyncio.sleep(0)
    assert adapter._frame is None
    assert not adapter.input_supported
    assert adapter._revision > frame.source.source_revision
    await adapter._lifecycle_task
    assert not adapter._guardian.alive
    with pytest.raises(ComputerError, match="revoked"):
        await adapter.act(action(frame))
    await adapter.stop()


@pytest.mark.asyncio
async def test_old_portal_notification_cannot_revoke_replacement(adapter):
    await adapter.start("session1")
    adapter._portal_event({"reason": "portal_closed"}, SimpleNamespace())
    assert not adapter._paused
    await adapter.stop()


def test_pipewire_parameter_change_fences_but_identical_caps_do_not():
    worker = object.__new__(portal._PortalWorker)
    worker._stream_caps = {}
    worker.alive, worker.generation = True, 1
    worker.cancel = threading.Event()
    events = []
    worker.emit = events.append
    assert worker.stream_parameters(1, "RGB 1920x1080")
    assert worker.stream_parameters(1, "RGB 1920x1080")
    assert worker.stream_parameters(2, "RGB 1280x720")
    assert not events and worker.generation == 1
    assert not worker.stream_parameters(1, "RGB 3840x2160")
    assert worker.cancel.is_set() and not worker.alive
    assert events == [{"event": "fence", "generation": 2,
                       "reason": "pipewire_stream_parameters_changed"}]


@pytest.mark.asyncio
async def test_native_preflight_report_is_not_unknown_outcome(adapter):
    from src.computer.runtime.wayland_guardian import WaylandGuardianError

    await adapter.start("session1")
    frame = await adapter.observe()
    details = {"event": "action_rejected", "reason": "unsupported_character",
               "input_was_sent": False, "characters": [{"index": 0, "codepoint": 128512}]}

    async def reject(command):
        error = WaylandGuardianError("unsupported_character")
        error.details = details
        raise error

    adapter._guardian.act = reject
    receipt = await adapter.act(action(frame, "type", text="😀"))
    assert receipt == {"status": "unavailable", "injected": False, "released": True,
                       "reason": "unsupported_character", "unsupported_characters": [
                           {"index": 0, "codepoint": 128512, "reason": "unsupported_character"}]}
    assert adapter._guardian.alive and not adapter._paused
    assert adapter._frame is None
    await adapter.stop()
