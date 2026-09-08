"""Private socket/fake portal tests; never contacts a host desktop or bus."""
from __future__ import annotations

import asyncio
import importlib.util
import io
import os
import socket
import struct
import subprocess
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

SOURCE = Path(__file__).parents[1] / "src/computer/runtime/wayland_portal.py"
SPEC = importlib.util.spec_from_file_location("portal_r8_test", SOURCE)
portal = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(portal)


def test_import_is_lazy():
    result = subprocess.run(["/usr/bin/python3", "-I", "-c",
        "import runpy,sys; runpy.run_path(sys.argv[1]); assert 'gi' not in sys.modules",
        str(SOURCE)],
        capture_output=True, timeout=5)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("address,uid", [("", 1), ("tcp:host=localhost", 1), (None, 1),
                                       ("unix:path=/private", True), ("unix:path=/private", -1)])
def test_constructor_rejects_ambient_or_invalid_identity(address, uid):
    with pytest.raises(ValueError):
        portal.WaylandPortalSession(address, uid)


def test_descriptor_stolen_and_extras_closed():
    left, right = socket.socketpair()
    extra = os.open("/dev/null", os.O_RDONLY)
    class FDs:
        def __init__(self):
            self.values = [left.detach(), extra]
        def steal_fds(self):
            result, self.values = self.values, []
            return result
    fds = FDs()
    owned = portal._take_fd(fds, 0)
    try:
        assert fds.values == []
        assert not os.get_inheritable(owned)
        with pytest.raises(OSError):
            os.fstat(extra)
        os.write(owned, b"x")
        assert right.recv(1) == b"x"
    finally:
        os.close(owned)
    assert right.recv(1) == b""
    right.close()


def test_invalid_descriptor_index_closes_all():
    fd = os.open("/dev/null", os.O_RDONLY)
    with pytest.raises(portal.PortalError):
        portal._take_fd(SimpleNamespace(steal_fds=lambda: [fd]), 2)
    with pytest.raises(OSError):
        os.fstat(fd)


def test_private_wire_binary_png_and_fd_transfer():
    parent, child = socket.socketpair()
    left, right = socket.socketpair()
    png = portal._png_rgb(b"\xff\0\0\0", 1, 1, 4)
    try:
        portal._send(parent, threading.Lock(), {"id": "one"}, png, left.fileno())
        left.close()
        message, image, fd = portal._receive(child)
        assert message == {"id": "one"}
        assert image == png
        assert not os.get_inheritable(fd)
        os.write(fd, b"probe")
        assert right.recv(5) == b"probe"
        os.close(fd)
        assert right.recv(1) == b""
    finally:
        parent.close()
        child.close()
        left.close()
        right.close()


def test_wire_bounds_before_allocation():
    parent, child = socket.socketpair()
    try:
        parent.sendall(struct.pack("!II", 1024 * 1024 + 1, 0))
        with pytest.raises(portal.PortalError, match="bound"):
            portal._receive(child)
    finally:
        parent.close()
        child.close()


def test_png_stride_and_dimensions():
    raw = bytes([255, 0, 0, 0, 255, 0, 99, 99, 0, 0, 255, 255, 255, 255, 99, 99])
    image = Image.open(io.BytesIO(portal._png_rgb(raw, 2, 2, 8)))
    image.load()
    assert image.size == (2, 2)
    assert [image.getpixel((x, y)) for y in range(2) for x in range(2)] == [
        (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)]


@pytest.mark.parametrize(
    "width,height,stride", [(8193, 1, 24579), (8192, 8192, 24576), (1, 1, 2), (0, 1, 0)])
def test_png_resource_bounds(width, height, stride):
    with pytest.raises(portal.PortalError):
        portal._png_rgb(b"abc", width, height, stride)


def test_calibrated_source_timestamp_not_receipt_time():
    captured, uncertainty = portal._frame_time(.08, 900, (100, 900, 100.0002),
                                               (100.1, 900.1, 100.1002), 100, 100.11)
    assert captured == pytest.approx(100.0801)
    assert captured != 100.11
    assert uncertainty == pytest.approx(.0001)


@pytest.mark.parametrize("running,base,first,last,requested,now", [
    (0, 899, (100, 900, 100.001), (100.1, 900.1, 100.101), 100, 100.11),
    (20, 900, (100, 900, 100.001), (100.1, 900.1, 100.101), 100, 100.11),
    (.05, 900, (100, 900, 100.1), (100.1, 900.1, 100.101), 100, 100.11),
    (.05, 900, (100, 900, 100.001), (100.1, 901, 100.101), 100, 100.11),
    (float("nan"), 900, (100, 900, 100.001), (100.1, 900.1, 100.101), 100, 100.11),
    (.05, 900, (100, 900, 100.001), (100.1, 900, 100.101), 100, 100.11),
])
def test_unverified_stale_future_clock_refused(running, base, first, last, requested, now):
    with pytest.raises(portal.PortalError, match="capture_clock_unverified"):
        portal._frame_time(running, base, first, last, requested, now)


def test_trusted_source_geometry_copy():
    props = {"source_type": 1, "position": [-1920, 0], "size": [1920, 1080],
             "mapping_id": "trusted"}
    value = portal._source_metadata(10, props, "/session/private")
    props["size"][0] = 12
    assert value == {"node_id": 10, "session_handle": "/session/private", "source_type": 1,
                     "position": [-1920, 0], "size": [1920, 1080], "mapping_id": "trusted"}


@pytest.mark.parametrize("props", [
    {"source_type": 2, "position": [0, 0], "size": [10, 10]},
    {"source_type": 1, "size": [10, 10]},
    {"source_type": 1, "position": [0, 0], "size": [0, 10]},
    {"source_type": 1, "position": [False, 0], "size": [10, 10]},
    {"source_type": True, "position": [0, 0], "size": [10, 10]},
])
def test_source_geometry_fail_closed(props):
    with pytest.raises(portal.PortalError):
        portal._source_metadata(10, props, "/session/private")


class FakeBus:
    def __init__(self):
        self.callbacks, self.unsubscribed = {}, []
    def get_unique_name(self):
        return ":1.234"
    def signal_subscribe(self, sender, interface, signal, path, arg, flags, callback):
        self.callbacks[path] = callback
        return path
    def signal_unsubscribe(self, sub):
        self.unsubscribed.append(sub)


def request_worker():
    worker = object.__new__(portal._PortalWorker)
    worker.bus = FakeBus()
    worker.Gio = SimpleNamespace(DBusSignalFlags=SimpleNamespace(NONE=0))
    worker.identity = {"portal": {"owner": ":1.99"}}
    worker.cancel = threading.Event()
    worker.check = lambda: None
    worker._cleanup_errors = []
    return worker


def test_request_subscribed_before_call_and_authenticated_response():
    worker = request_worker()
    def call(interface, method, args, **kwargs):
        path = next(iter(worker.bus.callbacks))
        worker.bus.callbacks[path](None, ":1.99", path, None, None,
                                   SimpleNamespace(unpack=lambda: (0, {"answer": "trusted"})))
        return SimpleNamespace(unpack=lambda: (path,))
    worker.call = call
    assert worker.request(portal.RD, "Start", lambda t: t, time.monotonic() + 1) == {
        "answer": "trusted"}
    assert len(worker.bus.unsubscribed) == 1


@pytest.mark.parametrize("cancel", [False, True])
def test_request_timeout_cancel_closes_owned_request(cancel):
    worker = request_worker()
    calls = []
    def call(interface, method, args, **kwargs):
        calls.append((interface, method, kwargs))
        if cancel and method == "Start":
            worker.check = lambda: (_ for _ in ()).throw(portal.PortalError("cancelled"))
        return SimpleNamespace(unpack=lambda: (next(iter(worker.bus.callbacks)),))
    worker.call = call
    with pytest.raises(portal.PortalError):
        worker.request(portal.RD, "Start", lambda t: t, time.monotonic() + .01)
    assert calls[-1][0:2] == (portal.REQUEST, "Close")
    assert calls[-1][2]["path"].startswith(portal.PATH + "/request/1_234/")
    assert len(worker.bus.unsubscribed) == 1


def test_consent_denial_is_not_grant():
    worker = request_worker()
    def call(*args, **kwargs):
        path = next(iter(worker.bus.callbacks))
        worker.bus.callbacks[path](
            None, None, None, None, None, SimpleNamespace(unpack=lambda: (1, {})))
        return SimpleNamespace(unpack=lambda: (path,))
    worker.call = call
    with pytest.raises(portal.PortalError, match="consent response 1"):
        worker.request(portal.RD, "Start", lambda t: t, time.monotonic() + 1)


def test_eis_peer_must_match_actual_shell_pid():
    worker = object.__new__(portal._PortalWorker)
    left, right = socket.socketpair()
    worker.eis_used = False
    worker.expected_uid = os.getuid()
    worker.identity = {"shell": {"pid": os.getpid() + 123, "uid": os.getuid()}}
    worker.owner = lambda name: worker.identity["shell"]
    worker.descriptor = lambda *args: left.detach()
    try:
        with pytest.raises(portal.PortalError, match="creator differs"):
            worker.connect_eis()
        assert right.recv(1) == b""
    finally:
        left.close()
        right.close()


def test_eis_sole_owner_transfer_and_measured_metadata():
    worker = object.__new__(portal._PortalWorker)
    left, right = socket.socketpair()
    worker.eis_used, worker.generation = False, 1
    worker.expected_uid = os.getuid()
    worker.identity = {"shell": {"pid": os.getpid(), "uid": os.getuid(), "start_ticks": 123}}
    worker.owner = lambda name: worker.identity["shell"]
    worker.descriptor = lambda *args: left.detach()
    try:
        result, fd = worker.connect_eis()
        assert result["eis_peer"]["pid"] == os.getpid()
        os.close(fd)
        assert right.recv(1) == b""
        with pytest.raises(portal.PortalError, match="one-shot"):
            worker.connect_eis()
    finally:
        left.close()
        right.close()


def test_helper_inert_until_identity_callback_and_reaped(tmp_path):
    async def run():
        identities = []
        async def callback(identity):
            identities.append(identity)
            assert Path(f"/proc/{identity['pid']}").exists()
            await asyncio.sleep(.05)
        session = portal.WaylandPortalSession(
            "unix:path=" + str(tmp_path / "nonexistent-bus"), os.getuid(), callback)
        await session._start()
        assert identities == [session.process_identity]
        assert session._process.poll() is None
        assert not session.alive
        receipt = await session.close()
        assert receipt["process_reaped"]
        assert not Path(f"/proc/{identities[0]['pid']}").exists()
    asyncio.run(run())


def test_failed_open_reaps_real_helper_on_private_missing_bus(tmp_path):
    async def run():
        session = portal.WaylandPortalSession("unix:path=" + str(tmp_path / "missing"), os.getuid())
        with pytest.raises(portal.PortalError):
            await session.open(timeout_seconds=.2)
        assert session._process.poll() is not None
        assert not session.alive
    asyncio.run(run())


def test_cancelled_identity_callback_never_abandons_helper(tmp_path):
    async def run():
        ready = asyncio.Event()
        async def callback(identity):
            ready.set()
            await asyncio.Future()
        session = portal.WaylandPortalSession(
            "unix:path=" + str(tmp_path / "missing"), os.getuid(), callback)
        task = asyncio.create_task(session.open())
        await ready.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert session._process.poll() is not None
    asyncio.run(run())


def test_wire_transfer_closes_sender_before_readable_reply():
    parent, child = socket.socketpair()
    left, right = socket.socketpair()
    fd = left.detach()
    try:
        portal._send(parent, threading.Lock(), {"result": {}}, fd=fd, transfer=True)
        with pytest.raises(OSError):
            os.fstat(fd)
        _, _, received = portal._receive(child)
        os.close(received)
        assert right.recv(1) == b""
    finally:
        parent.close()
        child.close()
        right.close()


def test_close_cancellation_still_reaps_inert_helper(tmp_path):
    async def run():
        session = portal.WaylandPortalSession("unix:path=" + str(tmp_path / "missing"), os.getuid())
        await session._start()
        original = session._rpc
        ready = asyncio.Event()
        async def slow_rpc(*args, **kwargs):
            ready.set()
            await asyncio.sleep(.05)
            return await original(*args, **kwargs)
        session._rpc = slow_rpc
        task = asyncio.create_task(session.close())
        await ready.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert session._process.poll() is not None
        assert (await session.close())["process_reaped"]
    asyncio.run(run())


def test_owner_loss_fence_changes_generation_and_cancel_state():
    worker = object.__new__(portal._PortalWorker)
    worker.alive, worker.generation = True, 1
    worker.cancel = threading.Event()
    events = []
    worker.emit = events.append
    worker.fence()
    assert not worker.alive
    assert worker.cancel.is_set()
    assert events == [{"event": "fence", "generation": 2, "reason": "portal_closed"}]


def test_open_preserves_authenticated_start_geometry_only():
    worker = request_worker()
    worker.GLib = SimpleNamespace(Variant=lambda signature, value: value)
    worker.session, worker.identity, worker.streams = None, {}, {}
    worker.subscriptions, worker.generation = [], 1
    worker.owner = lambda name: {"owner": ":1.99", "pid": 22, "uid": 1000,
                                 "executable": "/usr/bin/gnome-shell", "start_ticks": 2}
    path = portal.PATH + "/session/1_234/trusted"
    calls = []
    def request(interface, method, make_args, deadline):
        calls.append((method, make_args("private-token")))
        if method == "CreateSession":
            return {"session_handle": path}
        if method == "Start":
            return {"devices": 3, "streams": [[52, {"source_type": 1, "position": [1920, 0],
                                                    "size": [2560, 1440], "mapping_id": "auth"}]]}
        return {}
    worker.request = request
    result = worker.open(10)
    assert result["streams"][0][0] == 52
    assert worker.streams[52]["session_handle"] == path
    assert worker.streams[52]["position"] == [1920, 0]
    assert [method for method, _ in calls] == [
        "CreateSession", "SelectDevices", "SelectSources", "Start"]
    sources = next(args for method, args in calls if method == "SelectSources")
    assert sources[1]["multiple"] is True
    assert sources[1]["types"] == 1


def test_controller_eof_does_not_skip_session_close():
    worker = object.__new__(portal._PortalWorker)
    worker.alive, worker.generation = True, 1
    worker.cancel = threading.Event()
    worker._close_receipt, worker.bus = None, None
    worker._cleanup_errors = []
    worker._cancellation = SimpleNamespace(close=lambda: None)
    worker.context = SimpleNamespace(pop_thread_default=lambda: None)
    worker.session, worker.subscriptions = "/session/owned", []
    def disconnected(message):
        raise BrokenPipeError("controller gone")
    worker.emit = disconnected
    calls = []
    worker.call = lambda *args, **kwargs: calls.append((args, kwargs))
    result = worker.close()
    assert result["closed"]
    assert result["session_close_acknowledged"]
    assert calls[0][0][:2] == (portal.SESSION, "Close")
    assert worker.session is None


def test_gstreamer_private_videotest_caps_clock_png():
    """Real GI pipeline, but synthetic pixels only. No desktop or portal IO."""
    code = r'''
import importlib.util,sys,time
import gi
gi.require_version("Gst", "1.0")
gi.require_version("GstVideo", "1.0")
gi.require_version("GstApp", "1.0")
from gi.repository import Gst,GstVideo,GstApp
spec=importlib.util.spec_from_file_location("portal",sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
Gst.init(None)
pipe=Gst.parse_launch("videotestsrc is-live=true ! video/x-raw,format=RGB,width=8,height=8 ! "
                      "appsink name=sink sync=false")
try:
    requested=time.monotonic()
    pipe.set_state(Gst.State.PLAYING)
    pipe.get_state(3*Gst.SECOND)
    clock=pipe.get_clock()
    before=time.monotonic();first=(before,clock.get_time()/Gst.SECOND,time.monotonic())
    time.sleep(.03)
    sample=pipe.get_by_name("sink").emit("try-pull-sample",Gst.SECOND)
    buf=sample.get_buffer();segment=sample.get_segment()
    before=time.monotonic();last=(before,clock.get_time()/Gst.SECOND,time.monotonic())
    captured,uncertainty=m._frame_time(segment.to_running_time(Gst.Format.TIME,buf.pts)/Gst.SECOND,
        pipe.get_base_time()/Gst.SECOND,first,last,requested,time.monotonic())
    info=GstVideo.VideoInfo.new_from_caps(sample.get_caps())
    ok,view=buf.map(Gst.MapFlags.READ)
    assert ok
    try: image=m._png_rgb(view.data,info.width,info.height,info.stride[0],info.offset[0])
    finally: buf.unmap(view)
    assert image.startswith(b"\x89PNG") and captured>=requested-.005
    print("synthetic_gst_clock_png_ok")
finally: pipe.set_state(Gst.State.NULL)
'''
    check = subprocess.run(
        ["/usr/bin/python3", "-I", "-c", "import gi"], capture_output=True, timeout=5)
    if check.returncode:
        pytest.skip("optional system GI unavailable")
    result = subprocess.run(
        ["/usr/bin/python3", "-I", "-c", code, str(SOURCE)], capture_output=True, timeout=10)
    assert result.returncode == 0, result.stderr.decode()
    assert b"synthetic_gst_clock_png_ok" in result.stdout
