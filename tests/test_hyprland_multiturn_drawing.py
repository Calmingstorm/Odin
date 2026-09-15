"""Composed real Hyprland/controller/store/delivery tests with fake native IO.

These are not native receiver or live Discord qualification.
"""
# ruff: noqa: F811
import copy
import json

import pytest

from src.computer.models import ComputerError
from src.computer.runtime import hyprland_backend as hb
from tests.computer.test_hyprland_backend import native, scope
from tests.test_computer_hyprland_turnloop_r33 import (
    NativeTransport,
    action,
    call,
    normal,  # noqa: F401 - shared pytest fixture
    observe,
    start,
)


@pytest.fixture
async def drawing(normal, monkeypatch):
    grant = await start(normal)
    backend = normal.service.controller._live[grant["session_id"]].backend
    scene = dict(modal=False, serial=1, shade=0, documents=0)
    selected = dict(instance_id="i1-" + "a" * 32, plugin_epoch="b" * 48,
        window_id="canvas-root", output_name="DP-1", output_id=backend._selected,
        output={"x": -800, "y": 20, "width": 80, "height": 60,
                "pixel_width": 8, "pixel_height": 6, "scale": 0.1, "transform": 0},
        identity={"pid": 1234, "uid": 1000, "start_ticks": 100,
                  "executable": "/usr/bin/test", "exe_device": 1, "exe_inode": 2})
    backend._selected_binding = copy.deepcopy(selected)
    provider_class = type(backend._scope_provider)
    monkeypatch.setattr(provider_class, "socket_path", "/run/user/1000/fixture.sock", raising=False)

    async def focused(self, binding, **kwargs):
        return copy.deepcopy(selected)

    group_proof = (
        {"token": "g" * 48, "epoch": 1,
         "member_tokens": ["canvas-root", "[REDACTED]"]},
        {"application": scope()["application"], "plugin_epoch": "b" * 48},
    )

    def export_group(self):
        return copy.deepcopy(group_proof)

    def import_group(self, proof):
        assert proof == group_proof

    backend._application_group_proof = copy.deepcopy(group_proof)

    async def snapshot(self, metadata):
        return dict(scope(plugin_epoch="b" * 48, native_scope_serial=scene["serial"],
            surface_token="new-document" if scene["modal"] else "canvas-root",
            parent_tokens=["canvas-root"] if scene["modal"] else [], modal=scene["modal"],
            modal_kind="safe_application" if scene["modal"] else None,
            modal_title_digest="e" * 64 if scene["modal"] else None,
            bounds_digest=f'{scene["serial"]:064x}'),
            application_group=copy.deepcopy(group_proof[0]))

    async def capture(**kwargs):
        await kwargs["scope"]()
        return native(shade=scene["shade"])

    original_act = NativeTransport.act

    async def act(self, command, **kwargs):
        result = await original_act(self, command, **kwargs)
        if command == "J ctrl+n":
            scene["modal"] = True
            scene["serial"] += 1
        elif command.startswith("P ") and scene["modal"]:
            scene["modal"] = False
            scene["documents"] += 1
            scene["serial"] += 1
        scene["shade"] = (scene["shade"] + 30) % 240
        return result

    def guardian(*args):
        transport = NativeTransport(*args)
        ordinal = len(normal.transports)

        async def launch(*args):
            transport.alive = True
            transport.owner_identity = {"pid": 424242 + ordinal, "uid": 1000,
                                        "start_ticks": 777 + ordinal}
            transport.on_spawn({"pid": 424242 + ordinal, "start_ticks": 777 + ordinal})

        transport.start = launch
        normal.transports.append(transport)
        return transport

    monkeypatch.setattr(provider_class, "snapshot", snapshot)
    monkeypatch.setattr(provider_class, "export_application_group", export_group)
    monkeypatch.setattr(provider_class, "import_application_group", import_group, raising=False)
    monkeypatch.setattr(provider_class, "focus_bound_candidate", focused, raising=False)
    monkeypatch.setattr(hb, "capture_explicit_output", capture)
    monkeypatch.setattr(hb, "HyprlandGuardian", guardian)
    monkeypatch.setattr(NativeTransport, "act", act)
    normal.scene, normal.grant = scene, grant
    yield normal


def commands(rig):
    return sum(len(t.commands) for t in rig.transports)


async def invoke(rig, name, **values):
    return await rig.runner._run_one_tool(rig.state, call(name, **values))


def clean(rig):
    controller = rig.service.controller
    sid = rig.grant["session_id"]
    assert controller.store.get_recovery_pending(sid) is None
    assert controller.store.get_session(sid).state != "quarantined"


async def stroke(rig, label):
    inp = action(rig, rig.grant, label)
    inp.pop("x")
    inp.pop("y")
    inp.update(operation="polyline", points=[[1, 1], [3, 2], [5, 4]], duration=0.1)
    before = commands(rig)
    result = await invoke(rig, "computer_act", **inp)
    assert commands(rig) == before + 1, result
    assert '"released":true' in result["content"], result
    assert '"receiver_release_verified":false' in result["content"], result
    assert "Image loaded" in result["content"], result
    clean(rig)
    return inp


@pytest.mark.parametrize("natural_finish", [True, False])
async def test_composed_modal_drawing_finish_turn_resume_and_repeat(drawing, natural_finish):
    rig = drawing
    controller = rig.service.controller
    for cycle in range(2):
        await observe(rig, rig.grant)
        new = action(rig, rig.grant, f"new-{cycle}")
        new.pop("x")
        new.pop("y")
        new.update(operation="key", key="ctrl+n")
        result = await invoke(rig, "computer_act", **new)
        assert rig.scene["modal"] and "Image loaded" in result["content"], result
        stale = action(rig, rig.grant, f"stale-{cycle}")
        stale["expected_modal"] = "e" * 64
        rig.scene["serial"] += 1
        before = commands(rig)
        result = await invoke(rig, "computer_act", **stale)
        assert commands(rig) == before, result
        clean(rig)
        await observe(rig, rig.grant)
        create = action(rig, rig.grant, f"create-{cycle}")
        create["expected_modal"] = "e" * 64
        result = await invoke(rig, "computer_act", **create)
        assert not rig.scene["modal"] and rig.scene["documents"] == cycle + 1, result
        assert "Image loaded" in result["content"], result
        assert controller._live[rig.grant["session_id"]].backend._frame.modal is None
        old = await stroke(rig, f"shape-{cycle}-a")
        await stroke(rig, f"shape-{cycle}-b")
        sid = rig.grant["session_id"]
        old_owner = controller.store.hyprland_owner(sid)
        if natural_finish:
            await controller.finish_turn(rig.service._context(rig.state))
        else:
            await invoke(rig, "computer_session", operation="pause", **rig.grant)
        paused = controller.store.get_session(sid)
        assert paused.state == "paused"
        clean(rig)
        rig.grant["generation"] = paused.generation
        rig.state._req_id = f"drawing-next-turn-{cycle}"
        result = await invoke(rig, "computer_session", operation="resume", **rig.grant)
        current = controller.store.get_session(sid)
        assert current.state == "active", result
        rig.grant["generation"] = current.generation
        new_owner = controller.store.hyprland_owner(sid)
        assert new_owner["owner"]["ledger_id"] != old_owner["owner"]["ledger_id"]
        assert (new_owner["owner"]["guardian_start_ticks"]
                != old_owner["owner"]["guardian_start_ticks"])
        before = commands(rig)
        await invoke(rig, "computer_act", **old)
        assert commands(rig) == before
        await observe(rig, rig.grant)
        await stroke(rig, f"resumed-{cycle}")
    result = await invoke(rig, "computer_session", operation="close", **rig.grant)
    assert controller.store.get_session(rig.grant["session_id"]).state == "closed", result
    assert not rig.recovery
    previous_sid = rig.grant["session_id"]
    rig.state._req_id = "repeat-new-session"
    result = await invoke(rig, "computer_session", operation="start")
    fresh = controller.store.find_session(rig.service._context(rig.state))
    assert fresh.session_id != previous_sid and fresh.state == "active", result
    rig.grant = {"session_id": fresh.session_id, "generation": fresh.generation}
    await observe(rig, rig.grant)
    await stroke(rig, "new-session-stroke")
    result = await invoke(rig, "computer_session", operation="close", **rig.grant)
    assert controller.store.get_session(fresh.session_id).state == "closed", result


async def test_rearmed_owner_first_capture_transient_is_clean_retry(drawing, monkeypatch):
    rig = drawing
    controller = rig.service.controller
    sid = rig.grant["session_id"]
    await observe(rig, rig.grant)
    old = await stroke(rig, "before-capture-fault")
    # Explicit pause isolates the resume/capture boundary from finish_turn policy.
    await invoke(rig, "computer_session", operation="pause", **rig.grant)
    rig.grant["generation"] = controller.store.get_session(sid).generation
    old_owner = controller.store.hyprland_owner(sid)
    original_capture = controller._capture
    calls = 0

    async def transient(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ComputerError("wayland_scope_evidence_expired")
        return await original_capture(*args, **kwargs)

    monkeypatch.setattr(controller, "_capture", transient)
    before = commands(rig)
    result = await invoke(rig, "computer_session", operation="resume", **rig.grant)
    assert controller.store.get_session(sid).state == "paused", result
    assert "hyprland_resume_retryable" in result["content"], result
    delivered = rig.runner._audit_tool_outcome.call_args.args[6]
    refusal = json.loads(delivered.output)
    assert delivered.ok is False and delivered.uncertain_outcome is False
    assert refusal["recoverable"] is True and refusal["terminal"] is False
    assert refusal["next_action"] == "inspect_session_status"
    assert refusal["replay_permitted"] is False
    assert "CONTINUE" in refusal["instruction"]
    assert "current generation" in refusal["instruction"]
    assert "operator must" not in refusal["instruction"]
    assert refusal["state"] == "paused"
    assert refusal["execution"] == {
        "injected": False, "sent": False, "released": True,
        "release_basis": "confirmed_resume_rollback",
    }
    assert calls == 1
    clean(rig)
    assert commands(rig) == before
    rearmed_owner = controller.store.hyprland_owner(sid)
    assert rearmed_owner["owner"]["ledger_id"] != old_owner["owner"]["ledger_id"]
    assert rig.transports[-1].close_count == 1
    rig.grant["generation"] = controller.store.get_session(sid).generation
    result = await invoke(rig, "computer_session", operation="resume", **rig.grant)
    assert controller.store.get_session(sid).state == "active", result
    rig.grant["generation"] = controller.store.get_session(sid).generation
    await invoke(rig, "computer_act", **old)
    assert commands(rig) == before
    await observe(rig, rig.grant)
    await stroke(rig, "after-capture-retry")
