"""Execute production qualifier against an owned compositor, inside Docker ONLY.

This fixtures the active identity transport boundary, not behavioral evidence:
the production bwrap/helper/real GNOME/libei/GTK path remains unchanged.
"""
import asyncio
import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

sys.path.insert(0, "/work")
from src.computer.runtime.assets.wayland_probe_private import (
    mapped_objects,
    measured_object,
    relevant_library,
)
from src.computer.runtime.wayland_probe import qualify


@dataclass(frozen=True)
class Obj:
    path: str
    device: str
    inode: int
    sha256: str


@dataclass(frozen=True)
class Identity:
    pid: int
    uid: int
    start_ticks: int
    boot_id: str
    session_id: int
    backend: str
    version: str
    executable: Obj
    libraries: tuple
    shell_owner: str
    eis_peer_pid: int
    eis_peer_uid: int
    compositor_name: str = "gnome-shell"

    @property
    def binding_digest(self):
        return hashlib.sha256(json.dumps(asdict(self), sort_keys=True).encode()).hexdigest()


def main():
    logging.basicConfig(level=logging.DEBUG)
    if not Path("/.dockerenv").exists() or os.environ.get("HOME") != "/tmp/home":
        raise RuntimeError("owned Docker fixture only")
    import gi
    gi.require_version("Gio", "2.0")
    from gi.repository import Gio, GLib
    children = []
    def spawn(argv):
        child = subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        children.append(child)
        return child
    try:
        for path in ("/tmp/home", "/tmp/runtime"):
            Path(path).mkdir(mode=0o700, exist_ok=True)
        backend = os.environ.get("PROBE_FIXTURE_BACKEND", "native")
        system = subprocess.run(
            ["dbus-daemon", "--session", "--fork", "--print-address"],
            capture_output=True, text=True, check=True)
        os.environ["DBUS_SYSTEM_BUS_ADDRESS"] = system.stdout.strip()
        argv = ["/usr/bin/gnome-shell", "--wayland", "--no-x11", "--wayland-display=wayland-active"]
        if backend == "native":
            argv += ["--headless", "--virtual-monitor", "800x600"]
        else:
            spawn(["Xvfb", ":98", "-screen", "0", "800x600x24", "-nolisten", "tcp"])
            os.environ["DISPLAY"] = ":98"
            time.sleep(0.5)
            argv += ["--nested"]
        shell = spawn(argv)
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        owner = None
        for _ in range(200):
            if shell.poll() is not None:
                raise RuntimeError("fixture compositor startup failed")
            try:
                owner = bus.call_sync(
                    "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
                    "GetNameOwner", GLib.Variant("(s)", ("org.gnome.Shell",)), None,
                    Gio.DBusCallFlags.NONE, 1000, None).unpack()[0]
                break
            except Exception:
                time.sleep(.1)
        if owner is None:
            raise RuntimeError("fixture Shell owner missing")
        time.sleep(2)
        version = bus.call_sync(
            owner, "/org/gnome/Shell", "org.freedesktop.DBus.Properties", "Get",
            GLib.Variant("(ss)", ("org.gnome.Shell", "ShellVersion")), None,
            Gio.DBusCallFlags.NONE, 3000, None).unpack()[0]
        fields = Path(f"/proc/{shell.pid}/stat").read_text().rsplit(") ", 1)[1].split()
        libraries = tuple(Obj(**item) for item in mapped_objects(shell.pid)
                          if relevant_library(item["path"]))
        identity = Identity(
            shell.pid, os.getuid(), int(fields[19]),
            Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
            int(fields[3]), backend, version, Obj(**measured_object("/usr/bin/gnome-shell")),
            libraries, owner, shell.pid, os.getuid())
        result = asyncio.run(qualify(identity))
        print(json.dumps(result.public()), flush=True)
        expected = os.environ.get("PROBE_FIXTURE_EXPECT", "eligible")
        if result.state != expected:
            raise SystemExit(3)
    finally:
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=3)


if __name__ == "__main__":
    main()
