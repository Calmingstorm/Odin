"""R7 refusal/advertising contracts, not evidence of GUI task qualification."""
from types import SimpleNamespace

import pytest

from src.computer.app_profiles import (
    ATTACHED_NATIVE_PROFILES,
    NOT_OFFERED_PROFILES,
    WRITER_KEYS,
    application_profile,
    validate_attached_only_profile,
    validate_profile,
    validate_profile_action,
)
from src.computer.manager import ComputerLifecycle
from src.computer.models import ComputerError, RequestContext
from src.computer.runtime.x11_app_scope import AppScope, ScopeFailure
from src.computer.runtime.x11_attached import (
    AttachedFailure,
    X11AttachedBackend,
    same_application_scope,
)
from src.computer.store import ComputerStore
from src.config.schema import Config
from src.tools.defs.computer import computer_definitions
from tests.test_computer_app_profiles_r6 import app_scope
from tests.test_computer_x11_app_scope_r5 import Display, Window


@pytest.mark.parametrize("app", sorted(NOT_OFFERED_PROFILES))
def test_unqualified_office_names_refused_at_every_profile_entry(app, tmp_path):
    assert app not in ATTACHED_NATIVE_PROFILES
    for validate in (validate_profile, validate_attached_only_profile):
        with pytest.raises(ComputerError, match="^unsupported_app$"):
            validate(app, platform="x11", environment="existing_session")
    with pytest.raises(ComputerError, match="^unsupported_app$"):
        validate_profile_action(app, {"operation": "type", "text": "note"})
    with pytest.raises(AttachedFailure, match="unapproved_application_profile"):
        X11AttachedBackend(display_name=":177", monitor_names=["screen"],
                           app_profile=app, input_enabled=True)
    with pytest.raises(ScopeFailure, match="unapproved_application_profile"):
        AppScope(Display(), app)
    store = ComputerStore(tmp_path / "db", tmp_path / "frames")
    try:
        with pytest.raises(ComputerError, match="^unsupported_app$"):
            store.create_session(RequestContext("o", "c", "t", "h"), app,
                                 environment="existing_session")
    finally:
        store.close()


@pytest.mark.parametrize("component", ["calc", "draw", "impress", "startcenter", "base", "math"])
@pytest.mark.parametrize("mixed_writer_class", [False, True])
def test_writer_never_inherits_other_component_even_with_writer_class(
        monkeypatch, component, mixed_writer_class):
    classes = f"libreoffice\0libreoffice-{component}\0"
    if mixed_writer_class:
        classes += "libreoffice-writer\0"
    _, checker, monitor = app_scope(monkeypatch, "writer", classes)
    assert checker.snapshot(monitor) is None


def save_dialog(monkeypatch, *, ancestor="libreoffice-writer", title="Save"):
    display, checker, monitor = app_scope(monkeypatch, "writer", "soffice\0Soffice\0")
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": ancestor.encode()}
    display.windows[30], display.owners[30] = main, 1234
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": title.encode(), "WM_TRANSIENT_FOR": [30],
                                 "_NET_WM_WINDOW_TYPE": [700]})
    return display, checker, monitor


@pytest.mark.parametrize("title", ["Save", "Save As", "Save As…"])
def test_writer_measured_save_dialog_remains_eligible(monkeypatch, title):
    _, checker, monitor = save_dialog(monkeypatch, title=title)
    snapshot = checker.snapshot(monitor)
    assert snapshot["modal_kind"] == "safe_application"
    assert checker.assert_snapshot(snapshot, monitor) == snapshot


@pytest.mark.parametrize("title", ["Open", "Open File", "Open Image", "Close", "Close document"])
def test_writer_open_close_dialog_not_input_eligible(monkeypatch, title):
    _, checker, monitor = save_dialog(monkeypatch, title=title)
    snapshot = checker.snapshot(monitor)
    assert snapshot["modal_kind"] == "unrecognized"
    with pytest.raises(ScopeFailure, match="application_scope_changed"):
        checker.assert_snapshot(snapshot, monitor)


@pytest.mark.parametrize("ancestor", ["libreoffice-calc", "libreoffice-draw",
                                      "libreoffice-startcenter", "soffice"])
def test_generic_office_save_dialog_needs_writer_root(monkeypatch, ancestor):
    _, checker, monitor = save_dialog(monkeypatch, ancestor=ancestor)
    snapshot = checker.snapshot(monitor)
    assert snapshot is None or snapshot["modal_kind"] == "unrecognized"
    with pytest.raises(ScopeFailure, match="application_scope_changed"):
        checker.assert_snapshot(snapshot, monitor)


def test_close_or_new_document_never_counts_as_same_app_success(monkeypatch):
    display, checker, monitor = app_scope(monkeypatch, "writer", "libreoffice-writer")
    before = checker.snapshot(monitor)
    display.target.props["WM_CLASS"] = b"libreoffice-startcenter"
    after = checker.snapshot(monitor)
    assert after is None
    assert not same_application_scope(before, after)
    assert not same_application_scope(before, {**before, "window": 9999})
    assert not same_application_scope(before, {**before, "process": {"pid": 9999}})


@pytest.mark.parametrize("action", [
    {"operation": "click", "x": 45, "y": 167},  # Historical File > Close.
    {"operation": "drag", "points": [[0, 0], [1, 1]]},
    *[{"operation": "key", "key": key} for key in (
        "ctrl+o", "ctrl+n", "ctrl+w", "alt+F4", "Tab", "Left", "Down", "Home")],
])
def test_writer_lifecycle_menu_pointer_input_refused(action):
    with pytest.raises(ComputerError, match="^application_task_not_offered$"):
        validate_profile_action("writer", action)


@pytest.mark.parametrize("action", [
    {"operation": "type", "text": "R6 private note."},
    *[{"operation": "key", "key": key} for key in sorted(WRITER_KEYS)],
])
def test_writer_measured_keyboard_save_task_not_removed(action):
    validate_profile_action("writer", action)


@pytest.mark.parametrize("app", ["xed", "drawing", "inkscape", "fixture"])
def test_existing_other_app_action_contracts_not_narrowed(app):
    for action in ({"operation": "click"}, {"operation": "drag"},
                   {"operation": "key", "key": "ctrl+o"}):
        validate_profile_action(app, action)


def test_model_and_operator_profile_declarations_agree_and_are_not_readiness():
    config = Config(discord={"token": "fixture-only"})
    config.computer.environment = "existing_session"
    snapshot = ComputerLifecycle(SimpleNamespace(config=config)).snapshot()
    profiles = {p["id"]: p for p in snapshot["application_profiles"]}
    assert set(profiles) == {"drawing", "xed", "writer", "inkscape"}
    assert snapshot["backend"]["readiness"] == "not_checked"
    writer = profiles["writer"]
    assert writer == application_profile("writer", platform="x11", environment="existing_session")
    assert writer["label"] == "LibreOffice Writer only"
    assert writer["qualification"] == "partial_isolated_fixture"
    assert writer["input_keys"] == sorted(WRITER_KEYS)
    assert "Document close/reopen" in writer["not_offered_tasks"]
    assert writer["qualified_tasks"] == [
        "Short ASCII note, paragraph break, bold formatting and GUI ODT save"]
    writer["qualified_tasks"].clear()
    refreshed = application_profile("writer", platform="x11", environment="existing_session")
    assert refreshed["qualified_tasks"]
    session, _, action = computer_definitions()
    assert set(session["input_schema"]["properties"]["app"]["enum"]) == set(profiles)
    assert "Calc and Draw are not offered and must be refused" in session["description"]
    assert "Refuse Writer close/reopen" in action["description"]
    assert "pointer/menu input" in session["description"]
    assert application_profile("writer", platform="x11", environment="isolated") is None
    assert application_profile("writer", platform="wayland", environment="existing_session") is None
