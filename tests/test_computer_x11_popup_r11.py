"""Private pointer target resolution: eligible popup, never arbitrary overlays."""

from types import SimpleNamespace as NS  # noqa: N814 - compact protocol fixtures

import pytest

from src.computer.runtime import x11_app_scope as scope
from src.computer.runtime.x11_app_scope import ScopeFailure
from tests.test_computer_x11_app_scope_r5 import Display, Window


@pytest.fixture
def app(monkeypatch):
    display = Display()
    monkeypatch.setattr(
        scope,
        "_process_identity",
        lambda pid: {"pid": pid, "uid": 65534, "start_ticks": 101, "exe": "/usr/bin/xed"},
    )
    return display, scope.AppScope(display), NS(x=0, y=0, width=800, height=600)


def popup(display, checker, *, pid=1234, transient=True):
    menu = Window(display, 30, display.root)
    menu.override = True
    menu.geometry = [300, 100, 200, 200]
    menu.props = {"_NET_WM_PID": [999999], "WM_CLASS": b"xed\0Xed\0", "_NET_WM_WINDOW_TYPE": [700]}
    if transient:
        menu.props["WM_TRANSIENT_FOR"] = [20]
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_POPUP_MENU" else atom(name)
    display.windows[30], display.owners[30] = menu, pid
    display.root.child = menu
    display.pointer = (450, 200)
    return menu


@pytest.mark.parametrize("pid,transient", [(1234, True), (1234, False), (5678, True)])
def test_popup_extent_and_eligible_process_or_transient(app, pid, transient):
    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    popup(display, checker, pid=pid, transient=transient)
    assert checker.assert_snapshot(expected, monitor, (450, 200)) == expected


def test_qt_combo_popup_list_is_an_eligible_menu_hit(app):
    """Krita's dropdown lists are COMBO + NORMAL override-redirect windows.

    On 2026-11-01 a click on such a list item was refused at the press gate as
    pointer_scope_changed, which ended the drawing session.
    """
    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    menu = popup(display, checker)
    atom = checker._atom
    numbered = {"_NET_WM_WINDOW_TYPE_COMBO": 701, "_NET_WM_WINDOW_TYPE_NORMAL": 702}
    checker._atom = lambda name: numbered.get(name) or atom(name)
    menu.props["_NET_WM_WINDOW_TYPE"] = [701, 702]
    assert checker.assert_snapshot(expected, monitor, (450, 200)) == expected
    assert checker._snapshot(monitor, candidate=menu)["window_kind"] == "menu"


def test_inventory_lists_same_process_viewable_menu_popups_only(app):
    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    menu = popup(display, checker)
    display.root.children, display.target.children = [display.target, menu], [display.leaf]
    assert checker.window_inventory(expected)["menus"] == [30]
    display.owners[30] = 5678  # another process
    assert checker.window_inventory(expected)["menus"] == []
    display.owners[30] = 1234
    menu.props["_NET_WM_WINDOW_TYPE"] = [999]  # a tooltip or other non-menu type
    assert checker.window_inventory(expected)["menus"] == []
    menu.props["_NET_WM_WINDOW_TYPE"] = [700]
    menu.override = False
    assert checker.window_inventory(expected)["menus"] == []
    menu.override, menu.viewable = True, 0
    inventory = checker.window_inventory(expected)
    assert inventory["menus"] == [] and (30, 0) in inventory["windows"]
    menu.viewable = 2
    del display.owners[30]  # an unreadable popup proves nothing and is left out
    assert checker.window_inventory(expected)["menus"] == []


@pytest.mark.parametrize("unbound", ["foreign_transient", "no_transient", "off_source"])
def test_inventory_menu_must_belong_to_the_target_and_source(app, unbound):
    """Odin's PR #750 round-3 trace: a same-process menu elsewhere proves nothing."""
    from src.computer.runtime.x11_appearance import appearance_transition

    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    menu = popup(display, checker)
    display.root.children, display.target.children = [display.target, menu], [display.leaf]
    menu.viewable = 0
    before = checker.window_inventory(expected)
    menu.viewable = 2
    if unbound == "foreign_transient":
        menu.props["WM_TRANSIENT_FOR"] = [40]  # another window of the same process
    elif unbound == "no_transient":
        del menu.props["WM_TRANSIENT_FOR"]
    else:
        menu.geometry = [950, 100, 100, 100]  # wholly outside the 800x600 source
    after = checker.window_inventory(expected)
    assert after["menus"] == []
    transition = appearance_transition(before, after, expected, expected)
    assert transition["appeared"] is False and transition["kind"] == "normal"
    menu.props["WM_TRANSIENT_FOR"], menu.geometry = [20], [300, 100, 200, 200]
    bound = checker.window_inventory(expected)
    assert bound["menus"] == [30]
    assert appearance_transition(before, bound, expected, expected)["kind"] == "menu"


def test_inventory_popup_scan_keeps_the_sample_deadline(app, monkeypatch):
    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    first = popup(display, checker)
    second = Window(display, 31, display.root)
    second.override, second.geometry = True, [520, 100, 40, 40]
    second.props = {"_NET_WM_WINDOW_TYPE": [700]}
    display.windows[31], display.owners[31] = second, 1234
    display.root.children = [display.target, first, second]
    display.target.children = [display.leaf]
    now = [100.0]
    monkeypatch.setattr(scope, "time", NS(monotonic=lambda: now[0]))
    values = checker._values

    def slow(window, name):
        if window is second:  # the scan pops it first; reading it uses the budget
            now[0] += scope.INVENTORY_SECONDS
        return values(window, name)

    checker._values = slow
    with pytest.raises(ScopeFailure, match="application_scope_unavailable"):
        checker.window_inventory(expected)


@pytest.mark.parametrize(
    "mutation", ["foreign", "unmapped", "cycle", "outside", "source", "type", "pid"]
)
def test_popup_target_denials(app, mutation):
    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    menu = popup(display, checker)
    point = (450, 200)
    if mutation == "foreign":
        display.owners[30] = 5678
        del menu.props["WM_TRANSIENT_FOR"]
    elif mutation == "unmapped":
        menu.viewable = 0
    elif mutation == "cycle":
        menu.props["WM_TRANSIENT_FOR"] = [30]
    elif mutation == "outside":
        menu.geometry = [300, 100, 100, 100]
    elif mutation == "source":
        point = display.pointer = (800, 200)
        menu.geometry = [300, 100, 600, 200]
    elif mutation == "type":
        menu.props["_NET_WM_WINDOW_TYPE"] = [999]
    elif mutation == "pid":
        del display.owners[30]
    with pytest.raises(ScopeFailure, match="pointer_scope_changed"):
        checker.assert_snapshot(expected, monitor, point)


@pytest.mark.parametrize("metadata", ["class", "family_title", "leaf_title"])
def test_popup_provenance_is_not_a_keyword_policy(app, metadata):
    # Synthetic ordinary-app windows bearing untrusted labels do not authorize
    # model operation of terminals, security prompts, or the control plane.
    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    menu = popup(display, checker)
    if metadata == "class":
        menu.props["WM_CLASS"] = b"XTerm"
    elif metadata == "family_title":
        family = Window(display, 40, display.root)
        family.props = {"WM_STATE": [1, 0], "WM_NAME": b"Password"}
        display.windows[40], display.owners[40] = family, 1234
        menu.props["WM_TRANSIENT_FOR"] = [40]
    else:
        leaf = Window(display, 31, menu)
        leaf.props["WM_NAME"] = b"Authentication"
        display.windows[31], display.owners[31], menu.child = leaf, 1234, leaf
    assert checker.assert_snapshot(expected, monitor, (450, 200)) == expected
    # Identical labels cannot make an unrelated native owner eligible.
    display.owners[30] = 5678
    menu.props.pop("WM_TRANSIENT_FOR", None)
    with pytest.raises(ScopeFailure, match="pointer_scope_changed"):
        checker.assert_snapshot(expected, monitor, (450, 200))


def test_owned_popup_callback_and_final_target_revalidation(app):
    display, checker, monitor = app
    expected = checker.snapshot(monitor)
    menu = popup(display, checker)
    display.pointer = (700, 500)
    queries = []

    def query(identity):
        queries.append(identity)
        return NS(same_screen=True, root_x=450, root_y=200, child=display.windows[identity].child)

    assert checker.assert_snapshot(expected, monitor, (450, 200), pointer_query=query) == expected
    assert queries == [10, 30] and display.pointer == (700, 500)
    original = checker._snapshot
    calls = 0

    def changed(*args, **kwargs):
        nonlocal calls
        if kwargs.get("candidate") is not None:
            calls += 1
            if calls == 2:
                display.owners[30] = 5678
                menu.props.pop("WM_TRANSIENT_FOR", None)
        return original(*args, **kwargs)

    checker._snapshot = changed
    with pytest.raises(ScopeFailure, match="pointer_scope_changed"):
        checker.assert_snapshot(expected, monitor, (450, 200), pointer_query=query)
