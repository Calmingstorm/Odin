"""Safety and identity checks for the namespace-only Wayland qualification.

The launcher-created read-only marker is not a permission grant or cached proof.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from pathlib import Path


def assert_private_environment() -> dict:
    nonce = os.environ.get("ODIN_WAYLAND_PROBE_NONCE", "")
    if not re.fullmatch(r"[0-9a-f]{64}", nonce):
        raise RuntimeError("private_probe_nonce_missing")
    if any(os.environ.get(k) != v for k, v in {
        "HOME": "/home/probe", "XDG_RUNTIME_DIR": "/run/probe",
        "WAYLAND_DISPLAY": "wayland-probe", "GDK_BACKEND": "wayland",
    }.items()):
        raise RuntimeError("private_probe_environment_mismatch")
    marker = Path("/probe/private.json")
    metadata = marker.stat()
    if metadata.st_uid != os.getuid() or stat.S_IMODE(metadata.st_mode) != 0o600:
        raise RuntimeError("private_probe_marker_permissions")
    value = json.loads(marker.read_text())
    if value.get("nonce") != nonce:
        raise RuntimeError("private_probe_marker_mismatch")
    for kind in ("pid", "mnt", "net"):
        if os.readlink(f"/proc/self/ns/{kind}") == value.get(f"outer_{kind}_namespace"):
            raise RuntimeError("private_probe_namespace_not_isolated")
    if not os.statvfs(marker).f_flag & os.ST_RDONLY:
        raise RuntimeError("private_probe_marker_not_read_only")
    if Path("/dev/input").exists() or Path("/dev/dri").exists():
        raise RuntimeError("private_probe_physical_devices_visible")
    if os.environ.get("DBUS_SESSION_BUS_ADDRESS") not in (None, "unix:path=/run/probe/bus"):
        raise RuntimeError("private_probe_bus_not_private")
    if os.environ.get("DISPLAY") not in (None, ":97"):
        raise RuntimeError("private_probe_x_display_not_owned")
    return value


def measured_object(path: str) -> dict:
    if not path.startswith(("/usr/", "/lib/", "/lib64/")) or " (deleted)" in path:
        raise RuntimeError("stack_path_not_trusted_installed_object")
    with open(path, "rb") as stream:
        info = os.fstat(stream.fileno())
        owner_ok = info.st_uid == 0
        if not owner_ok and info.st_uid == 65534 and os.environ.get("ODIN_WAYLAND_PROBE_NONCE"):
            # Unprivileged bwrap maps only the caller UID; outer root therefore
            # appears as overflowuid. Active-side measurement checked real UID0.
            # Inside, accept only read-only bytes matching the pinned manifest.
            assert_private_environment()
            owner_ok = bool(os.fstatvfs(stream.fileno()).f_flag & os.ST_RDONLY)
        if (not stat.S_ISREG(info.st_mode) or not owner_ok or info.st_mode & 0o022
                or info.st_size > 256 * 1024 * 1024):
            raise RuntimeError("stack_object_not_root_owned_read_only")
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
        after = os.fstat(stream.fileno())
        if (info.st_size, info.st_mtime_ns, info.st_ctime_ns) != (
                after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise RuntimeError("stack_object_changed_during_hash")
    return {"path": path, "device": f"{os.major(info.st_dev):02x}:{os.minor(info.st_dev):02x}",
            "inode": info.st_ino, "sha256": digest}


def device_equal(left: str, right: str) -> bool:
    try:
        return tuple(int(x, 16) for x in left.split(":")) == tuple(
            int(x, 16) for x in right.split(":"))
    except (TypeError, ValueError):
        return False


def object_equal(left: dict, right: dict) -> bool:
    return (left["path"] == right["path"] and left["inode"] == right["inode"]
            and left["sha256"] == right["sha256"]
            and device_equal(left["device"], right["device"]))


def mapped_objects(pid: int) -> list[dict]:
    result = {}
    for line in Path(f"/proc/{pid}/maps").read_text().splitlines():
        row = line.split(None, 5)
        if len(row) < 6 or "x" not in row[1] or not row[5].startswith("/"):
            continue
        path = row[5]
        item = measured_object(path)
        if item["inode"] != int(row[4]) or not device_equal(item["device"], row[3]):
            raise RuntimeError("mapped_object_replaced")
        result[path] = item
    return sorted(result.values(), key=lambda x: x["path"])


def require_same_stack(expected: dict, pid: int) -> dict:
    actual_exe = measured_object(os.readlink(f"/proc/{pid}/exe"))
    if not object_equal(expected["executable"], actual_exe):
        raise RuntimeError("private_compositor_executable_mismatch")
    actual = {item["path"]: item for item in mapped_objects(pid)}
    for item in expected["libraries"]:
        if item["path"] not in actual or not object_equal(item, actual[item["path"]]):
            error = RuntimeError("private_compositor_mapped_stack_mismatch")
            error.stack_detail = {
                "expected": item, "actual": actual.get(item["path"]),
                "loaded_candidates": [
                    value for path, value in actual.items()
                    if Path(path).name == Path(item["path"]).name],
            }
            raise error
    expected_paths = {item["path"] for item in expected["libraries"]}
    if any(relevant_library(p) and p not in expected_paths for p in actual):
        raise RuntimeError("private_compositor_vendor_stack_mismatch")
    return {"executable": actual_exe, "libraries": list(actual.values())}


def relevant_library(path):
    # MUST match wayland_identity._capture exactly. Case-insensitive libGL would
    # accidentally select libglib, which is not the OpenGL vendor implementation.
    name = Path(path).name
    return (name.startswith(("libmutter", "libei", "libeis", "libxkbcommon",
                             "libinput", "libEGL", "libGL", "libgbm", "libdrm"))
            or "_dri.so" in name or "nvidia" in name)
