"""Disposable AT-SPI consent operator; explicit named UI action, not product input."""
import os
import sys
import pyatspi
assert os.path.exists('/.dockerenv') and os.environ['HOME'] == '/tmp/home'
assert len(sys.argv) == 1 or sys.argv[1:] in [
    ['check box', 'Allow Remote Interaction'], ['push button', 'Share']]
def walk(obj, depth=0):
    if depth > 15:
        return
    try:
        if True:
            try:
                rect = obj.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
                geometry = (rect.x, rect.y, rect.width, rect.height)
            except Exception:
                geometry = None
            print('  '*depth, obj.getRoleName(), repr(obj.name), geometry,
                  obj.getState().getStates(), flush=True)
            if len(sys.argv) == 3 and obj.getRoleName() == sys.argv[1] and obj.name == sys.argv[2]:
                action = obj.queryAction()
                print('OPERATOR_UI_ACTION', obj.name, action.getName(0), action.doAction(0), flush=True)
        for child in obj:
            walk(child, depth+1)
    except Exception as exc:
        print(type(exc).__name__, str(exc), flush=True)
for app in pyatspi.Registry.getDesktop(0):
    if 'portal' in app.name:
        walk(app)
