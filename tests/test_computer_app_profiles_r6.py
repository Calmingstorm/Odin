"""Attached scope inversion; isolated launch containment remains unchanged."""
import os
from types import SimpleNamespace as NS  # noqa: N814 - Protocol fixtures.

import pytest

from src.computer.app_profiles import ISOLATED_PROFILES, application_profile, validate_profile
from src.computer.models import ComputerError
from src.computer.runtime import x11_app_scope as scope
from src.computer.runtime.profile import APP_PROFILES, sandbox_argv
from tests.test_computer_x11_app_scope_r5 import Display, Window


@pytest.mark.parametrize("app", [None, "writer", "inkscape", "drawing", "calc", "draw",
                                  "arbitrary-flatpak", "terminal", "/home/user/app"])
@pytest.mark.parametrize("platform", ["x11", "wayland"])
def test_attached_has_no_profile_gate(app, platform):
    validate_profile(app, platform=platform, environment="existing_session")
    assert application_profile(app, platform=platform, environment="existing_session") is None


@pytest.mark.parametrize("app", [None, "writer", "inkscape", "calc", "/usr/bin/xed"])
def test_isolated_list_still_contains_launches(app):
    with pytest.raises(ComputerError, match="unsupported_app"):
        validate_profile(app, platform="x11", environment="isolated")
    with pytest.raises(Exception):
        sandbox_argv(app)
    assert app not in APP_PROFILES


def test_isolated_profiles_unchanged():
    assert ISOLATED_PROFILES == {"xed", "drawing"}
    assert set(APP_PROFILES) == ISOLATED_PROFILES
    for app in ISOLATED_PROFILES:
        validate_profile(app, platform="x11", environment="isolated")
        profile = application_profile(app, platform="x11", environment="isolated")
        assert profile["input"] == "supported"


def app_scope(monkeypatch, profile, wm_class):
    # profile is only a legacy test-fixture label, never passed to scope.
    display = Display()
    display.target.props["WM_CLASS"] = wm_class.encode()
    monkeypatch.setattr(scope, "_process_identity", lambda pid: {
        "pid": pid, "uid": os.geteuid(), "start_ticks": 101, "exe": "/home/user/custom",
        "exe_identity": [1, 2], "trusted_executable": False, "cmdline_digest": "a" * 64,
        "script_identity": None})
    return display, scope.AppScope(display), NS(x=0, y=0, width=800, height=600)


@pytest.mark.parametrize("wm_class,title", [
    ("libreoffice-calc", "Spreadsheet"), ("libreoffice-draw", "Drawing"),
    ("libreoffice-startcenter", "LibreOffice"), ("custom-app", "Preferences"),
    ("drawing", "Save As"), ("xdg-desktop-portal-gtk", "Open File"),
    ("xdg-desktop-portal-kde", "Choose Folder"), ("custom-app", "Overwrite?"),
    ("inkscape", "Extensions"), ("libreoffice-writer", "Macros")])
def test_general_focused_apps_and_ordinary_dialogs_accepted(monkeypatch, wm_class, title):
    from src.computer.provenance import canonical_application_provenance

    display, checker, monitor = app_scope(monkeypatch, None, wm_class)
    display.target.props["WM_NAME"] = title.encode()
    evidence = checker.snapshot(monitor)
    assert checker.assert_snapshot(evidence, monitor) == evidence
    provenance = canonical_application_provenance(evidence)
    assert provenance["trusted_executable"] is False
    assert provenance["exe_basename"] == "custom" and provenance["wm_class"] == wm_class


@pytest.mark.parametrize("text", ["Terminal", "Authentication", "Password", "Polkit",
                                  "Keyring", "Pinentry", "sudo", "Odin", "Security"])
@pytest.mark.parametrize("field", ["WM_NAME", "WM_CLASS", "_NET_WM_NAME"])
def test_denied_classes_remain_refused(monkeypatch, text, field):
    display, checker, monitor = app_scope(monkeypatch, None, "custom-app")
    display.target.props[field] = text.encode()
    assert checker.snapshot(monitor) is None


@pytest.mark.parametrize("parent_pid", [1234, 9999])
@pytest.mark.parametrize("parent_title", ["Untitled", "Unknown action dialog", "Save As"])
def test_dialog_chain_is_normal_and_binds_parent_identity(monkeypatch, parent_pid, parent_title):
    display, checker, monitor = app_scope(monkeypatch, None, "xdg-desktop-portal-gtk")
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": b"custom-app", "WM_NAME": parent_title.encode()}
    display.windows[30], display.owners[30] = main, parent_pid
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": b"Open", "WM_TRANSIENT_FOR": [30],
                                 "_NET_WM_WINDOW_TYPE": [700]})
    evidence = checker.snapshot(monitor)
    assert evidence["modal_kind"] == "safe_application"
    assert evidence["transient_processes"][0]["pid"] == parent_pid
    assert checker.assert_snapshot(evidence, monitor) == evidence
    main.props["WM_NAME"] = b"changed parent"
    with pytest.raises(scope.ScopeFailure):
        checker.assert_snapshot(evidence, monitor)
    main.props["WM_NAME"] = b"Authentication"
    assert checker.snapshot(monitor) is None


def test_unparented_focused_dialog_eligible(monkeypatch):
    display, checker, monitor = app_scope(monkeypatch, None, "custom-app")
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props["_NET_WM_WINDOW_TYPE"] = [700]
    evidence = checker.snapshot(monitor)
    assert evidence["modal_kind"] == "safe_application"
    checker.assert_snapshot(evidence, monitor)


def test_missing_authoritative_identity_not_replaced_with_class(monkeypatch):
    display, checker, monitor = app_scope(monkeypatch, None, "custom-app")
    display.res_query_client_ids = lambda specs: NS(ids=[])
    assert checker.snapshot(monitor) is None
