"""Deterministic fake IPC coverage.  No display, plugin, or desktop is touched."""

import asyncio
import hashlib
import os
import socket

import pytest

import src.computer.runtime.hyprland_plugin as plugin
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
    trust = ExecutableTrust(
        "/usr/bin/Hyprland", "c" * 64, approval.hyprland_version, approval.hyprland_commit
    )
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


@pytest.mark.parametrize(
    "manifest", [None, {}, {"schema": 2}, {"schema": 1, "runtime_qualified": False}]
)
def test_manifest_reader_rejects_untrusted_records(tmp_path, manifest):
    path = tmp_path / "manifest.json"
    path.write_text(__import__("json").dumps(manifest))
    with pytest.raises(HyprlandPluginError, match="manifest_invalid|manifest_untrusted"):
        plugin.read_trusted_plugin_manifest(str(path))


def test_approval_and_artifact_reject_bad_digest_and_root(tmp_path):
    approved, root = approval(tmp_path)
    with pytest.raises(HyprlandPluginError, match="approved_tuple"):
        PluginApproval(
            approved.path,
            "x" * 64,
            approved.hyprland_version,
            approved.hyprland_commit,
            approved.companion_build_id,
            True,
        )
    with pytest.raises(HyprlandPluginError, match="artifact_untrusted"):
        approved.verify_artifact(approved_root=str(tmp_path / "wrong"))


def test_mapped_verifier_rejects_nonroot_and_missing_maps(tmp_path):
    approved, _ = approval(tmp_path)
    with pytest.raises(HyprlandPluginError, match="mapped_image_unavailable"):
        ProcMappedPluginVerifier(proc_root=str(tmp_path), geteuid=lambda: 1000).verify(
            pid=77, approval=approved
        )
    proc = tmp_path / "proc2"
    (proc / "77").mkdir(parents=True)
    (proc / "77" / "maps").write_text(f"1000-2000 r-xp 0 0 0 {approved.path}\n")
    with pytest.raises(HyprlandPluginError, match="mapped_image_unverified"):
        ProcMappedPluginVerifier(proc_root=str(proc), geteuid=lambda: 0).verify(
            pid=77, approval=approved
        )


@pytest.mark.asyncio
async def test_ipc_rejects_malformed_replies(tmp_path, monkeypatch):
    approved, _ = approval(tmp_path)
    adapter = HyprlandPluginIPC(identity=identity(approved), ipc_path="/tmp/hypr.sock")
    monkeypatch.setattr(
        adapter,
        "_request",
        lambda _cmd: asyncio.sleep(0, result=b'{"plugins": [{"path": "relative"}]}'),
    )
    with pytest.raises(HyprlandPluginError, match="reply_invalid"):
        await adapter.loaded_plugins()
    monkeypatch.setattr(
        adapter,
        "_request",
        lambda _cmd: asyncio.sleep(0, result=b'{"path": "x", "companion_build_id": "bad"}'),
    )
    with pytest.raises(HyprlandPluginError, match="instance_status_invalid"):
        await adapter.plugin_instance_status(approved.path)


def _same_process_identity(approved):
    trusted = identity(approved)
    return HyprlandIdentity(
        ProcessPin(
            os.getpid(),
            os.getuid(),
            trusted.process.start_ticks,
            trusted.process.boot_id,
            trusted.process.device,
            trusted.process.inode,
            trusted.process.size,
            trusted.process.mtime_ns,
            trusted.process.ctime_ns,
            trusted.process.sha256,
        ),
        trusted.trust,
    )


@pytest.mark.asyncio
async def test_native_ipc_uses_real_private_unix_socket_and_peer_credentials(tmp_path, monkeypatch):
    approved, _ = approval(tmp_path)
    path = str(tmp_path / "hyprland.sock")
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(path)
    server.listen(1)
    server.setblocking(False)
    received = []

    async def serve():
        connection, _ = await asyncio.get_running_loop().sock_accept(server)
        try:
            received.append(await asyncio.get_running_loop().sock_recv(connection, 4096))
            await asyncio.get_running_loop().sock_sendall(connection, b"ok")
        finally:
            connection.close()

    task = asyncio.create_task(serve())
    monkeypatch.setattr(plugin, "revalidate", lambda *_args: asyncio.sleep(0))
    adapter = HyprlandPluginIPC(identity=_same_process_identity(approved), ipc_path=path)
    try:
        await adapter.load_fixed_plugin(approved.path)
        await task
    finally:
        server.close()
    assert received == [b"plugin load " + approved.path.encode("ascii")]


@pytest.mark.asyncio
async def test_native_ipc_lost_reply_does_not_retry_the_write(tmp_path, monkeypatch):
    approved, _ = approval(tmp_path)
    path = str(tmp_path / "lost-ack.sock")
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(path)
    server.listen(2)
    server.setblocking(False)
    writes = []

    async def serve_once():
        connection, _ = await asyncio.get_running_loop().sock_accept(server)
        try:
            writes.append(await asyncio.get_running_loop().sock_recv(connection, 4096))
        finally:
            connection.close()

    task = asyncio.create_task(serve_once())
    monkeypatch.setattr(plugin, "revalidate", lambda *_args: asyncio.sleep(0))
    adapter = HyprlandPluginIPC(identity=_same_process_identity(approved), ipc_path=path)
    try:
        with pytest.raises(HyprlandPluginError, match="load_unconfirmed"):
            await adapter.load_fixed_plugin(approved.path)
        await task
    finally:
        server.close()
    assert writes == [b"plugin load " + approved.path.encode("ascii")]


def _root_owned_lstat(monkeypatch):
    real_lstat = plugin.os.lstat
    real_fstat = plugin.os.fstat

    def trusted(stat_result):
        values = list(stat_result)
        values[4] = 0
        values[0] &= ~0o022
        return os.stat_result(values)

    monkeypatch.setattr(plugin.os, "lstat", lambda path: trusted(real_lstat(path)))
    monkeypatch.setattr(plugin.os, "fstat", lambda fd: trusted(real_fstat(fd)))


def test_trusted_manifest_accepts_real_immutable_content_addressed_artifact(tmp_path, monkeypatch):
    approved, root = approval(tmp_path)
    manifest = {
        "schema": 1,
        "hyprland_version": approved.hyprland_version,
        "hyprland_commit": approved.hyprland_commit,
        "runtime_qualified": True,
        "companion_build_id": approved.companion_build_id,
        "plugin_sha256": approved.sha256,
        "plugin_filename": os.path.basename(approved.path),
    }
    path = os.path.join(root, "manifest.json")
    with open(path, "w", encoding="utf-8") as handle:
        __import__("json").dump(manifest, handle)
    os.chmod(root, 0o755)
    os.chmod(approved.path, 0o644)
    os.chmod(path, 0o644)
    _root_owned_lstat(monkeypatch)
    trusted = plugin.read_trusted_plugin_manifest(path)
    assert trusted.path == approved.path
    assert trusted.approval.pin == approved.pin


@pytest.mark.asyncio
async def test_native_ipc_parses_successful_json_responses(tmp_path, monkeypatch):
    approved, _ = approval(tmp_path)
    adapter = HyprlandPluginIPC(identity=identity(approved), ipc_path="/tmp/hypr.sock")
    replies = iter(
        [
            b'{"plugins": [{"path": "/one.so"}, {"path": "/two.so"}]}',
            (
                b'{"path": "'
                + approved.path.encode("ascii")
                + b'", "companion_build_id": "'
                + b"b" * 64
                + b'"}'
            ),
        ]
    )

    async def request(_command):
        return next(replies)

    monkeypatch.setattr(adapter, "_request", request)
    assert await adapter.loaded_plugins() == ("/one.so", "/two.so")
    assert await adapter.plugin_instance_status(approved.path) == "b" * 64


@pytest.mark.asyncio
async def test_manager_reports_missing_load_and_companion_mismatch(tmp_path, monkeypatch):
    approved, _ = approval(tmp_path)
    monkeypatch.setattr(PluginApproval, "verify_artifact", lambda *_args, **_kwargs: None)

    class NeverLoads(IPC):
        async def load_fixed_plugin(self, _path):
            self.loads += 1

    manager = ManagedHyprlandPlugin(
        approval=approved, identity=identity(approved), ipc=NeverLoads(approved.path)
    )
    with pytest.raises(HyprlandPluginError, match="load_unconfirmed"):
        await manager.activate(authorized_task=True)

    class WrongCompanion(IPC):
        async def plugin_instance_status(self, _path):
            return "c" * 64

    verifier = type("Verifier", (), {"verify": lambda *_args, **_kwargs: None})()
    manager = ManagedHyprlandPlugin(
        approval=approved,
        identity=identity(approved),
        ipc=WrongCompanion(approved.path),
        mapped_verifier=verifier,
    )
    state = await manager.activate(authorized_task=True)
    assert state.code == "hyprland_plugin_companion_identity_mismatch"
