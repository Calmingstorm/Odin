"""Harmless native GTK event logger in disposable session only."""
import os
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk
assert os.path.exists('/.dockerenv') and os.environ['HOME'] == '/tmp/home'
win = Gtk.Window(title='Isolated native event receiver')
win.set_default_size(700, 450)
win.maximize()
win.add_events(Gdk.EventMask.ALL_EVENTS_MASK)
win.add(Gtk.Label(label='Harmless native Wayland receiver'))
def event(_win, event):
    print('RECEIVER', event.type, 'xy', getattr(event, 'x', None), getattr(event, 'y', None),
          'device', event.get_device().get_name() if event.get_device() else None, flush=True)
    return False
win.connect('event', event)
win.show_all()
Gtk.main()
