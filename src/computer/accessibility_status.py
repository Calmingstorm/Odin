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


async def _loginctl(*arguments):
    """Read logind's bounded session metadata, never process environments."""
    process = await asyncio.create_subprocess_exec(
        "/usr/bin/loginctl", *arguments, stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        env={"PATH": "/usr/bin:/bin", "LANG": "C"}, limit=16384)
    try:
        assert process.stdout is not None
        output = await asyncio.wait_for(process.stdout.read(16385), 1)
        if len(output) > 16384:
            raise ValueError("session_metadata_limit")
        await asyncio.wait_for(process.wait(), 1)
        if process.returncode != 0:
            raise ValueError("session_metadata_unavailable")
        return output.decode("utf-8")
    finally:
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            await process.wait()


async def _x11_uid(settings):
    # Root-owned or /dev/null authority is valid with explicit runtime sudo.
    # Bind it through logind's exact active local X display, not an arbitrary
    # logged-in account or the service account's own session bus.
    display = settings.display_name
    sessions = await _loginctl("list-sessions", "--no-legend", "--no-pager")
    matches = set()
    rows = sessions.splitlines()
    if len(rows) > 16:
        return None
    for row in rows:
        parts = row.split()
        if not parts:
            continue
        info = dict(line.split("=", 1) for line in (await _loginctl(
            "show-session", parts[0], "-p", "User", "-p", "Display", "-p", "Type",
            "-p", "Remote", "-p", "Active")).splitlines() if "=" in line)
        if (info.get("Display") == display and info.get("Type") == "x11"
                and info.get("Remote") == "no" and info.get("Active") == "yes"):
            uid = int(info.get("User", "0"))
            if uid > 0:
                matches.add(uid)
    return matches.pop() if len(matches) == 1 else None


async def _target(settings):
    if getattr(settings, "environment", None) != "existing_session":
        return None
    if settings.platform == "wayland":
        uid = settings.wayland_uid
        address = settings.wayland_bus_address
    elif settings.platform == "x11":
        # Prefer an explicit nonroot-owned authority; privileged display access
        # otherwise needs an unambiguous logind binding to this exact display.
        authority = Path(settings.xauthority)
        info = authority.stat() if settings.xauthority and authority.is_absolute() else None
        uid = (info.st_uid if info and stat.S_ISREG(info.st_mode) and info.st_uid > 0
               else await _x11_uid(settings))
        if uid is None:
            return None
        address = f"unix:path=/run/user/{uid}/bus"
    else:
        return None
    if type(uid) is not int or uid <= 0 or not address.startswith("unix:path=/"):
        return None
    bus = Path(address.removeprefix("unix:path="))
    try:
        info = bus.stat()
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid != uid:
            return None
    except PermissionError:
        # /run/user/UID is deliberately private. The explicit sudo transport
        # authenticates as that UID; only its canonical runtime bus is allowed
        # without the service account's own stat access.
        if (not getattr(settings, "runtime_sudo", False)
                or address != f"unix:path=/run/user/{uid}/bus"):
            return None
    return uid, pwd.getpwuid(uid).pw_gid, address


async def read_accessibility_status(settings):
    """One bounded property read as the target uid; only tri-state data escapes."""
    result = {"enabled": None, "state": "unknown", "reason": "target_unavailable"}
    process = None
    try:
        target = await asyncio.wait_for(_target(settings), 2)
        if target is None:
            return result
        uid, gid, address = target
        argv = ["/usr/bin/busctl", "--auto-start=no", "--timeout=1s",
                f"--address={address}", "get-property", "org.a11y.Bus",
                "/org/a11y/bus", "org.a11y.Status", "IsEnabled"]
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
            assert process.stdout is not None
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
