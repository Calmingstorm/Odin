"""Owned-descriptor and cleanup regressions without a desktop or compositor."""

import asyncio
import errno
import os
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import wayland_portal as portal
from src.computer.runtime import wayland_probe as probe
from tests.test_computer_r10_wayland_probe import harness as harness
from tests.test_computer_wayland_portal_r10 import gi_worker as gi_worker

NS = SimpleNamespace


def assert_closed(fd):
    with pytest.raises(OSError) as caught:
        os.fstat(fd)
    assert caught.value.errno == errno.EBADF


@pytest.fixture
def owned_pipe():
    read_fd, write_fd = os.pipe()
    try:
        yield read_fd
    finally:
        for fd in (read_fd, write_fd):
            try:
                os.close(fd)
            except OSError as exc:
                assert exc.errno == errno.EBADF


@pytest.mark.parametrize("extra_cancellations", [0, 2])
@pytest.mark.parametrize("cleanup_fails", [False, True])
async def test_probe_cancellation_settles_cleanup_and_closes_owned_fd(
    harness, monkeypatch, owned_pipe, extra_cancellations, cleanup_fails
):
    reading, cleaning, release, settled = (asyncio.Event() for _ in range(4))
    close = Mock(wraps=os.close)
    monkeypatch.setattr(probe.os, "pidfd_open", lambda pid: owned_pipe)
    monkeypatch.setattr(probe.os, "close", close)
    original_spawn = harness.spawn.side_effect

    async def read(*args):
        reading.set()
        await asyncio.Future()

    async def spawn(*args, **kwargs):
        proc = await original_spawn(*args, **kwargs)
        proc.stdout.read = read
        return proc

    async def cleanup(proc, fd):
        assert fd == owned_pipe
        cleaning.set()
        try:
            await release.wait()
            os.fstat(fd)  # The descriptor stays owned until cleanup has settled.
            if cleanup_fails:
                raise TimeoutError("cleanup did not reap")
        finally:
            settled.set()

    harness.spawn.side_effect = spawn
    harness.cleanup.side_effect = cleanup
    task = asyncio.create_task(probe.qualify(harness.ident))
    try:
        await asyncio.wait_for(reading.wait(), 3)
        task.cancel()
        await asyncio.wait_for(cleaning.wait(), 3)
        for _ in range(extra_cancellations):
            task.cancel()
            await asyncio.sleep(0)
        assert not task.done()
        assert not settled.is_set()
        close.assert_not_called()
        os.fstat(owned_pipe)
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, 3)
        assert settled.is_set()
        harness.cleanup.assert_awaited_once_with(harness.proc, owned_pipe)
        close.assert_called_once_with(owned_pipe)
        assert_closed(owned_pipe)
    finally:
        release.set()
        if not task.done():
            task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.parametrize("error", [TimeoutError, asyncio.CancelledError])
async def test_probe_cleanup_exception_still_closes_owned_fd(
    harness, monkeypatch, owned_pipe, error
):
    close = Mock(wraps=os.close)
    monkeypatch.setattr(probe.os, "pidfd_open", lambda pid: owned_pipe)
    monkeypatch.setattr(probe.os, "close", close)
    original_spawn = harness.spawn.side_effect

    async def spawn(*args, **kwargs):
        proc = await original_spawn(*args, **kwargs)
        proc.stdout.read.side_effect = RuntimeError("probe read failed")
        return proc

    harness.spawn.side_effect = spawn
    harness.cleanup.side_effect = error("cleanup did not reap")
    with pytest.raises(error):
        await probe.qualify(harness.ident)
    harness.cleanup.assert_awaited_once_with(harness.proc, owned_pipe)
    close.assert_called_once_with(owned_pipe)
    assert_closed(owned_pipe)


def test_eis_constructor_failure_closes_transferred_pipe(gi_worker, owned_pipe):
    worker = gi_worker[0]
    worker.descriptor = Mock(return_value=owned_pipe)
    with pytest.raises(OSError) as caught:
        worker.connect_eis()
    assert caught.value.errno == errno.ENOTSOCK
    worker.descriptor.assert_called_once_with(portal.RD, "ConnectToEIS")
    assert_closed(owned_pipe)
    with pytest.raises(portal.PortalError, match="one-shot"):
        worker.connect_eis()


@pytest.mark.parametrize("stop_result", ["success", "failure"])
def test_capture_stop_return_controls_success_and_cleanup_receipt(
    gi_worker, monkeypatch, owned_pipe, stop_result
):
    worker, modules, _, _ = gi_worker
    worker.streams = {7: {"mapping_id": "m"}}
    worker.descriptor = Mock(return_value=owned_pipe)
    buffer = NS(pts=2, get_size=lambda: 3, map=lambda flags: (True, NS(data=b"rgb")), unmap=Mock())
    sample = NS(
        get_buffer=lambda: buffer,
        get_segment=lambda: NS(format=1, to_running_time=lambda *args: 2),
        get_caps=lambda: "caps",
    )
    clock = NS(get_time=lambda: 1000)
    source = NS(get_static_pad=lambda name: NS(add_probe=Mock()))
    sink = NS(emit=lambda *args: sample)
    states = []

    def set_state(state):
        os.fstat(owned_pipe)
        states.append(state)
        return stop_result if state == "NULL" else "success"

    pipeline = NS(
        get_by_name=lambda name: source if name == "source" else sink,
        set_state=set_state,
        get_bus=lambda: NS(pop_filtered=lambda flag: None),
        get_clock=lambda: clock,
        get_base_time=lambda: 1,
    )
    modules.update(
        {
            "gi.repository.Gst": NS(
                init=Mock(),
                parse_launch=lambda spec: pipeline,
                SECOND=1,
                MSECOND=1,
                PadProbeType=NS(EVENT_DOWNSTREAM=1, BUFFER=2),
                State=NS(PLAYING="PLAYING", NULL="NULL"),
                StateChangeReturn=NS(FAILURE="failure"),
                MessageType=NS(ERROR=1),
                CLOCK_TIME_NONE=-1,
                Format=NS(TIME=1),
                MapFlags=NS(READ=1),
            ),
            "gi.repository.GstApp": NS(),
            "gi.repository.GstVideo": NS(
                VideoInfo=NS(
                    new_from_caps=lambda caps: NS(width=1, height=1, stride=[3], offset=[0])
                )
            ),
        }
    )
    monkeypatch.setattr(portal, "_frame_time", lambda *args: (123.0, 0.001))
    if stop_result == "failure":
        with pytest.raises(portal.PortalError, match="pipeline failed to stop"):
            worker.capture(7)
        assert worker._cleanup_errors == ["pipeline_stop:PortalError"]
    else:
        metadata, image = worker.capture(7)
        assert metadata["clock_verified"]
        assert image.startswith(b"\x89PNG")
        assert worker._cleanup_errors == []
    buffer.unmap.assert_called_once()
    assert states == ["PLAYING", "NULL"]
    assert_closed(owned_pipe)
    receipt = worker.close()
    assert receipt["cleanup_errors"] == worker._cleanup_errors
    assert receipt["connection_closed"]
