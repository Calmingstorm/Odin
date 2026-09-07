"""In-process private probe tests; native and OS boundaries never execute."""
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from types import SimpleNamespace as NS  # noqa: N814
from unittest.mock import MagicMock, Mock

import pytest

ASSETS = Path(__file__).resolve().parents[1] / 'src/computer/runtime/assets'


@pytest.fixture
def modules(monkeypatch):
    private = ModuleType('wayland_probe_private')
    private.assert_private_environment = Mock(return_value={
        'nonce': 'test', 'identity': {'backend': 'native', 'version': '47', 'binding_digest': 'x'}})
    private.require_same_stack = Mock()
    monkeypatch.setitem(sys.modules, private.__name__, private)
    result = []
    for name in ('sender', 'session'):
        spec = importlib.util.spec_from_file_location(
            'r10_' + name, ASSETS / ('wayland_probe_' + name + '.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.os = MagicMock()
        module.time = MagicMock()
        module.time.monotonic.return_value = 0
        module.socket = NS(socket=MagicMock(), AF_UNIX=1, SOCK_STREAM=1,
                           SOL_SOCKET=1, SO_PEERCRED=17)
        if name == 'sender':
            module.select = MagicMock()
        else:
            module.subprocess = MagicMock()
            module.selectors = MagicMock()
            module.Path = MagicMock()
        result.append(module)
    return result


def native(s):
    lib = MagicMock()
    lib.ei_new_sender.return_value = 1
    lib.ei_setup_backend_fd.return_value = 0
    lib.ei_get_fd.return_value = 8
    lib.ei_get_event.return_value = 0
    lib.ei_device_ref.side_effect = lambda d: d
    lib.ei_now.return_value = 123
    lib.ei_device_has_capability.return_value = True
    return lib, s.Sender(lib, 9)


def events(lib, sender, values):
    lib.ei_get_event.side_effect = list(range(1, len(values) + 1)) + [0]
    lib.ei_event_get_type.side_effect = [v[0] for v in values]
    lib.ei_event_get_device.side_effect = [v[1] for v in values if v[0] in (5, 6, 7, 8)]
    sender.pump()
    lib.ei_get_event.side_effect = None


def test_sender_lifecycle(modules):
    s, _ = modules
    library = MagicMock()
    s.c = MagicMock(wraps=s.c)
    s.c.CDLL.return_value = library
    assert s.bind_library() is library
    lib, sender = native(s)
    events(lib, sender, [(1, 0), (3, 0), (5, 20), (8, 20), (8, 20)])
    assert sender.connected and sender.active == {20}
    sender.handshake()
    sender.hold()
    for method, text in [('hold', 'already'), ('fresh', 'neutral'), ('escape', 'neutral')]:
        with pytest.raises(s.ProbeError, match=text):
            getattr(sender, method)()
    sender.release()
    sender.fresh()
    sender.escape()
    events(lib, sender, [(7, 20), (8, 20)])
    assert sender.sequences[20] == 2
    sender.close()
    sender.close()
    lib.ei_device_stop_emulating.assert_called_once_with(20)
    assert sender.ctx is None


@pytest.mark.parametrize('failure', ['new', 'setup', 'fd'])
def test_sender_init_errors(modules, failure):
    s, _ = modules
    lib, _ = native(s)
    if failure == 'new':
        lib.ei_new_sender.return_value = 0
    elif failure == 'setup':
        lib.ei_setup_backend_fd.return_value = -1
    else:
        lib.ei_get_fd.return_value = -1
    with pytest.raises(s.ProbeError):
        s.Sender(lib, 9)
    if failure == 'new':
        s.os.close.assert_called_once_with(9)
    else:
        lib.ei_unref.assert_called()


@pytest.mark.parametrize('values,held,message', [
    ([(2, 0)], False, 'disconnected'), ([(5, 0)], False, 'no device'),
    ([(8, 20)], False, 'unknown'), ([(5, 20), (6, 20)], True, 'lost'),
])
def test_sender_event_errors(modules, values, held, message):
    s, _ = modules
    lib, sender = native(s)
    sender.held = held
    with pytest.raises(s.ProbeError, match=message):
        events(lib, sender, values)
    assert lib.ei_event_unref.call_count == len(values)


def test_sender_budgets_and_release(modules):
    s, _ = modules
    lib, sender = native(s)
    lib.ei_get_event.return_value = 1
    lib.ei_event_get_type.return_value = 99
    with pytest.raises(s.ProbeError, match='budget'):
        sender.pump()
    lib.ei_get_event.return_value = 0
    with pytest.raises(s.ProbeError, match='capability'):
        sender.device(2)
    s.time.monotonic.side_effect = [0, 0, 0, 11]
    sender.connected = True
    with pytest.raises(s.ProbeError, match='timed out'):
        sender.handshake()
    s.time.monotonic.side_effect = None
    sender.held = True
    with pytest.raises(s.ProbeError, match='ownership'):
        sender.release()
    sender.close()
    assert sender.ctx is None


@pytest.mark.parametrize('raw,error', [
    (b'x\n', 'invalid'), (b'\xff\n', 'invalid'), (b'[]\n', 'only op'),
    (b'{"op":"no"}\n', 'unsupported'), (b'x' * 4097 + b'\n', 'large'),
    (b'x' * 4097, 'large'),
])
def test_command_invalid(modules, raw, error):
    s, _ = modules
    reader = s.Commands()
    reader.buffer.extend(raw)
    with pytest.raises(s.ProbeError, match=error):
        reader.read(10)


def test_command_reader(modules):
    s, _ = modules
    reader = s.Commands()
    s.select.select.return_value = ([0], [], [])
    s.os.read.side_effect = [b'{"op":', b'"hold"}\n', b'']
    sender = NS(fd=8, pump=Mock())
    assert reader.read(10, sender) == 'hold'
    assert reader.read(10, sender) is None
    reader.buffer.extend(b'x')
    s.os.read.side_effect = None
    s.os.read.return_value = b''
    with pytest.raises(s.ProbeError, match='incomplete'):
        reader.read(10)
    reader.buffer.clear()
    with pytest.raises(s.ProbeError, match='deadline'):
        reader.read(0)
    reader.buffer.extend(b'{"op":"eof"}\n')
    reader.count = 64
    with pytest.raises(s.ProbeError, match='budget'):
        reader.read(10)


@pytest.mark.parametrize('failure', [None, 'stdio', 'family', 'peer', 'namespace', 'duplicate'])
def test_socket_handoff(modules, failure):
    s, _ = modules
    peer = s.socket.socket.return_value
    peer.family = s.socket.AF_UNIX if failure != 'family' else 999
    peer.type = s.socket.SOCK_STREAM
    peer.getsockopt.return_value = s.struct.pack('3i', 0 if failure == 'peer' else 42, 1, 1)
    s.os.getpid.return_value = 10
    s.os.getppid.return_value = 11

    def link(path):
        if path == '/gone':
            raise FileNotFoundError
        if '/ns/' in path:
            return 'other' if failure == 'namespace' and '/42/' in path else 'ns'
        return 'sock' if path == '/proc/self/fd/9' or failure == 'duplicate' else 'other'

    s.os.readlink.side_effect = link
    s.os.scandir.return_value.__enter__.return_value = [
        NS(name='9', path='/copy'), NS(name='1', path='/gone')]
    if failure:
        with pytest.raises(s.ProbeError):
            s.verify_socket_handoff(1 if failure == 'stdio' else 9)
    else:
        s.verify_socket_handoff(9)
        s.os.set_inheritable.assert_called_once_with(9, False)


@pytest.mark.parametrize('ops,expected', [
    (['handoff', 'hold', 'release', 'fresh', 'escape', None], 0),
    (['bad'], 2), (['handoff', 'handoff'], 2), (['handoff', 'eof', None], 0)])
def test_sender_main(modules, monkeypatch, capsys, ops, expected):
    s, _ = modules
    monkeypatch.setattr(sys, 'argv', ['sender', '--fd', '9'])
    s.Commands = Mock(return_value=NS(read=Mock(side_effect=ops)))
    s.verify_socket_handoff = Mock()
    s.bind_library = Mock()
    instance = MagicMock()
    s.Sender = Mock(return_value=instance)
    if 'eof' in ops:
        s.os._exit.side_effect = SystemExit(0)
        with pytest.raises(SystemExit):
            s.main()
        s.os._exit.assert_called_once_with(0)
    else:
        assert s.main() == expected
    assert [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    if ops[0] == 'handoff':
        instance.close.assert_called_once()


def trial(modules):
    _, m = modules
    return m, m.Trial(m.assert_private_environment())


def test_session_spawn_pump(modules):
    m, t = trial(modules)
    child = MagicMock(pid=12)
    child.stdout.fileno.return_value = 33
    m.subprocess.Popen.return_value = child
    assert t.spawn(['fake'], capture=True) is child
    t.receiver = child
    key = NS(fd=33, fileobj=child.stdout, data=12)
    t.selector.select.return_value = [(key, 1)]
    m.os.read.return_value = b'{"kind":"sample","pid":12}\n'
    t.pump()
    assert t.rows == [{'kind': 'sample', 'pid': 12}]
    m.os.read.return_value = b''
    t.pump()
    t.selector.unregister.assert_called_once_with(child.stdout)
    child.stdout = None
    with pytest.raises(m.TrialError, match='pipe_missing'):
        t.spawn(['fake'], capture=True)


@pytest.mark.parametrize('failure', [
    'deadline', 'output_limit', 'line_limit',
    'telemetry_or_sender_error', 'identity_mismatch'])
def test_session_pump_errors(modules, failure):
    m, t = trial(modules)
    t.receiver = NS(pid=12)
    t.buffers[12] = bytearray()
    t.outputs[12] = []
    t.selector.select.return_value = [(NS(fd=3, fileobj=3, data=12), 1)]
    m.os.read.return_value = b'{"kind":"sample","pid":99}\n'
    if failure == 'deadline':
        t.deadline = 0
    elif failure == 'output_limit':
        t.total_output = 262144
    elif failure == 'line_limit':
        m.os.read.return_value = b'x' * 16385
    elif failure == 'telemetry_or_sender_error':
        m.os.read.return_value = b'{"event":"error"}\n'
    with pytest.raises(m.TrialError, match=failure):
        t.pump()


def test_session_wait_command_and_samples(modules):
    m, t = trial(modules)
    t.selector.select.return_value = []
    t.wait(lambda: True, 'failed')
    for attr in ('compositor', 'receiver'):
        setattr(t, attr, NS(poll=lambda: 1))
        with pytest.raises(m.TrialError, match=attr + '_exited'):
            t.wait(lambda: True, 'failed')
        setattr(t, attr, None)
    with pytest.raises(m.TrialError, match='timeout'):
        t.wait(lambda: False, 'timeout', seconds=0)
    with pytest.raises(m.TrialError, match='not_connected'):
        t.command('fresh')
    t.sender = MagicMock(pid=9)
    t.outputs[9] = []

    def wait(predicate, *args):
        t.outputs[9].append({'event': 'ready'})
        assert predicate()

    t.wait = wait
    t.command('handoff', 'ready')
    t.sender.stdin.write.assert_called_once_with(b'{"op": "handoff"}\n')
    assert not t.clean_after(0)
    t.rows = [{'kind': 'event', 'type': 'key_press', 'key': 97},
              {'kind': 'sample', 'active': True, 'focused': True,
               'keys': [], 'buttons': [], 'state': 0}]
    assert t.event_after(0, 'key_press', key=97)
    assert not t.event_after(0, 'key_press', button=1)
    assert t.clean_after(0)


def gi_setup(monkeypatch):
    gio = MagicMock()
    gio.DBusCallFlags.NONE = 0
    glib = MagicMock()
    glib.Error = RuntimeError
    glib.Variant.side_effect = lambda signature, value: NS(unpack=lambda: value)
    for name, value in [('gi', MagicMock()), ('gi.repository.Gio', gio),
                        ('gi.repository.GLib', glib)]:
        monkeypatch.setitem(sys.modules, name, value)
    return gio, glib


@pytest.mark.parametrize('failure', [None, 'missing', 'shape', 'peer'])
def test_session_connect_sender(modules, monkeypatch, failure):
    m, t = trial(modules)
    gi_setup(monkeypatch)
    with pytest.raises(m.TrialError, match='bus_not_connected'):
        t.call('/', 'i', 'm')
    t.bus = MagicMock()
    t.call('/', 'i', 'm')
    t.bus.call_sync.assert_called_once()
    t.compositor = None if failure == 'missing' else NS(pid=42)
    fds = MagicMock()
    fds.steal_fds.return_value = [9]
    t.bus.call_with_unix_fd_list_sync.return_value = (
        NS(unpack=lambda: (1 if failure == 'shape' else 0,)), fds)
    m.os.getuid.return_value = 10
    peer = m.socket.socket.return_value.__enter__.return_value
    peer.getsockopt.return_value = m.struct.pack(
        '3i', 99 if failure == 'peer' else 42, 10, 10)
    t.spawn = Mock(return_value=NS(pid=19))
    t.command = Mock()
    if failure:
        with pytest.raises(m.TrialError):
            t.connect_sender()
    else:
        t.connect_sender()
        t.command.assert_called_once_with('handoff', 'ready')
    if failure != 'missing':
        m.os.close.assert_called_once_with(9)


@pytest.mark.parametrize('backend', ['native', 'x11-nested'])
@pytest.mark.parametrize('failure', [
    None, 'owner', 'shell_owner', 'version', 'bus', 'windows', 'exit', 'lost'])
def test_session_run(modules, monkeypatch, backend, failure):
    m, t = trial(modules)
    gio, glib = gi_setup(monkeypatch)
    t.marker['identity']['backend'] = backend
    child = MagicMock(pid=42)
    child.poll.return_value = None
    child.returncode = 1 if failure == 'exit' else 0
    t.spawn = Mock(return_value=child)
    m.Path.return_value.is_socket.return_value = True
    m.subprocess.run.return_value.stdout = '' if failure == 'windows' else '123 456'
    bus = MagicMock()
    gio.DBusConnection.new_for_address_sync.return_value = None if failure == 'bus' else bus
    version_calls = []

    def call(*args):
        method = args[3]
        value = args[4].unpack()[0]
        if method == 'Get':
            if not version_calls:
                version_calls.append(1)
                raise glib.Error('not ready')
            result = 'bad' if failure == 'version' else '47'
        elif method == 'GetConnectionUnixProcessID':
            mismatch = (
                failure == 'owner' and value == 'org.gnome.Mutter.RemoteDesktop'
            ) or (failure == 'shell_owner' and value == 'org.gnome.Shell')
            result = 99 if mismatch else 42
        elif method == 'GetNameOwner':
            result = value
        else:
            result = True
        return NS(unpack=lambda: (result,))

    bus.call_sync.side_effect = call
    t.call = Mock(return_value=NS(unpack=lambda: ('/session',)))

    def connect():
        t.sender = child

    t.connect_sender = connect
    sample = {'kind': 'sample', 'active': True, 'focused': True,
              'keys': [], 'buttons': [], 'state': 0}

    def command(op, expect=None):
        if op in ('hold', 'fresh', 'eof'):
            key = 65505 if op in ('hold', 'eof') else 97
            suffixes = (['press'] if op == 'hold' else
                        ['release'] if op == 'eof' else ['press', 'release'])
            for suffix in suffixes:
                t.rows.extend([{'kind': 'event', 'type': 'button_' + suffix, 'button': 1},
                               {'kind': 'event', 'type': 'key_' + suffix, 'key': key}])
            t.rows.append(dict(sample, keys=[65505], buttons=[1], state=257)
                          if op == 'hold' else dict(sample))
        if failure == 'lost' and t.stage == 'fresh_input' and op == 'fresh':
            child.poll.return_value = 0

    t.command = command

    def wait(predicate, code, seconds=5):
        t.rows.extend([dict(sample) for _ in range(8)])
        t.rows.append({'kind': 'receiver_ready'})
        if not predicate():
            assert predicate(), code

    t.wait = wait
    should_fail = failure is not None and (failure != 'windows' or backend == 'x11-nested')
    if should_fail:
        with pytest.raises(m.TrialError):
            t.run()
    else:
        t.run()
        assert {'same_receiver_fresh_input', 'sole_sender_eof', 'exact_mapped_stack'} <= t.checks


def test_session_unsupported_backend(modules, monkeypatch):
    m, t = trial(modules)
    gi_setup(monkeypatch)
    t.marker['identity']['backend'] = 'unsupported'
    t.spawn = Mock()
    t.wait = Mock()
    with pytest.raises(m.TrialError, match='backend_unsupported'):
        t.run()


@pytest.mark.parametrize('failure', [False, True])
def test_session_cleanup(modules, failure):
    m, t = trial(modules)
    child = MagicMock()
    child.poll.return_value = None
    child.terminate.side_effect = ProcessLookupError
    child.kill.side_effect = ProcessLookupError
    t.children = [child]
    m.time.monotonic.side_effect = [0, 0, 2, 2, 2, 5] if failure else [0, 0, 2, 2, 2]
    m.Path.return_value.read_text.side_effect = ['123', '123'] if failure else ['123', '']
    m.os.kill.side_effect = ProcessLookupError
    m.os.waitpid.side_effect = [(123, 0), ChildProcessError()]
    if failure:
        with pytest.raises(m.TrialError, match='cleanup_incomplete'):
            t.cleanup()
    else:
        t.cleanup()
        assert 'private_cleanup_reaped' in t.checks
        t.selector.close.assert_called_once()
    child.wait.assert_called_once_with(timeout=1)


@pytest.mark.parametrize('failure', [None, 'valid_code', 'Bad error!', 'cleanup', 'prctl'])
def test_session_main(modules, capsys, failure):
    m, t = trial(modules)
    m.resource = MagicMock()
    m.ctypes = MagicMock()
    m.ctypes.CDLL.return_value.prctl.return_value = 1 if failure == 'prctl' else 0
    m.Trial = Mock(return_value=t)
    t.run = Mock(side_effect=RuntimeError(failure)
                 if failure in ('valid_code', 'Bad error!') else None)
    t.cleanup = Mock(side_effect=RuntimeError() if failure == 'cleanup' else None)
    if failure == 'prctl':
        with pytest.raises(RuntimeError, match='subreaper_failed'):
            m.main()
        return
    m.main()
    result = json.loads(capsys.readouterr().out)
    assert result['passed'] == (failure is None)
    if failure == 'Bad error!':
        assert result['code'] == 'probe_private_init_failed'
    elif failure == 'valid_code':
        assert result['code'] == failure
    elif failure == 'cleanup':
        assert result['code'] == 'probe_private_cleanup_incomplete'
