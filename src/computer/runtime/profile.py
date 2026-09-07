"""Fixed Linux sandbox profile. No model-supplied command or mount fragments."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

APP_PROFILES = frozenset({"drawing", "xed"})
DISPLAY = ":77"
WIDTH, HEIGHT = 1280, 960
SCRATCH_BYTES = 256 * 1024 * 1024
MAX_EXPORT_BYTES = 16 * 1024 * 1024
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_WIRE_BYTES = 24 * 1024 * 1024
LEASE_SECONDS = 2.0
ENVIRONMENT = {
    "PATH": "/usr/bin", "HOME": "/workspace/home", "USER": "desktop",
    "LOGNAME": "desktop", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "DISPLAY": DISPLAY,
    "XDG_RUNTIME_DIR": "/workspace/run", "XDG_CONFIG_HOME": "/workspace/home/.config",
    "XDG_CACHE_HOME": "/workspace/home/.cache", "XDG_DATA_HOME": "/workspace/home/.local/share",
    "DBUS_SESSION_BUS_ADDRESS": "unix:path=/workspace/run/bus", "GTK_MODULES": "gail:atk-bridge",
    "GTK_A11Y": "always", "GSETTINGS_BACKEND": "memory", "NO_AT_BRIDGE": "0",
    "LIBGL_ALWAYS_SOFTWARE": "1", "GDK_BACKEND": "x11", "PYTHONDONTWRITEBYTECODE": "1",
}


def validate_session(session_id: str) -> str:
    if not isinstance(session_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", session_id):
        raise ValueError("invalid desktop session identifier")
    return session_id


def unit_for(session_id: str) -> str:
    digest = hashlib.sha256(validate_session(session_id).encode("ascii")).hexdigest()[:32]
    return f"odin-cu-{digest}.service"


def validate_unit(unit: str) -> str:
    if not re.fullmatch(r"odin-cu-[a-f0-9]{32}\.service", unit):
        raise ValueError("not an owned desktop unit")
    return unit


def basename(name: str) -> str:
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_. -]{0,127}", name):
        raise ValueError("export requires a safe basename")
    if ".." in name or name.endswith((" ", ".")):
        raise ValueError("invalid export basename")
    return name


def sandbox_argv(app_profile: str) -> list[str]:
    if app_profile not in APP_PROFILES:
        raise ValueError("unapproved application profile")
    args = [
        "/usr/bin/bwrap", "--unshare-all", "--unshare-user", "--disable-userns",
        "--die-with-parent",
        "--new-session", "--cap-drop", "ALL", "--clearenv", "--uid", "65534", "--gid", "65534",
        "--ro-bind", "/usr", "/usr", "--symlink", "usr/bin", "/bin",
        "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64",
        "--ro-bind", "/opt/odin-computer-runtime", "/runtime",
        "--proc", "/proc", "--dev", "/dev",
        "--dir", "/etc", "--dir", "/var", "--dir", "/home",
        "--ro-bind", "/opt/odin-computer-runtime/assets/passwd", "/etc/passwd",
        "--ro-bind", "/opt/odin-computer-runtime/assets/group", "/etc/group",
        "--dir", "/etc/fonts", "--ro-bind",
        "/opt/odin-computer-runtime/assets/fonts.conf", "/etc/fonts/fonts.conf",
        "--size", str(SCRATCH_BYTES), "--tmpfs", "/workspace",
        "--dir", "/workspace/home", "--dir", "/workspace/run",
        "--dir", "/workspace/tmp", "--dir", "/workspace/exports",
        "--symlink", "workspace/tmp", "/tmp", "--symlink", "workspace/run", "/run",
        "--symlink", "/workspace/tmp", "/var/tmp", "--chdir", "/workspace",
        "--size", "1048576", "--tmpfs", "/dev/shm", "--remount-ro", "/proc",
        "--remount-ro", "/dev/shm", "--remount-ro", "/dev", "--remount-ro", "/",
    ]
    for key, value in ENVIRONMENT.items():
        args.extend(("--setenv", key, value))
    return [*args, "/usr/bin/python3", "-I", "/runtime/worker.py", app_profile]


def launch_argv(session_id: str, app_profile: str, *, runtime_sudo: bool = False) -> list[str]:
    """Only the internal package is mountable; callers cannot choose host roots."""
    root = Path(__file__).resolve().parent
    if any(char in str(root) for char in (":", "\n", "\r", " ")):
        raise ValueError("runtime installation path cannot be encoded safely")
    unit = unit_for(session_id)
    properties = [
        "DynamicUser=yes", "PrivateTmp=yes", "PrivateNetwork=yes", "PrivateDevices=yes",
        "ProtectSystem=strict", "ProtectHome=yes", "NoNewPrivileges=yes",
        # Masked host-proc submounts prevent unprivileged mounting of a NEW procfs.
        # The fixed sandbox exposes only read-only private proc, no host /sys.
        "ProtectKernelModules=yes",
        "ProtectControlGroups=yes", "ProtectClock=yes", "RestrictRealtime=yes",
        "RestrictSUIDSGID=yes", "LockPersonality=yes", "RemoveIPC=yes",
        "MemoryMax=1G", "MemorySwapMax=0", "CPUQuota=100%", "TasksMax=128",
        "RuntimeMaxSec=1200", "TimeoutStopSec=1", "KillMode=control-group",
        "SendSIGKILL=yes", "UMask=0077", "RestrictAddressFamilies=AF_UNIX AF_NETLINK",
        "CapabilityBoundingSet=", "AmbientCapabilities=", "LimitCORE=0",
        f"BindReadOnlyPaths={root}:/opt/odin-computer-runtime",
    ]
    return [
        *(["/usr/bin/sudo", "-n"] if runtime_sudo else []),
        "/usr/bin/systemd-run", "--quiet", "--pipe", "--wait",
        "--collect", "--service-type=exec", f"--unit={unit}",
        *(f"--property={value}" for value in properties), *sandbox_argv(app_profile),
    ]


def clean_environment() -> dict[str, str]:
    return {"PATH": "/usr/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}


def preflight(app_profile: str | None = None) -> None:
    if app_profile is not None and app_profile not in APP_PROFILES:
        raise ValueError("unapproved application profile")
    required: tuple[str, ...] = ("sudo", "systemd-run", "systemctl", "bwrap", "Xvfb", "python3",
                                 "dbus-daemon", "xdotool", "openbox")
    if app_profile is not None:
        required = (*required, app_profile)
    missing = [name for name in required if not os.access(f"/usr/bin/{name}", os.X_OK)]
    if missing:
        raise RuntimeError("desktop dependencies unavailable: " + ", ".join(missing))
