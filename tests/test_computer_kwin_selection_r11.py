"""Compositor selection keeps qualification/release gates, using fake transport."""
import os

import pytest

from src.computer.runtime import wayland_backend as backend
from tests.test_computer_wayland_backend_r8 import Portal, Scope
from tests.test_computer_wayland_backend_r8 import adapter as adapter_fixture

adapter = adapter_fixture


@pytest.mark.asyncio
async def test_kwin_uses_native_scope_and_keeps_probe_gate(adapter, monkeypatch):
    calls = []

    class KWinPortal(Portal):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.identity = {"shell": {"executable": "/usr/bin/kwin_wayland", "pid": 123}}

    class KWinScope(Scope):
        def __init__(self, **kwargs):
            calls.append(kwargs)
            super().__init__(**kwargs)

    monkeypatch.setattr(backend, "WaylandPortalSession", KWinPortal)
    monkeypatch.setattr(backend, "KWinWaylandScopeProvider", KWinScope)
    result = await adapter.start("kwin_session1")
    assert result["input_supported"]
    assert calls == [{"bus_address": "unix:path=/private/bus", "expected_uid": os.geteuid(),
                      "expected_compositor_pid": 123}]
    assert (await adapter.stop())["stopped"]


@pytest.mark.asyncio
async def test_missing_kwin_companion_does_not_fallback_to_gnome_or_input(adapter, monkeypatch):
    class KWinPortal(Portal):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.identity = {"shell": {"executable": "/usr/bin/kwin_wayland", "pid": 123}}

    class MissingCompanion(Scope):
        async def identity(self):
            raise RuntimeError("wayland_scope_unavailable")

    monkeypatch.setattr(backend, "WaylandPortalSession", KWinPortal)
    monkeypatch.setattr(backend, "KWinWaylandScopeProvider", MissingCompanion)
    result = await adapter.start("kwin_session1")
    assert result["capture_only"] and not result["input_supported"]
    assert result["input_blocker"] == "wayland_scope_unavailable"
    assert adapter._guardian is None
    assert (await adapter.stop())["stopped"]
