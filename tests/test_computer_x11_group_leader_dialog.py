"""A dialog transient for its application's hidden group leader is a same-app dialog.

On 2026-11-01 Krita's PNG export options dialog had WM_TRANSIENT_FOR set to
Qt's client leader: an unmapped 1x1 window of the same process with no
WM_STATE, which every Krita window names in WM_CLIENT_LEADER. The transient
walk required a mapped, managed parent, so the dialog had no input scope
(application_scope_unavailable) and Odin could not click OK. Fake X only.
"""

from types import SimpleNamespace as NS  # noqa: N814 - compact protocol fixtures

import pytest

from src.computer.runtime import x11_app_scope as scope
from src.computer.runtime.x11_attached import same_application_scope
from src.computer.runtime.x11_recovery import recoverable_scope
from tests.test_computer_x11_app_scope_r5 import Display, Window

LEADER = 40


@pytest.fixture
def app(monkeypatch):
    display = Display()
    monkeypatch.setattr(
        scope,
        "_process_identity",
        lambda pid: {"pid": pid, "uid": 1000, "start_ticks": 101, "exe": "/usr/bin/krita"},
    )
    checker = scope.AppScope(display)
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    return display, checker, NS(x=0, y=0, width=800, height=600)


def group_dialog(display):
    """Focused dialog 20, transient for leader 40, as Qt sets them."""
    leader = Window(display, LEADER, display.root)
    leader.viewable = 0  # never mapped
    leader.props = {"WM_CLIENT_LEADER": [LEADER], "_NET_WM_NAME": b"krita"}
    display.windows[LEADER], display.owners[LEADER] = leader, 1234
    display.target.props.update({
        "WM_TRANSIENT_FOR": [LEADER],
        "WM_CLIENT_LEADER": [LEADER],
        "WM_NAME": b"PNG image",
        "_NET_WM_WINDOW_TYPE": [700],
    })
    return leader


def test_dialog_transient_for_its_own_group_leader_has_a_same_app_scope(app):
    display, checker, monitor = app
    group_dialog(display)
    result = checker.snapshot(monitor)
    assert result is not None
    assert result["transient_chain"] == [LEADER]
    assert result["client_leader"] == LEADER
    assert result["modal"] and result["modal_kind"] == "safe_application"
    assert [p["pid"] for p in result["transient_processes"]] == [1234]
    assert recoverable_scope({**result, "window_kind": "dialog"})
    # The press gate rebuilds the same scope.
    assert checker.assert_snapshot(result, monitor) == result


@pytest.mark.parametrize("change", [
    "foreign_process", "mapped", "not_own_leader", "not_the_dialogs_leader", "missing",
])
def test_anything_but_the_dialogs_own_hidden_leader_is_still_refused(app, change):
    display, checker, monitor = app
    leader = group_dialog(display)
    if change == "foreign_process":
        display.owners[LEADER] = 5678
    elif change == "mapped":
        leader.viewable = 2  # a shown window must be a managed client
    elif change == "not_own_leader":
        leader.props["WM_CLIENT_LEADER"] = [41]
    elif change == "not_the_dialogs_leader":
        display.target.props["WM_CLIENT_LEADER"] = [41]
    else:
        del display.windows[LEADER]
    assert checker.snapshot(monitor) is None


def test_the_leader_joins_dialog_and_main_window_into_one_application(app):
    display, checker, monitor = app
    group_dialog(display)
    dialog = checker.snapshot(monitor)
    main = {**dialog, "window": 30, "transient_chain": [], "transient_processes": [],
            "modal": False, "modal_kind": None}
    assert same_application_scope(main, dialog)
    assert not same_application_scope({**main, "process": {"pid": 5678}}, dialog)
    # Without a recorded leader, the old window and chain roots still decide.
    assert not same_application_scope({**main, "client_leader": None},
                                      {**dialog, "client_leader": None})


def test_a_window_without_a_separate_leader_records_none(app):
    display, checker, monitor = app
    assert checker.snapshot(monitor)["client_leader"] is None
    display.target.props["WM_CLIENT_LEADER"] = [display.target.id]  # its own leader
    assert checker.snapshot(monitor)["client_leader"] is None
