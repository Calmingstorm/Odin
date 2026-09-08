"""A portal-session acknowledgement alone does not close its D-Bus connection."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime.wayland_backend import WaylandRuntimeBackend


@pytest.mark.parametrize("connection_closed", [True, False, None])
async def test_cleanup_requires_portal_transport_close(connection_closed):
    backend = WaylandRuntimeBackend.__new__(WaylandRuntimeBackend)
    backend._jobs = set()
    backend._scope_jobs = set()
    backend._guardian = SimpleNamespace(
        close=AsyncMock(return_value={"process_reaped": True, "release_submitted": True})
    )
    backend._portal = SimpleNamespace(
        close=AsyncMock(
            return_value={
                "process_reaped": True,
                "session_close_acknowledged": True,
                "connection_closed": connection_closed,
            }
        )
    )
    backend._scope_provider = SimpleNamespace(close=AsyncMock())
    backend._release_failed = False
    assert await backend._cleanup_all() is (connection_closed is True)
    assert backend._cleanup_evidence["portal_session_closed"] is True
    assert backend._cleanup_evidence["portal_connection_closed"] is (connection_closed is True)
    backend._guardian.close.assert_awaited_once()
    backend._portal.close.assert_awaited_once()
    backend._scope_provider.close.assert_awaited_once()
