"""Production controller/native adapter; synthetic OS transports, not live acceptance."""
# ruff: noqa: F811

from dataclasses import replace
from types import SimpleNamespace

import pytest

from src.computer.grounding import native_keyboard_focus_trusted
from tests.computer.test_hyprland_backend import scope
from tests.test_computer_hyprland_turnloop_r33 import (
    action,
    normal,  # noqa: F401
    observe,
    start,
)
from tests.test_hyprland_multiturn_drawing import (
    clean,
    commands,
    drawing,  # noqa: F401
    invoke,
)


def plan(normal, grant, *, suffix="", last_operation="key"):
    binding = action(normal, grant)
    for key in ("x", "y", "expect"):
        binding.pop(key)
    last = {"key": "shift+BackSpace"} if last_operation == "key" else {"x": 2, "y": 2}
    return dict(binding, operation="sequence", action_id="plan" + suffix, steps=[
        {"action_id": "click" + suffix, "operation": "click", "x": 2, "y": 2,
         "expect": {"type": "visual_change"}},
        {"action_id": "shortcut" + suffix, "operation": last_operation, **last,
         "expect": {"type": "visual_change"}},
    ])


async def test_click_then_shift_backspace_across_pixel_redraw_and_no_replay(normal):
    grant = await start(normal)
    controller = normal.service.controller
    context = normal.service._context(normal.state)
    for index in range(2):
        await observe(normal, grant)
        inp = plan(normal, grant, suffix=str(index))
        result = await controller.act(context, inp)
        assert result["status"] == "verified", result
        assert len(normal.transports[0].commands) == (index + 1) * 2
        assert "BackSpace" in str(normal.transports[0].commands[-1])
        await controller.act(context, inp)
        assert len(normal.transports[0].commands) == (index + 1) * 2


async def test_sequences_survive_clean_pause_resume_and_new_session(drawing):
    rig = drawing
    controller = rig.service.controller
    for cycle in range(2):
        await observe(rig, rig.grant)
        inp = plan(rig, rig.grant, suffix=f"cycle-{cycle}")
        before = commands(rig)
        result = await invoke(rig, "computer_act", **inp)
        assert commands(rig) == before + 2, result
        assert "Image loaded" in result["content"], result
        clean(rig)
        sid = rig.grant["session_id"]
        await invoke(rig, "computer_session", operation="pause", **rig.grant)
        paused = controller.store.get_session(sid)
        assert paused.state == "paused"
        rig.grant["generation"] = paused.generation
        rig.state._req_id = f"keyboard-resume-{cycle}"
        await invoke(rig, "computer_session", operation="resume", **rig.grant)
        current = controller.store.get_session(sid)
        assert current.state == "active"
        rig.grant["generation"] = current.generation
        before = commands(rig)
        await invoke(rig, "computer_act", **inp)
        assert commands(rig) == before
    await invoke(rig, "computer_session", operation="close", **rig.grant)
    assert controller.store.get_session(sid).state == "closed"
    rig.state._req_id = "keyboard-new-session"
    await invoke(rig, "computer_session", operation="start")
    fresh = controller.store.find_session(rig.service._context(rig.state))
    assert fresh.session_id != sid and fresh.state == "active"
    rig.grant = {"session_id": fresh.session_id, "generation": fresh.generation}
    await observe(rig, rig.grant)
    before = commands(rig)
    result = await invoke(rig, "computer_act", **plan(rig, rig.grant, suffix="fresh"))
    assert commands(rig) == before + 2, result
    assert "Image loaded" in result["content"], result
    clean(rig)
    assert not rig.recovery


@pytest.mark.parametrize("change", [
    "focus_digest", "bounds_digest", "source_digest", "application", "modal",
    "native_wayland", "authenticated", "safe_focus",
])
async def test_click_then_shortcut_rejects_real_binding_changes(normal, monkeypatch, change):
    grant = await start(normal)
    await observe(normal, grant)
    inp = plan(normal, grant)
    controller = normal.service.controller
    backend = controller._live[grant["session_id"]].backend

    async def snapshot(metadata):
        value = scope()
        if normal.transports[0].commands:
            if change == "application":
                value[change]["pid"] += 1
            elif change == "modal":
                value[change] = True
            elif change in {"native_wayland", "authenticated", "safe_focus"}:
                value[change] = False
            else:
                value[change] = "d" * 64
        return value

    monkeypatch.setattr(backend._scope_provider, "snapshot", snapshot)
    result = await controller.act(normal.service._context(normal.state), inp)
    assert result["status"] != "verified", result
    assert len(normal.transports[0].commands) == 1
    await controller.act(normal.service._context(normal.state), inp)
    assert len(normal.transports[0].commands) == 1


async def test_pointer_step_still_rejects_changed_anchor(normal):
    grant = await start(normal)
    await observe(normal, grant)
    result = await normal.service.controller.act(
        normal.service._context(normal.state), plan(normal, grant, last_operation="click")
    )
    assert result["status"] != "verified", result
    assert len(normal.transports[0].commands) == 1


@pytest.mark.parametrize("change", [
    "backend_label_only", "revoked", "paused", "closed", "release_failed", "owner",
    "frame", "stale", "focus", "geometry", "modal", "generation", "consent",
])
async def test_predicate_requires_current_native_evidence(normal, change):
    grant = await start(normal)
    await observe(normal, grant)
    controller = normal.service.controller
    live = controller._live[grant["session_id"]]
    original = live.observations[controller._delivered_observations[grant["session_id"]]]
    current = replace(original, image_sha256="pixel-only-redraw")
    stored = controller.store.get_session(grant["session_id"])
    now = controller.monotonic()
    assert native_keyboard_focus_trusted(stored, live, original, current, now=now)
    # Copy adapter state so teardown of the actual fixture remains unaffected.
    candidate = replace(live)
    backend = object.__new__(type(live.backend))
    backend.__dict__.update(live.backend.__dict__)
    candidate.backend = backend
    if change == "backend_label_only":
        candidate.backend = SimpleNamespace(**backend.__dict__)
    elif change == "revoked":
        candidate.revoked = True
    elif change in {"paused", "closed", "release_failed"}:
        setattr(backend, "_" + change, True)
    elif change == "owner":
        backend._owner_handle = None
    elif change == "frame":
        backend._frame = None
    elif change == "stale":
        now += 60
    elif change == "focus":
        current = replace(current, focused=False)
    elif change == "geometry":
        current = replace(current, width=current.width + 1)
    elif change == "modal":
        current = replace(current, modal="new-dialog", modal_kind="safe_application")
    elif change == "generation":
        current = replace(current, generation=current.generation + 1)
    elif change == "consent":
        current = replace(current, source=replace(current.source, consent_generation=2))
    assert not native_keyboard_focus_trusted(stored, candidate, original, current, now=now)
