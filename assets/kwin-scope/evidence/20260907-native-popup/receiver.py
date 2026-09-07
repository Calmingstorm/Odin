import os
import json
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, GLib
Gdk.set_allowed_backends('wayland')
assert Gtk.init_check([])[0]
assert Gdk.Display.get_default().__gtype__.name == 'GdkWaylandDisplay'
window = Gtk.Window(title='Odin read-only native scope smoke')
window.set_default_size(500, 350)
window.set_wmclass('odin-readonly-smoke', 'odin-readonly-smoke')
events = open('/evidence/menu-events.jsonl', 'w', buffering=1)
def record(kind, **kw):
    events.write(json.dumps(dict(event=kind, **kw)) + '\n')
area = Gtk.EventBox()
area.add(Gtk.Label(label='Scratch native menu scope test'))
area.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK | Gdk.EventMask.KEY_RELEASE_MASK)
menu = Gtk.Menu()
item = Gtk.MenuItem(label='Select scratch menu item')
item.connect('activate', lambda *_: record('item_selected'))
menu.append(item)
menu.show_all()
def press(widget, event):
    record('button_press', button=event.button)
    if event.button == 3:
        menu.popup_at_pointer(event)
        record('menu_opened')
        return True
    return False
area.connect('button-press-event', press)
area.connect('button-release-event', lambda _, e: record('button_release', button=e.button))
menu.connect('button-release-event', lambda _, e: record('menu_button_release', button=e.button))
menu.connect('key-release-event', lambda _, e: record('menu_key_release', keyval=e.keyval))
window.connect('key-release-event', lambda _, e: record('window_key_release', keyval=e.keyval))
window.add(area)
window.show_all()
window.present()
print('receiver_pid=' + str(os.getpid()), flush=True)
GLib.timeout_add_seconds(40, lambda: (Gtk.main_quit(), False)[1])
Gtk.main()
