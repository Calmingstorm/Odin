"""Authenticated read-only scope from the opt-in in-process KWin companion.

The provider must share the real org.kde.KWin connection, executable inode, UID
and pinned process. A metadata proxy cannot satisfy this protocol. The common
snapshot path supplies metadata validation, challenge, double-read application
provenance and source/focus freshness validation.
"""
from __future__ import annotations

import json
import re
import secrets

from . import wayland_scope as common
from .wayland_identity import compositor_adapter

BUS_NAME = "org.kde.KWin.OdinScope"
OBJECT_PATH = "/org/kde/KWin/OdinScope"
INTERFACE = BUS_NAME


class KWinWaylandScopeProvider(common.GNOMEWaylandScopeProvider):
    """Same-session KWin provider; installation never implies qualification."""

    object_path = OBJECT_PATH
    interface = INTERFACE

    async def _authenticate(self):
        owner = await self._daemon("GetNameOwner", BUS_NAME)
        if not isinstance(owner, str) or not common._UNIQUE.fullmatch(owner):
            common._fail("wayland_provider_untrusted")
        if await self._daemon("GetNameOwner", "org.kde.KWin") != owner:
            common._fail("wayland_provider_untrusted")
        pid = await self._daemon("GetConnectionUnixProcessID", owner)
        uid = await self._daemon("GetConnectionUnixUser", owner)
        if (type(pid) is not int or type(uid) is not int or uid != self.expected_uid
                or (self.expected_compositor_pid is not None
                    and pid != self.expected_compositor_pid)):
            common._fail("wayland_provider_untrusted")
        process = common._process_identity(pid, uid)
        try:
            executable, inode = common._trusted_executable("/usr/bin/kwin_wayland")
        except (OSError, ValueError, RuntimeError):
            common._fail("wayland_provider_untrusted")
        if process.get("exe") != executable or tuple(process.get("exe_identity", ())) != inode:
            common._fail("wayland_provider_untrusted")
        identity = process | {"owner": owner}
        if (await self._daemon("GetNameOwner", BUS_NAME) != owner
                or await self._daemon("GetNameOwner", "org.kde.KWin") != owner):
            common._fail("wayland_provider_owner_changed")
        if self._pinned is not None and identity != self._pinned:
            common._fail("wayland_provider_owner_changed")
        self._pinned = identity
        return identity

    async def _identity(self):
        compositor = await self._authenticate()
        challenge = secrets.token_hex(24)
        body = await self._call(compositor["owner"], OBJECT_PATH, INTERFACE,
                                "Identity", "s", [challenge])
        if len(body) != 1 or not isinstance(body[0], str) or len(body[0]) > 4096:
            common._fail("wayland_compositor_identity_unavailable")
        try:
            result = json.loads(body[0])
        except (ValueError, TypeError):
            common._fail("wayland_compositor_identity_unavailable")
        if (not isinstance(result, dict) or result.get("challenge") != challenge
                or result.get("native_wayland") is not True
                or result.get("compositor_name") != "kwin_wayland"
                or not isinstance(result.get("compositor_version"), str)
                or len(result["compositor_version"]) > 160
                or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)*(?:[-+~][A-Za-z0-9.+~_-]+)?",
                                    result["compositor_version"])):
            common._fail("wayland_compositor_identity_unavailable")
        compositor_adapter("/usr/bin/kwin_wayland", result["compositor_version"])
        backends = {"KWinDrmBackend": "native", "KWinVirtualBackend": "native",
                    "KWinX11Backend": "x11-nested", "KWinWaylandBackend": "native"}
        backend_class = result.get("backend_class")
        if (not isinstance(backend_class, str) or backend_class not in backends
                or result.get("backend") != backends[backend_class]):
            common._fail("wayland_compositor_backend_unavailable")
        if compositor != await self._authenticate():
            common._fail("wayland_provider_owner_changed")
        return compositor | {"compositor_name": "kwin_wayland",
                             "compositor_version": result["compositor_version"],
                             "backend_class": backend_class, "backend": backends[backend_class]}
