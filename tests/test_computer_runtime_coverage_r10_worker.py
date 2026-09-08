"""Controller/worker failure-boundary tests; all OS and GUI effects are faked."""

import asyncio
import io
import stat
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime import backend, exports, protocol, supervisor, worker
from src.computer.runtime.accessibility import PrimitiveError


def stream(*messages):
    reader = asyncio.StreamReader()
    for message in messages:
        reader.feed_data(protocol.encode(message))
    reader.feed_eof()
    return reader


def process(*messages):
    return SimpleNamespace(
        pid=987654, returncode=None,
        stdin=SimpleNamespace(write=Mock(), drain=AsyncMock()), stdout=stream(*messages),
        terminate=Mock(), kill=Mock(), wait=AsyncMock(return_value=0),
        communicate=AsyncMock(return_value=(b"inactive\n", b"")),
    )


def make_worker(monkeypatch):
    # Satisfy the fixed sandbox admission check without touching a real sandbox.
    monkeypatch.setattr(worker, "__file__", "/runtime/worker.py")
    monkeypatch.setattr(worker.os, "getuid", lambda: 65534)
    result = worker.Worker("drawing")
    result.desktop = SimpleNamespace(
        snapshot=Mock(return_value={"image_bytes": b"pixels", "window": {"pid": 12}}),
        grounded_execute=Mock(return_value={"released": True}),
        release_all=Mock(return_value={"ok": True}), launch=Mock(return_value={"ok": True}),
    )
    return result


@pytest.mark.parametrize("wire", [b"{}", b"{}\nextra", b"[]\n", b'{"x":1,"x":2}\n',
                                  b'{"x":NaN}\n', b'{"x":Infinity}\n'])
def test_protocol_rejects_ambiguous_frames(wire):
    with pytest.raises(ValueError):
        protocol.decode(wire)


def test_protocol_caps_and_binary_roundtrip(monkeypatch):
    assert protocol.decode(protocol.encode({"text": "snow \u2603"})) == {"text": "snow \u2603"}
    assert protocol.unpack_blob(protocol.pack_blob(b"\x00\xff"), cap=2) == b"\x00\xff"
    for blob, cap in [(None, 3), ("AAAA", 0), ("AAAA", 2), ("!!!!", 3)]:
        with pytest.raises(ValueError):
            protocol.unpack_blob(blob, cap=cap)
    with pytest.raises(ValueError):
        protocol.decode(b"{}\n", cap=2)
    monkeypatch.setattr(protocol, "MAX_WIRE_BYTES", 1)
    with pytest.raises(ValueError, match="wire cap"):
        protocol.encode({})


@pytest.mark.parametrize("case", [
    "ok", "nonregular", "links", "empty", "large", "eof", "changed", "renamed"])
def test_export_read_fences_and_always_closes(monkeypatch, case):
    def metadata(**changes):
        return SimpleNamespace(**({"st_mode": stat.S_IFREG, "st_nlink": 1, "st_size": 3,
                                   "st_dev": 1, "st_ino": 2, "st_mtime_ns": 3,
                                   "st_ctime_ns": 4} | changes))
    before = metadata()
    if case == "nonregular":
        before.st_mode = stat.S_IFDIR
    if case == "links":
        before.st_nlink = 2
    if case == "empty":
        before.st_size = 0
    if case == "large":
        before.st_size = exports.MAX_EXPORT_BYTES + 1
    opened, closed = Mock(return_value=91), Mock()
    monkeypatch.setattr(exports.os, "open", opened)
    monkeypatch.setattr(exports.os, "close", closed)
    after = metadata(st_ino=8) if case == "changed" else before
    named = metadata(st_ino=9) if case == "renamed" else before
    monkeypatch.setattr(exports.os, "fstat", Mock(side_effect=[before, after]))
    monkeypatch.setattr(exports.os, "stat", Mock(return_value=named))
    monkeypatch.setattr(exports.os, "read", Mock(
        side_effect=[b"a", b"" if case == "eof" else b"bc"]))
    if case == "ok":
        assert exports.read_export("drawing.png", directory_fd=70) == b"abc"
    else:
        with pytest.raises(ValueError):
            exports.read_export("drawing.png", directory_fd=70)
    assert opened.call_args.kwargs == {"dir_fd": 70}
    assert opened.call_args.args[1] & exports.os.O_NOFOLLOW
    closed.assert_called_once_with(91)


def test_worker_admission_and_operations(monkeypatch):
    with pytest.raises(ValueError):
        worker.Worker("shell")
    with pytest.raises(RuntimeError, match="sandbox"):
        worker.Worker("drawing")
    w = make_worker(monkeypatch)
    child = Mock()
    popen = Mock(return_value=child)
    monkeypatch.setattr(worker.subprocess, "Popen", popen)
    assert w.spawn(["fake-app"]) is child
    assert w.children == [child]
    assert popen.call_args.kwargs["close_fds"] is True
    observed = w.operation({"id": "1", "op": "observe"}, 71)
    assert protocol.unpack_blob(observed["observation"]["image"], cap=6) == b"pixels"
    assert "image_bytes" not in observed["observation"]
    receipt = w.operation({"id": "2", "op": "act", "action": {"type": "click"}}, 71)["receipt"]
    assert receipt == {"released": True}
    w.desktop.grounded_execute.assert_called_once_with({"type": "click"}, w.cancelled)
    read = Mock(return_value=b"exported")
    monkeypatch.setattr(worker, "read_export", read)
    blob = w.operation({"id": "3", "op": "export", "name": "a.png"}, 71)["blob"]
    assert blob == protocol.pack_blob(b"exported")
    read.assert_called_once_with("a.png", directory_fd=71)
    for message in [{"id": "1", "op": "observe"}, {"id": 1}, {"id": "x" * 65},
                    {"id": "4", "op": "act"}, {"id": "5", "op": "export"},
                    {"id": "6", "op": "shell"}]:
        with pytest.raises(ValueError):
            w.operation(message, 71)
    w.seen = {str(i) for i in range(1024)}
    with pytest.raises(ValueError, match="ceiling"):
        w.operation({"id": "new", "op": "observe"}, 71)


def test_worker_output_pause_and_error_redaction(monkeypatch):
    w = make_worker(monkeypatch)
    output = io.BytesIO()
    monkeypatch.setattr(worker.sys, "stdout", SimpleNamespace(buffer=output))
    w.emit({"ok": True})
    assert protocol.decode(output.getvalue()) == {"ok": True}
    w.emit = Mock()
    w.pause({"id": "p"})
    assert w.paused and w.cancelled.is_set() and not w.operation_lock.locked()
    assert w.emit.call_args.args[0]["released"] is True
    w.operation_lock = Mock(acquire=Mock(return_value=False))
    w.pause({"id": "blocked"})
    assert w.emit.call_args.args[0]["error"] == "pause cleanup unavailable"
    w.operation_lock.release.assert_not_called()
    for exc, reason in [(RuntimeError("secret text"), "desktop operation unavailable"),
                        (PrimitiveError("denied", "fixed diagnostic"), "fixed diagnostic")]:
        w.operation = Mock(side_effect=exc)
        w.serve_operation({"id": "err"}, 7)
        assert reason in w.emit.call_args.args[0]["error"]
    assert w.operation_lock.release.call_count == 2
    w.operation = Mock(return_value={"ok": True})
    w.serve_operation({"id": "success"}, 7)
    assert w.emit.call_args.args[0] == {"ok": True}


def test_worker_run_control_dispatch_and_cleanup(monkeypatch):
    w = make_worker(monkeypatch)
    w.startup = Mock(return_value={"event": "ready", "ok": True})
    w.emit = Mock()
    messages = [{"id": "r0", "op": "resume"}, {"id": "p", "op": "pause"},
                {"id": "a0", "op": "act"}, {"id": "r1", "op": "resume"},
                {"id": "obs", "op": "observe"}, {"id": "busy", "op": "observe"}]
    incoming = io.BytesIO(b"".join(map(protocol.encode, messages)))
    monkeypatch.setattr(worker.sys, "stdin", SimpleNamespace(buffer=incoming))
    opened, closed = Mock(return_value=72), Mock()
    monkeypatch.setattr(worker.os, "open", opened)
    monkeypatch.setattr(worker.os, "close", closed)
    # Do not start threads: the first operation retains the lock to exercise busy rejection.
    thread = Mock()
    monkeypatch.setattr(worker.threading, "Thread", thread)
    w.run()
    responses = [call.args[0] for call in w.emit.call_args_list]
    assert responses[1]["ok"] is False
    assert responses[3]["error"] == "desktop paused"
    assert responses[4]["ok"] is True
    assert responses[5]["error"] == "desktop busy"
    assert thread.call_args.kwargs["daemon"] is True
    thread.return_value.start.assert_called_once()
    closed.assert_called_once_with(72)
    assert w.cancelled.is_set()
    assert w.desktop.release_all.call_count == 2
    w.operation_lock.release()


@pytest.mark.parametrize("case", ["ready", "primitives", "launch", "unobservable"])
def test_worker_startup_isolated_fakes(monkeypatch, case):
    w = make_worker(monkeypatch)
    from src.computer.runtime import primitives
    monkeypatch.setattr(primitives, "NativeDesktop", Mock(return_value=w.desktop))
    monkeypatch.setattr(worker.os, "environ", {})
    mask = Mock()
    monkeypatch.setattr(worker.os, "umask", mask)
    monkeypatch.setattr(worker.Path, "mkdir", Mock())
    write = Mock()
    monkeypatch.setattr(worker.Path, "write_text", write)
    monkeypatch.setattr(worker.Path, "is_socket", lambda _: case != "primitives")
    monkeypatch.setattr(worker.time, "sleep", Mock())
    w.spawn = Mock()
    w.children = [Mock(poll=Mock(return_value=1))] if case == "primitives" else []
    if case == "launch":
        w.desktop.launch.return_value = {"ok": False}
    if case == "unobservable":
        w.desktop.snapshot.side_effect = RuntimeError("not mapped")
        clock = iter([0, 0, 1, 9])
        monkeypatch.setattr(worker.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(worker, "containment_report", lambda: {"fake": True})
    if case == "ready":
        result = w.startup()
        assert result["ok"] and result["containment"] == {"fake": True}
        assert w.spawn.call_count == 3
        assert "gtk-cursor-blink=false" in write.call_args.args[0]
        mask.assert_called_once_with(0o077)
    else:
        with pytest.raises(RuntimeError):
            w.startup()


def test_worker_containment_metadata(monkeypatch):
    monkeypatch.setattr(worker.Path, "read_text",
                        lambda _: "NoNewPrivs:\t1\nCapEff:\t0000\nignored")
    monkeypatch.setattr(worker.Path, "exists", lambda _: False)
    monkeypatch.setattr(worker.os, "statvfs", lambda _: SimpleNamespace(f_blocks=4, f_frsize=4096))
    monkeypatch.setattr(worker.os, "readlink", lambda p: "namespace:" + p.rsplit("/", 1)[1])
    monkeypatch.setattr(worker.os, "getuid", lambda: 65534)
    monkeypatch.setattr(worker.os, "getgid", lambda: 65534)
    report = worker.containment_report()
    assert report["no_new_privs"] == "1" and report["effective_capabilities"] == "0000"
    assert report["workspace_capacity"] == 16384 and not report["physical_input_visible"]


@pytest.mark.asyncio
async def test_supervisor_unit_commands_and_timeout(monkeypatch):
    proc = process()
    proc.returncode = 0
    proc.communicate.return_value = (b"x" * 5000, b"")
    create = AsyncMock(return_value=proc)
    monkeypatch.setattr(supervisor.asyncio, "create_subprocess_exec", create)
    unit = supervisor.unit_for("a" * 32)
    assert await supervisor.unit_command(unit, "show", runtime_sudo=True) == (0, b"x" * 4096)
    assert create.call_args.args[:3] == ("/usr/bin/sudo", "-n", "/usr/bin/systemctl")
    proc.returncode = None
    proc.communicate.side_effect = TimeoutError
    assert await supervisor.unit_command(unit, "show") == (124, b"")
    proc.kill.assert_called_once()
    proc.wait.assert_awaited_once()


@pytest.mark.asyncio
async def test_terminate_unit_verifies_state_and_deadline(monkeypatch):
    command = AsyncMock(side_effect=[(0, b""), (0, b""), (0, b"inactive")])
    monkeypatch.setattr(supervisor, "unit_command", command)
    assert await supervisor.terminate_unit("fake") is True
    assert command.call_args_list[0].args[1:] == ("kill", "--kill-whom=all", "--signal=KILL")
    command.side_effect = None
    command.return_value = (0, b"active")
    clock = iter([0, 0.1, 0.8])
    # Patch module time reference, never the event loop's global clock.
    monkeypatch.setattr(supervisor, "time", SimpleNamespace(monotonic=lambda: next(clock)))
    monkeypatch.setattr(supervisor.asyncio, "sleep", AsyncMock())
    assert await supervisor.terminate_unit("fake") is False


@pytest.mark.asyncio
async def test_supervisor_routing_replay_and_stop(monkeypatch):
    s = supervisor.Supervisor("a" * 32, "drawing")
    s.worker = process({"id": "reply", "ok": True})
    s.emit = AsyncMock()
    await s.commands(stream({"op": "heartbeat"}, {"op": "observe", "id": "1"}))
    assert s.forwarded == {"1"}
    assert protocol.decode(s.worker.stdin.write.call_args.args[0])["id"] == "1"
    await s.replies()
    s.emit.assert_awaited_once_with({"id": "reply", "ok": True})
    for message in [{"op": "unknown"}, {"op": "act", "id": "1"},
                    {"op": "act", "id": 12}, {"op": "act", "id": "x" * 65}]:
        with pytest.raises(ValueError):
            await s.commands(stream(message))
    s.forwarded = {str(i) for i in range(1024)}
    with pytest.raises(ValueError, match="ceiling"):
        await s.commands(stream({"op": "act", "id": "new"}))
    s.forwarded.clear()
    s.worker = None
    await s.commands(stream({"op": "observe", "id": "unavailable"}))
    terminate = AsyncMock(return_value=True)
    monkeypatch.setattr(supervisor, "terminate_unit", terminate)
    await s.commands(stream({"op": "stop", "id": "stop"}))
    assert s.revoked.is_set() and s.stop_result
    assert await s.stop() is True
    terminate.assert_awaited_once()


@pytest.mark.asyncio
async def test_supervisor_output_watchdog_and_main(monkeypatch):
    s = supervisor.Supervisor("a" * 32, "drawing")
    output = io.BytesIO()
    monkeypatch.setattr(supervisor.sys, "stdout", SimpleNamespace(buffer=output))
    await s.emit({"ok": True})
    assert protocol.decode(output.getvalue()) == {"ok": True}
    s.last_heartbeat -= 3
    monkeypatch.setattr(supervisor, "terminate_unit", AsyncMock(return_value=True))
    await s.watchdog()
    assert s.revoked.is_set()
    monkeypatch.setattr(supervisor.sys, "argv", ["supervisor"])
    with pytest.raises(SystemExit) as exc:
        await supervisor.main()
    assert exc.value.code == 2
    fake = SimpleNamespace(run=AsyncMock())
    constructor = Mock(return_value=fake)
    monkeypatch.setattr(supervisor, "Supervisor", constructor)
    monkeypatch.setattr(supervisor.sys, "argv", ["supervisor", "token", "drawing", "sudo"])
    add = Mock()
    monkeypatch.setattr(asyncio.get_running_loop(), "add_signal_handler", add)
    await supervisor.main()
    assert add.call_count == 2
    constructor.assert_called_once_with("token", "drawing", runtime_sudo=True)
    fake.run.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("launch", [True, False])
async def test_supervisor_launch_handshake_and_owned_worker_reaping(monkeypatch, launch):
    s = supervisor.Supervisor("a" * 32, "drawing")
    loop = asyncio.get_running_loop()
    async def connect(factory, pipe):
        reader = factory()._stream_reader
        reader.feed_data(protocol.encode({"op": "launch" if launch else "heartbeat"}))
        reader.feed_eof()
    monkeypatch.setattr(loop, "connect_read_pipe", connect)
    monkeypatch.setattr(supervisor.sys, "stdin", SimpleNamespace(buffer=io.BytesIO()))
    proc = process()
    proc.wait.side_effect = [TimeoutError, 0]
    create = AsyncMock(return_value=proc)
    monkeypatch.setattr(supervisor.asyncio, "create_subprocess_exec", create)
    terminate = AsyncMock(return_value=True)
    monkeypatch.setattr(supervisor, "terminate_unit", terminate)
    await s.run()
    if launch:
        assert s.revoked.is_set()
        proc.kill.assert_called_once()
        assert proc.wait.await_count == 2
        terminate.assert_awaited_once()
    else:
        create.assert_not_awaited()
        terminate.assert_not_awaited()


@pytest.mark.asyncio
async def test_backend_identity_and_admission(monkeypatch):
    from src.computer.runtime import recovery
    monkeypatch.setattr(recovery, "boot_id", lambda: "boot")
    with pytest.raises(ValueError):
        backend.LinuxDesktopBackend(app_profile="shell")
    b = backend.LinuxDesktopBackend()
    with pytest.raises(backend.RuntimeFailure, match="disabled"):
        await b.start("a" * 32)
    first = b.startup_descriptor("a" * 32)
    first["processes"].append("caller mutation")
    assert b.startup_descriptor("a" * 32)["processes"] == []
    with pytest.raises(backend.RuntimeFailure, match="identity changed"):
        b.startup_descriptor("b" * 32)
    b.enabled = True
    b._closed = True
    with pytest.raises(backend.RuntimeFailure, match="single-use"):
        await b.start("a" * 32)


@pytest.mark.asyncio
@pytest.mark.parametrize("ok", [True, False])
async def test_backend_start_durable_identity_before_launch(monkeypatch, ok):
    from src.computer.runtime import recovery
    b = backend.LinuxDesktopBackend(enabled=True, runtime_sudo=True)
    monkeypatch.setattr(backend, "preflight", Mock())
    monkeypatch.setattr(recovery, "boot_id", lambda: "boot")
    monkeypatch.setattr(recovery, "process_identity", lambda pid: {"pid": pid})
    proc = process({"event": "ready", "ok": ok})
    monkeypatch.setattr(backend.asyncio, "create_subprocess_exec", AsyncMock(return_value=proc))
    monkeypatch.setattr(supervisor, "terminate_unit", AsyncMock(return_value=True))
    recorded = []
    b.runtime_identity_callback = lambda descriptor: recorded.append(descriptor)
    original_send = b._send
    async def checked_send(message):
        assert recorded and recorded[0]["launch_pending"] is False
        await original_send(message)
    b._send = checked_send
    if ok:
        result = await b.start("a" * 32)
        assert result["session_id"] == "a" * 32
        assert recorded[0]["processes"] == [{"pid": proc.pid}]
        assert (await b.close())["stopped"] is True
    else:
        with pytest.raises(backend.RuntimeFailure, match="startup failed"):
            await b.start("a" * 32)
        assert b._closed
    proc.terminate.assert_called_once()


@pytest.mark.asyncio
async def test_backend_read_pending_disconnect_and_heartbeat(monkeypatch):
    b = backend.LinuxDesktopBackend()
    loop = asyncio.get_running_loop()
    b._ready = loop.create_future()
    replied, lost = loop.create_future(), loop.create_future()
    b._pending = {"reply": replied, "lost": lost}
    b._process = process({"event": "ready", "ok": True}, {"id": "reply", "ok": True}, {"id": 4})
    await b._read()
    assert b._ready.result()["ok"] and replied.result()["ok"]
    assert isinstance(lost.exception(), backend.RuntimeFailure)
    b._send = AsyncMock(side_effect=OSError("pipe"))
    await b._heartbeats()
    b._send.assert_awaited_once_with({"op": "heartbeat"})
    b._process.stdout = SimpleNamespace(readline=AsyncMock(side_effect=ValueError("bad frame")))
    await b._read()


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["ok", "error", "revoked", "timeout"])
async def test_backend_rpc_outcomes_and_pending_cleanup(outcome):
    b = backend.LinuxDesktopBackend()
    async def send(message):
        if outcome == "timeout":
            return
        if outcome == "revoked":
            b._closed = True
        b._pending[message["id"]].set_result({"ok": outcome != "error", "error": "x" * 300})
    b._send = send
    b.stop = AsyncMock(return_value={"stopped": True})
    if outcome == "ok":
        assert (await b._rpc("observe"))["ok"]
    else:
        with pytest.raises(TimeoutError if outcome == "timeout" else backend.RuntimeFailure) as exc:
            await b._rpc("observe", timeout=0.001)
        if outcome == "error":
            assert len(str(exc.value)) == 160
        if outcome == "timeout":
            b.stop.assert_awaited_once()
    assert b._pending == {}
    b._closed = True
    with pytest.raises(backend.RuntimeFailure, match="revoked"):
        await b._rpc("observe")


@pytest.mark.asyncio
async def test_backend_export_pause_resume_and_stop_escalation(monkeypatch):
    b = backend.LinuxDesktopBackend()
    with pytest.raises(backend.RuntimeFailure, match="disconnected"):
        await b._send({})
    b._rpc = AsyncMock(return_value={"blob": protocol.pack_blob(b"file"), "ok": True})
    assert await b.export("a.png") == b"file"
    with pytest.raises(backend.RuntimeFailure, match="not paused"):
        await b.resume(consent_generation=2)
    await b.pause()
    for generation in [1, True]:
        with pytest.raises(backend.RuntimeFailure, match="fresh capture"):
            await b.resume(consent_generation=generation)
    await b.resume(consent_generation=2)
    assert not b._paused and b._consent_generation == 2
    b._unit = "fake"
    terminate = AsyncMock(return_value=False)
    monkeypatch.setattr(supervisor, "terminate_unit", terminate)
    b._process = process()
    b._process.wait.side_effect = [TimeoutError, 0]
    b._rpc.side_effect = OSError("pipe")
    with pytest.raises(OSError):
        await b.pause()
    assert b._closed
    b._process.kill.assert_called_once()
    b._process.returncode = 0
    assert await b.stop() == {"stopped": False, "state": "quarantined"}


async def observed():
    b = backend.LinuxDesktopBackend()
    b._rpc = AsyncMock(return_value={"observation": {
        "width": 32, "height": 32, "window": {"id": 1}, "observation_id": "frame",
        "source_revision": 1, "raster_mode": "RGB", "focused": True,
        "image": protocol.pack_blob(bytes(32 * 32 * 3)),
    }})
    frame = await b.observe()
    action = {"type": "click", "x": 1, "y": 2,
              "source_id": frame.source.source_id, "source_revision": 1,
              "consent_generation": 1, "expected": {"type": "visual_change"}}
    b._rpc = AsyncMock(return_value={"receipt": {"released": True}})
    return b, action


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,value,valid", [
    ("polyline", {"points": [[1, 2], [3, 4]], "duration": 0.5}, True),
    ("polyline", {"points": [], "duration": 0.5}, False),
    ("polyline", {"points": [[1, 2], [3, 4]], "duration": 99}, False),
    ("type", {"text": "hello"}, True), ("type", {"text": "\x00"}, False),
    ("key", {"chord": "Return"}, True), ("key", {"chord": "not-allowed"}, False),
    ("key", {"chord": "alt+F4"}, True), ("key", {"chord": "super+alt+F12"}, True),
    ("key", {"chord": "Return", "unknown": True}, False),
    ("click", {"x": 1, "y": 2, "button": "extra"}, False),
    ("click", {"x": True, "y": 2}, False),
])
async def test_backend_action_payload_validation(kind, value, valid):
    b, action = await observed()
    action.pop("x")
    action.pop("y")
    action.update(type=kind, **value)
    if valid:
        receipt = await b.act(action)
        assert receipt["postcondition"]["source_revision"] == 1
        payload = b._rpc.call_args.kwargs["action"]
        for key, expected in value.items():
            assert payload[key] == expected
        assert b._frame is None
    else:
        with pytest.raises(backend.RuntimeFailure):
            await b.act(action)
        b._rpc.assert_not_awaited()


@pytest.mark.asyncio
async def test_backend_legacy_capture_and_invalid_worker_metadata():
    from PIL import Image
    png = io.BytesIO()
    Image.new("RGB", (32, 32)).save(png, format="PNG")
    b = backend.LinuxDesktopBackend()
    result = {"width": 32, "height": 32, "image": protocol.pack_blob(png.getvalue())}
    b._rpc = AsyncMock(return_value={"observation": result})
    frame = await b.observe()
    assert frame.image_bytes == png.getvalue() and b._frame is None
    b._paused = True
    with pytest.raises(backend.RuntimeFailure, match="revoked"):
        await b.observe()
    b._paused = False
    result.update(source_revision=1, raster_mode="RGB", window={}, observation_id=123,
                  image=protocol.pack_blob(bytes(32 * 32 * 3)))
    with pytest.raises(backend.RuntimeFailure, match="identity"):
        await b.observe()
    result["observation_id"] = "valid"
    with pytest.raises(backend.RuntimeFailure, match="revision"):
        await b.observe()
    result["source_revision"] = 3
    b._paused = True
    with pytest.raises(backend.RuntimeFailure, match="revoked"):
        await b.observe()
