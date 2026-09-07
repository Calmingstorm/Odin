"""Private socket regressions. No desktop, bus daemon, consent or native input."""
from __future__ import annotations

import asyncio
import importlib.util
import os
import socket
import subprocess
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

SOURCE = Path(__file__).parents[1] / "src/computer/runtime/wayland_portal.py"
SPEC = importlib.util.spec_from_file_location("portal_deadlines_r8_test", SOURCE)
portal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(portal)


def filled_socket():
    left, right = socket.socketpair()
    left.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 4096)
    left.setblocking(False)
    try:
        while True:
            left.send(b"x" * 4096)
    except BlockingIOError:
        pass
    left.setblocking(True)
    return left, right


@pytest.mark.parametrize("blocked", ["socket", "lock"])
def test_transport_deadline_includes_write_and_lock(blocked):
    left, right = filled_socket() if blocked == "socket" else socket.socketpair()
    lock = threading.Lock()
    if blocked == "lock":
        lock.acquire()
    started = time.monotonic()
    try:
        with pytest.raises(TimeoutError):
            portal._send(left, lock, {}, deadline=started + .03)
        assert time.monotonic() - started < .4
    finally:
        if blocked == "lock":
            lock.release()
        left.close()
        right.close()


@pytest.mark.parametrize("cancel", [False, True])
def test_rpc_stalled_send_deadline_and_cancellation_shutdown(cancel):
    async def run():
        left, right = filled_socket()
        session = portal.WaylandPortalSession("unix:path=/unused-private-test", os.getuid())
        session._sock = left
        async def inert_start():
            pass
        session._start = inert_start
        try:
            started = time.monotonic()
            task = asyncio.create_task(session._rpc("open", timeout=5 if cancel else .03))
            if cancel:
                await asyncio.sleep(.03)
                task.cancel()
            with pytest.raises(asyncio.CancelledError if cancel else TimeoutError):
                await asyncio.wait_for(task, .5)
            receipt = await asyncio.wait_for(session.close(), .5)
            assert time.monotonic() - started < .6
            assert receipt["connection_closed"]
            assert not receipt["session_close_acknowledged"]
            assert not session._send_tasks and not session._pending
            assert session._transport_stopped.is_set()
            right.settimeout(.2)
            while right.recv(4096):
                pass
        finally:
            portal._shutdown(left)
            left.close()
            right.close()
    asyncio.run(run())


def test_cancel_does_not_enqueue_a_second_send(monkeypatch):
    calls = []
    send = portal._send
    def record(*args, **kwargs):
        calls.append(args[2]["action"])
        return send(*args, **kwargs)
    monkeypatch.setattr(portal, "_send", record)
    test_rpc_stalled_send_deadline_and_cancellation_shutdown(True)
    assert calls == ["open"]


def test_timeout_closes_transferred_fd_even_before_lock_acquired():
    left, right = socket.socketpair()
    descriptor = os.open("/dev/null", os.O_RDONLY)
    lock = threading.Lock()
    lock.acquire()
    try:
        with pytest.raises(TimeoutError):
            portal._send(left, lock, {}, fd=descriptor, transfer=True,
                         deadline=time.monotonic() + .02)
        with pytest.raises(OSError):
            os.fstat(descriptor)
    finally:
        lock.release()
        left.close()
        right.close()


@pytest.mark.parametrize("end", ["eof", "deadline"])
def test_initial_bus_auth_is_cancellable_and_helper_exits(tmp_path, end):
    check = subprocess.run(["/usr/bin/python3", "-I", "-c", "from gi.repository import Gio"],
                           capture_output=True, timeout=3)
    if check.returncode:
        pytest.skip("optional system GI unavailable")
    listener = socket.socket(socket.AF_UNIX)
    listener.bind(str(tmp_path / "stalled-bus"))
    listener.listen(1)
    listener.settimeout(2)
    controller, child = socket.socketpair()
    process, peer = None, None
    try:
        process = subprocess.Popen(
            ["/usr/bin/python3", "-I", str(SOURCE), "--helper", str(child.fileno()),
             "unix:path=" + str(tmp_path / "stalled-bus"), str(os.getuid())],
            pass_fds=(child.fileno(),), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL)
        child.close()
        portal._send(controller, threading.Lock(), {
            "action": "open", "id": "test", "timeout_seconds": .3 if end == "deadline" else 10})
        peer, _ = listener.accept()
        peer.settimeout(1)
        assert peer.recv(4096)
        started = time.monotonic()
        if end == "deadline":
            controller.settimeout(1)
            while True:
                message, _, fd = portal._receive(controller)
                assert fd is None
                if message.get("id") == "test":
                    assert "error" in message
                    break
        portal._shutdown(controller)
        controller.close()
        process.wait(timeout=1)
        assert time.monotonic() - started < 1
        assert process.poll() is not None
        assert peer.recv(4096) == b""
    finally:
        portal._shutdown(controller)
        controller.close()
        child.close()
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=2)
        if peer is not None:
            peer.close()
        listener.close()


@pytest.mark.parametrize("cause", ["eof", "deadline", "lifetime"])
def test_worker_cancellation_independent_of_glib_dispatch(cause):
    event, cancelled = threading.Event(), threading.Event()
    gio = SimpleNamespace(Cancellable=SimpleNamespace(new=lambda: SimpleNamespace(
        cancel=cancelled.set)))
    guard = portal._WorkerCancellation(gio, event, time.monotonic() + 30)
    try:
        if cause == "eof":
            event.set()
        elif cause == "deadline":
            guard.deadline = time.monotonic() + .02
        else:
            guard.lifetime = time.monotonic() + .02
        assert cancelled.wait(.4)
        assert event.is_set()
    finally:
        guard.close()
    assert not guard.thread.is_alive()


@pytest.mark.parametrize("session_fails,unsubscribe_fails,bus_fails", [
    (False, False, False), (True, False, False), (True, True, True)])
def test_cleanup_receipt_distinguishes_ack_from_connection_close(
        session_fails, unsubscribe_fails, bus_fails):
    calls = []
    worker = object.__new__(portal._PortalWorker)
    worker._close_receipt = None
    worker.alive, worker.generation = True, 1
    worker.session, worker.subscriptions = "/private/session", [1, 2]
    worker.cancel = threading.Event()
    worker.emit = lambda *_: None
    worker._cancellation = SimpleNamespace(close=lambda: calls.append("cancel_closed"))
    worker.context = SimpleNamespace(pop_thread_default=lambda: calls.append("context_popped"))
    worker.Gio = SimpleNamespace(Cancellable=SimpleNamespace(new=lambda: SimpleNamespace(
        cancel=lambda: None)))
    def call(*args, **kwargs):
        calls.append("session_close")
        assert kwargs["cleanup"] is True
        if session_fails:
            raise TimeoutError("no acknowledgment")
    def unsubscribe(sub):
        calls.append("unsubscribe_" + str(sub))
        if unsubscribe_fails:
            raise RuntimeError("broken subscription")
    def close_bus(cancellable):
        calls.append("bus_close")
        if bus_fails:
            raise TimeoutError("connection failed")
    worker.call = call
    worker.bus = SimpleNamespace(signal_unsubscribe=unsubscribe, close_sync=close_bus,
                                 is_closed=lambda: not bus_fails)
    receipt = worker.close()
    assert receipt["session_close_acknowledged"] is (not session_fails)
    assert receipt["connection_closed"] is (not bus_fails)
    assert bool(receipt["cleanup_errors"]) is session_fails
    assert len(receipt["cleanup_errors"]) == sum((session_fails, 2 * unsubscribe_fails, bus_fails))
    assert calls == ["session_close", "unsubscribe_1", "unsubscribe_2", "bus_close",
                     "cancel_closed", "context_popped"]
    assert worker.close() == receipt
    assert len(calls) == 6
