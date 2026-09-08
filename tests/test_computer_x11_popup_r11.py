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
