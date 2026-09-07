"""Read only the configured operator session's AT-SPI switch, never desktop data.

This does not activate AT-SPI, enumerate applications, capture pixels, or certify
editable nodes. No ambient root D-Bus address or process environment is consulted.
"""
from __future__ import annotations

import asyncio
import os
import pwd
import stat
from datetime import UTC, datetime
from pathlib import Path


def _target(settings):
    if getattr(settings, "environment", None) != "existing_session":
        return None
    if settings.platform == "wayland":
        uid = settings.wayland_uid
        address = settings.wayland_bus_address
    elif settings.platform == "x11":
        # This is the explicit configured authority file, not a guessed logged-in
        # user. Root-owned/missing authority cannot establish an operator identity.
        authority = Path(settings.xauthority)
        if not settings.xauthority or not authority.is_absolute():
            return None
        info = authority.stat()
        if not stat.S_ISREG(info.st_mode):
            return None
        uid = info.st_uid
        address = f"unix:path=/run/user/{uid}/bus"
    else:
        return None
    if type(uid) is not int or uid <= 0 or not address.startswith("unix:path=/"):
        return None
    bus = Path(address.removeprefix("unix:path="))
    info = bus.stat()
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != uid:
        return None
    return uid, pwd.getpwuid(uid).pw_gid, address


async def read_accessibility_status(settings):
    """One bounded property read as the target uid; only tri-state data escapes."""
    result = {"enabled": None, "state": "unknown", "reason": "target_unavailable"}
    process = None
    try:
        target = _target(settings)
        if target is None:
            return result
        uid, gid, address = target
        argv = ["/usr/bin/busctl", "--auto-start=no", "--timeout=1s",
                f"--address={address}", "get-property", "org.a11y.Bus",
                "/org/a11y/status", "org.a11y.Status", "IsEnabled"]
        identity = {}
        if os.geteuid() == 0:
            identity = {"user": uid, "group": gid, "extra_groups": []}
        elif os.geteuid() != uid:
            if not getattr(settings, "runtime_sudo", False):
                result["reason"] = "operator_identity_unavailable"
                return result
            argv = ["/usr/bin/sudo", "-n", "-u", f"#{uid}", "--",
                    "/usr/bin/env", "-i", "PATH=/usr/bin:/bin", "LANG=C", *argv]
        # Minimal environment: never copy credentials, root's bus, or desktop
        # process environments. No shell and no session-wide setting mutations.
        process = await asyncio.create_subprocess_exec(
            *argv, stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, env={"PATH": "/usr/bin:/bin", "LANG": "C"},
            limit=256, **identity)

        async def bounded_read():
            output = await process.stdout.read(129)
            if len(output) > 128:
                return None
            await process.wait()
            return output.strip() if process.returncode == 0 else None

        result["reason"] = "property_unavailable"
        output = await asyncio.wait_for(bounded_read(), timeout=1.5)
        if output in (b"b true", b"b false"):
            enabled = output == b"b true"
            result.update(enabled=enabled, state="enabled" if enabled else "disabled",
                          reason="property_read")
    except TimeoutError:
        result["reason"] = "read_timeout"
    except (OSError, ValueError, KeyError):
        pass
    finally:
        if process is not None and process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            await process.wait()
        result["checked_at"] = datetime.now(UTC).isoformat()
    return result
