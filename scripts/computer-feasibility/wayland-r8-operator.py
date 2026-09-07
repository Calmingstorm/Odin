"""Genuine portal Notify session as private simulated human, NEVER product input.

This session never calls ConnectToEIS. A separate real consent grant and process
owns it; no host sockets, direct Mutter bypass or permission-store alteration.
"""
import json
import os
from pathlib import Path
import socket
import time
import uuid

import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib

DEST = 'org.freedesktop.portal.Desktop'
ROOT = '/org/freedesktop/portal/desktop'
RD = 'org.freedesktop.portal.RemoteDesktop'
SC = 'org.freedesktop.portal.ScreenCast'
SOCKET = '/tmp/r8-operator.sock'
KEYS = {'Control_R': 65508, 'Control_L': 65507, 'Alt_L': 65513, 'Shift_L': 65505,
        'alt': 65513, 'ctrl': 65507, 'Tab': 65289, 'Escape': 65307, 'Return': 65293,
        's': 115, 'a': 97, 'Home': 65360, 'End': 65367}


def client(args):
    with socket.socket(socket.AF_UNIX) as sock:
        sock.settimeout(8)
        sock.connect(SOCKET)
        sock.sendall(json.dumps(args).encode() + b'\n')
        result = json.loads(sock.makefile('rb').readline())
        if result != {'ok': True}:
            raise RuntimeError(result)


def main():
    assert Path('/.dockerenv').exists() and os.environ['HOME'] == '/tmp/home'
    assert os.environ['R8_BACKEND'] == 'native-headless'
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    session = None

    def call(iface, method, signature, values):
        return bus.call_sync(DEST, ROOT, iface, method, GLib.Variant(signature, values),
                             None, Gio.DBusCallFlags.NONE, 5000, None)

    def request(iface, method, signature, values):
        token = 'r8' + uuid.uuid4().hex
        options = {k: GLib.Variant(*v) for k, v in values[-1].items()}
        options['handle_token'] = GLib.Variant('s', token)
        expected = '/org/freedesktop/portal/desktop/request/' + bus.get_unique_name()[1:].replace('.', '_') + '/' + token
        response = []
        loop = GLib.MainLoop()
        def received(_b, _s, _p, _i, _n, params):
            response.append(params.unpack())
            loop.quit()
        sub = bus.signal_subscribe(DEST, 'org.freedesktop.portal.Request', 'Response', expected,
                                   None, Gio.DBusSignalFlags.NONE, received)
        timer = GLib.timeout_add_seconds(40, lambda: (loop.quit(), False)[1])
        try:
            actual = call(iface, method, signature, (*values[:-1], options)).unpack()[0]
            assert actual == expected
            if method == 'Start': Path('/tmp/r8-operator-consent').touch()
            if not response: loop.run()
            if not response or response[0][0] != 0: raise RuntimeError((method, response))
            print(json.dumps(dict(event='operator_portal_granted', method=method)), flush=True)
            return response[0][1]
        finally:
            bus.signal_unsubscribe(sub)
            if GLib.MainContext.default().find_source_by_id(timer): GLib.source_remove(timer)

    def notify(method, signature, *values):
        call(RD, method, signature, (session, {}, *values))

    def key(value, down):
        notify('NotifyKeyboardKeysym', '(oa{sv}iu)', KEYS.get(value, ord(value) if len(value) == 1 else -1), int(down))

    try:
        session = request(RD, 'CreateSession', '(a{sv})', ({'session_handle_token': ('s', 'r8operator' + uuid.uuid4().hex)},))['session_handle']
        request(RD, 'SelectDevices', '(oa{sv})', (session, {'types': ('u', 3), 'persist_mode': ('u', 0)}))
        request(SC, 'SelectSources', '(oa{sv})', (session, {'types': ('u', 1), 'multiple': ('b', False), 'cursor_mode': ('u', 2)}))
        start = request(RD, 'Start', '(osa{sv})', (session, '', {}))
        stream = start['streams'][0][0]
        with socket.socket(socket.AF_UNIX) as listener:
            listener.bind(SOCKET)
            listener.listen(1)
            listener.settimeout(300)
            while True:
                peer, _ = listener.accept()
                with peer:
                    peer.settimeout(5)
                    args = json.loads(peer.makefile('rb').readline(4096))
                    if args == ['close']:
                        peer.sendall(b'{"ok":true}\n')
                        break
                    try:
                        i = 0
                        while i < len(args):
                            op = args[i]; i += 1
                            if op == 'mousemove':
                                x, y = map(float, args[i:i+2]); i += 2
                                notify('NotifyPointerMotionAbsolute', '(oa{sv}udd)', stream, x, y)
                            elif op == 'click':
                                button = 271 + int(args[i]); i += 1
                                notify('NotifyPointerButton', '(oa{sv}iu)', button, 1)
                                notify('NotifyPointerButton', '(oa{sv}iu)', button, 0)
                            elif op in ('keydown', 'keyup'):
                                key(args[i], op == 'keydown'); i += 1
                            elif op == 'key':
                                keys = args[i].split('+'); i += 1
                                for value in keys: key(value, True)
                                for value in reversed(keys): key(value, False)
                            elif op == 'type':
                                delay = .04
                                if args[i] == '--delay': delay = float(args[i+1])/1000; i += 2
                                text = args[i]; i += 1
                                for value in text:
                                    key(value, True); key(value, False); time.sleep(delay)
                            else: raise ValueError(op)
                        peer.sendall(b'{"ok":true}\n')
                    except Exception as exc:
                        peer.sendall(json.dumps({'error': str(exc)}).encode() + b'\n')
                        raise
    finally:
        if session:
            bus.call_sync(DEST, session, 'org.freedesktop.portal.Session', 'Close', None,
                          None, Gio.DBusCallFlags.NONE, 3000, None)
        Path(SOCKET).unlink(missing_ok=True)


if __name__ == '__main__':
    main()
