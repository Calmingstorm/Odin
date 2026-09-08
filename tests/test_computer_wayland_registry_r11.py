"""Registry recognition is never compositor qualification."""
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.runtime import wayland_identity as identity
from src.computer.runtime import wayland_probe as probe
from src.computer.runtime.assets import wayland_probe_kwin as kwin
from src.computer.runtime.assets.wayland_probe_private import relevant_library


@pytest.mark.parametrize("version", ["6.1", "6.1.0", "6.4.5", "6.7.0-1", "7.0.0"])
def test_kwin_recognized_not_qualified(version):
    adapter = identity.compositor_adapter("/usr/bin/kwin_wayland", version)
    assert adapter.bus_name == "org.kde.KWin"
    assert adapter.library_prefix == "libkwin"


@pytest.mark.parametrize("version", ["5.27.11", "6.0.5", "bad", "6.1\n", "6.1.0rc1"])
def test_kwin_old_or_unidentified_refused(version):
    with pytest.raises(identity.WaylandIdentityError, match="requires_6_1"):
        identity.compositor_adapter("/usr/bin/kwin_wayland", version)


@pytest.mark.parametrize("executable,code", [
    ("/usr/bin/sway", "portal_remotedesktop_eis_unavailable"),
    ("/usr/bin/labwc", "portal_remotedesktop_eis_unavailable"),
    ("/usr/bin/Hyprland", "hyprland_remote_portal_unqualified"),
    ("/tmp/kwin_wayland", "executable_unqualified"),
])
def test_named_refusal(executable, code):
    with pytest.raises(identity.WaylandIdentityError, match=code):
        identity.compositor_adapter(executable, "6.4.5")


def sample():
    exe = identity.MappedObject("/usr/bin/kwin_wayland", "0:0", 1, "a" * 64)
    library = identity.MappedObject("/usr/lib/libkwin.so.6", "0:0", 2, "b" * 64)
    return identity.CompositorRuntimeIdentity(42, 10, 1000, "boot", 3, "kwin_wayland",
        "6.4.5", "native", exe, (library,), ":1.2", 42, 1000)


def test_kwin_manifest_requires_matching_library_and_peer():
    value = sample()
    assert probe._manifest(value)["compositor_name"] == "kwin_wayland"
    with pytest.raises(ValueError, match="mapping_missing"):
        probe._manifest(replace(value, libraries=()))
    with pytest.raises(ValueError, match="peer_not_authenticated"):
        probe._manifest(replace(value, eis_peer_pid=99))
    with pytest.raises(ValueError, match="peer_not_authenticated"):
        probe._manifest(replace(value, compositor_name="gnome-shell"))


@pytest.mark.parametrize("path", [
    "/usr/lib/libkwin.so.6", "/usr/lib/qt6/plugins/kwin/plugins/eis.so"])
def test_same_stack_covers_kwin_and_eis_plugin(path):
    assert relevant_library(path)


def test_kwin_private_launch():
    assert "--virtual" in kwin.compositor_argv("native")
    argv = kwin.compositor_argv("x11-nested")
    assert argv[-2:] == ["--x11-display", ":97"]
    assert "--replace" not in argv
    with pytest.raises(RuntimeError, match="backend_unsupported"):
        kwin.compositor_argv("active-desktop")


def test_kwin_private_fd_contract():
    result = SimpleNamespace(unpack=lambda: (0, 12))
    fds = object()
    trial = SimpleNamespace(call=Mock(return_value=(result, fds)))
    glib = SimpleNamespace(Variant=Mock(return_value="variant"))
    assert kwin.connect(trial, glib) == (result, fds)
    glib.Variant.assert_called_once_with("(i)", (3,))
    trial.call.assert_called_once_with("/org/kde/KWin/EIS/RemoteDesktop",
        "org.kde.KWin.EIS.RemoteDesktop", "connectToEIS", "variant", fd=True)


def test_kwin_private_fd_bad_cookie_closes(monkeypatch):
    import os
    close = Mock()
    monkeypatch.setattr(os, "close", close)
    result = SimpleNamespace(unpack=lambda: (0, -1))
    fds = SimpleNamespace(steal_fds=lambda: [91])
    trial = SimpleNamespace(call=Mock(return_value=(result, fds)))
    with pytest.raises(RuntimeError, match="fd_shape_invalid"):
        kwin.connect(trial, SimpleNamespace(Variant=Mock()))
    close.assert_called_once_with(91)


def test_kwin_without_compiled_eis_plugin_is_named_refusal():
    trial = SimpleNamespace(call=Mock(side_effect=RuntimeError(
        "org.freedesktop.DBus.Error.UnknownObject: no such object")))
    with pytest.raises(RuntimeError, match="^portal_remotedesktop_eis_unavailable$"):
        kwin.connect(trial, SimpleNamespace(Variant=Mock()))


def test_kwin_private_errors_do_not_become_success():
    trial = SimpleNamespace(call=Mock(side_effect=TimeoutError("deadline")))
    with pytest.raises(TimeoutError):
        kwin.connect(trial, SimpleNamespace(Variant=Mock()))


def test_kwin_private_owner_version_check():
    trial = SimpleNamespace(wait=lambda predicate, *args: predicate(),
        compositor=SimpleNamespace(pid=42), call=Mock(return_value=SimpleNamespace(
            unpack=lambda: ("KWin version: 6.4.5\n",))))
    def dbus(method, name):
        return {"NameHasOwner": True, "GetNameOwner": ":1.7",
                "GetConnectionUnixProcessID": 42}[method]
    kwin.setup(trial, {"version": "6.4.5"}, dbus)
    assert trial.owner == ":1.7"
    with pytest.raises(RuntimeError, match="version_mismatch"):
        kwin.setup(trial, {"version": "6.4.4"}, dbus)
    with pytest.raises(RuntimeError, match="owner_mismatch"):
        kwin.setup(trial, {"version": "6.4.5"}, lambda *args: 99)


def test_kwin_refusal_does_not_prescribe_mutter_fix():
    result = probe._behavior_refusal(sample().public(), "compositor_held_button_eof_release_failed")
    assert result.state == "refused"
    assert "Mutter" not in result.remedy
