"""General office/dialog offering replaces per-application action policy."""
import pytest

from src.computer import app_profiles
from src.computer.runtime.x11_app_scope import ScopeFailure
from tests.test_computer_app_profiles_r6 import app_scope
from tests.test_computer_x11_app_scope_r5 import Window


def test_attached_profile_and_key_gates_removed():
    for name in ("ATTACHED_NATIVE_PROFILES", "ATTACHED_PROFILES", "NOT_OFFERED_PROFILES",
                 "WAYLAND_PROFILES", "WRITER_KEYS", "validate_attached_only_profile",
                 "validate_profile_action"):
        assert not hasattr(app_profiles, name)


@pytest.mark.parametrize("component", ["calc", "draw", "impress", "startcenter", "base", "math"])
@pytest.mark.parametrize("mixed_writer_class", [False, True])
def test_office_components_are_ordinary_applications(monkeypatch, component, mixed_writer_class):
    classes = f"libreoffice\0libreoffice-{component}\0"
    if mixed_writer_class:
        classes += "libreoffice-writer\0"
    _, checker, monitor = app_scope(monkeypatch, None, classes)
    assert checker.snapshot(monitor) is not None


def save_dialog(monkeypatch, *, ancestor="libreoffice-writer", title="Save"):
    display, checker, monitor = app_scope(monkeypatch, None, "soffice\0Soffice\0")
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": ancestor.encode()}
    display.windows[30], display.owners[30] = main, 1234
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": title.encode(), "WM_TRANSIENT_FOR": [30],
                                 "_NET_WM_WINDOW_TYPE": [700]})
    return display, checker, monitor


@pytest.mark.parametrize("title", ["Save", "Save As", "Save As…", "Open", "Open File",
                                   "Open Image", "Close", "Close document", "Replace existing?"])
@pytest.mark.parametrize("ancestor", ["libreoffice-calc", "libreoffice-draw",
                                      "libreoffice-startcenter", "soffice"])
def test_document_lifecycle_dialogs_are_input_eligible(monkeypatch, title, ancestor):
    _, checker, monitor = save_dialog(monkeypatch, ancestor=ancestor, title=title)
    evidence = checker.snapshot(monitor)
    assert evidence["modal_kind"] == "safe_application"
    checker.assert_snapshot(evidence, monitor)


def test_document_lifecycle_still_requires_fresh_observation(monkeypatch):
    display, checker, monitor = app_scope(monkeypatch, None, "libreoffice-writer")
    before = checker.snapshot(monitor)
    display.target.props["WM_CLASS"] = b"libreoffice-startcenter"
    after = checker.snapshot(monitor)
    assert after is not None
    with pytest.raises(ScopeFailure):
        checker.assert_snapshot(before, monitor)
    checker.assert_snapshot(after, monitor)
