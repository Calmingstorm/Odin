"""Hermetic profile eligibility/provenance, not GUI qualification."""
import os
from types import SimpleNamespace as NS  # noqa: N814 - Protocol fixtures.

import pytest

from src.computer.app_profiles import validate_profile
from src.computer.models import ComputerError, RequestContext
from src.computer.runtime import x11_app_scope as scope
from src.computer.runtime.profile import APP_PROFILES, sandbox_argv
from src.computer.runtime.x11_attached import X11AttachedBackend
from src.computer.store import ComputerStore
from tests.test_computer_x11_app_scope_r5 import Display, Window, fake_proc  # noqa: F401


@pytest.mark.parametrize("app", ["writer", "inkscape"])
def test_attached_only_profiles_are_not_isolated_launch_commands(app, tmp_path):
    validate_profile(app, platform="x11", environment="existing_session")
    assert app not in APP_PROFILES
    with pytest.raises(Exception):
        sandbox_argv(app)
    for platform, environment in [("x11", "isolated"), ("wayland", "isolated")]:
        with pytest.raises(ComputerError, match="application_environment_unsupported"):
            validate_profile(app, platform=platform, environment=environment)
    store = ComputerStore(tmp_path / "state.sqlite3", tmp_path / "evidence")
    try:
        with pytest.raises(ComputerError, match="application_environment_unsupported"):
            store.create_session(RequestContext("o", "c", "t", "h"), app)
        grant = store.create_session(RequestContext("o", "c", "t", "h"), app,
                                     environment="existing_session")
        assert grant.app == app
    finally:
        store.close()


@pytest.mark.parametrize("app", ["/usr/bin/inkscape", "soffice", "libreoffice", "calc", "draw",
                                  "terminal", "python"])
def test_production_profile_names_are_not_arbitrary(app):
    with pytest.raises(ComputerError, match="unsupported_app"):
        validate_profile(app, platform="x11", environment="existing_session")


@pytest.mark.parametrize("app", ["writer", "inkscape", "xed"])
def test_attached_configuration_enables_native_profiles_only(app):
    backend = X11AttachedBackend(display_name=":177", monitor_names=["screen"],
                                 app_profile=app, input_enabled=True)
    assert backend.input_supported
    capture = X11AttachedBackend(display_name=":177", monitor_names=["screen"],
                                 app_profile="drawing", input_enabled=True)
    assert not capture.input_supported and not capture._input_enabled
    assert capture.input_blocker == "attached_application_provenance_unavailable"


@pytest.mark.parametrize("app", ["writer", "inkscape"])
def test_actual_interpreter_never_proves_native_identity(app):
    with pytest.raises(scope.ScopeFailure):
        scope._process_identity(os.getpid(), app)


@pytest.mark.parametrize("app,path", [
    ("writer", "/usr/lib/libreoffice/program/soffice.bin"),
    ("inkscape", "/usr/bin/inkscape"),
])
def test_native_identity_requires_trusted_executable(fake_proc, monkeypatch, app, path):  # noqa: F811
    executable = fake_proc.parent / "native"
    executable.write_bytes(b"native fixture")
    original_path = scope.Path
    monkeypatch.setattr(scope, "Path", lambda value: (
        executable if value == path else original_path(value)))
    info = executable.stat()
    monkeypatch.setattr(scope, "_trusted_file", lambda candidate: (
        candidate.resolve(), (info.st_dev, info.st_ino)))
    (fake_proc / "exe").unlink()
    (fake_proc / "exe").symlink_to(executable)
    (fake_proc / "cmdline").write_bytes(b"forged arbitrary argv\0")
    assert scope._process_identity(1234, app)["exe"] == str(executable)
    (fake_proc / "exe").unlink()
    (fake_proc / "exe").symlink_to("/usr/bin/true")
    (fake_proc / "cmdline").write_bytes(path.encode() + b"\0")
    with pytest.raises(scope.ScopeFailure, match="identity_unavailable"):
        scope._process_identity(1234, app)


def app_scope(monkeypatch, profile, wm_class):
    display = Display()
    wm_class = "soffice" if wm_class == "writer" else wm_class
    display.target.props["WM_CLASS"] = wm_class.encode()
    monkeypatch.setattr(scope, "_process_identity", lambda pid, profile: {
        "pid": pid, "uid": 65534, "start_ticks": 101, "exe": "native"})
    checker = scope.AppScope(display, profile)
    return display, checker, NS(x=0, y=0, width=800, height=600)


@pytest.mark.parametrize("kind", ["writer", "calc", "draw"])
def test_office_document_surfaces(monkeypatch, kind):
    _, checker, monitor = app_scope(
        monkeypatch, "writer", f"libreoffice\0libreoffice-{kind}\0")
    if kind == "writer":
        assert checker.snapshot(monitor)["modal_kind"] is None
    else:
        assert checker.snapshot(monitor) is None


@pytest.mark.parametrize("wm_class,title", [
    ("libreoffice-startcenter", "LibreOffice"), ("libreoffice-base", "Database"),
    ("libreoffice-writer", "LibreOffice Basic"), ("libreoffice-writer", "Macros"),
    ("libreoffice-writer", "Security"), ("libreoffice-writer", "Options"),
    ("libreoffice-writer", "Terminal"), ("libreoffice-writer", "Odin"),
])
def test_office_non_document_and_sensitive_windows_denied(monkeypatch, wm_class, title):
    display, checker, monitor = app_scope(monkeypatch, "writer", wm_class)
    display.target.props["WM_NAME"] = title.encode()
    assert checker.snapshot(monitor) is None


@pytest.mark.parametrize("profile,wm_class", [
    ("writer", "libreoffice-writer"), ("inkscape", "inkscape"),
])
@pytest.mark.parametrize("title,expected", [("Save As", "safe_application"),
                                           ("Unknown", "unrecognized"),
                                           ("Security", None), ("Macros", None)])
def test_dialogs_need_exact_safe_title_and_same_xres_process(
        monkeypatch, profile, wm_class, title, expected):
    display, checker, monitor = app_scope(monkeypatch, profile, wm_class)
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": wm_class.encode()}
    display.windows[30], display.owners[30] = main, 1234
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": title.encode(), "WM_TRANSIENT_FOR": [30],
                                "_NET_WM_WINDOW_TYPE": [700]})
    value = checker.snapshot(monitor)
    assert (value["modal_kind"] if value else None) == expected
    display.owners[30] = 9999
    assert checker.snapshot(monitor) is None


def test_tool_catalogue_contains_new_profiles_without_launch_claim():
    from src.tools.defs.computer import _DEFINITIONS
    definition = _DEFINITIONS[0]
    assert set(definition["input_schema"]["properties"]["app"]["enum"]) == {
        "drawing", "xed", "writer", "inkscape"}
    assert "attached-X11 only" in definition["description"]
    assert "operator must open the application" in definition["description"]


@pytest.mark.parametrize("app", ["writer", "inkscape"])
def test_production_integration_validates_environment_before_building_backend(app):
    from src.computer.integration import ComputerIntegration

    integration = object.__new__(ComputerIntegration)
    integration._closed = False
    integration.bot = NS(config=NS(computer=NS(enabled=True)))
    integration.settings = NS(platform="x11", environment="existing_session", display=":177",
                              xauthority="", monitor_names=["screen"], runtime_sudo=False)
    backend = integration._backend(app)
    assert backend.input_supported and backend._config["app_profile"] == app
    integration.settings.environment = "isolated"
    with pytest.raises(ComputerError, match="application_environment_unsupported"):
        integration._backend(app)
    with pytest.raises(ComputerError, match="unsupported_app"):
        integration._backend("/usr/bin/inkscape")


@pytest.mark.parametrize("app", ["writer", "inkscape"])
async def test_controller_accepts_attached_profile_but_not_isolated_adapter(tmp_path, app):
    from src.computer.controller import ComputerController
    from tests.test_computer_attached_controller_r5 import Attached
    from tests.test_computer_contract_r1 import Stub

    store = ComputerStore(tmp_path / "db", tmp_path / "frames")
    backend = Attached()
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("o", "c", "t", "h")
    try:
        grant = await controller.session(context, {"operation": "start", "app": app})
        assert grant["app"] == app
        await controller.session(context, {"operation": "close", "session_id": grant["session_id"]})
        controller.backend_factory = lambda _: Stub()
        with pytest.raises(ComputerError, match="application_environment_unsupported"):
            await controller.session(context, {"operation": "start", "app": app})
    finally:
        await controller.close()
        store.close()


@pytest.mark.parametrize("profile,wm_class", [
    ("writer", "libreoffice-writer"), ("inkscape", "inkscape"),
])
def test_unparented_dialog_never_becomes_safe(monkeypatch, profile, wm_class):
    display, checker, monitor = app_scope(monkeypatch, profile, wm_class)
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": b"Save As", "_NET_WM_WINDOW_TYPE": [700]})
    assert checker.snapshot(monitor)["modal_kind"] == "unrecognized"


@pytest.mark.parametrize("title", ["Preferences", "Extensions", "Terminal", "Odin", "Settings"])
def test_inkscape_sensitive_nonmodal_windows_denied(monkeypatch, title):
    display, checker, monitor = app_scope(monkeypatch, "inkscape", "inkscape")
    display.target.props["WM_NAME"] = title.encode()
    assert checker.snapshot(monitor) is None


@pytest.mark.parametrize("profile,wm_class", [
    ("writer", "libreoffice-writer"), ("inkscape", "inkscape"),
])
def test_spoofed_class_wm_pid_or_missing_xres_cannot_authorize(monkeypatch, profile, wm_class):
    display, checker, monitor = app_scope(monkeypatch, profile, wm_class)
    display.res_query_client_ids = lambda specs: NS(ids=[])
    assert checker.snapshot(monitor) is None
    display.res_query_client_ids = Display.res_query_client_ids.__get__(display)

    def no_native_identity(pid, app):
        raise scope.ScopeFailure("application_identity_unavailable")

    monkeypatch.setattr(scope, "_process_identity", no_native_identity)
    assert checker.snapshot(monitor) is None


def test_office_file_dialog_from_start_center_not_eligible(monkeypatch):
    display, checker, monitor = app_scope(monkeypatch, "writer", "libreoffice")
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": b"libreoffice-startcenter"}
    display.windows[30], display.owners[30] = main, 1234
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": b"Open", "WM_TRANSIENT_FOR": [30],
                                "_NET_WM_WINDOW_TYPE": [700]})
    assert checker.snapshot(monitor) is None


def test_formatting_key_contract_is_identical_in_schema_and_guardian():
    from src.computer.gui_actions import KEYS
    from src.computer.runtime.x11_guardian import GuardianFailure, input_steps
    from src.tools.defs.computer import _DEFINITIONS

    assert set(_DEFINITIONS[2]["input_schema"]["properties"]["key"]["enum"]) == KEYS
    native = NS(keycode=lambda key: {"Control_L": 37, "b": 56, "i": 31, "u": 30}[key])
    for key in ["ctrl+b", "ctrl+i", "ctrl+u"]:
        events = input_steps({"type": "key", "chord": key}, native)
        assert events[0] == ("key", 37, True) and events[-1] == ("key", 37, False)
        assert len(events) == 4
    for key in ["ctrl+alt+t", "alt+F2", "ctrl+alt+Delete", "F4", "F8"]:
        assert key not in KEYS
        with pytest.raises(GuardianFailure, match="unsupported_action"):
            input_steps({"type": "key", "chord": key}, native)


@pytest.mark.parametrize("profile,document_class", [
    ("writer", "libreoffice-writer"), ("inkscape", "inkscape"),
])
@pytest.mark.parametrize("intermediate_title,expected", [
    ("Unknown action dialog", "unrecognized"), ("Save As", "safe_application"),
])
def test_unknown_transient_cannot_launder_safe_file_child(
        monkeypatch, profile, document_class, intermediate_title, expected):
    display, checker, monitor = app_scope(monkeypatch, profile, profile)
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": document_class.encode()}
    intermediate = Window(display, 40, display.root)
    intermediate.props = {"WM_STATE": [1, 0],
                          "WM_CLASS": ("soffice" if profile == "writer" else profile).encode(),
                          "WM_NAME": intermediate_title.encode(), "WM_TRANSIENT_FOR": [30],
                          "_NET_WM_WINDOW_TYPE": [700]}
    for window in [main, intermediate]:
        display.windows[window.id], display.owners[window.id] = window, 1234
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": b"Save", "WM_TRANSIENT_FOR": [40],
                                "_NET_WM_WINDOW_TYPE": [700]})
    snapshot = checker.snapshot(monitor)
    assert snapshot["modal_kind"] == expected
    if expected == "unrecognized":
        with pytest.raises(scope.ScopeFailure):
            checker.assert_snapshot(snapshot, monitor)
    else:
        assert checker.assert_snapshot(snapshot, monitor) == snapshot
        intermediate.props["WM_NAME"] = b"Save"
        with pytest.raises(scope.ScopeFailure):
            checker.assert_snapshot(snapshot, monitor)


@pytest.mark.parametrize("profile,document_class", [
    ("writer", "libreoffice-writer"), ("inkscape", "inkscape"),
])
def test_final_transient_ancestor_must_be_nonmodal_document(monkeypatch, profile, document_class):
    display, checker, monitor = app_scope(monkeypatch, profile, profile)
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": document_class.encode(),
                  "WM_NAME": b"Open", "_NET_WM_WINDOW_TYPE": [700]}
    display.windows[30], display.owners[30] = main, 1234
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": b"Open", "WM_TRANSIENT_FOR": [30],
                                "_NET_WM_WINDOW_TYPE": [700]})
    assert checker.snapshot(monitor)["modal_kind"] == "unrecognized"
    main.props["_NET_WM_WINDOW_TYPE"] = [999]
    assert checker.snapshot(monitor)["modal_kind"] == "unrecognized"


@pytest.mark.parametrize("profile,wm_class,expected", [
    ("inkscape", "org.inkscape.Inkscape\0Inkscape\0", "safe_application"),
    ("writer", "libreoffice-writer", "unrecognized"),
])
def test_measured_inkscape_save_title_is_profile_specific(monkeypatch, profile, wm_class, expected):
    display, checker, monitor = app_scope(monkeypatch, profile, wm_class)
    main = Window(display, 30, display.root)
    main.props = {"WM_STATE": [1, 0], "WM_CLASS": wm_class.encode()}
    display.windows[30], display.owners[30] = main, 1234
    atom = checker._atom
    checker._atom = lambda name: 700 if name == "_NET_WM_WINDOW_TYPE_DIALOG" else atom(name)
    display.target.props.update({"WM_NAME": b"Select file to save to", "WM_TRANSIENT_FOR": [30],
                                "_NET_WM_WINDOW_TYPE": [700]})
    assert checker.snapshot(monitor)["modal_kind"] == expected
    display.owners[30] = 9999
    assert checker.snapshot(monitor) is None


def test_profile_import_does_not_load_native_dependencies():
    import subprocess
    import sys

    result = subprocess.run([sys.executable, "-c", "import sys; "
        "import src.computer.app_profiles; import src.computer.runtime.x11_app_scope; "
        "import src.computer.controller; assert 'Xlib' not in sys.modules"],
        capture_output=True, timeout=10)
    assert result.returncode == 0, result.stderr
