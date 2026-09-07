"""Synthetic adapter contracts. No live display access."""
import base64
from unittest.mock import AsyncMock

import pytest

from src.computer.geometry import AffineTransform
from src.computer.models import ComputerError
from src.computer.runtime import recovery
from src.computer.runtime.x11_attached import X11AttachedBackend


def backend():
    b = X11AttachedBackend(enabled=True, display_name=":177", monitor_names=["fake"],
                           input_enabled=True, app_profile="anything")
    b._started = True
    b._selected = "source"
    b._sources = {"source": {"name": "fake", "width": 100, "height": 80,
                             "seal": "s", "index": 0}}
    return b


def capture(crop=None):
    rect = crop or {"x": 0, "y": 0, "width": 100, "height": 80}
    return {"ok": True, "source_width": 100, "source_height": 80,
            "width": rect["width"], "height": rect["height"], "resize_scale": [1, 1],
            "delivered_to_source": AffineTransform(c=rect["x"], f=rect["y"]).public(),
            "crop": list(crop.values()) if crop else None,
            "input_scope": {"focused": True, "modal_kind": None, "source_origin": [100, 200],
                            "process": {"pid": 20}, "window": 3, "source_rect": [100, 80],
                            "topology": "same"},
            "image": base64.b64encode(b"synthetic-raster").decode()}


def test_generic_input_descriptor():
    b = backend()
    assert b._input_enabled and "app_profile" not in b._config
    descriptor = b.startup_descriptor("generic")
    assert descriptor["no_persistent_devices"] is False
    recovery.validate_descriptor(descriptor, "generic")


@pytest.mark.asyncio
async def test_crop_stable_revision_mapping_and_postcondition(monkeypatch):
    b = backend()
    read = AsyncMock(side_effect=lambda operation, selected=None, crop=None: capture(crop))
    monkeypatch.setattr(b, "_read_worker", read)
    whole = await b.observe()
    crop = {"x": 10, "y": 20, "width": 30, "height": 40}
    frame = await b.observe(crop=crop)
    assert frame.crop == (10, 20, 30, 40)
    assert frame.source.source_revision == whole.source.source_revision
    inject = AsyncMock(return_value={"released": True, "status": "executed"})
    monkeypatch.setattr(b, "_input_worker", inject)
    result = await b.act({"type": "right_click", "x": 2, "y": 3, "source_id": "source",
                          "source_revision": frame.source.source_revision,
                          "consent_generation": 1, "expected": {"type": "visual_change"}})
    assert inject.call_args.args[0]["action"] == {"type": "right_click", "x": 112, "y": 223}
    assert result["postcondition"]["status"] == "observed"
    assert read.call_args.kwargs["crop"] == crop and b._frame is None


@pytest.mark.asyncio
@pytest.mark.parametrize("operation,extra", [
    ("double_click", {"x": 2, "y": 3}), ("middle_click", {"x": 2, "y": 3}),
    ("scroll", {"x": 2, "y": 3, "direction": "left", "count": 20}),
    ("type", {"text": "é日本語"}), ("key", {"chord": "super+Page_Down"}),
    ("polyline", {"points": [[1, 2], [3, 4]], "duration": .2}),
])
async def test_generic_actions(monkeypatch, operation, extra):
    b = backend()
    monkeypatch.setattr(b, "_read_worker", AsyncMock(return_value=capture()))
    frame = await b.observe()
    inject = AsyncMock(return_value={"released": True, "status": "executed"})
    monkeypatch.setattr(b, "_input_worker", inject)
    await b.act({"type": operation, **extra, "source_id": "source",
                 "source_revision": frame.source.source_revision, "consent_generation": 1,
                 "expected": {"type": "visual_change"}})
    assert inject.call_args.args[0]["action"]["type"] == operation


@pytest.mark.asyncio
async def test_topology_and_power_invalidate(monkeypatch):
    b = backend()
    monkeypatch.setattr(b, "_read_worker", AsyncMock(return_value=capture()))
    await b.observe()
    revision = b._revision
    b._topology_event({"ok": True, "event": "topology_changed", "topology_revision": 2,
                       "power_status": "display_asleep", "sources": list(b._sources.values())})
    assert b._frame is None and b._revision > revision
    with pytest.raises(ComputerError, match="display_asleep"):
        await b.observe()


@pytest.mark.asyncio
async def test_persistent_cleanup_crash_unknown(monkeypatch):
    b = backend()
    b._accept_device_receipt({"persistent_input_devices": True, "released": True,
                             "owned_devices": "persistent_idle", "pointer": "independent",
                             "keyboard_focus": "independent_per_window"})
    assert b.capabilities.pointer_separation == "independent"
    assert (await b.detach())["owned_devices"] == "retained_inactive"
    b._device_state = "persistent_release_unverified"
    assert (await b.detach())["state"] == "quarantined"
    descriptor = b.startup_descriptor("crash")
    monkeypatch.setattr(recovery, "_processes_gone", lambda descriptor: None)
    assert await recovery.verify_absence(descriptor) == {
        "status": "unknown", "reason": "persistent_input_state_unproven"}
