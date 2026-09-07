"""Real attached adapter/controller grounding with fake native I/O; no display."""
import asyncio
import base64
import copy
from contextlib import asynccontextmanager
from dataclasses import replace
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from PIL import Image

from src.computer.controller import ComputerController
from src.computer.geometry import AffineTransform
from src.computer.models import ComputerError, RequestContext
from src.computer.runtime.x11_attached import X11AttachedBackend
from src.computer.store import ComputerStore


def raster(value):
    image = Image.new("RGB", (20, 10))
    image.putpixel((5, 5), (value, value, value))
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


@asynccontextmanager
async def fixture(tmp_path, monkeypatch, *, environment="existing_session", platform="x11",
                  deliver=True):
    async def forbidden(*args, **kwargs):
        pytest.fail("grounding test attempted native child launch")
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    backend = X11AttachedBackend(enabled=True, display_name=":177",
                                 monitor_names=["fixture"], app_profile="xed",
                                 input_enabled=True)
    backend.capabilities = replace(backend.capabilities, environment=environment, platform=platform)
    state = {"image": raster(0), "binding": {
        "focused": True, "modal": False, "modal_kind": None,
        "process": {"pid": 17, "start_ticks": 300}, "window": 90,
        "focus_window": 90, "focus_path": [90], "focus_metadata": ["native"],
        "topology": "fixture", "source_rect": [100, 200, 40, 20],
        "transient_chain": [], "transient_metadata": [],
        "rect": [100, 200, 40, 20], "source_origin": [100, 200]}}
    monitor = {"name": "fixture", "width": 40, "height": 20, "index": 0}
    calls = []

    async def read(operation, **kwargs):
        if operation == "sources":
            return {"sources": [monitor]}
        if operation == "scope_readiness":
            return {"scope_readiness": [{"name": "fixture", "eligible": True, "reason": None}]}
        if operation == "input_capabilities":
            return {"released": True, "pointer": "shared", "keyboard_focus": "shared",
                    "persistent_input_devices": False, "owned_devices": "not_created",
                    "device_identity": [11, 12]}
        return {"source_width": 40, "source_height": 20, "width": 20, "height": 10,
                "resize_scale": [1, 2],
                "delivered_to_source": AffineTransform(a=2, e=2).public(),
                "input_scope": copy.deepcopy(state["binding"]),
                "image": base64.b64encode(state["image"]).decode()}

    async def inject(request):
        assert store.db.execute("SELECT status FROM receipts").fetchone()[0] == "pending"
        calls.append(request)
        state["image"] = raster(255)
        return {"status": "executed", "injected": True, "released": True}

    async def pause():
        state["paused"] = True
        return {"released": True}

    async def stop():
        return {"stopped": True, "released": True, "applications_preserved": True,
                "input_revoked": True, "capture_revoked": True, "owned_devices": "none_created"}

    monkeypatch.setattr(backend, "_read_worker", read)
    monkeypatch.setattr(backend, "_start_device_lifecycle", lambda: read("input_capabilities"))
    monkeypatch.setattr(backend, "_start_topology", AsyncMock())
    monkeypatch.setattr(backend, "_input_worker", inject)
    monkeypatch.setattr(backend, "pause", pause)
    monkeypatch.setattr(backend, "detach", stop)
    monkeypatch.setattr(backend, "stop", stop)
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    try:
        start = {"operation": "start"}
        if environment == "isolated":
            start["app"] = "xed"
        grant = await controller.session(context, start)
        observed = await controller.observe(context, {"session_id": grant["session_id"],
                                                       "generation": 1})
        obs = controller._live[grant["session_id"]].observations[observed["observation_id"]]
        if deliver:
            await controller.validate_observation_delivery(
                context, obs.frame_metadata, obs.image_sha256)
        action = {"session_id": grant["session_id"], "generation": 1,
                  "consent_generation": 1, "source_id": obs.source.source_id,
                  "source_revision": obs.source.source_revision, "action_id": "one",
                  "observation_id": obs.observation_id, "expect": {"type": "visual_change"}}
        state["image"] = raster(128)
        yield controller, context, action, state, calls
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("environment", ["existing_session", "isolated"])
@pytest.mark.parametrize("operation,fields", [
    ("type", {"text": "scratch note"}), ("key", {"key": "Right"}),
    ("click", {"x": 2, "y": 2}),
    ("drag", {"points": [[2, 2], [3, 3]], "duration": .1}),
])
async def test_changed_pixels_keyboard_only_and_no_replay(tmp_path, monkeypatch, environment,
                                                         operation, fields):
    async with fixture(tmp_path, monkeypatch, environment=environment) as rig:
        c, ctx, action, _, calls = rig
        action.update(operation=operation, **fields)
        if environment == "existing_session" and operation in {"type", "key", "click"}:
            result = await c.act(ctx, action)
            assert result["status"] == "verified"
            assert result["verification"]["scope"] == "raster_change_only"
            assert await c.act(ctx, action) == result
            assert len(calls) == 1
        else:
            with pytest.raises(ComputerError, match="visual_target_changed"):
                await c.act(ctx, action)
            assert calls == []
            assert c.store.db.execute("SELECT count(*) FROM receipts").fetchone()[0] == 0


@pytest.mark.parametrize("operation,fields", [
    ("type", {"text": "note"}), ("key", {"key": "Right"})])
@pytest.mark.parametrize("change", [
    {"rect": [101, 200, 40, 20]}, {"window": 91},
    {"process": {"pid": 17, "start_ticks": 301}},
    {"process": {"pid": 18, "start_ticks": 400}},
    {"focus_window": 91}, {"focus_path": [90, 91]}, {"focus_metadata": ["changed"]},
    {"focused": False}, {"source_rect": [101, 200, 40, 20]},
    {"source_origin": [101, 200]}, {"topology": "changed"},
    {"transient_chain": [91]}, {"transient_metadata": ["changed"]},
    {"modal": True, "modal_kind": "safe_application"},
    {"modal": True, "modal_kind": "unrecognized"},
])
async def test_changed_native_scope_rejects_before_injection(tmp_path, monkeypatch, operation,
                                                           fields, change):
    async with fixture(tmp_path, monkeypatch) as (c, ctx, action, state, calls):
        action.update(operation=operation, **fields)
        state["image"] = raster(0)  # Same pixels cannot authorize another app/window.
        state["binding"].update(change)
        with pytest.raises(ComputerError, match="stale_source_binding"):
            await c.act(ctx, action)
        assert calls == []
        assert c.store.db.execute("SELECT count(*) FROM receipts").fetchone()[0] == 0
        if change.get("modal"):
            assert state["paused"]
            assert c.store.get_session(action["session_id"]).state == "paused"


async def test_changed_pixels_does_not_bypass_delivery(tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch, deliver=False) as (c, ctx, action, _, calls):
        action.update(operation="type", text="note")
        with pytest.raises(ComputerError, match="observation_not_delivered"):
            await c.act(ctx, action)
        assert calls == []


@pytest.mark.parametrize("operation,fields", [
    ("type", {"text": "note"}), ("key", {"key": "Right"})])
async def test_other_platform_keyboard_keeps_full_raster_gate(
        tmp_path, monkeypatch, operation, fields):
    async with fixture(tmp_path, monkeypatch, platform="wayland") as (c, ctx, action, _, calls):
        action.update(operation=operation, **fields)
        with pytest.raises(ComputerError, match="visual_target_changed"):
            await c.act(ctx, action)
        assert calls == []
