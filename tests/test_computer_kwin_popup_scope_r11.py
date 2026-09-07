"""Source invariants complement the isolated, compiled GTK popup regression.

These do not claim to execute KWin; native evidence is recorded separately.
"""
from pathlib import Path


SOURCE = (Path(__file__).resolve().parents[1] / "assets/kwin-scope/odinscope.cpp").read_text()


def test_popup_relation_is_native_bounded_and_same_connection():
    relation = SOURCE.split("bool popupBelongsTo(", 1)[1].split("QString normalizedBackendClass", 1)[0]
    for guard in ("depth < 64", "cursor->hasPopupGrab()", "XdgPopupInterface::role()",
                  "cursor->surface()->client() != client", "cursor->transientFor()",
                  "cursor->pid() != client->processId()", "!unconstrained(cursor->surface())",
                  "return cursor == application"):
        assert guard in relation


def test_popup_uses_actual_keyboard_surface_and_target_content_bounds():
    assert "rootSurface(waylandServer()->seat()->focusedKeyboardSurface())" in SOURCE
    assert "waylandServer()->findWindow(surface)" in SOURCE
    assert "const RectF content = focus->clientGeometry()" in SOURCE
    assert "order.indexOf(focus)" in SOURCE
    assert "intersects(clipped, other->frameGeometry())" in SOURCE
    assert "focusedKeyboardSurfaceAboutToChange" in SOURCE


def test_security_and_overlay_guards_are_not_bypassed_for_menus():
    for guard in ("isScreenLocked()", "isKeyboardShortcutsInhibited()", "isSelectingWindow()",
                  "activeFullScreenEffect()", "!window->isLockScreen()",
                  "!window->isLockScreenOverlay()", "!window->isInputMethod()",
                  "screenLockerClientConnection()", "inputMethodConnection()",
                  "!popupBelongsTo(focus, application, client)"):
        assert guard in SOURCE
    assert "|| focus->hasPopupGrab()) return unavailable()" not in SOURCE


def test_unknown_window_type_is_accepted_only_for_native_popup_role():
    assert "window->isPopupWindow() && window->surface()->role() == XdgPopupInterface::role()" in SOURCE
