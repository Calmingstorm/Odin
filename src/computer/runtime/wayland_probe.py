"""Per-start disposable qualification using the SAME installed Wayland stack.

No active-desktop injection, operator-supplied evidence, build, or container
fallback. Consent and active-session authentication are separate runtime gates.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import signal
import stat
import tempfile
from pathlib import Path

from ..admission import CompositorIdentity, InputAdmission
from .assets.wayland_probe_private import device_equal, measured_object, object_equal

_ASSETS = Path(__file__).with_name("assets")
_REMEDY = ("Keep this session capture-only. Install matching GNOME/Mutter and probe "
           "dependencies, or use a compositor/backend whose disposable same-stack "
           "button-release probe passes; then begin a new consented session.")


def _behavior_refusal(public, code):
    if code == "compositor_held_button_eof_release_failed":
        return InputAdmission(
            "refused", code,
            f"{public.name} {public.version} ({public.backend}): the receiver received a held "
            "button but did not receive its release after the sole EI sender exited. "
            "This is the stuck-button damage class. Older Mutter builds contain the "
            "meta-eis-client drop_device button-state index defect (key instead of button).",
            "Do not enable input on this build. Install your distribution's Mutter update "
            "containing upstream fix 4ae305f19e391edda1aab0f9a9c47b01062f6330, or an "
            "equivalent vendor fix; start a new desktop session at your convenience and "
            "run qualification again. Odin will not patch or restart the compositor.",
            public, "same_stack_disposable", ("held_button_eof_release_failed",))
    return InputAdmission(
        "refused", code,
        f"{public.name} {public.version}: disposable {public.backend} "
        "probe did not verify held-input EOF release and receiver recovery.",
        _REMEDY, public, "same_stack_disposable")


def _manifest(identity) -> dict:
    def obj(value):
        return {key: getattr(value, key) for key in ("path", "device", "inode", "sha256")}
    digest = identity.binding_digest
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("identity_binding_invalid")
    if (identity.compositor_name != "gnome-shell"
            or identity.backend not in {"native", "x11-nested"}
            or identity.pid <= 1 or identity.uid < 0 or identity.start_ticks <= 0
            or identity.eis_peer_pid != identity.pid or identity.eis_peer_uid != identity.uid
            or not re.fullmatch(r":[0-9]+[.][0-9]+", identity.shell_owner)):
        raise ValueError("identity_backend_or_peer_not_authenticated")
    libraries = [obj(item) for item in identity.libraries]
    if not libraries or not any("libmutter" in item["path"] for item in libraries):
        raise ValueError("identity_mutter_mapping_missing")
    return {"binding_digest": digest, "pid": identity.pid, "uid": identity.uid,
            "start_ticks": identity.start_ticks, "boot_id": identity.boot_id,
            "session_id": identity.session_id, "backend": identity.backend,
            "version": identity.version, "executable": obj(identity.executable),
            "libraries": libraries}


def _validate_active(expected: dict) -> None:
    pid = expected["pid"]
    proc = Path(f"/proc/{pid}")
    fields = (proc / "stat").read_text().rsplit(") ", 1)[1].split()
    if (int(fields[19]) != expected["start_ticks"] or int(fields[3]) != expected["session_id"]
            or proc.stat().st_uid != expected["uid"]
            or Path("/proc/sys/kernel/random/boot_id").read_text().strip() != expected["boot_id"]):
        raise RuntimeError("active_compositor_identity_changed")
    if os.readlink(proc / "exe") != expected["executable"]["path"]:
        raise RuntimeError("active_compositor_executable_changed")
    maps = {}
    for line in (proc / "maps").read_text().splitlines():
        row = line.split(None, 5)
        if len(row) == 6 and "x" in row[1]:
            maps[row[5]] = row
    for item in [expected["executable"], *expected["libraries"]]:
        measured = measured_object(item["path"])
        row = maps.get(item["path"])
        if (not object_equal(item, measured) or not row or int(row[4]) != item["inode"]
                or not device_equal(row[3], item["device"])):
            raise RuntimeError("active_compositor_mapped_stack_changed")


def _trusted_program(path: str) -> None:
    target = Path(path)
    metadata = target.stat()
    if (not target.is_file() or not os.access(target, os.X_OK) or metadata.st_uid != 0
            or metadata.st_mode & (stat.S_IWGRP | stat.S_IWOTH)):
        raise RuntimeError("probe_dependency_not_trusted")


def _sandbox_argv(marker: Path) -> list[str]:
    # Only fixed or supervisor-generated arguments. No input supplies a bus,
    # display, executable, shell fragment or host mount.
    argv = ["/usr/bin/bwrap", "--unshare-all", "--die-with-parent", "--new-session",
            "--clearenv", "--cap-drop", "ALL", "--ro-bind", "/usr", "/usr"]
    for path in ("/lib", "/lib64", "/bin", "/sbin"):
        if Path(path).is_symlink():
            argv += ["--symlink", os.readlink(path), path]
        elif Path(path).exists():
            argv += ["--ro-bind", path, path]
    argv += ["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--tmpfs", "/run",
             "--dir", "/run/probe", "--chmod", "0700", "/run/probe", "--tmpfs", "/home",
             "--dir", "/home/probe", "--dir", "/etc", "--dir", "/probe",
             "--ro-bind", str(_ASSETS), "/probe/assets",
             "--ro-bind", str(marker), "/probe/private.json"]
    for path in ("/etc/fonts", "/etc/ld.so.cache", "/etc/ld.so.conf", "/etc/ld.so.conf.d",
                 "/etc/passwd", "/etc/group", "/etc/localtime"):
        if Path(path).exists():
            argv += ["--ro-bind", path, path]
    env = {"PATH": "/usr/bin:/bin", "HOME": "/home/probe", "XDG_RUNTIME_DIR": "/run/probe",
           "WAYLAND_DISPLAY": "wayland-probe", "GDK_BACKEND": "wayland", "LC_ALL": "C.UTF-8",
           "ODIN_WAYLAND_PROBE_NONCE": json.loads(marker.read_text())["nonce"],
           "XDG_CONFIG_HOME": "/home/probe/.config", "XDG_DATA_HOME": "/home/probe/.local/share",
           "XDG_CACHE_HOME": "/home/probe/.cache", "XDG_CURRENT_DESKTOP": "GNOME",
           "XDG_SESSION_TYPE": "wayland", "GSETTINGS_BACKEND": "memory", "NO_AT_BRIDGE": "1",
           "LIBGL_ALWAYS_SOFTWARE": "1", "GALLIUM_DRIVER": "llvmpipe", "LP_NUM_THREADS": "2",
           "OMP_NUM_THREADS": "1", "GSK_RENDERER": "cairo", "PYTHONDONTWRITEBYTECODE": "1"}
    for key, value in env.items():
        argv += ["--setenv", key, value]
    argv += ["--chdir", "/home/probe", "--", "/usr/bin/python3", "-s",
             "/probe/assets/wayland_probe_session.py"]
    return argv


async def _cleanup(proc, pidfd) -> None:
    # Never signal a numeric PID/PGID after asyncio's watcher may have reaped it.
    # The pidfd pins the gated subreaper supervisor. It terminates/reaps bwrap,
    # whose PID namespace teardown also removes independently forked jobs.
    if proc.returncode is None:
        if pidfd is None:
            # No gate was opened, so the bounded launcher cannot have descendants.
            if proc.stdin:
                proc.stdin.close()
        else:
            try:
                signal.pidfd_send_signal(pidfd, signal.SIGTERM)
            except ProcessLookupError:
                pass
        try:
            await asyncio.wait_for(proc.wait(), 3)
        except TimeoutError:
            if pidfd is not None:
                try:
                    signal.pidfd_send_signal(pidfd, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            await asyncio.wait_for(proc.wait(), 1)


class GnomeSameStackQualifier:
    """No operator qualification switch or evidence path; a fresh trial per call."""

    def __init__(self, *, record_spawn=None):
        self._lock = asyncio.Lock()
        self.record_spawn = record_spawn

    async def __call__(self, identity) -> InputAdmission:
        public = None
        proc = None
        pidfd = None
        try:
            public = CompositorIdentity(identity.compositor_name, identity.version,
                                        identity.backend, identity.binding_digest)
            async with asyncio.timeout(86):
                async with self._lock:
                    manifest = _manifest(identity)
                    await asyncio.to_thread(_validate_active, manifest)
                    for path in ("/usr/bin/bwrap", "/usr/bin/python3", "/usr/bin/dbus-daemon",
                                 "/usr/bin/gnome-shell"):
                        _trusted_program(path)
                    if manifest["backend"] == "x11-nested":
                        _trusted_program("/usr/bin/Xvfb")
                        _trusted_program("/usr/bin/xdotool")
                    if manifest["executable"]["path"] != "/usr/bin/gnome-shell":
                        raise RuntimeError("probe_nonstandard_compositor_installation")
                    with tempfile.TemporaryDirectory(prefix="odin-wayland-probe-") as directory:
                        marker = Path(directory) / "private.json"
                        data = {"nonce": secrets.token_hex(32), "identity": manifest}
                        data.update({f"outer_{kind}_namespace": os.readlink(f"/proc/self/ns/{kind}")
                                     for kind in ("pid", "mnt", "net")})
                        marker.write_text(json.dumps(data, sort_keys=True))
                        marker.chmod(0o600)
                        proc = await asyncio.create_subprocess_exec(
                            "/usr/bin/python3", "-I", str(_ASSETS / "wayland_probe_gate.py"),
                            str(os.getpid()), stdin=asyncio.subprocess.PIPE,
                            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                            start_new_session=True, env={"PATH": "/usr/bin:/bin"}, limit=131072)
                        if await proc.stdout.readline() != b"PROBE_GATE_READY\n":
                            raise RuntimeError("probe_launcher_failed")
                        pidfd = os.pidfd_open(proc.pid)
                        if self.record_spawn is not None:
                            await self.record_spawn(proc.pid)
                        proc.stdin.write(json.dumps(_sandbox_argv(marker)).encode() + b"\n")
                        await proc.stdin.drain()
                        proc.stdin.close()
                        output = bytearray()
                        while chunk := await proc.stdout.read(8192):
                            output.extend(chunk)
                            if len(output) > 131072:
                                raise RuntimeError("probe_output_limit")
                        status = await proc.wait()
                        await _cleanup(proc, pidfd)
                        proc = None
                        os.close(pidfd)
                        pidfd = None
                        if status != 0:
                            raise RuntimeError("probe_sandbox_or_dependency_failed")
                        result = json.loads(output)
                        if (result.get("nonce") != data["nonce"]
                                or result.get("binding_digest") != manifest["binding_digest"]):
                            raise RuntimeError("probe_measurement_binding_mismatch")
                        if not result.get("passed"):
                            code = result.get("code", "probe_behavior_failed")
                            if not re.fullmatch(r"[a-z][a-z0-9_]{0,95}", code):
                                code = "probe_behavior_failed"
                            return _behavior_refusal(public, code)
                        required = {"held_button_received", "held_key_received", "sole_sender_eof",
                                    "button_release_received", "key_release_received",
                                    "same_receiver_fresh_input", "private_compositor_survived",
                                    "exact_mapped_stack", "private_cleanup_reaped"}
                        if set(result.get("checks", [])) != required:
                            raise RuntimeError("probe_measurement_incomplete")
                        await asyncio.to_thread(_validate_active, manifest)
                        if identity.binding_digest != manifest["binding_digest"]:
                            raise RuntimeError("active_compositor_binding_changed")
                        return InputAdmission(
                            "eligible", "same_stack_button_release_verified",
                            f"{public.name} {public.version}: identical disposable "
                            f"{public.backend} "
                            "stack released received held input after the sole EI sender exited; "
                            "the same receiver accepted fresh input.",
                            "This is same-stack disposable evidence, not a fault test "
                            "of the active "
                            "desktop. Fresh portal consent and authenticated active-session/source "
                            "scope are still required.",
                            public, "same_stack_disposable",
                            tuple(sorted(required)) + (
                                "identity_sha256:" + manifest["binding_digest"],))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            code = (str(exc) if re.fullmatch(r"[a-z][a-z0-9_]{0,95}", str(exc))
                    else "probe_unavailable")
            if isinstance(exc, TimeoutError):
                code = "probe_deadline_exceeded"
            name = f"{public.name} {public.version}" if public else "Unidentified compositor"
            return InputAdmission(
                "refused", code,
                f"{name}: safe per-session same-stack qualification could not be completed "
                f"({code}).", _REMEDY, public)
        finally:
            if proc is not None:
                await asyncio.shield(_cleanup(proc, pidfd))
            if pidfd is not None:
                os.close(pidfd)


async def qualify(identity) -> InputAdmission:
    """Runtime integration convenience; no cached decisions."""
    return await GnomeSameStackQualifier()(identity)
