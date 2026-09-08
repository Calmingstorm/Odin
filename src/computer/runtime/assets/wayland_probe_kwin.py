"""Private KWin 6.1+ adapter, never an active-session input transport.

API reference: KDE/kwin Plasma/6.1 src/plugins/eis/eisbackend.cpp.
No portal bypass escapes the namespace: Trial verifies the marker before calls,
the returned socket credentials, exact mapped stack, delivery and EOF recovery.
"""

from __future__ import annotations

import re


def compositor_argv(backend):
    argv = [
        "/usr/bin/kwin_wayland",
        "--socket",
        "wayland-probe",
        "--width",
        "800",
        "--height",
        "600",
    ]
    if backend == "native":
        return argv + ["--virtual"]
    if backend == "x11-nested":
        return argv + ["--x11-display", ":97"]
    raise RuntimeError("probe_backend_unsupported")


def setup(trial, identity, dbus):
    trial.wait(lambda: dbus("NameHasOwner", "org.kde.KWin"), "probe_private_kwin_unavailable", 15)
    trial.owner = dbus("GetNameOwner", "org.kde.KWin")
    if dbus("GetConnectionUnixProcessID", trial.owner) != trial.compositor.pid:
        raise RuntimeError("probe_private_bus_owner_mismatch")
    info = trial.call("/KWin", "org.kde.KWin", "supportInformation").unpack()[0]
    if not isinstance(info, str) or len(info) > 131072:
        raise RuntimeError("probe_private_kwin_information_invalid")
    version = re.search(r"^KWin version: ([^\r\n]+)$", info, re.MULTILINE)
    if not version or version.group(1).strip() != identity["version"]:
        raise RuntimeError("probe_private_compositor_version_mismatch")


def connect(trial, glib):
    # D-Bus signature is (i)->(hi): descriptor index plus context cookie.
    # The connection stays owned by Trial until after sole-sender EOF checks.
    try:
        result, fds = trial.call(
            "/org/kde/KWin/EIS/RemoteDesktop",
            "org.kde.KWin.EIS.RemoteDesktop",
            "connectToEIS",
            glib.Variant("(i)", (3,)),
            fd=True,
        )
    except Exception as exc:
        if "UnknownObject" in str(exc) or "UnknownMethod" in str(exc):
            raise RuntimeError("portal_remotedesktop_eis_unavailable") from None
        raise
    values = result.unpack()
    if (
        len(values) != 2
        or type(values[0]) is not int
        or type(values[1]) is not int
        or values[1] <= 0
    ):
        import os

        for fd in fds.steal_fds():
            os.close(fd)
        raise RuntimeError("probe_eis_fd_shape_invalid")
    return result, fds
