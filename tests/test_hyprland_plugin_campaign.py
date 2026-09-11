"""Deterministic fake IPC coverage.  No display, plugin, or desktop is touched."""

import asyncio
import hashlib
import os

import pytest

from src.computer.runtime.hyprland_identity import (
    ExecutableTrust,
    HyprlandIdentity,
    ProcessPin,
)
from src.computer.runtime.hyprland_plugin import (
    HyprlandPluginError,
    HyprlandPluginIPC,
    ManagedHyprlandPlugin,
    PluginApproval,
    ProcMappedPluginVerifier,
)


def approval(tmp_path):
    root = tmp_path / "odin"
    root.mkdir()
    payload = b"qualified plugin fixture"
    digest = hashlib.sha256(payload).hexdigest()
    path = root / f"odin-hyprland-scope-{digest}.so"
    path.write_bytes(payload)
    return PluginApproval(str(path), digest, "0.55.2", "a" * 40, "b" * 64, True), str(root)


def identity(approval):
    trust = ExecutableTrust("/usr/bin/Hyprland", "c" * 64, approval.hyprland_version,
                            approval.hyprland_commit)
    return HyprlandIdentity(ProcessPin(77, os.getuid(), 9, "boot", 1, 2, 3, 4, 5, "c" * 64), trust)


class IPC:
    def __init__(self, path, *, lose_ack=False):
        self.path, self.lose_ack, self.loaded, self.loads, self.inspects = path, lose_ack, [], 0, 0

    async def loaded_plugins(self):
        self.inspects += 1
        return tuple(self.loaded)

    async def load_fixed_plugin(self, path):
        assert path == self.path
        self.loads += 1
        self.loaded.append(path)
        if self.lose_ack:
            raise ConnectionError("fixture only")

    async def plugin_instance_status(self, path):
        assert path == self.path
        return "b" * 64


class SlowIPC(IPC):
    async def load_fixed_plugin(self, path):
        await asyncio.sleep(0)
        await super().load_fixed_plugin(path)


@pytest.mark.asyncio
async def test_status_never_loads_and_existing_plugin_stays_blocked_without_native_endpoint(
    tmp_path, monkeypatch
):
    approved, root = approval(tmp_path)
    monkeypatch.setattr(PluginApproval, "verify_artifact", lambda *_args, **_kwargs: None)
    ipc = IPC(approved.path)
    manager = ManagedHyprlandPlugin(approval=approved, identity=identity(approved), ipc=ipc)
    assert await manager.status() == type(await manager.status())(False, False)
    assert ipc.loads == 0
    ipc.loaded.append(approved.path)
    assert (await manager.status()).code == "hyprland_plugin_runtime_unqualified"
    assert ipc.loads == 0


@pytest.mark.asyncio
async def test_authorized_lost_ack_inspects_once_and_never_resends(tmp_path, monkeypatch):
    approved, root = approval(tmp_path)
    monkeypatch.setattr(PluginApproval, "verify_artifact", lambda *_args, **_kwargs: None)
    ipc = IPC(approved.path, lose_ack=True)
    manager = ManagedHyprlandPlugin(approval=approved, identity=identity(approved), ipc=ipc)
    state = await manager.activate(authorized_task=True)
    assert state.loaded and not state.ready
    assert ipc.loads == 1 and ipc.inspects == 2


@pytest.mark.asyncio
async def test_unauthorized_activation_cannot_inspect_or_load(tmp_path, monkeypatch):
    approved, root = approval(tmp_path)
    ipc = IPC(approved.path)
    manager = ManagedHyprlandPlugin(approval=approved, identity=identity(approved), ipc=ipc)
    with pytest.raises(HyprlandPluginError, match="task_authorization"):
        await manager.activate(authorized_task=False)
    assert ipc.loads == ipc.inspects == 0


@pytest.mark.asyncio
async def test_loaded_plugin_remains_runtime_unqualified_without_privileged_mapped_elf_verifier(
    tmp_path, monkeypatch
):
    approved, root = approval(tmp_path)
    monkeypatch.setattr(PluginApproval, "verify_artifact", lambda *_args, **_kwargs: None)
    ipc = IPC(approved.path)

    manager = ManagedHyprlandPlugin(approval=approved, identity=identity(approved), ipc=ipc)
    state = await manager.activate(authorized_task=True)
    assert not state.ready
    assert state.code == "hyprland_plugin_runtime_unqualified"


@pytest.mark.asyncio
async def test_same_approved_pin_is_locked_and_loads_once(tmp_path, monkeypatch):
    approved, _root = approval(tmp_path)
    monkeypatch.setattr(PluginApproval, "verify_artifact", lambda *_args, **_kwargs: None)
    ipc = SlowIPC(approved.path)
    manager = ManagedHyprlandPlugin(approval=approved, identity=identity(approved), ipc=ipc)
    first, second = await asyncio.gather(
        manager.activate(authorized_task=True), manager.activate(authorized_task=True)
    )
    assert first.loaded and second.loaded
    assert ipc.loads == 1


def test_mapped_elf_verifier_requires_exact_candidate_inode_and_digest(tmp_path):
    approved, _root = approval(tmp_path)
    proc = tmp_path / "proc"
    pid = "77"
    (proc / pid / "map_files").mkdir(parents=True)
    address = "1000-2000"
    (proc / pid / "maps").write_text(
        f"1000-2000 r-xp 00000000 00:00 0 {approved.path}\n"
        f"2000-3000 r-xp 00000000 00:00 0 {approved.path}\n"
    )
    os.link(approved.path, proc / pid / "map_files" / address)
    verifier = ProcMappedPluginVerifier(proc_root=str(proc), geteuid=lambda: 0)
    verifier.verify(pid=77, approval=approved)


@pytest.mark.asyncio
async def test_mapped_and_companion_identity_make_runtime_ready(tmp_path, monkeypatch):
    approved, _root = approval(tmp_path)
    monkeypatch.setattr(PluginApproval, "verify_artifact", lambda *_args, **_kwargs: None)
    verifier = type("Verifier", (), {"verify": lambda *_args, **_kwargs: None})()
    ipc = IPC(approved.path)
    manager = ManagedHyprlandPlugin(
        approval=approved, identity=identity(approved), ipc=ipc, mapped_verifier=verifier
    )
    state = await manager.activate(authorized_task=True)
    assert state == type(state)(True, True)


def test_manifest_and_artifact_require_qualified_immutable_root_owned_tuple(tmp_path):
    approved, root = approval(tmp_path)
    # Test process normally owns this fixture, which is intentionally not good enough.
    with pytest.raises(HyprlandPluginError, match="artifact_untrusted"):
        approved.verify_artifact(approved_root=root)
    with pytest.raises(HyprlandPluginError, match="manifest_invalid"):
        PluginApproval.from_manifest(approved.path, {"plugin_sha256": approved.sha256})


@pytest.mark.asyncio
async def test_native_adapter_has_only_fixed_hyprland_plugin_grammar(tmp_path, monkeypatch):
    approved, _root = approval(tmp_path)
    adapter = HyprlandPluginIPC(identity=identity(approved), ipc_path="/tmp/hypr.sock")
    seen = []

    async def request(command):
        seen.append(command)
        return b"ok"

    monkeypatch.setattr(adapter, "_request", request)
    await adapter.load_fixed_plugin(approved.path)
    assert seen == [b"plugin load " + approved.path.encode("ascii")]
    with pytest.raises(HyprlandPluginError, match="command_refused"):
        await adapter.load_fixed_plugin("/safe.so\nkeyword exec dangerous")
