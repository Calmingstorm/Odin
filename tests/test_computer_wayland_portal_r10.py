"""Exercise optional GI worker logic with deterministic, inert GI substitutes."""

import concurrent.futures
import importlib
import socket
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime import wayland_portal as m

NS = SimpleNamespace


@pytest.fixture
def gi_worker(monkeypatch):
    context = NS(
        push_thread_default=Mock(),
        pop_thread_default=Mock(),
        pending=Mock(return_value=False),
        iteration=Mock(),
    )
    bus = NS(
        set_exit_on_close=Mock(),
        connect=Mock(),
        get_unique_name=lambda: ":1.2",
        call_sync=Mock(return_value=NS(unpack=lambda: (1000,))),
        close_sync=Mock(),
        is_closed=lambda: True,
        signal_unsubscribe=Mock(),
    )
    gio = NS(
        DBusConnection=NS(new_for_address_sync=Mock(return_value=bus)),
        DBusConnectionFlags=NS(AUTHENTICATION_CLIENT=1, MESSAGE_BUS_CONNECTION=2),
        DBusCallFlags=NS(NONE=0),
        DBusSignalFlags=NS(NONE=0),
        Cancellable=NS(new=lambda: NS(cancel=Mock())),
    )
    glib = NS(
        MainContext=NS(new=lambda: context),
        Variant=lambda signature, value: value,
        VariantType=NS(new=lambda value: value),
    )
    # VariantType belongs to GLib, retained in this fake just as in GI.
    modules = {
        "gi": NS(require_version=Mock()),
        "gi.repository.Gio": gio,
        "gi.repository.GLib": glib,
    }
    original = importlib.import_module
    monkeypatch.setattr(
        m.importlib,
        "import_module",
        lambda name: modules[name] if name in modules else original(name),
    )
    worker = m._PortalWorker("unix:path=/inert", 1000, Mock(), threading.Event())
    yield worker, modules, bus, context
    worker.close()


def test_r10_gi_constructor_pump_identity_and_call(gi_worker, monkeypatch):
    worker, modules, bus, context = gi_worker
    context.pending.side_effect = [True, False]
    worker.pump()
    context.iteration.assert_called_once_with(False)
    bus.call_sync.side_effect = [
        NS(unpack=lambda: (":1.8",)),
        NS(unpack=lambda: (42,)),
        NS(unpack=lambda: (1000,)),
    ]
    monkeypatch.setattr(m, "_process_identity", lambda pid: {"pid": pid, "start_ticks": 3})
    monkeypatch.setattr(m.os, "readlink", lambda p: "/usr/bin/gnome-shell")
    owner = worker.owner("org.gnome.Shell")
    assert owner == dict(
        owner=":1.8", pid=42, start_ticks=3, uid=1000, executable="/usr/bin/gnome-shell"
    )
    worker.identity = {"portal": owner}
    bus.call_sync.side_effect = None
    worker.call("interface", "method", (), cleanup=True)
    assert bus.call_sync.call_args.args[-1] is None
    bus.call_sync.side_effect = [
        NS(unpack=lambda: (":1.8",)),
        NS(unpack=lambda: (42,)),
        NS(unpack=lambda: (2000,)),
    ]
    with pytest.raises(m.PortalError, match="UID mismatch"):
        worker.owner("org.gnome.Shell")


def test_r10_constructor_failure_closes_context(gi_worker):
    worker, modules, bus, context = gi_worker
    bus.call_sync.return_value = NS(unpack=lambda: (2000,))
    with pytest.raises(m.PortalError, match="credential UID mismatch") as caught:
        m._PortalWorker("unix:path=/fake", 1000, Mock(), threading.Event())
    assert caught.value.cleanup_receipt["connection_closed"]
    context.pop_thread_default.assert_called_once()


def test_r10_check_cancelled_and_descriptor_ownership(gi_worker, monkeypatch):
    worker, modules, bus, context = gi_worker
    worker.identity = {"portal": {"owner": ":1.8"}}
    with pytest.raises(m.PortalError, match="not alive"):
        worker.descriptor(m.SC, "OpenPipeWireRemote")
    worker.alive = True
    worker.session = "/session"
    bus.call_with_unix_fd_list_sync = Mock(return_value=(NS(unpack=lambda: (0,)), object()))
    monkeypatch.setattr(m, "_take_fd", lambda *a: 123)
    assert worker.descriptor(m.SC, "OpenPipeWireRemote") == 123
    close = Mock()
    monkeypatch.setattr(m.os, "close", close)
    worker.check = Mock(side_effect=[None, m.PortalError("revoked")])
    with pytest.raises(m.PortalError, match="revoked"):
        worker.descriptor(m.SC, "OpenPipeWireRemote")
    close.assert_called_once_with(123)
    del worker.check
    worker.cancel.set()
    with pytest.raises(m.PortalError, match="cancelled"):
        worker.check()


@pytest.mark.parametrize(
    "fault",
    [None, "start", "bus", "dimensions", "map", "pipeline_stop", "guard_caps", "guard_buffer"],
)
def test_r10_capture_pipeline_and_cleanup(gi_worker, monkeypatch, fault):
    worker, modules, bus, context = gi_worker
    worker.streams = {7: {"mapping_id": "m"}}
    worker.descriptor = Mock(return_value=123)
    closed = Mock()
    monkeypatch.setattr(m.os, "close", closed)
    buffer = NS(
        pts=2, get_size=lambda: 3, map=lambda flags: (fault != "map", NS(data=b"rgb")), unmap=Mock()
    )
    segment = NS(format=1, to_running_time=lambda *args: 2)
    sample = NS(get_buffer=lambda: buffer, get_segment=lambda: segment, get_caps=lambda: "caps")
    clock = NS(get_time=Mock(side_effect=[1000, 1001]))
    probe_returns = []

    def add_probe(flags, callback):
        if fault == "guard_caps":
            caps = NS(get_structure=lambda n: NS(get_value=lambda key: 9000),
                      to_string=lambda: "video/x-raw,width=9000,height=9000")
            event = NS(type=1, parse_caps=lambda: caps)
            probe_returns.append(callback(None, NS(type=1, get_event=lambda: event)))
        elif fault == "guard_buffer":
            probe_returns.append(
                callback(None, NS(type=2, get_buffer=lambda: NS(get_size=lambda: m.MAX_BYTES + 1)))
            )
        else:
            probe_returns.append(callback(None, NS(type=2, get_buffer=lambda: buffer)))

    source = NS(get_static_pad=lambda name: NS(add_probe=add_probe))
    sink = NS(emit=lambda *a: sample)
    states = []

    def set_state(state):
        states.append(state)
        if state == "NULL" and fault == "pipeline_stop":
            raise RuntimeError("stop")
        return "failure" if fault == "start" and state == "PLAYING" else "ok"

    pipeline = NS(
        get_by_name=lambda name: source if name == "source" else sink,
        set_state=set_state,
        get_bus=lambda: NS(pop_filtered=lambda flag: fault == "bus"),
        get_clock=lambda: clock,
        get_base_time=lambda: 1,
    )
    gst = NS(
        init=Mock(),
        parse_launch=Mock(return_value=pipeline),
        SECOND=1,
        MSECOND=1,
        PadProbeType=NS(EVENT_DOWNSTREAM=1, BUFFER=2),
        EventType=NS(CAPS=1),
        PadProbeReturn=NS(DROP="drop", OK="ok"),
        State=NS(PLAYING="PLAYING", NULL="NULL"),
        StateChangeReturn=NS(FAILURE="failure"),
        MessageType=NS(ERROR=1),
        CLOCK_TIME_NONE=-1,
        Format=NS(TIME=1),
        MapFlags=NS(READ=1),
    )
    modules.update(
        {
            "gi.repository.Gst": gst,
            "gi.repository.GstApp": NS(),
            "gi.repository.GstVideo": NS(
                VideoInfo=NS(
                    new_from_caps=lambda caps: NS(
                        width=9000 if fault == "dimensions" else 1, height=1, stride=[3], offset=[0]
                    )
                )
            ),
        }
    )
    monkeypatch.setattr(m, "_frame_time", lambda *a: (123.0, 0.001))
    if fault:
        with pytest.raises((m.PortalError, RuntimeError)):
            worker.capture(7)
    else:
        metadata, image = worker.capture(7)
        assert metadata["clock_verified"] and metadata["captured_at"] == 123.0
        assert image.startswith(b"\x89PNG")
        buffer.unmap.assert_called_once()
    assert states[-1] == "NULL"
    closed.assert_called_once_with(123)
    if fault and fault.startswith("guard_"):
        assert probe_returns == ["drop"]
    if fault == "pipeline_stop":
        assert worker._cleanup_errors == ["pipeline_stop:RuntimeError"]


def test_r10_capture_unknown_node(gi_worker):
    with pytest.raises(m.PortalError, match="not granted"):
        gi_worker[0].capture(999)


def test_r10_helper_dispatch_on_private_socket(monkeypatch):
    workers = []

    class Worker:
        def __init__(self, address, uid, emit, cancel, deadline):
            self._close_receipt = None
            self._cancellation = NS(expired=threading.Event(), deadline=deadline, lifetime=0)
            self.closed = 0
            workers.append(self)

        def pump(self):
            pass

        def open(self, timeout):
            return {"devices": 3}

        def capture(self, node):
            return {"node": node}, b"PNG"

        def close(self):
            self.closed += 1
            self._close_receipt = {"closed": True}
            return self._close_receipt

    monkeypatch.setattr(m, "_PortalWorker", Worker)
    readers = []

    def tracked_thread(*args, **kwargs):
        # Local module proxy, not a global threading patch. A shutdown regression
        # must fail this test without keeping the pytest interpreter alive.
        kwargs["daemon"] = True
        reader = threading.Thread(*args, **kwargs)
        readers.append(reader)
        return reader

    monkeypatch.setattr(m, "threading", NS(**(vars(threading) | {"Thread": tracked_thread})))
    parent, child = socket.socketpair()
    parent.settimeout(3)
    thread = threading.Thread(target=m._helper, args=(child.detach(), "unix:path=/fake", 1000),
                              daemon=True)
    thread.start()
    try:

        def request(action, **args):
            m._send(parent, threading.Lock(), {"action": action, "id": action, **args})
            return m._receive(parent)

        assert "not open" in request("capture", node_id=7)[0]["error"]
        assert request("open", timeout_seconds=2)[0]["result"] == {"devices": 3}
        assert request("capture", node_id=7)[1] == b"PNG"
        assert "unknown" in request("invalid")[0]["error"]
        assert request("close")[0]["result"]["closed"]
        # Assert native shutdown before test fallback can conceal a regression.
        thread.join(3)
        assert not thread.is_alive()
        assert len(readers) == 1 and readers[0].name == "wayland-portal-commands"
        readers[0].join(3)
        assert not readers[0].is_alive()
    finally:
        # Cooperative EOF wakes the command reader on any earlier assertion failure.
        try:
            parent.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        parent.close()
        thread.join(3)
        for reader in readers:
            reader.join(3)
    assert not thread.is_alive() and workers[0].closed >= 1


def test_r10_reader_dispatches_binary_and_disposes_orphans(monkeypatch):
    session = m.WaylandPortalSession("unix:path=/fake", 1000)
    success, failure, pending = [concurrent.futures.Future() for _ in range(3)]
    session._pending = {"ok": success, "bad": failure, "pending": pending}
    messages = [
        ({"event": "fence", "generation": 3}, b"", 11),
        ({"id": "orphan"}, b"", 12),
        ({"id": "bad", "error": "denied", "cleanup_receipt": {"closed": True}}, b"", 13),
        ({"id": "ok", "result": {}}, b"PNG", 14),
    ]
    monkeypatch.setattr(m, "_receive", Mock(side_effect=messages + [EOFError()]))
    close = Mock()
    monkeypatch.setattr(m.os, "close", close)
    session._reader()
    assert success.result() == {"image": b"PNG", "fd": 14}
    assert isinstance(failure.exception(), m.PortalError)
    assert isinstance(pending.exception(), m.PortalError)
    assert [call.args[0] for call in close.call_args_list] == [11, 12, 13]
    assert session.current_generation == 4 and not session.alive


@pytest.mark.parametrize("fault", [None, "generation", "rpc"])
async def test_r10_session_open_and_transfer(monkeypatch, fault):
    session = m.WaylandPortalSession("unix:path=/fake", 1000)
    session._process = NS(poll=lambda: None)
    session.close = AsyncMock(return_value={})
    session._rpc = AsyncMock(return_value={"generation": 1, "identity": {"portal": 1}})
    await session.open()
    assert session.identity == {"portal": 1}
    session.identity.clear()
    assert session.identity
    session._rpc.return_value = {
        "generation": 2 if fault == "generation" else 1,
        "eis_peer": {"pid": 42},
        "fd": 123,
    }
    if fault == "rpc":
        session._rpc.side_effect = m.PortalError("failed")
    closed = Mock()
    monkeypatch.setattr(m.os, "close", closed)
    if fault:
        with pytest.raises(m.PortalError):
            await session.connect_eis()
        if fault == "generation":
            closed.assert_called_once_with(123)
        else:
            session.close.assert_awaited_once()
    else:
        assert await session.connect_eis() == 123
        assert session.eis_peer == {"pid": 42}


@pytest.mark.parametrize("fault", [None, "generation", "rpc", "invalid"])
async def test_r10_session_capture(monkeypatch, fault):
    session = m.WaylandPortalSession("unix:path=/fake", 1000)
    session._alive = True
    session._process = NS(poll=lambda: None)
    session.close = AsyncMock(return_value={})
    session._rpc = AsyncMock(return_value={"generation": int(fault == "generation")})
    if fault == "rpc":
        session._rpc.side_effect = m.PortalError("failed")
    if fault:
        with pytest.raises(m.PortalError):
            await session.capture(True if fault == "invalid" else 1)
    else:
        assert await session.capture(1) == {"generation": 0}


async def test_r10_closed_session_and_invalid_timeout():
    session = m.WaylandPortalSession("unix:path=/fake", 1000)
    for timeout in (0, 301, float("nan")):
        with pytest.raises(ValueError):
            await session.open(timeout)
    with pytest.raises(m.PortalError, match="not alive"):
        await session.connect_eis()
    session._closed = True
    with pytest.raises(m.PortalError, match="closed"):
        await session._start()
    session._closed = False
    session._generation = 2
    session._rpc = AsyncMock(return_value={"generation": 1})
    session.close = AsyncMock()
    with pytest.raises(m.PortalError, match="owner lost"):
        await session.open()
    session.close.assert_awaited_once()


@pytest.mark.parametrize("fault", ["kill", "reap", "wait"])
async def test_r10_close_failed_helper_reports_truth(fault):
    session = m.WaylandPortalSession("unix:path=/fake", 1000)
    session._closed = True
    timeout = m.subprocess.TimeoutExpired("fake", 1)
    process = NS(poll=lambda: None, kill=Mock(), wait=Mock(side_effect=[timeout, None]))
    if fault == "reap":
        process.wait.side_effect = [timeout, OSError()]
    if fault == "wait":
        process.wait.side_effect = OSError()
    session._process = process
    receipt = await session.close()
    assert not receipt["process_reaped"]
    assert receipt["cleanup_errors"]
    if fault != "wait":
        process.kill.assert_called_once()
