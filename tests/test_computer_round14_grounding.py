"""Live-round regression pins. No real desktop, input or host privileges."""
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from PIL import Image, ImageDraw

from src.computer.grounding import pointer_target_stable
from src.computer.models import ComputerError
from src.computer.runtime.x11_attached import AttachedFailure, X11AttachedBackend
from tests.test_computer_keyboard_grounding_r6 import fixture


def raster(rect=None, *, color="black", size=(160, 100)):
    image = Image.new("RGB", size, "white")
    if rect:
        ImageDraw.Draw(image).rectangle(rect, fill=color)
    stream = BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()


@pytest.mark.parametrize("rect", [(145, 0, 155, 12), (80, 45, 80, 59)])
def test_unrelated_animation_and_thin_caret_do_not_reject_target(rect):
    assert pointer_target_stable(raster(), raster(rect), 80, 50)


@pytest.mark.parametrize("rect", [(65, 45, 95, 59), (65, 45, 75, 50)])
def test_changed_button_or_small_label_remains_rejected(rect):
    assert not pointer_target_stable(raster(), raster(rect), 80, 50)


def test_edge_bounds_dimensions_encoding_and_noise():
    assert pointer_target_stable(raster(), raster(), 0, 0)
    assert pointer_target_stable(raster(), raster((65, 45, 95, 59), color="#f8f8f8"), 80, 50)
    assert not pointer_target_stable(raster(), raster(size=(161, 100)), 80, 50)
    assert not pointer_target_stable(raster(), raster(), 160, 50)
    with pytest.raises(ComputerError, match="visual_target_unavailable"):
        pointer_target_stable(b"bad", raster(), 1, 1)


@pytest.mark.parametrize("operation", ["click", "double_click", "right_click", "middle_click",
                                        "scroll"])
async def test_controller_attached_click_tolerates_caret_and_preserves_once_only(
        tmp_path, monkeypatch, operation):
    async with fixture(tmp_path, monkeypatch) as (controller, ctx, action, state, calls):
        action.update(operation=operation, x=2, y=2)
        if operation == "scroll":
            action.update(direction="down", count=1)
        result = await controller.act(ctx, action)
        assert result["status"] == "verified"
        assert result["execution"] == {"injected": True, "released": True}
        assert len(calls) == 1
        assert await controller.act(ctx, action) == result


@pytest.mark.parametrize("change", ["pixels", "focus"])
async def test_changed_target_and_focus_are_not_authorized(tmp_path, monkeypatch, change):
    async with fixture(tmp_path, monkeypatch) as (controller, ctx, action, state, calls):
        action.update(operation="click", x=2, y=2)
        if change == "pixels":
            state["image"] = raster(size=(20, 10))
        else:
            state["binding"]["window"] = 91
        with pytest.raises(ComputerError, match=("visual_target_changed" if change == "pixels"
                                                else "stale_source_binding")):
            await controller.act(ctx, action)
        assert not calls


async def test_four_monitors_follow_focus_only_for_new_observation(monkeypatch):
    backend = X11AttachedBackend(enabled=True, display_name=":177",
        monitor_names=["DP-4", "HDMI-0", "DP-0", "DP-2"], input_enabled=True)
    backend._started = True
    backend._sources = {str(i): {"name": name} for i, name in enumerate(
        ["DP-4", "HDMI-0", "DP-0", "DP-2"])}
    backend._selected = "2"
    active = set()
    async def read(operation, **kwargs):
        assert operation == "scope_readiness"
        return {"scope_readiness": [{"name": m["name"], "eligible": sid in active}
                                    for sid, m in backend._sources.items()]}
    monkeypatch.setattr(backend, "_read_worker", read)
    for sid in ("0", "1", "2", "3"):
        active.clear()
        active.add(sid)
        await backend.follow_focus()
        assert backend._selected == sid
        assert backend._frame is None
        assert not backend.input_supported
    active.update({"0", "1"})
    await backend.follow_focus()
    assert backend._selected == "3"  # Spanning window must not oscillate sources.
    active.clear()
    await backend.follow_focus()
    assert backend._selected == "3"
    await backend.select_source("1")
    assert backend._selected == "1"
    backend._paused = True
    with pytest.raises(AttachedFailure, match="capture_not_active"):
        await backend.follow_focus()


@pytest.mark.parametrize("rows", [None, [], [{"name": "one", "eligible": "yes"}],
                                     [{"name": "other", "eligible": True}]])
async def test_focus_selection_validates_readiness_rows(monkeypatch, rows):
    backend = X11AttachedBackend(enabled=True, display_name=":177",
        monitor_names=["one"], input_enabled=True)
    backend._started = True
    backend._sources = {"1": {"name": "one"}}
    backend._selected = "1"
    monkeypatch.setattr(backend, "_read_worker", AsyncMock(return_value={"scope_readiness": rows}))
    with pytest.raises(AttachedFailure, match="scope_readiness_unavailable"):
        await backend.follow_focus()


async def test_explicit_selection_wins_and_action_revalidation_never_follows_focus(
        tmp_path, monkeypatch):
    async with fixture(tmp_path, monkeypatch) as (controller, ctx, action, state, calls):
        backend = controller._live[action["session_id"]].backend
        follow = AsyncMock()
        monkeypatch.setattr(backend, "follow_focus", follow)
        args = {"session_id": action["session_id"], "generation": 1}
        observed = await controller.observe(ctx, args)
        follow.assert_awaited_once()
        assert observed["sources"][0]["source_id"] == observed["source"]["source_id"]
        observed = await controller.observe(
            ctx, {**args, "source_id": observed["source"]["source_id"]})
        follow.assert_awaited_once()
        obs = controller._live[action["session_id"]].observations[observed["observation_id"]]
        await controller.validate_observation_delivery(ctx, obs.frame_metadata, obs.image_sha256)
        action.update(operation="click", x=2, y=2,
                      observation_id=obs.observation_id, source_revision=obs.source.source_revision)
        await controller.act(ctx, action)
        follow.assert_awaited_once()
        assert len(calls) == 1


async def test_capture_only_does_not_query_input_readiness(monkeypatch):
    backend = X11AttachedBackend(enabled=True, display_name=":177", monitor_names=["one"])
    backend._started = True
    read = AsyncMock()
    monkeypatch.setattr(backend, "_read_worker", read)
    await backend.follow_focus()
    read.assert_not_called()
