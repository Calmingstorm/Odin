"""Sandbox-only worker. No arbitrary command operation is provided."""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING or __package__:
    from .exports import read_export
    from .profile import APP_PROFILES, DISPLAY, ENVIRONMENT, HEIGHT, WIDTH
    from .protocol import decode, encode, pack_blob
else:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from runtime.exports import read_export
    from runtime.profile import APP_PROFILES, DISPLAY, ENVIRONMENT, HEIGHT, WIDTH
    from runtime.protocol import decode, encode, pack_blob

if TYPE_CHECKING:
    from .primitives import NativeDesktop


def containment_report() -> dict:
    """Read-only evidence; not proof of hostile-code sandbox escape resistance."""
    status = Path("/proc/self/status").read_text()
    fields = dict(line.split(":", 1) for line in status.splitlines() if ":" in line)
    fs = os.statvfs("/workspace")
    return {
        "uid": os.getuid(), "gid": os.getgid(), "display": os.environ.get("DISPLAY"),
        "network_namespace": os.readlink("/proc/self/ns/net"),
        "pid_namespace": os.readlink("/proc/self/ns/pid"),
        "mount_namespace": os.readlink("/proc/self/ns/mnt"),
        "ipc_namespace": os.readlink("/proc/self/ns/ipc"),
        "no_new_privs": fields.get("NoNewPrivs", "").strip(),
        "effective_capabilities": fields.get("CapEff", "").strip(),
        "workspace_capacity": fs.f_blocks * fs.f_frsize,
        "host_home_visible": Path("/home/odin").exists(),
        "host_root_home_visible": Path("/root").exists(),
        "host_machine_id_visible": Path("/etc/machine-id").exists(),
        "physical_input_visible": Path("/dev/input").exists(),
        "graphics_device_visible": Path("/dev/dri").exists(),
    }


class Worker:
    def __init__(self, profile: str):
        if profile not in APP_PROFILES:
            raise ValueError("unapproved application profile")
        if Path(__file__).resolve().parent != Path("/runtime") or os.getuid() != 65534:
            raise RuntimeError("worker must execute inside its fixed sandbox")
        self.profile = profile
        self.children: list[subprocess.Popen[bytes]] = []
        self.cancelled = threading.Event()
        self.seen: set[str] = set()
        self.desktop: NativeDesktop | None = None
        self.operation_lock = threading.Lock()
        self.output_lock = threading.Lock()
        self.paused = False

    def spawn(self, argv: list[str]):
        child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL, env=dict(ENVIRONMENT), close_fds=True)
        self.children.append(child)
        return child

    def startup(self) -> dict:
        os.umask(0o077)
        os.environ.clear()
        os.environ.update(ENVIRONMENT)
        for folder in ("home/.config", "home/.cache", "home/.local/share", "run", "exports",
                       "tmp/.X11-unix"):
            Path("/workspace", folder).mkdir(parents=True, exist_ok=True, mode=0o700)
        self.spawn([
            "/usr/bin/dbus-daemon", "--nofork", "--nopidfile",
            "--config-file=/runtime/assets/session.conf",
        ])
        self.spawn([
            "/usr/bin/Xvfb", DISPLAY, "-screen", "0", f"{WIDTH}x{HEIGHT}x24",
            "-nolisten", "tcp", "-noreset", "-ac", "-extension", "GLX",
        ])
        end = time.monotonic() + 5.0
        while not (
            Path("/tmp/.X11-unix/X77").is_socket() and Path("/workspace/run/bus").is_socket()
        ):
            if time.monotonic() > end or any(child.poll() is not None for child in self.children):
                raise RuntimeError("private desktop primitives failed to start")
            time.sleep(0.05)
        self.spawn([
            "/usr/bin/openbox", "--sm-disable", "--config-file", "/runtime/assets/openbox.xml"
        ])
        if TYPE_CHECKING or __package__:
            from .primitives import NativeDesktop
        else:
            from runtime.primitives import NativeDesktop
        self.desktop = NativeDesktop()
        launch = self.desktop.launch(self.profile)
        if not launch.get("ok"):
            raise RuntimeError("approved desktop application failed to launch")
        end = time.monotonic() + 8.0
        while time.monotonic() < end:
            try:
                observation = self.desktop.snapshot(packed=True)
                if observation["window"]["pid"] > 0:
                    return {"ok": True, "event": "ready", "profile": self.profile,
                            "width": WIDTH, "height": HEIGHT, "containment": containment_report()}
            except Exception:
                time.sleep(0.1)
        raise RuntimeError("approved application window did not become observable")

    def operation(self, message: dict, directory_fd: int) -> dict:
        request_id = message.get("id")
        if not isinstance(request_id, str) or len(request_id) > 64 or request_id in self.seen:
            raise ValueError("duplicate request; no replay")
        if len(self.seen) >= 1024:
            raise ValueError("worker operation ceiling exceeded")
        self.seen.add(request_id)
        operation = message.get("op")
        if operation == "observe":
            assert self.desktop is not None  # Operations follow successful startup.
            observation = self.desktop.snapshot(packed=True)
            observation["image"] = pack_blob(observation.pop("image_bytes"))
            return {"ok": True, "id": request_id, "observation": observation}
        if operation == "act":
            assert self.desktop is not None  # Operations follow successful startup.
            action = message.get("action")
            if not isinstance(action, dict):
                raise ValueError("action must be an object")
            receipt = self.desktop.grounded_execute(action, self.cancelled)
            return {"ok": True, "id": request_id, "receipt": receipt}
        if operation == "export":
            name = message.get("name")
            if not isinstance(name, str):
                raise ValueError("export name must be a string")
            return {"ok": True, "id": request_id,
                    "blob": pack_blob(read_export(name, directory_fd=directory_fd))}
        raise ValueError("unsupported worker operation")

    def emit(self, message: dict):
        with self.output_lock:
            sys.stdout.buffer.write(encode(message))
            sys.stdout.buffer.flush()

    def serve_operation(self, message, directory_fd):
        try:
            self.emit(self.operation(message, directory_fd))
        except Exception:
            self.emit({
                "ok": False, "id": message.get("id"), "error": "desktop operation unavailable"
            })
        finally:
            self.operation_lock.release()

    def pause(self, message):
        self.paused = True
        self.cancelled.set()
        if not self.operation_lock.acquire(timeout=0.3):
            self.emit({"ok": False, "id": message.get("id"), "error": "pause cleanup unavailable"})
            return
        try:
            assert self.desktop is not None  # Pause follows successful startup.
            released = self.desktop.release_all()
            self.emit({"ok": bool(released.get("ok")), "released": released.get("ok") is True,
                       "id": message.get("id"), "state": "paused"})
        finally:
            self.operation_lock.release()

    def run(self):
        self.emit(self.startup())
        directory_fd = os.open("/workspace/exports", os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            while True:
                line = sys.stdin.buffer.readline(65537)
                if not line:
                    return
                message = decode(line, cap=65536)
                if message.get("op") == "pause":
                    self.pause(message)
                    continue
                if message.get("op") == "resume":
                    safe = self.paused and not self.operation_lock.locked()
                    if safe:
                        self.paused = False
                        self.cancelled.clear()
                    self.emit({
                        "ok": safe, "id": message.get("id"), "state": "active" if safe else "paused"
                    })
                    continue
                if self.paused and message.get("op") == "act":
                    self.emit({"ok": False, "id": message.get("id"), "error": "desktop paused"})
                    continue
                if not self.operation_lock.acquire(blocking=False):
                    self.emit({"ok": False, "id": message.get("id"), "error": "desktop busy"})
                    continue
                threading.Thread(
                    target=self.serve_operation, args=(message, directory_fd), daemon=True
                ).start()
        finally:
            os.close(directory_fd)
            self.cancelled.set()
            if self.desktop:
                self.desktop.release_all()


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("invalid worker invocation")
        Worker(sys.argv[1]).run()
    except Exception:
        sys.stdout.buffer.write(encode({
            "ok": False, "event": "ready", "error": "isolated worker failed"
        }))
        sys.stdout.buffer.flush()
        raise SystemExit(1) from None
