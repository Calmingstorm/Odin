"""Private socket regressions. No desktop, bus daemon, consent or native input."""
from __future__ import annotations

import asyncio
import fcntl
import importlib.util
import os
import resource
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


def test_stalled_transport_deadline_above_select_fd_limit():
    limits = resource.getrlimit(resource.RLIMIT_NOFILE)
    if limits[1] != resource.RLIM_INFINITY and limits[1] <= 1100:
        pytest.skip("test process hard descriptor limit below select boundary")
    original, peer = filled_socket()
    high = None
    try:
        resource.setrlimit(resource.RLIMIT_NOFILE, (max(limits[0], 1101), limits[1]))
        descriptor = fcntl.fcntl(original.fileno(), fcntl.F_DUPFD_CLOEXEC, 1100)
        high = socket.socket(fileno=descriptor)
        original.close()
        assert high.fileno() >= 1100
        with pytest.raises(TimeoutError):
            portal._send(high, threading.Lock(), {}, deadline=time.monotonic() + .02)
    finally:
        if high is not None:
            high.close()
        original.close()
        peer.close()
        resource.setrlimit(resource.RLIMIT_NOFILE, limits)


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
        if end == "eof":
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
    worker._cleanup_errors = []
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


def test_close_fences_queued_send_under_transport_lock():
    async def run():
        left, right = socket.socketpair()
        session = portal.WaylandPortalSession("unix:path=/unused-private-test", os.getuid())
        session._sock = left
        async def inert_start():
            pass
        session._start = inert_start
        session._write_lock.acquire()
        try:
            operation = asyncio.create_task(session._rpc("capture", timeout=3))
            await asyncio.sleep(.03)
            closing = asyncio.create_task(session.close())
            await asyncio.sleep(.03)
            assert session._closing and session._operations_stopped.is_set()
            session._write_lock.release()
            with pytest.raises(portal.PortalError):
                await asyncio.wait_for(operation, .5)
            assert (await asyncio.wait_for(closing, .5))["closed"]
            right.settimeout(.2)
            assert right.recv(4096) == b""  # No post-fence command was written.
        finally:
            if session._write_lock.locked():
                session._write_lock.release()
            portal._shutdown(left)
            left.close()
            right.close()
    asyncio.run(run())


def test_repeated_caller_cancellation_never_cancels_owned_close(tmp_path):
    async def run():
        session = portal.WaylandPortalSession("unix:path=" + str(tmp_path / "none"), os.getuid())
        await session._start()
        original = session._rpc
        ready, resume = asyncio.Event(), asyncio.Event()
        async def pause(*args, **kwargs):
            ready.set()
            await resume.wait()
            return await original(*args, **kwargs)
        session._rpc = pause
        caller = asyncio.create_task(session.close())
        try:
            await asyncio.wait_for(ready.wait(), .5)
            for _ in range(3):
                caller.cancel()
                await asyncio.sleep(.01)
                assert not session._close_task.done()
            resume.set()
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(caller, 2)
            receipt = await session.close()
            assert receipt["process_reaped"] and receipt["connection_closed"]
            assert not receipt["session_close_acknowledged"]
            assert not receipt["cleanup_errors"]
            assert not session._reader_thread.is_alive()
            assert session._process.returncode == 0
        finally:
            resume.set()
            await session.close()
    asyncio.run(run())


def test_controller_preserves_helper_failure_receipt_without_ack(tmp_path):
    async def run():
        session = portal.WaylandPortalSession("unix:path=" + str(tmp_path / "none"), os.getuid())
        await session._start()
        async def close_reply(*args, **kwargs):
            return {"closed": True, "session_close_acknowledged": False,
                    "connection_closed": True, "cleanup_errors": ["session_close:TimeoutError"]}
        session._rpc = close_reply
        receipt = await session.close()
        assert receipt["process_reaped"] and receipt["connection_closed"]
        assert not receipt["session_close_acknowledged"]
        assert receipt["cleanup_errors"] == ["session_close:TimeoutError"]
        receipt["cleanup_errors"].clear()
        assert (await session.close())["cleanup_errors"] == ["session_close:TimeoutError"]
        assert session._process.returncode == 0
    asyncio.run(run())


def test_open_deadline_and_cancellation_reap_auth_stalled_helper(tmp_path):
    async def run():
        listener = socket.socket(socket.AF_UNIX)
        listener.bind(str(tmp_path / "bus"))
        listener.listen(1)
        listener.setblocking(False)
        session = portal.WaylandPortalSession("unix:path=" + str(tmp_path / "bus"), os.getuid())
        task, peer = None, None
        try:
            task = asyncio.create_task(session.open(timeout_seconds=10))
            peer, _ = await asyncio.wait_for(asyncio.get_running_loop().sock_accept(listener), 2)
            assert await asyncio.wait_for(asyncio.get_running_loop().sock_recv(peer, 4096), 1)
            started = time.monotonic()
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(task, 1)
            assert time.monotonic() - started < 1
            assert session._process.poll() is not None
            receipt = await session.close()
            assert receipt["connection_closed"] and receipt["process_reaped"]
            assert not receipt["session_close_acknowledged"]
            assert receipt["cleanup_errors"] == []
            assert not session._reader_thread.is_alive()
        finally:
            if task is not None:
                task.cancel()
            await session.close()
            if peer is not None:
                peer.close()
            listener.close()
    asyncio.run(run())
