"""Production controller, two backends, real provider; disposable fake transports."""
import asyncio
import copy
import json
import os
import subprocess
import tempfile
import time
from contextlib import AsyncExitStack
from dataclasses import FrozenInstanceError, replace
from pathlib import Path
from types import SimpleNamespace

import pytest
import pytest_asyncio

from src.computer.controller import ComputerController
from src.computer.models import ComputerError, RequestContext
from src.computer.runtime import hyprland_backend as backend_module
from src.computer.runtime import hyprland_discovery, hyprland_guardian
from src.computer.runtime.hyprland_capture import NativeFrame
from src.computer.runtime.hyprland_scope import (
    HyprlandScopeFailure,
    HyprlandScopeProvider,
    instance_scope_socket,
    selection_output,
)
from src.computer.runtime.wayland_scope import _process_identity
from src.computer.store import ComputerStore
from tests.test_computer_hyprland_foundation_r29 import pinned


def context(**changes):
    return replace(RequestContext("owner", "channel", "turn", "host"), **changes)


@pytest_asyncio.fixture
async def rig(tmp_path, monkeypatch):
    pin = pinned()
    measured = _process_identity(os.getpid(), os.getuid())
    native = {
        "pid": measured["pid"], "uid": measured["uid"],
        "start_ticks": measured["start_ticks"], "executable": measured["exe"],
        "exe_device": measured["exe_identity"][0], "exe_inode": measured["exe_identity"][1],
    }
    geometry = {
        "x": -4, "y": 0, "width": 16, "height": 8,
        "pixel_width": 16, "pixel_height": 8, "scale": 1.0, "transform": 0,
    }
    state = SimpleNamespace(
        instance="i1-" + "b" * 32, requests=[], guardians=[], backends=[],
        mutation=None, pin=pin, measured=measured, native=native, geometry=geometry,
        plugin_epoch="f" * 48, ledger_id="e" * 48,
    )
    item = {
        "id": "c1-" + "a" * 32, "label": "Disposable fixture", "output_id": "o1-original",
        "output_name": "TEST-1", "topology_digest": "e" * 64,
        "window_id": "w1-" + state.plugin_epoch + "-" + "d" * 48,
        "plugin_epoch": state.plugin_epoch, "output": geometry, "identity": native,
    }
    state.item = item

    async def wl(reader, writer):
        await reader.read()
        writer.close()
        await writer.wait_closed()

    async def ipc(reader, writer):
        assert await reader.read(4096) == b"j/version"
        version = {"version": pin.trust.version, "commit": pin.trust.commit}
        writer.write(json.dumps(version).encode())
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    async def scope(reader, writer):
        request = json.loads(await reader.readline())
        state.requests.append(request)
        op = request["op"]
        if op == "status":
            reply = {
                "ok": True, "version": 1, "scope_protocol_version": 1,
                "instance_id": state.instance, "compositor_pid": pin.process.pid,
                "compositor_uid": pin.process.uid,
                "compositor_start_ticks": pin.process.start_ticks,
                "boot_id": pin.process.boot_id, "companion_build_id": "f" * 64,
                "plugin_epoch": state.plugin_epoch,
            }
        elif op == "inventory_targets":
            reply = {
                "ok": True, "version": 1, "instance_id": state.instance,
                "topology_epoch": 9, "topology_digest": "d" * 64,
                "candidates": [copy.deepcopy(item)],
            }
        elif op == "focus_candidate":
            state.foreign_pid = None
            reply = {
                "ok": True, "version": 1, "instance_id": state.instance,
                "candidate_id": item["id"], "output_id": item["output_id"],
                "output_name": item["output_name"], "topology_epoch": 9,
                "topology_digest": item["topology_digest"],
                "window_id": item["window_id"], "plugin_epoch": state.plugin_epoch,
                "output": copy.deepcopy(geometry), "identity": copy.deepcopy(native),
            }
            if state.mutation == "identity":
                reply["identity"]["exe_inode"] += 1
            elif state.mutation == "output":
                reply["output"]["width"] += 1
            elif state.mutation == "epoch":
                reply["topology_epoch"] += 1
        elif op == "snapshot":
            out = copy.deepcopy(geometry)
            if state.mutation == "snapshot_output":
                out["x"] += 1
            reply = {
                "ok": True, "version": 1, "locked": False, "native_wayland": True,
                "safe_focus": True, "measured_monotonic_ns": time.monotonic_ns(),
                "window_id": item["window_id"], "plugin_epoch": state.plugin_epoch,
                "token": "f" * 32, "output": {"name": "TEST-1", **out},
                "focus": {
                    "x": out["x"], "y": 0, "width": 8, "height": 4,
                    "pid": getattr(state, "foreign_pid", None) or native["pid"],
                    "uid": native["uid"], "modal": False,
                    "token": "native-window", "parent_tokens": [], "parent_chain_verified": True,
                    "serial": 9, "wm_class": "fixture", "title": "Disposable fixture",
                },
            }
            reply["focus"]["token"] = item["window_id"]
        elif op == "owner_capture":
            # Register the authenticated owner after spawn and before arm.
            guardian = state.guardians[-1].owner_identity
            assert request == {
                "op": "owner_capture", "instance_id": state.instance,
                "plugin_epoch": state.plugin_epoch,
                "guardian_pid": guardian["pid"], "guardian_uid": guardian["uid"],
                "guardian_start_ticks": str(guardian["start_ticks"]),
            }
            reply = {
                "ok": True, "version": 1, "scope_protocol_version": 1,
                "instance_id": state.instance, "compositor_pid": pin.process.pid,
                "compositor_uid": pin.process.uid,
                "compositor_start_ticks": pin.process.start_ticks,
                "boot_id": pin.process.boot_id, "companion_build_id": "f" * 64,
                "owner_protocol_version": 1, "plugin_epoch": state.plugin_epoch,
                "ledger_id": state.ledger_id,
                "guardian_pid": guardian["pid"], "guardian_uid": guardian["uid"],
                "guardian_start_ticks": str(guardian["start_ticks"]),
                "recovery_pid": os.getpid(), "recovery_uid": os.geteuid(),
                "recovery_start_ticks": str(measured["start_ticks"]),
                "owner_matched": True, "ledger_empty": True, "release_ack": True,
                "revoked": False, "retired": False, "unknown_release": False,
                "native_resources_retired": False, "receiver_release_verified": False,
            }
        else:
            raise AssertionError(request)
        writer.write(json.dumps(reply).encode() + b"\n")
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    class Guardian:
        def __init__(self, *_):
            state.guardians.append(self)
            self.alive = True
            self.bound = []
            self.owner_identity = {
                "pid": measured["pid"], "uid": measured["uid"],
                "start_ticks": measured["start_ticks"],
            }

        async def start(self, *_):
            pass

        async def bind_scope(self, value):
            self.bound.append(value)

        async def select(self, _):
            return {"width": 16, "height": 8}

        async def close(self):
            self.alive = False
            return {"release_ack": True, "process_reaped": True}

    async def capture(**kwargs):
        try:
            proof = await kwargs["scope"]()
            return NativeFrame(kwargs["output"], bytes([0, 0, 0, 255]) * 128, proof)
        finally:
            kwargs["wayland"].close()

    monkeypatch.setattr(hyprland_guardian, "HyprlandGuardian", Guardian)
    monkeypatch.setattr(backend_module, "capture_explicit_output", capture)
    async with AsyncExitStack() as stack:
        root = stack.enter_context(tempfile.TemporaryDirectory(prefix="odin-sel-"))
        Path(root, "hypr", "fixture").mkdir(parents=True)
        for callback, path in (
            (wl, root + "/wayland-1"), (ipc, root + "/hypr/fixture/.socket.sock"),
            (scope, instance_scope_socket(pin, root)),
        ):
            await stack.enter_async_context(await asyncio.start_unix_server(callback, path=path))

        async def resolve(_):
            return SimpleNamespace(runtime_dir=root, wayland_display="wayland-1",
                                   instance_signature="fixture", pid=os.getpid())

        monkeypatch.setattr(hyprland_discovery.HyprlandDiscoveryResolver, "resolve", resolve)
        config = backend_module.HyprlandSessionConfig(
            os.getuid(), root, "", "", "TEST-1", None, pin.trust,
            capture_binary="/usr/bin/true", discovery_mode="auto",
        )

        def factory(_):
            backend = backend_module.HyprlandRuntimeBackend(config=config, enabled=True)
            state.backends.append(backend)
            return backend

        state.store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
        state.controller = ComputerController(state.store, factory, lambda _: True, enabled=True)
        try:
            yield state
        finally:
            await state.controller.close()
            for backend in state.backends:
                await backend.close()
            state.store.close()


async def inventory(rig):
    result = await rig.controller.session(context(), {"operation": "inventory_targets"})
    assert rig.backends[0]._closed
    assert not rig.guardians
    assert all(value not in repr(result) for value in (
        rig.item["id"], rig.native["executable"], "identity"
    ))
    return {"operation": "start", "candidate_epoch": result["candidate_epoch"],
            "target_id": result["candidates"][0]["target_id"]}


async def test_two_backend_instances_import_original_native_candidate(rig):
    selected = await inventory(rig)
    binding = rig.controller._selection_bindings[selected["candidate_epoch"]]
    proof = binding["targets"][selected["target_id"]]["selection_proof"]
    with pytest.raises(FrozenInstanceError):
        proof.pid = 0
    changed = proof.candidate()
    changed["identity"]["pid"] = 0
    assert proof.candidate()["identity"]["pid"] == os.getpid()
    result = await rig.controller.session(context(), selected)
    assert result["state"] == "active"
    assert len(rig.backends) == 2 and len(rig.guardians) == 1
    # Capture and durable persistence precede the first native scope binding.
    operations = [r["op"] for r in rig.requests]
    assert operations.index("owner_capture") < operations.index(
        "snapshot", operations.index("owner_capture")
    )
    owner = rig.store.hyprland_owner(result["session_id"])
    assert owner and owner["owner"]["ledger_id"] == rig.ledger_id
    assert owner["owner"]["guardian_pid"] == rig.measured["pid"]
    assert [r["op"] for r in rig.requests].count("inventory_targets") == 1
    focus = next(r for r in rig.requests if r["op"] == "focus_candidate")
    assert focus == {
        "op": "focus_candidate", "candidate_id": rig.item["id"],
        "output_id": rig.item["output_id"], "topology_epoch": 9,
        "requested_identity": {"executable": rig.native["executable"],
                               "start_ticks": rig.native["start_ticks"]},
    }
    assert rig.backends[1]._application_pin == rig.measured
    assert rig.backends[1]._output == selection_output("TEST-1", rig.geometry)
    assert rig.backends[1].sources()[0]["source_id"] == "o1-original"
    with pytest.raises(ComputerError, match="target_selection_stale"):
        await rig.controller.session(context(), selected)
    assert len(rig.guardians) == 1


@pytest.mark.parametrize("mutation", ["identity", "output", "epoch", "snapshot_output", "instance"])
async def test_native_changes_rejected_before_guardian(rig, mutation):
    selected = await inventory(rig)
    if mutation == "instance":
        rig.instance = "i1-" + "c" * 32
    else:
        rig.mutation = mutation
    with pytest.raises(ComputerError):
        await rig.controller.session(context(), selected)
    assert not rig.guardians
    assert [r["op"] for r in rig.requests].count("inventory_targets") == 1


@pytest.mark.parametrize("field,value", [
    ("owner_id", "foreign"), ("host_id", "foreign"), ("turn_id", "foreign"),
    ("channel_id", "foreign"), ("surface", "webui"),
])
async def test_controller_binding_cannot_transfer(rig, field, value):
    selected = await inventory(rig)
    with pytest.raises(ComputerError, match="target_selection_forbidden"):
        await rig.controller.session(context(**{field: value}), selected)
    assert not rig.guardians
    assert not any(r["op"] == "focus_candidate" for r in rig.requests)


async def test_expiry_and_wrong_output_rejected_before_guardian(rig):
    selected = await inventory(rig)
    with pytest.raises(ComputerError, match="target_selection_invalid"):
        await rig.controller.session(context(), selected | {"output_id": "wrong"})
    rig.controller._selection_bindings[selected["candidate_epoch"]]["expires_at"] = 0
    with pytest.raises(ComputerError, match="target_selection_stale"):
        await rig.controller.session(context(), selected)
    assert not rig.guardians


async def test_repin_exact_compositor_and_process_proof(rig):
    selected = await inventory(rig)
    binding = rig.controller._selection_bindings[selected["candidate_epoch"]]
    target = binding["targets"][selected["target_id"]]
    proof = target["selection_proof"]
    target["selection_proof"] = replace(
        proof, compositor=replace(
            proof.compositor, process=replace(proof.compositor.process, start_ticks=1)
        )
    )
    with pytest.raises(ComputerError):
        await rig.controller.session(context(), selected)
    assert not rig.guardians
    assert not any(r["op"] == "focus_candidate" for r in rig.requests)


@pytest.mark.parametrize("field,value", [
    ("width", True), ("x", False), ("transform", 8), ("scale", True),
    ("scale", float("nan")), ("pixel_height", 0), ("width", 16385),
])
async def test_inventory_validates_geometry_before_export(rig, field, value):
    rig.geometry[field] = value
    with pytest.raises(ComputerError):
        await rig.controller.session(context(), {"operation": "inventory_targets"})
    assert not rig.guardians
    assert not rig.controller._selection_bindings


async def test_provider_cancelled_focus_consumes_candidate(rig, monkeypatch):
    selected = await inventory(rig)
    binding = rig.controller._selection_bindings[selected["candidate_epoch"]]
    target = binding["targets"][selected["target_id"]]
    proof = target["selection_proof"]
    provider = await HyprlandScopeProvider.from_identity(
        identity=proof.compositor, runtime_dir=rig.backends[0].config.runtime_dir
    )
    provider.import_selection_proof(proof)

    async def cancel(_):
        assert not provider._inventory
        raise asyncio.CancelledError

    monkeypatch.setattr(provider, "_request", cancel)
    try:
        with pytest.raises(asyncio.CancelledError):
            await provider.focus_candidate(
                candidate_id=proof.candidate_id, output_id=proof.output_id,
                topology_epoch=proof.topology_epoch,
            )
        with pytest.raises(HyprlandScopeFailure):
            await provider.focus_candidate(
                candidate_id=proof.candidate_id, output_id=proof.output_id,
                topology_epoch=proof.topology_epoch,
            )
        with pytest.raises(HyprlandScopeFailure):
            provider.import_selection_proof(proof)
    finally:
        await provider.close()


async def test_real_snapshot_focus_loss_invokes_controller_recovery_and_fresh_revision(rig):
    result = await rig.controller.session(context(), await inventory(rig))
    sid = result["session_id"]
    backend = rig.backends[1]
    old_revision = backend._revision
    old_frame = backend._frame
    live = rig.controller._live[sid]
    old_ids = set(live.observations)
    rig.controller._delivered_observations[sid] = "old-delivery"
    foreign = subprocess.Popen(["/usr/bin/sleep", "60"])
    try:
        rig.foreign_pid = foreign.pid
        fresh = await rig.controller.observe(context(), {
            "session_id": sid, "generation": result["generation"],
        })
        assert fresh["source"]["source_revision"] > old_revision
        assert backend._frame is not old_frame
        assert not old_ids.intersection(live.observations)
        assert sid not in rig.controller._delivered_observations
        assert [r["op"] for r in rig.requests].count("focus_candidate") == 2
        assert backend._application_pin == rig.measured
    finally:
        foreign.terminate()
        foreign.wait(timeout=5)


@pytest.mark.parametrize("failure", ["cancel", "error", "false"])
async def test_recover_invalidates_before_first_yield_on_all_outcomes(rig, monkeypatch, failure):
    await rig.controller.session(context(), await inventory(rig))
    backend = rig.backends[1]
    assert backend._frame is not None and backend._captured_at > 0

    async def focus(_):
        assert backend._frame is None and backend._captured_at == 0
        assert backend._fingerprint is None
        if failure == "cancel":
            raise asyncio.CancelledError
        if failure == "error":
            raise HyprlandScopeFailure()
        return backend._selected_binding | {"output_name": "wrong"}

    monkeypatch.setattr(backend._scope_provider, "focus_bound_candidate", focus)
    if failure == "cancel":
        with pytest.raises(asyncio.CancelledError):
            await backend.recover_focus(backend.application_provenance, context=context())
    else:
        recovered = await backend.recover_focus(backend.application_provenance, context=context())
        assert recovered is False
    assert backend._frame is None and backend._captured_at == 0
    assert backend.input_readiness == "observation_required"


@pytest.mark.parametrize("change", [
    {"pid": True}, {"uid": -1}, {"start_ticks": 0}, {"exe_inode": 0},
    {"executable": "relative"}, {"scale": True}, {"topology_epoch": True},
    {"topology_digest": "bad"}, {"candidate_id": "bad"}, {"output_id": "bad/id"},
    {"instance_id": "i1-" + "c" * 32}, {"output": None},
])
async def test_malformed_private_proof_rejected_before_focus(rig, change):
    selected = await inventory(rig)
    binding = rig.controller._selection_bindings[selected["candidate_epoch"]]
    target = binding["targets"][selected["target_id"]]
    target["selection_proof"] = replace(target["selection_proof"], **change)
    with pytest.raises(ComputerError):
        await rig.controller.session(context(), selected)
    assert not rig.guardians
    assert not any(r["op"] == "focus_candidate" for r in rig.requests)


@pytest.mark.parametrize("reason", [
    "hyprland_scope_unknown_locked_or_stale", "hyprland_provider_owner_changed",
    "hyprland_explicit_output_changed",
])
async def test_observe_does_not_reclassify_untrusted_scope_failures(rig, monkeypatch, reason):
    await rig.controller.session(context(), await inventory(rig))
    backend = rig.backends[1]

    async def fail(_):
        raise ComputerError(reason)

    monkeypatch.setattr(backend, "_capture_observation", fail)
    with pytest.raises(ComputerError, match=reason):
        await backend.observe()
    assert [r["op"] for r in rig.requests].count("focus_candidate") == 1


async def test_nonhyprland_start_receives_no_selection_kwargs(tmp_path):
    from tests.test_computer_attached_controller_r5 import Attached

    class NoSelection(Attached):
        async def start(self, session_id):
            self.started_id = session_id
            return await super().start(session_id)

    backend = NoSelection()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    try:
        result = await controller.session(context(), {"operation": "start"})
        assert backend.started_id == result["session_id"]
    finally:
        await controller.close()
        store.close()
