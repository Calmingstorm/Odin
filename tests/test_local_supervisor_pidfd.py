"""Exit wakeups, not fast polling. Only fixture-owned harmless children run."""
import selectors
import socket
import subprocess
import sys
import time
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.tools import local_supervisor_worker as w


@pytest.fixture
def worker(monkeypatch):
    selector = Mock()
    selector.select.return_value = []
    monkeypatch.setattr(w.selectors, 'DefaultSelector', lambda: selector)
    monkeypatch.setattr(w.os, 'close', Mock())
    return w.Worker(Mock())


@pytest.mark.parametrize('connected', [True, False])
def test_exit_watch_is_consumed_without_control_io_or_descriptor_close(worker, connected):
    worker.connected = connected
    worker.selector.select.return_value = [
        (SimpleNamespace(fileobj=110), selectors.EVENT_READ),
        (SimpleNamespace(fileobj=111), selectors.EVENT_READ),
    ]
    worker.io()
    worker.selector.select.assert_called_once_with(.02)
    assert worker.selector.unregister.call_args_list == [((110,),), ((111,),)]
    worker.control.recv.assert_not_called()
    worker.control.send.assert_not_called()
    w.os.close.assert_not_called()
    assert not worker.failed


@pytest.mark.parametrize('consumed', [True, False])
def test_exit_reporting_retires_leader_watch_and_descriptor(worker, consumed):
    worker.leader = SimpleNamespace(poll=Mock(return_value=0))
    worker.leader_fd = 110
    if consumed:
        worker.selector.unregister.side_effect = KeyError(110)
    worker.io = Mock()
    worker.poll_leader()
    worker.poll_leader()
    worker.selector.unregister.assert_called_once_with(110)
    w.os.close.assert_called_once_with(110)
    assert worker.exit_reported and worker.leader_fd is None
    assert bytes(worker.outgoing) == b'{"event": "exit", "returncode": 0}\n'


@pytest.mark.parametrize('registration_error', [False, True])
def test_discovery_watches_verified_pin_and_closes_failed_registration(worker, monkeypatch,
                                                                      registration_error):
    monkeypatch.setattr(w, 'children', lambda pid: {10} if pid == worker.owner else set())
    monkeypatch.setattr(w, 'stat', lambda pid: (worker.owner, 1000))
    monkeypatch.setattr(w, 'dead', lambda pin: False)
    monkeypatch.setattr(w.os, 'pidfd_open', lambda pid: 110)
    if registration_error:
        worker.selector.register.side_effect = RuntimeError('fixture')
    assert worker.discover() is not registration_error
    worker.selector.register.assert_called_with(110, selectors.EVENT_READ)
    assert bool(worker.pins) is not registration_error
    assert worker.failed is registration_error
    if registration_error:
        w.os.close.assert_called_once_with(110)
    else:
        w.os.close.assert_not_called()


def test_reap_retires_descendant_watch(worker, monkeypatch):
    worker.pins[(10, 1000)] = w.Pin(10, 1000, 110)
    monkeypatch.setattr(w, 'stat', lambda pid: None)
    monkeypatch.setattr(w, 'dead', lambda pin: True)
    worker.reap()
    worker.selector.unregister.assert_called_once_with(110)
    w.os.close.assert_called_once_with(110)
    assert not worker.pins and not worker.failed


def test_pidfd_and_control_events_share_one_wait(worker):
    worker.selector.select.return_value = [
        (SimpleNamespace(fileobj=110), selectors.EVENT_READ),
        (SimpleNamespace(fileobj=worker.control), selectors.EVENT_READ),
    ]
    worker.control.recv.return_value = b'{"op":"terminate","grace":0}\n'
    worker.io()
    worker.selector.select.assert_called_once_with(.02)
    worker.selector.unregister.assert_called_once_with(110)
    assert worker.stop_at is not None and not worker.failed


def test_reap_after_consumed_watch_still_closes_descriptor(worker, monkeypatch):
    worker.pins[(10, 1000)] = w.Pin(10, 1000, 110)
    worker.selector.unregister.side_effect = KeyError(110)
    monkeypatch.setattr(w, 'stat', lambda pid: None)
    monkeypatch.setattr(w, 'dead', lambda pin: True)
    worker.reap()
    w.os.close.assert_called_once_with(110)
    assert not worker.pins and not worker.failed


def test_leader_registration_failure_closes_fd_and_retains_cleanup(worker, monkeypatch):
    monkeypatch.setattr(w, 'subreaper', lambda: None)
    monkeypatch.setattr(w.subprocess, 'Popen', lambda *a, **kw:
                        SimpleNamespace(pid=10, poll=lambda: 0))
    monkeypatch.setattr(w.os, 'pidfd_open', lambda pid: 110)
    worker.selector.register.side_effect = RuntimeError('fixture')
    monkeypatch.setattr(w, 'children', lambda pid: set())
    worker.discover = Mock(return_value=True)
    worker.io = lambda *a: setattr(worker, 'settlement_ack', worker.settlement_published)
    assert worker.run('true') == 1
    w.os.close.assert_any_call(110)
    assert worker.failed and worker.exit_reported and worker.settlement_published


@pytest.mark.parametrize('kind', ['leader', 'descendant'])
@pytest.mark.parametrize('connected', [True, False])
def test_real_pidfd_wakes_io_before_idle_deadline(kind, connected):
    parent, peer = socket.socketpair()
    worker = w.Worker(parent)
    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(.1)'])
    fd = w.os.pidfd_open(child.pid)
    try:
        worker.selector.register(fd, selectors.EVENT_READ)
        if kind == 'leader':
            worker.leader = child
            worker.leader_fd = fd
        else:
            worker.pins[(child.pid, 1)] = w.Pin(child.pid, 1, fd)
        if not connected:
            worker.disconnect()
        started = time.monotonic()
        worker.io(2)
        assert time.monotonic() - started < 1.5
        assert w.dead(w.Pin(child.pid, 1, fd))
        assert fd not in worker.selector.get_map()
        assert w.os.fstat(fd)  # Watch consumed; ownership fd remains open.
        assert not worker.failed
    finally:
        child.wait(timeout=5)
        worker.selector.close()
        w.os.close(fd)
        parent.close()
        peer.close()
