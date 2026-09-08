import json
import os
import secrets
import subprocess
import time
from pathlib import Path

from gi.repository import Gio, GLib
from wayland_probe_sender import ABSOLUTE, BUTTON, Sender, bind_library

out = Path("/evidence")
result = {"production_admitted": False, "input_attempted": False, "stage": "init"}
children = []


def save():
    (out / "result.json").write_text(json.dumps(result, indent=2) + "\n")


def call(dest, path, interface, method, args=None):
    value = bus.call_sync(
        dest, path, interface, method, args, None, Gio.DBusCallFlags.NONE, 2500, None
    ).unpack()
    return value[0] if len(value) == 1 else value


def dbus(method, name):
    return call(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
        method,
        GLib.Variant("(s)", (name,)),
    )


try:
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    result["stage"] = "start_kwin"
    log = open(out / "kwin.log", "w")
    kwin = subprocess.Popen(
        [
            "/usr/bin/kwin_wayland",
            "--virtual",
            "--socket",
            "wayland-smoke",
            "--width",
            "800",
            "--height",
            "600",
        ],
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    children.append(kwin)
    result["kwin_pid"] = kwin.pid
    for _ in range(150):
        if kwin.poll() is not None:
            raise RuntimeError("kwin exited: " + str(kwin.returncode))
        if dbus("NameHasOwner", "org.kde.KWin"):
            break
        time.sleep(0.1)
    owner = dbus("GetNameOwner", "org.kde.KWin")
    assert dbus("GetConnectionUnixProcessID", owner) == kwin.pid
    result["kwin_owner"] = owner
    result["kwin_executable"] = os.readlink(f"/proc/{kwin.pid}/exe")
    result["stage"] = "load_plugin"
    (out / "plugins-introspection.xml").write_text(
        call(owner, "/Plugins", "org.freedesktop.DBus.Introspectable", "Introspect")
    )
    result["load_return"] = call(
        owner,
        "/Plugins",
        "org.kde.KWin.Plugins",
        "LoadPlugin",
        GLib.Variant("(s)", ("odin-scope",)),
    )
    scope_owner = dbus("GetNameOwner", "org.kde.KWin.OdinScope")
    scope_pid = dbus("GetConnectionUnixProcessID", scope_owner)
    scope_uid = dbus("GetConnectionUnixUser", scope_owner)
    result.update(scope_owner=scope_owner, scope_pid=scope_pid, scope_uid=scope_uid)
    assert scope_owner == owner and scope_pid == kwin.pid and scope_uid == os.getuid()
    challenge = secrets.token_hex(24)
    result["stage"] = "identity"
    identity = json.loads(
        call(
            owner,
            "/org/kde/KWin/OdinScope",
            "org.kde.KWin.OdinScope",
            "Identity",
            GLib.Variant("(s)", (challenge,)),
        )
    )
    result["identity"] = identity
    assert identity["challenge"] == challenge and identity["backend_class"] == "KWinVirtualBackend"
    assert identity["compositor_version"] == "6.7.4" and identity["native_wayland"] is True
    result["stage"] = "receiver"
    env = dict(os.environ, WAYLAND_DISPLAY="wayland-smoke", GDK_BACKEND="wayland", NO_AT_BRIDGE="1")
    receiver_log = open(out / "receiver.log", "w")
    receiver = subprocess.Popen(
        ["/usr/bin/python3", "/evidence/receiver.py"],
        env=env,
        stdout=receiver_log,
        stderr=subprocess.STDOUT,
    )
    children.append(receiver)
    result["receiver_pid"] = receiver.pid
    request = {
        "protocol": 1,
        "challenge": challenge,
        "source_digest": "a" * 64,
        "source": {
            "node_id": 1,
            "source_type": 1,
            "session_handle": "/readonly/smoke",
            "position": [0, 0],
            "size": [800, 600],
        },
    }
    result["source_note"] = (
        "Synthetic protocol source binding for scope-only smoke, "
        "not a portal stream or input admission."
    )
    result["stage"] = "snapshot"
    for attempt in range(30):
        time.sleep(0.2)
        try:
            snapshot = json.loads(
                call(
                    owner,
                    "/org/kde/KWin/OdinScope",
                    "org.kde.KWin.OdinScope",
                    "Snapshot",
                    GLib.Variant("(s)", (json.dumps(request),)),
                )
            )
            break
        except GLib.Error as exc:
            result["last_snapshot_error"] = str(exc)
    else:
        raise RuntimeError("Snapshot unavailable after 30 bounded observations")
    result["snapshot"] = snapshot
    assert snapshot["pid"] == receiver.pid and snapshot["safe_focus"] is True
    assert snapshot["native_wayland"] is True and snapshot["challenge"] == challenge
    assert snapshot["source_digest"] == request["source_digest"]
    assert snapshot["title"] == "Odin read-only native scope smoke"
    assert dbus("GetNameOwner", "org.kde.KWin.OdinScope") == owner
    assert dbus("GetConnectionUnixProcessID", owner) == kwin.pid
    result["loaded_plugin_mapping"] = [
        line
        for line in Path(f"/proc/{kwin.pid}/maps").read_text().splitlines()
        if "odin-scope.so" in line
    ]
    assert result["loaded_plugin_mapping"]
    result["stage"] = "scratch_menu_scope"
    result["input_attempted"] = True
    result["input_note"] = (
        "Explicit scratch EI helper only in isolated lab; "
        "NOT production admission or EOF qualification."
    )
    returned, fds = bus.call_with_unix_fd_list_sync(
        owner,
        "/org/kde/KWin/EIS/RemoteDesktop",
        "org.kde.KWin.EIS.RemoteDesktop",
        "connectToEIS",
        GLib.Variant("(i)", (3,)),
        None,
        Gio.DBusCallFlags.NONE,
        2500,
        None,
        None,
    )
    fd_index, cookie = returned.unpack()
    sender = Sender(bind_library(), fds.get(fd_index))

    def pause():
        for _ in range(10):
            sender.pump()
            time.sleep(0.03)

    def button(code, down):
        dev = sender.device(BUTTON)
        sender.lib.ei_device_button_button(dev, code, down)
        sender.frame(dev)
        sender.flush()

    def move(x, y):
        dev = sender.device(ABSOLUTE)
        sender.lib.ei_device_pointer_motion_absolute(dev, x, y)
        sender.frame(dev)
        sender.flush()
        pause()

    try:
        sender.handshake()
        b = snapshot["bounds"]
        move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        button(273, True)
        pause()
        button(273, False)
        pause()
        menu_snapshot = json.loads(
            call(
                owner,
                "/org/kde/KWin/OdinScope",
                "org.kde.KWin.OdinScope",
                "Snapshot",
                GLib.Variant("(s)", (json.dumps(request),)),
            )
        )
        result["menu_snapshot"] = menu_snapshot
        assert menu_snapshot["pid"] == receiver.pid and menu_snapshot["safe_focus"]
        assert menu_snapshot["bounds"] != snapshot["bounds"]
        assert menu_snapshot["focus_token"] != snapshot["focus_token"]
        b = menu_snapshot["bounds"]
        move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
        button(272, True)
        pause()
        button(272, False)
        pause()
        result["menu_events"] = [
            json.loads(line) for line in (out / "menu-events.jsonl").read_text().splitlines()
        ]
        assert any(e["event"] == "item_selected" for e in result["menu_events"])
        restored = json.loads(
            call(
                owner,
                "/org/kde/KWin/OdinScope",
                "org.kde.KWin.OdinScope",
                "Snapshot",
                GLib.Variant("(s)", (json.dumps(request),)),
            )
        )
        result["restored_snapshot"] = restored
        assert restored["bounds"] == snapshot["bounds"]
        assert restored["focus_token"] != menu_snapshot["focus_token"]
        result["native_menu_scope_pass"] = True
    finally:
        button(273, False)
        button(272, False)
        pause()
        sender.close()
        call(
            owner,
            "/org/kde/KWin/EIS/RemoteDesktop",
            "org.kde.KWin.EIS.RemoteDesktop",
            "disconnect",
            GLib.Variant("(i)", (cookie,)),
        )
    result["unload_return"] = call(
        owner,
        "/Plugins",
        "org.kde.KWin.Plugins",
        "UnloadPlugin",
        GLib.Variant("(s)", ("odin-scope",)),
    )
    assert not dbus("NameHasOwner", "org.kde.KWin.OdinScope")
    result["scope_load_smoke_pass"] = True
    result["stage"] = "complete"
except Exception as exc:
    result["error"] = type(exc).__name__ + ": " + str(exc)
    result["scope_load_smoke_pass"] = False
finally:
    for child in reversed(children):
        if child.poll() is None:
            child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=3)
    result["child_exit_codes"] = [p.returncode for p in children]
    save()
print(json.dumps(result), flush=True)
raise SystemExit(0 if result.get("scope_load_smoke_pass") else 1)
