"""Private native simulated operator presses actual GTK4 portal UI controls.

Mutter private Notify is ONLY the disposable simulated human, not product input
or a fake portal response. Neither permission DB nor application is modified.
"""
import os
from pathlib import Path
import sys
import time
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio, GLib
import pyatspi


def main():
    assert Path('/.dockerenv').exists() and os.environ['HOME'] == '/tmp/home'
    assert sys.argv[1:] in [['check box', 'Allow Remote Interaction'], ['push button', 'Share'], ['escape']]
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    dest = 'org.gnome.Mutter.RemoteDesktop'
    iface = dest + '.Session'
    def call(path, interface, method, args=None):
        return bus.call_sync(dest, path, interface, method, args, None, Gio.DBusCallFlags.NONE, 5000, None)
    session = call('/org/gnome/Mutter/RemoteDesktop', dest, 'CreateSession').unpack()[0]
    call(session, iface, 'Start')
    def key(value):
        call(session, iface, 'NotifyKeyboardKeysym', GLib.Variant('(ub)', (value, True)))
        call(session, iface, 'NotifyKeyboardKeysym', GLib.Variant('(ub)', (value, False)))
    try:
        if sys.argv[1:] == ['escape']:
            key(65307)
            return
        expected_role, name = sys.argv[1:]
        roles = {expected_role, 'button' if expected_role == 'push button' else expected_role}
        found = []
        def walk(node, depth=0):
            if depth > 30: return
            try:
                if node.getRoleName() in roles and node.name == name and node.getState().contains(pyatspi.STATE_SHOWING): found.append(node)
                for child in node: walk(child, depth+1)
            except Exception: pass
        for app in pyatspi.Registry.getDesktop(0):
            if 'portal' in app.name: walk(app)
        print('UI_CANDIDATES', [(n.getRoleName(), n.name, n.getState().getStates()) for n in found], flush=True)
        if not found: raise RuntimeError(f'missing real visible {name}')
        # GTK4 exposes both the accessible row and its nested checkbutton.
        # Prefer the actionable descendant; independently check focus + checked.
        node = None
        for attempt in range(16):
            focused = [n for n in found if n.getState().contains(pyatspi.STATE_FOCUSED)]
            if focused:
                node = focused[0]
                break
            key(65289)
            time.sleep(.1)
        if node is None: raise RuntimeError('UI keyboard focus unverified')
        before = node.getState()
        print('UI_CONTROL', node.getRoleName(), node.name, before.getStates(), flush=True)
        if expected_role == 'check box':
            if not before.contains(pyatspi.STATE_CHECKED): key(32)
            time.sleep(.2)
            if not node.getState().contains(pyatspi.STATE_CHECKED): raise RuntimeError('checkbox did not become checked')
        else:
            key(65293)
        print('OPERATOR_UI_ACTION', name, 'keyboard', True, flush=True)
    finally:
        call(session, iface, 'Stop')


if __name__ == '__main__': main()
