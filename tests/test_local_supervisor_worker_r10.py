"""In-process worker tests. Kernel mutations are replaced with harmless fakes."""
import errno
import io
import json
import signal
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.tools import local_supervisor_worker as w


@pytest.fixture
def worker(monkeypatch):
    selector = Mock()
    selector.select.return_value = []
    monkeypatch.setattr(w.selectors, 'DefaultSelector', lambda: selector)
    for module, name in [(w.os, 'close'), (w.os, 'pidfd_open'),
                         (w.os, 'waitid'), (w.signal, 'pidfd_send_signal'),
                         (w.signal, 'signal'), (w.ctypes, 'CDLL'),
                         (w.subprocess, 'Popen')]:
        monkeypatch.setattr(module, name, Mock(side_effect=AssertionError(name)))
    monkeypatch.setattr(w.time, 'monotonic', lambda: 100.0)
    return w.Worker(Mock())


def frames(worker):
    return [json.loads(line) for line in worker.outgoing.splitlines()]


def test_control_lifecycle(worker):
    worker.terminate(20)
    assert (worker.stop_at, worker.kill_at) == (100, 108)
    worker.terminate(2)
    assert worker.kill_at == 102
    worker.error('safe', ValueError('secret'))
    worker.error('safe', ValueError('secret'))
    assert frames(worker) == [{'event': 'error', 'message': 'safe (ValueError)'}]
    assert worker.failed and worker.kill_at == 100
    worker.selector.unregister.side_effect = KeyError()
    worker.disconnect()
    worker.emit('ignored')
    worker.disconnect()
    assert not worker.connected and not worker.outgoing
    worker.control.close.assert_called_once()


def test_output_limit(worker):
    worker.emit('large', data='x' * 65536)
    assert not worker.connected


@pytest.mark.parametrize('message', [[], {'op': 'bad'}, {'op': 'terminate', 'grace': True},
    {'op': 'terminate', 'grace': '1'}, {'op': 'terminate', 'grace': -1},
    {'op': 'terminate', 'grace': float('inf')}, {'op': 'terminate', 'grace': float('nan')}])
def test_bad_control(worker, message):
    worker.selector.select.return_value = [(None, w.selectors.EVENT_READ)]
    worker.control.recv.return_value = json.dumps(message).encode() + b'\n'
    worker.io()
    assert worker.failed and not worker.incoming
    assert frames(worker)[0]['message'] == 'invalid control message (ValueError)'


def test_io_partial_write_and_read(worker):
    worker.emit('hello')
    original = bytes(worker.outgoing)
    worker.selector.select.return_value = [(None, w.selectors.EVENT_READ | w.selectors.EVENT_WRITE)]
    worker.control.send.return_value = 2
    worker.control.recv.return_value = b'{"op":"terminate",'
    worker.io()
    assert worker.outgoing == original[2:] and worker.stop_at is None
    worker.control.send.side_effect = BlockingIOError()
    worker.control.recv.return_value = b'"grace":3}\n'
    worker.io()
    assert worker.kill_at == 103 and not worker.incoming
    worker.control.recv.side_effect = BlockingIOError()
    worker.io()
    assert worker.connected


@pytest.mark.parametrize('mode', ['eof', 'oserror', 'oversize', 'disconnected'])
def test_io_failure(worker, monkeypatch, mode):
    worker.selector.select.return_value = [(None, w.selectors.EVENT_READ)]
    if mode == 'disconnected':
        sleeper = Mock()
        monkeypatch.setattr(w.time, 'sleep', sleeper)
        worker.disconnect()
        worker.io(.123)
        sleeper.assert_called_once_with(.123)
        return
    if mode == 'oserror':
        worker.selector.modify.side_effect = OSError()
    worker.control.recv.return_value = b'x' * 65537 if mode == 'oversize' else b''
    worker.io()
    assert worker.failed if mode == 'oversize' else not worker.connected


def test_proc_parsers(monkeypatch):
    fields = [b'S', b'42'] + [b'0'] * 17 + [b'123']
    monkeypatch.setattr('builtins.open', lambda *a, **k:
                        io.BytesIO(b'8 (odd ) name) ' + b' '.join(fields)))
    assert w.stat(8) == (42, 123)
    monkeypatch.setattr(w.os, 'listdir', lambda _: ['1', '2', 'not-a-tid'])
    monkeypatch.setattr('builtins.open', lambda *a, **k: io.StringIO('12 13'))
    assert w.children(8) == {12, 13}


@pytest.mark.parametrize('code', [errno.ENOENT, errno.ESRCH, errno.EACCES])
def test_proc_errors(monkeypatch, code):
    failing = Mock(side_effect=OSError(code, 'unavailable'))
    monkeypatch.setattr('builtins.open', failing)
    if code == errno.EACCES:
        with pytest.raises(OSError):
            w.stat(8)
    else:
        assert w.stat(8) is None
    monkeypatch.setattr(w.os, 'listdir', lambda _: ['1'])
    if code == errno.EACCES:
        with pytest.raises(OSError):
            w.children(8)
    else:
        assert w.children(8) == set()
    monkeypatch.setattr(w.os, 'listdir', failing)
    if code == errno.EACCES:
        with pytest.raises(OSError):
            w.children(8)
    else:
        assert w.children(8) == set()


@pytest.mark.parametrize('failure', ['none', 'set', 'get', 'value', 'wait'])
def test_subreaper_verification_is_stubbed(worker, monkeypatch, failure):
    calls = []
    def prctl(op, value, *rest):
        calls.append(op)
        if op == 37:
            value._obj.value = 0 if failure == 'value' else 1
        return int((op == 36 and failure == 'set') or (op == 37 and failure == 'get'))
    monkeypatch.setattr(w.ctypes, 'CDLL', lambda *a, **k: SimpleNamespace(prctl=prctl))
    monkeypatch.setattr(w.os, 'pidfd_open', Mock(return_value=789))
    close = Mock()
    monkeypatch.setattr(w.os, 'close', close)
    send = Mock()
    monkeypatch.setattr(w.signal, 'pidfd_send_signal', send)
    monkeypatch.setattr(w.os, 'waitid',
                        Mock(side_effect=ChildProcessError() if failure == 'wait' else None))
    if failure in {'set', 'get', 'value'}:
        with pytest.raises((OSError, RuntimeError)):
            w.subreaper()
        close.assert_not_called()
    else:
        w.subreaper()
        send.assert_called_once_with(789, 0)
        close.assert_called_once_with(789)
    assert calls[0] == 36


def test_dead(monkeypatch):
    poll = Mock()
    monkeypatch.setattr(w.select, 'poll', lambda: poll)
    poll.poll.return_value = []
    assert not w.dead(w.Pin(4, 5, 6))
    poll.poll.return_value = [(6, 1)]
    assert w.dead(w.Pin(4, 5, 6))
    poll.register.assert_called_with(6, w.select.POLLIN)


def test_discovery_tree(worker, monkeypatch):
    root = worker.owner
    monkeypatch.setattr(w, 'children',
                        lambda pid: {10} if pid == root else ({11} if pid == 10 else set()))
    monkeypatch.setattr(w, 'stat', lambda pid: {10: (root, 1000), 11: (10, 1001)}[pid])
    monkeypatch.setattr(w, 'dead', lambda _: False)
    monkeypatch.setattr(w.os, 'pidfd_open', lambda pid: pid + 100)
    assert worker.discover()
    assert set(worker.pins) == {(10, 1000), (11, 1001)}
    assert worker.discover()


@pytest.mark.parametrize('mode', [
    'missing', 'foreign', 'gone', 'reuse', 'error', 'deadline', 'dead', 'parent_reuse'])
def test_discovery_races(worker, monkeypatch, mode):
    root = worker.owner
    if mode in {'deadline', 'dead', 'parent_reuse'}:
        worker.pins[(10, 1000)] = w.Pin(10, 1000, 110)
    expected_parent = 10 if mode == 'parent_reuse' else root
    monkeypatch.setattr(w, 'children', lambda pid: {11} if pid == expected_parent else set())
    values = iter([(root, 1), (root, 2)])
    def stat(pid):
        if mode == 'missing':
            return None
        if mode == 'foreign':
            return (-1, 1)
        if mode == 'reuse':
            return next(values)
        if mode == 'parent_reuse':
            return (10, 1001) if pid == 11 else (root, 9999)
        return (root, 1)
    monkeypatch.setattr(w, 'stat', stat)
    monkeypatch.setattr(w, 'dead', lambda _: mode == 'dead')
    error = ProcessLookupError() if mode == 'gone' else (
        PermissionError() if mode == 'error' else None)
    monkeypatch.setattr(w.os, 'pidfd_open', Mock(side_effect=error, return_value=111))
    close = Mock()
    monkeypatch.setattr(w.os, 'close', close)
    if mode == 'deadline':
        clock = iter([100, 101])
        monkeypatch.setattr(w.time, 'monotonic', lambda: next(clock))
    assert worker.discover() is (mode not in {'error', 'deadline'})
    if mode in {'reuse', 'parent_reuse'}:
        close.assert_called_once_with(111)
    if mode == 'error':
        assert worker.failed


@pytest.mark.parametrize('mode', ['live', 'zombie', 'gone', 'notchild', 'error', 'leader'])
def test_reap_identity(worker, monkeypatch, mode):
    worker.pins[(10, 1000)] = w.Pin(10, 1000, 110)
    if mode == 'leader':
        worker.leader = SimpleNamespace(pid=10)
    monkeypatch.setattr(w, 'stat', Mock(
        side_effect=OSError() if mode == 'error' else None,
        return_value=None if mode == 'gone' else (worker.owner, 1000)))
    monkeypatch.setattr(w, 'dead', lambda _: mode in {'zombie', 'gone'})
    wait = Mock(side_effect=ChildProcessError() if mode == 'notchild' else None)
    monkeypatch.setattr(w.os, 'waitid', wait)
    close = Mock()
    monkeypatch.setattr(w.os, 'close', close)
    worker.reap()
    assert bool(worker.pins) is (mode != 'gone')
    assert worker.failed is (mode == 'error')
    if mode in {'live', 'zombie', 'notchild'}:
        wait.assert_called_once_with(w.os.P_PIDFD, 110, w.os.WEXITED | w.os.WNOHANG)
    else:
        wait.assert_not_called()
    if mode == 'gone':
        close.assert_called_once_with(110)
    else:
        close.assert_not_called()


@pytest.mark.parametrize('mode', ['normal', 'gone', 'error', 'timeout'])
def test_signals_and_timeout(worker, monkeypatch, mode):
    pin = w.Pin(10, 1000, 110)
    worker.pins[(10, 1000)] = pin
    send = Mock(side_effect=ProcessLookupError() if mode == 'gone' else (
        PermissionError() if mode == 'error' else None))
    monkeypatch.setattr(w.signal, 'pidfd_send_signal', send)
    worker.signal_descendants()
    send.assert_not_called()
    worker.terminate(1)
    worker.signal_descendants()
    if mode == 'normal':
        assert pin.termed
        send.assert_called_once_with(110, signal.SIGTERM)
    monkeypatch.setattr(w.time, 'monotonic', lambda: 111 if mode == 'timeout' else 102)
    worker.signal_descendants()
    if mode in {'normal', 'timeout'}:
        assert send.call_args.args == (110, signal.SIGKILL)
    if mode == 'timeout':
        worker.signal_descendants()
        assert worker.timeout_reported and len(frames(worker)) == 1


@pytest.mark.parametrize('mode', ['normal', 'setup', 'iteration'])
def test_run_state_machine(worker, monkeypatch, mode):
    monkeypatch.setattr(w, 'subreaper', Mock(side_effect=OSError() if mode == 'setup' else None))
    leader = Mock(pid=10)
    leader.poll.return_value = 7
    spawn = Mock(return_value=leader)
    monkeypatch.setattr(w.subprocess, 'Popen', spawn)
    close = Mock(side_effect=OSError())
    monkeypatch.setattr(w.os, 'close', close)
    monkeypatch.setattr(w, 'children', lambda _: set())
    worker.signal_requested = True
    worker.discover = Mock(
        side_effect=[ValueError(), True] if mode == 'iteration' else None, return_value=True)
    emitted = []
    original = worker.emit
    def emit(*args, **kwargs):
        emitted.append((args, kwargs))
        original(*args, **kwargs)
    worker.emit = emit
    worker.io = lambda *args: worker.outgoing.clear()
    assert worker.run('harmless-placeholder') == (0 if mode == 'normal' else 1)
    assert close.call_count == 3
    assert emitted[-1] == (('settled',), {'clean': True})
    if mode != 'setup':
        spawn.assert_called_once_with(
            ['/bin/sh', '-c', 'harmless-placeholder'], start_new_session=True, close_fds=True)
        assert worker.exit_reported


@pytest.mark.parametrize('argv', [[], ['--control-fd', 'no', '--command', 'x'],
    ['--control-fd', '2', '--command', 'x'], ['--control-fd', '9', '--command', 'x', 'extra']])
def test_main_bad_arguments(monkeypatch, argv):
    monkeypatch.setattr('sys.argv', ['worker', *argv])
    assert w.main() == 2


def test_main_handlers_stubbed(worker, monkeypatch):
    monkeypatch.setattr('sys.argv', ['worker', '--control-fd', '9', '--command', 'x'])
    monkeypatch.setattr(w.socket, 'socket', lambda **kwargs: worker.control)
    monkeypatch.setattr(w, 'Worker', lambda _: worker)
    handlers = {}
    monkeypatch.setattr(w.signal, 'signal', lambda sig, handler: handlers.update({sig: handler}))
    worker.run = Mock(return_value=7)
    assert w.main() == 7
    assert handlers[signal.SIGCHLD] == signal.SIG_DFL
    handlers[signal.SIGTERM](signal.SIGTERM, None)
    assert worker.signal_requested
