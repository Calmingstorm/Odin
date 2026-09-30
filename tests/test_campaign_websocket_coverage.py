"""Audit tail boundaries operate only on disposable logs and fake transports."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.web import websocket


class Transport:
    closed = False
    _odin_identity = None
    _odin_policy_revoked = False
    _odin_session_managed = False

    def __init__(self):
        self.send_json = AsyncMock()


@pytest.mark.parametrize("state", ["closed", "revoked", "unreadable"])
async def test_initial_audit_tail_stops_on_closed_revoked_or_unreadable(
    tmp_path, monkeypatch, state,
):
    log = tmp_path / "audit.jsonl"
    log.write_text('{"event":"test"}\n')
    monkeypatch.setattr(websocket, "Path", lambda _path: log)
    manager = websocket.WebSocketManager(SimpleNamespace())
    ws = Transport()
    if state == "closed":
        ws.closed = True
    elif state == "revoked":
        ws._odin_policy_revoked = True
    else:
        from pathlib import Path
        monkeypatch.setattr(
            Path, "read_text", lambda *_: (_ for _ in ()).throw(OSError("test unreadable")),
        )
    await manager._tail_logs(ws)
    ws.send_json.assert_not_awaited()


async def test_audit_tail_handles_rotation_missing_file_and_read_failure(tmp_path, monkeypatch):
    log = tmp_path / "audit.jsonl"
    log.write_text("old audit entry\n")
    monkeypatch.setattr(websocket, "Path", lambda _path: log)
    manager = websocket.WebSocketManager(SimpleNamespace())
    ws = Transport()
    manager._log_subscribers.add(ws)
    polls = []
    from pathlib import Path
    exists = Path.exists

    async def poll(_delay):
        polls.append(len(polls))
        if len(polls) == 1:
            log.write_text("")
        elif len(polls) == 2:
            pass
        elif len(polls) == 3:
            monkeypatch.setattr(Path, "exists", lambda _: False)
        elif len(polls) == 4:
            monkeypatch.setattr(Path, "exists", exists)
            log.write_text("new audit entry\n")
        else:
            raise OSError("log storage disappeared")

    monkeypatch.setattr(websocket.asyncio, "sleep", poll)
    await manager._tail_logs(ws)
    assert len(polls) == 5
    assert [call.args[0]["line"] for call in ws.send_json.await_args_list] == [
        "old audit entry", "new audit entry",
    ]


@pytest.mark.parametrize("source", ["dynamic", "static"])
def test_compatibility_transport_without_identity_has_no_credential_authority(source):
    manager = websocket.WebSocketManager(SimpleNamespace())
    ws = Transport()
    ws._odin_policy_source = source
    assert not manager._credential_authorized(ws)


def test_compatibility_static_transport_revalidates_exact_inventory_identity():
    from src.config.schema import ApiTokenIdentity, WebConfig
    identity = ApiTokenIdentity(token="test", user_id="test", tier="user")
    config = WebConfig(api_tokens=[identity])
    manager = websocket.WebSocketManager(SimpleNamespace(), web_config=config)
    ws = Transport()
    ws._odin_identity = identity
    ws._odin_policy_source = "static"
    assert manager._credential_authorized(ws)
    config.api_tokens = []
    assert not manager._credential_authorized(ws)
