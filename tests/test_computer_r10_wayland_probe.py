"""In-process qualification control-flow tests, never compositor evidence."""
import asyncio
import json
import signal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime import wayland_probe as p

NS = SimpleNamespace


def identity(**changes):
    obj = NS(path="/usr/bin/gnome-shell", device="0:1", inode=5, sha256="a" * 64)
    return NS(**(dict(binding_digest="b" * 64, compositor_name="gnome-shell",
        backend="native", pid=123, uid=1003, start_ticks=42, boot_id="test",
        session_id=100, eis_peer_pid=123, eis_peer_uid=1003, shell_owner=":1.2",
        version="48.7", executable=obj,
        libraries=(NS(**(vars(obj) | {"path": "/usr/lib/libmutter-16.so"})),)) | changes))


CHECKS = {"held_button_received", "held_key_received", "sole_sender_eof",
          "button_release_received", "key_release_received", "same_receiver_fresh_input",
          "private_compositor_survived", "exact_mapped_stack", "private_cleanup_reaped"}


@pytest.fixture
def harness(monkeypatch):
    state = NS(result={"nonce": "n", "binding_digest": "b" * 64, "passed": True,
                       "checks": sorted(CHECKS)}, ready=b"PROBE_GATE_READY\n", status=0,
               raw=None, ident=identity())
    state.validate = Mock()
    state.trust = Mock()
    state.cleanup = AsyncMock()
    state.close = Mock()
    monkeypatch.setattr(p, "_validate_active", state.validate)
    monkeypatch.setattr(p, "_trusted_program", state.trust)
    monkeypatch.setattr(p, "_sandbox_argv", lambda marker: ["sandbox", str(marker)])
    monkeypatch.setattr(p, "_cleanup", state.cleanup)
    monkeypatch.setattr(p.secrets, "token_hex", lambda count: "n")
    monkeypatch.setattr(p, "os", NS(**(vars(p.os) | {
        "pidfd_open": lambda pid: 9876, "close": state.close})))
    async def spawn(*args, **kwargs):
        data = state.raw if state.raw is not None else json.dumps(state.result).encode()
        state.proc = NS(pid=4321, returncode=0,
            stdin=NS(write=Mock(), drain=AsyncMock(), close=Mock()),
            stdout=NS(readline=AsyncMock(return_value=state.ready),
                      read=AsyncMock(side_effect=[data, b""])),
            wait=AsyncMock(return_value=state.status))
        return state.proc
    state.spawn = AsyncMock(side_effect=spawn)
    monkeypatch.setattr(p.asyncio, "create_subprocess_exec", state.spawn)
    return state


def test_qualified_revalidates_and_records_owned_launcher(harness):
    h = harness
    h.ident.backend = "x11-nested"
    record = AsyncMock()
    result = asyncio.run(p.GnomeSameStackQualifier(record_spawn=record)(h.ident))
    assert result.state == "eligible"
    assert set(result.checks) >= CHECKS
    assert h.validate.call_count == 2
    record.assert_awaited_once_with(4321)
    assert [x.args[0] for x in h.trust.call_args_list][-2:] == ["/usr/bin/Xvfb", "/usr/bin/xdotool"]
    h.cleanup.assert_awaited_once_with(h.proc, 9876)
    h.close.assert_called_once_with(9876)
    assert h.proc.stdin.write.call_args.args[0].endswith(b"\n")


@pytest.mark.parametrize("mode,code", [
    ("ready", "probe_launcher_failed"), ("status", "probe_sandbox_or_dependency_failed"),
    ("nonce", "probe_measurement_binding_mismatch"),
    ("digest", "probe_measurement_binding_mismatch"),
    ("checks", "probe_measurement_incomplete"),
    ("binding", "active_compositor_binding_changed"),
    ("large", "probe_output_limit"), ("json", "probe_unavailable"),
    ("install", "probe_nonstandard_compositor_installation"),
    ("timeout", "probe_deadline_exceeded"), ("error", "probe_unavailable"),
    ("missing", "probe_launcher_failed"),
])
def test_qualification_fail_closed(harness, mode, code):
    h = harness
    if mode == "ready":
        h.ready = b"wrong\n"
    if mode == "status":
        h.status = 2
    if mode == "nonce":
        h.result["nonce"] = "other"
    if mode == "digest":
        h.result["binding_digest"] = "other"
    if mode == "checks":
        h.result["checks"] = []
    if mode == "binding":
        def validate(manifest):
            if h.validate.call_count == 2:
                h.ident.binding_digest = "c" * 64
        h.validate.side_effect = validate
    if mode == "large":
        h.raw = b"x" * 131073
    if mode == "json":
        h.raw = b"not json"
    if mode == "install":
        h.ident.executable.path = "/somewhere/shell"
    if mode == "timeout":
        h.validate.side_effect = TimeoutError()
    if mode == "error":
        h.validate.side_effect = RuntimeError("unsafe error details")
    if mode == "missing":
        h.spawn.side_effect = None
        h.spawn.return_value = NS(stdout=None, stdin=None)
    result = asyncio.run(p.qualify(h.ident))
    assert result.state == "refused" and result.code == code
    if mode in {"ready", "large", "missing"}:
        h.cleanup.assert_awaited_once()


@pytest.mark.parametrize("code,expected", [("compositor_held_button_eof_release_failed",
    "compositor_held_button_eof_release_failed"), ("valid_code", "valid_code"),
    ("bad code!", "probe_behavior_failed"), (None, "probe_behavior_failed")])
def test_behavior_refusal(harness, code, expected):
    harness.result["passed"] = False
    if code is not None:
        harness.result["code"] = code
    result = asyncio.run(p.qualify(harness.ident))
    assert result.state == "refused" and result.code == expected
    assert result.probe_scope == "same_stack_disposable"


def test_cancel_propagates_and_cleans(harness):
    harness.spawn.side_effect = asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(p.qualify(harness.ident))


@pytest.mark.parametrize("changes,code", [({"binding_digest": "bad"}, "binding_invalid"),
    ({"compositor_name": "other"}, "not_authenticated"), ({"uid": -1}, "not_authenticated"),
    ({"start_ticks": 0}, "not_authenticated"), ({"libraries": []}, "mapping_missing")])
def test_manifest_rejects(changes, code):
    with pytest.raises(ValueError, match=code):
        p._manifest(identity(**changes))


@pytest.mark.parametrize("fault", [
    None, "ticks", "session", "uid", "boot", "exe", "hash", "mapping", "inode", "device"])
def test_active_stack_validation(monkeypatch, fault):
    manifest = p._manifest(identity())
    fields = ["0"] * 20
    fields[19] = "99" if fault == "ticks" else "42"
    fields[3] = "99" if fault == "session" else "100"
    objects = [manifest["executable"], *manifest["libraries"]]
    device = "0:2" if fault == "device" else "0:1"
    inode = "9" if fault == "inode" else "5"
    rows = [f"000-111 r-xp 0 {device} {inode} {obj['path']}" for obj in objects]
    def read(path, *args, **kwargs):
        if path.name == "stat":
            return "123 (shell) " + " ".join(fields)
        if path.name == "boot_id":
            return "other" if fault == "boot" else "test\n"
        if path.name == "maps":
            return "short\n000 r--p 0 0:1 5 /unused\n" + (
                "" if fault == "mapping" else "\n".join(rows))
        raise AssertionError(path)
    monkeypatch.setattr(Path, "read_text", read)
    monkeypatch.setattr(Path, "stat", lambda path: NS(st_uid=0 if fault == "uid" else 1003))
    monkeypatch.setattr(p.os, "readlink", lambda path:
        "other" if fault == "exe" else "/usr/bin/gnome-shell")
    monkeypatch.setattr(p, "measured_object", lambda path:
        dict(next(obj for obj in objects if obj["path"] == path),
             sha256="wrong" if fault == "hash" else "a" * 64))
    if fault:
        with pytest.raises(RuntimeError, match="active_compositor_"):
            p._validate_active(manifest)
    else:
        p._validate_active(manifest)


@pytest.mark.parametrize("fault", [None, "file", "access", "uid", "group", "other"])
def test_trusted_program(monkeypatch, fault):
    monkeypatch.setattr(Path, "stat", lambda path: NS(st_uid=1 if fault == "uid" else 0,
        st_mode=0o775 if fault == "group" else 0o757 if fault == "other" else 0o755))
    monkeypatch.setattr(Path, "is_file", lambda path: fault != "file")
    monkeypatch.setattr(p.os, "access", lambda *args: fault != "access")
    if fault:
        with pytest.raises(RuntimeError, match="not_trusted"):
            p._trusted_program("/fake")
    else:
        p._trusted_program("/fake")


def test_sandbox_fixed_mounts_and_environment(monkeypatch, tmp_path):
    marker = tmp_path / "private.json"
    marker.write_text('{"nonce":"only-this"}')
    monkeypatch.setattr(Path, "is_symlink", lambda path: str(path) == "/lib")
    monkeypatch.setattr(Path, "exists", lambda path: str(path) != "/sbin")
    monkeypatch.setattr(p.os, "readlink", lambda path: "usr/lib")
    argv = p._sandbox_argv(marker)
    assert argv[:3] == ["/usr/bin/bwrap", "--unshare-all", "--die-with-parent"]
    assert argv[argv.index("--symlink") + 1:argv.index("--symlink") + 3] == [
        "usr/lib", "/lib"]
    assert "/sbin" not in argv
    env = {argv[i+1]: argv[i+2] for i, value in enumerate(argv) if value == "--setenv"}
    assert env["ODIN_WAYLAND_PROBE_NONCE"] == "only-this"
    assert env["WAYLAND_DISPLAY"] == "wayland-probe" and "DISPLAY" not in env
    assert "--dev-bind" not in argv and "--clearenv" in argv


@pytest.mark.parametrize("pidfd,timeout,vanished", [(None, False, False), (9, False, False),
    (9, False, True), (9, True, False), (9, True, True), (None, True, False)])
def test_cleanup_pins_signals_and_reaps(monkeypatch, pidfd, timeout, vanished):
    proc = NS(returncode=None, stdin=NS(close=Mock()),
              wait=AsyncMock(side_effect=[TimeoutError(), 0] if timeout else [0]))
    send = Mock(side_effect=ProcessLookupError() if vanished else None)
    monkeypatch.setattr(p.signal, "pidfd_send_signal", send)
    asyncio.run(p._cleanup(proc, pidfd))
    assert proc.wait.await_count == (2 if timeout else 1)
    if pidfd is None:
        send.assert_not_called()
        proc.stdin.close.assert_called_once()
    else:
        assert send.call_args_list[0].args == (9, signal.SIGTERM)
        if timeout:
            assert send.call_args_list[1].args == (9, signal.SIGKILL)
