"""Pinned 0.55.2 protocol regressions; no live compositor or desktop access."""

import asyncio
import json
import os
import socket
from dataclasses import replace
from pathlib import Path

import pytest

import src.computer.runtime.hyprland_plugin as plugin
import src.computer.runtime.hyprland_scope as scope
from tests.test_hyprland_plugin_campaign import IPC, approval, identity


def row():
    return {"name": "odin-hyprland-scope", "author": "Odin", "handle": "5a51c0158600",
            "version": "1.0.0", "description": "Authenticated compositor-loop scope"}


@pytest.fixture
def adapter(tmp_path, monkeypatch):
    approved, _ = approval(tmp_path)
    monkeypatch.setattr(plugin, "revalidate", lambda *_args: asyncio.sleep(0))
    value = plugin.HyprlandPluginIPC(
        identity=identity(approved), ipc_path="/run/user/1000/hypr/pinned/.socket.sock")
    return value, approved


@pytest.mark.asyncio
@pytest.mark.parametrize("reply", [
    {}, {"plugins": []}, [dict(row(), path="/claimed.so")], [dict(row(), handle=True)],
    [dict(row(), handle="0")], [dict(row(), handle="xyz")], [dict(row(), author=3)],
    [dict(row(), name="\ud800")], [row(), row()], [row()] * 129,
])
async def test_inventory_rejects_non_native_or_adversarial_schema(adapter, monkeypatch, reply):
    value, _ = adapter
    monkeypatch.setattr(value, "_request", lambda _: asyncio.sleep(
        0, result=json.dumps(reply).encode()))
    with pytest.raises(plugin.HyprlandPluginError, match="reply_invalid"):
        await value.loaded_plugins()


@pytest.mark.asyncio
async def test_duplicate_json_keys_rejected(adapter, monkeypatch):
    value, _ = adapter
    raw = json.dumps([row()]).replace('"author": "Odin"', '"author":"Odin","author":"Other"')
    monkeypatch.setattr(value, "_request", lambda _: asyncio.sleep(0, result=raw.encode()))
    with pytest.raises(plugin.HyprlandPluginError, match="reply_invalid"):
        await value.loaded_plugins()


@pytest.mark.asyncio
@pytest.mark.parametrize("registered,paths", [(True, ()), (False, ("/scope.so",)),
                                               (True, ("/one.so", "/two.so"))])
async def test_name_alone_or_mapping_alone_is_not_registration(
    adapter, monkeypatch, registered, paths
):
    value, _ = adapter
    monkeypatch.setattr(value, "_request", lambda _: asyncio.sleep(
        0, result=json.dumps([row()] if registered else []).encode()))
    monkeypatch.setattr(value, "_mapped_scope_paths", lambda: paths)
    with pytest.raises(plugin.HyprlandPluginError, match="reply_invalid"):
        await value.loaded_plugins()


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/x y.so", "/x\ty.so", "/x\ry.so", "/x\n.so", "/x\x00.so",
                                  "/x;unload.so", "/x/../y.so", "/x//y.so", "/é.so"])
async def test_load_rejects_command_delimiters_before_send(adapter, monkeypatch, path):
    value, _ = adapter
    async def forbidden(_):
        pytest.fail("invalid command sent")
    monkeypatch.setattr(value, "_request", forbidden)
    with pytest.raises(plugin.HyprlandPluginError, match="command_refused"):
        await value.load_fixed_plugin(path)


def status(value):
    process = value.identity.process
    endpoint = plugin.instance_scope_socket(value.identity, "/run/user/1000")
    return {"ok": True, "version": 1, "scope_protocol_version": 1,
            "instance_id": Path(endpoint).name.removeprefix(
                "odin-hyprland-scope-").removesuffix(".sock"),
            "compositor_pid": process.pid, "compositor_uid": process.uid,
            "compositor_start_ticks": str(process.start_ticks), "boot_id": process.boot_id,
            "companion_build_id": "b" * 64}


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [None, {"ok": False}, {"version": True},
    {"compositor_pid": 999}, {"compositor_uid": 999}, {"compositor_start_ticks": "99"},
    {"boot_id": "other"}, {"instance_id": "i1-" + "a" * 32}, {"companion_build_id": "bad"}])
async def test_status_uses_native_instance_endpoint_and_pinned_identity(
    adapter, monkeypatch, change
):
    value, approved = adapter
    seen = []
    reply = status(value)
    if change:
        reply.update(change)
    class Provider:
        def __init__(self, **kwargs):
            seen.append(kwargs)
        async def _request(self, request):
            assert request == {"op": "status"}
            return reply
        async def close(self):
            seen.append("closed")
    monkeypatch.setattr(plugin, "HyprlandScopeProvider", Provider)
    if change:
        with pytest.raises(plugin.HyprlandPluginError, match="instance_status_invalid"):
            await value.plugin_instance_status(approved.path)
    else:
        assert await value.plugin_instance_status(approved.path) == approved.companion_build_id
    assert seen[0] == {"socket_path": plugin.instance_scope_socket(
        value.identity, "/run/user/1000"),
                       "expected_uid": value.identity.process.uid, "expected_compositor_pid": 77}
    assert seen[-1] == "closed"


@pytest.mark.asyncio
async def test_mismatched_existing_plugin_never_loads(adapter, monkeypatch):
    value, approved = adapter
    monkeypatch.setattr(plugin.PluginApproval, "verify_artifact", lambda *_a, **_k: None)
    ipc = IPC(approved.path)
    ipc.loaded = ["/usr/local/lib/odin/odin-hyprland-scope-other.so"]
    manager = plugin.ManagedHyprlandPlugin(approval=approved, identity=value.identity, ipc=ipc)
    with pytest.raises(plugin.HyprlandPluginError, match="load_unconfirmed"):
        await manager.activate(authorized_task=True)
    assert ipc.loads == 0


@pytest.mark.asyncio
async def test_lost_ack_and_absent_inventory_never_replays_on_next_activation(adapter, monkeypatch):
    value, approved = adapter
    monkeypatch.setattr(plugin.PluginApproval, "verify_artifact", lambda *_a, **_k: None)
    class Lost(IPC):
        async def load_fixed_plugin(self, path):
            self.loads += 1
            raise ConnectionError
    ipc = Lost(approved.path)
    for _ in range(2):
        manager = plugin.ManagedHyprlandPlugin(approval=approved, identity=value.identity, ipc=ipc)
        with pytest.raises(plugin.HyprlandPluginError, match="load_unconfirmed"):
            await manager.activate(authorized_task=True)
    assert ipc.loads == 1


def test_mapped_discovery_compares_kernel_inode_not_filename(adapter, tmp_path, monkeypatch):
    value, approved = adapter
    proc = tmp_path / "proc" / "77"
    (proc / "map_files").mkdir(parents=True)
    (proc / "maps").write_text(f"1000-2000 r-xp 00000000 00:00 0 {approved.path}\n")
    target = proc / "map_files" / "1000-2000"
    target.write_bytes(Path(approved.path).read_bytes())
    real_path = Path
    monkeypatch.setattr(plugin, "Path", lambda path: (
        tmp_path / "proc" if path == "/proc" else real_path(path)))
    monkeypatch.setattr(plugin.os, "geteuid", lambda: 0)
    with pytest.raises(plugin.HyprlandPluginError, match="mapped_image_unverified"):
        value._mapped_scope_paths()
    target.unlink()
    os.link(approved.path, target)
    assert value._mapped_scope_paths() == (approved.path,)


@pytest.fixture
def mapped_proc(adapter, tmp_path, monkeypatch):
    value, approved = adapter
    proc = tmp_path / "proc" / "77"
    (proc / "map_files").mkdir(parents=True)
    target = proc / "map_files" / "1000-2000"
    os.link(approved.path, target)
    real_path = Path
    monkeypatch.setattr(plugin, "Path", lambda path: (
        tmp_path / "proc" if path == "/proc" else real_path(path)))
    monkeypatch.setattr(plugin.os, "geteuid", lambda: 0)
    verifier = plugin.ProcMappedPluginVerifier(proc_root=str(proc.parent), geteuid=lambda: 0)
    return value, approved, proc, target, verifier


@pytest.mark.parametrize("unrelated", [b"/tmp/caf\xc3\xa9.so", b"/tmp/invalid-\xff.so"])
def test_unrelated_filesystem_bytes_do_not_block_mapped_plugin(mapped_proc, unrelated):
    value, approved, proc, _, verifier = mapped_proc
    # Neither inventory nor readiness may decode unrelated filenames as ASCII/UTF-8.
    (proc / "maps").write_bytes(
        b"3000-4000 r-xp 00000000 00:00 0 " + unrelated + b"\n"
        b"1000-2000 r-xp 00000000 00:00 0 " + os.fsencode(approved.path) + b"\n")
    assert value._mapped_scope_paths() == (approved.path,)
    verifier.verify(pid=77, approval=approved)


@pytest.mark.parametrize("directory", [b"caf\xc3\xa9", b"invalid-\xff"])
def test_candidate_filesystem_bytes_preserved_exactly(mapped_proc, directory):
    value, approved, proc, _, verifier = mapped_proc
    parent = proc.parent / os.fsdecode(directory)
    parent.mkdir()
    path = parent / Path(approved.path).name
    os.link(approved.path, path)
    approved = replace(approved, path=str(path))
    (proc / "maps").write_bytes(
        b"1000-2000 r-xp 00000000 00:00 0 " + os.fsencode(path) + b"\n")
    assert value._mapped_scope_paths() == (approved.path,)
    verifier.verify(pid=77, approval=approved)


@pytest.mark.parametrize("suffix", [b"\\012", b" (deleted)"])
@pytest.mark.parametrize("valid_mapping", [False, True])
def test_escaped_or_deleted_scope_candidates_fail_closed(mapped_proc, suffix, valid_mapping):
    value, approved, proc, target, verifier = mapped_proc
    candidate = os.fsdecode(os.fsencode(approved.path) + suffix)
    # A literal lookalike with the approved inode/hash must not resolve ambiguity.
    os.link(target, candidate)
    raw = b"1000-2000 r-xp 00000000 00:00 0 " + os.fsencode(candidate) + b"\n"
    if valid_mapping:
        os.link(target, proc / "map_files" / "5000-6000")
        raw += b"5000-6000 r-xp 00000000 00:00 0 " + os.fsencode(approved.path) + b"\n"
    (proc / "maps").write_bytes(raw)
    with pytest.raises(plugin.HyprlandPluginError, match="mapped_image_unverified"):
        value._mapped_scope_paths()
    with pytest.raises(plugin.HyprlandPluginError, match="mapped_image_unverified"):
        verifier.verify(pid=77, approval=approved)


@pytest.mark.parametrize("mismatch", ["inode", "hash"])
def test_non_utf8_unrelated_mapping_does_not_bypass_image_checks(mapped_proc, mismatch):
    value, approved, proc, target, verifier = mapped_proc
    (proc / "maps").write_bytes(
        b"3000-4000 r-xp 00000000 00:00 0 /tmp/unrelated-\xff.so\n"
        b"1000-2000 r-xp 00000000 00:00 0 " + os.fsencode(approved.path) + b"\n")
    if mismatch == "inode":
        payload = target.read_bytes()
        target.unlink()
        target.write_bytes(payload)
        with pytest.raises(plugin.HyprlandPluginError, match="mapped_image_unverified"):
            value._mapped_scope_paths()
    else:
        target.write_bytes(b"changed mapped image, same inode")
        assert value._mapped_scope_paths() == (approved.path,)
    with pytest.raises(plugin.HyprlandPluginError, match="mapped_image_unverified"):
        verifier.verify(pid=77, approval=approved)


@pytest.mark.asyncio
async def test_status_native_wire_framing_uses_authenticated_provider(adapter, monkeypatch):
    value, approved = adapter
    client, server = socket.socketpair()
    client.setblocking(False)
    server.setblocking(False)
    seen = []
    async def connect(path, pid, uid, deadline):
        seen.append((path, pid, uid))
        return client
    async def serve():
        loop = asyncio.get_running_loop()
        request = await loop.sock_recv(server, 4096)
        assert request == b'{"op": "status"}\n'
        await loop.sock_sendall(server, json.dumps(status(value)).encode() + b"\n")
    monkeypatch.setattr(scope, "connect_peer", connect)
    monkeypatch.setattr(scope.HyprlandScopeProvider, "_identity", lambda _: {"pid": 77})
    task = asyncio.create_task(serve())
    try:
        assert await value.plugin_instance_status(approved.path) == approved.companion_build_id
        await task
    finally:
        server.close()
        client.close()
    assert seen == [(plugin.instance_scope_socket(value.identity, "/run/user/1000"),
                     value.identity.process.pid, value.identity.process.uid)]


@pytest.mark.asyncio
@pytest.mark.parametrize("already_loaded,lose_ack", [(True, False), (False, False), (False, True)])
async def test_manager_actual_inventory_grammar_existing_and_lost_ack(
    adapter, monkeypatch, already_loaded, lose_ack
):
    value, approved = adapter
    loaded = already_loaded
    commands = []
    async def request(command):
        nonlocal loaded
        commands.append(command)
        if command == b"j/plugin list":
            return json.dumps([row()] if loaded else []).encode()
        assert command == b"/plugin load " + approved.path.encode()
        loaded = True
        if lose_ack:
            raise plugin.HyprlandPluginError("hyprland_plugin_ipc_unavailable")
        return b"ok"
    monkeypatch.setattr(value, "_request", request)
    monkeypatch.setattr(value, "_mapped_scope_paths", lambda: (approved.path,) if loaded else ())
    monkeypatch.setattr(plugin.PluginApproval, "verify_artifact", lambda *_a, **_k: None)
    monkeypatch.setattr(value, "plugin_instance_status", lambda _: asyncio.sleep(
        0, result=approved.companion_build_id))
    verifier = type("Verifier", (), {"verify": lambda *_a, **_k: None})()
    manager = plugin.ManagedHyprlandPlugin(
        approval=approved, identity=value.identity, ipc=value, mapped_verifier=verifier)
    assert (await manager.activate(authorized_task=True)).ready
    assert commands == ([b"j/plugin list"] if already_loaded else [
        b"j/plugin list", b"/plugin load " + approved.path.encode(), b"j/plugin list"])
