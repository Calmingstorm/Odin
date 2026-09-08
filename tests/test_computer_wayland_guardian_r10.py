"""Guardian refusal and receipt logic without launching native input."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime import wayland_guardian as m

NS = SimpleNamespace


@pytest.mark.parametrize("path", [None, "relative", "/bad\npath"])
def test_r10_binary_path_refused(path):
    with pytest.raises(m.WaylandGuardianError, match="path_invalid"):
        m.trusted_binary(path)


@pytest.mark.parametrize(
    "mode,uid,executable,error",
    [
        (0o100755, 0, True, None),
        (0o120777, 0, True, "untrusted"),
        (0o100777, 0, True, "untrusted"),
        (0o100755, 1, True, "untrusted"),
        (0o040755, 0, True, "unavailable"),
        (0o100644, 0, False, "unavailable"),
    ],
)
def test_r10_binary_trust_walk(monkeypatch, mode, uid, executable, error):
    monkeypatch.setattr(m.os, "lstat", lambda p: NS(st_mode=mode, st_uid=uid))
    monkeypatch.setattr(m.os, "access", lambda *a: executable)
    if error:
        with pytest.raises(m.WaylandGuardianError, match=error):
            m.trusted_binary("/usr/bin/guardian")
    else:
        m.trusted_binary("/usr/bin/guardian")


@pytest.mark.parametrize("value", ["", "has space", "x" * 129, None])
def test_r10_mapping_refused(value):
    with pytest.raises(m.WaylandGuardianError, match="mapping"):
        m._mapping(value)


@pytest.mark.parametrize(
    "rows,failed",
    [
        ([b'{"event":"unsupported_release"}\n'], True),
        ([b"x" * 4097], True),
        ([b"not json"], True),
        ([b'{"event":"closed"}'], False),
    ],
)
async def test_r10_reader_receipts(rows, failed):
    guardian = m.WaylandGuardian("/fake", 1000)
    guardian._child = NS(stdout=NS(readline=AsyncMock(side_effect=rows + [b""])))
    await guardian._read()
    assert guardian._failed is failed
    events = []
    while not guardian._events.empty():
        events.append(guardian._events.get_nowait())
    assert events[-1] == {"event": "transport_end"}
    if not failed:
        assert guardian._closed_receipt


async def test_r10_no_child_read_send_close():
    guardian = m.WaylandGuardian("/fake", 1000)
    await guardian._read()
    assert guardian._failed
    with pytest.raises(m.WaylandGuardianError, match="disconnected"):
        await guardian._send("N\n")
    assert await guardian.close() == {
        "process_reaped": True,
        "release_submitted": True,
        "input_was_sent": False,
    }


@pytest.mark.parametrize(
    "event,error", [("closed", "input_path_lost"), ("surprise", "unexpected_receipt")]
)
async def test_r10_receipt_refusal(event, error):
    guardian = m.WaylandGuardian("/fake", 1000)
    guardian._events.put_nowait({"event": event})
    with pytest.raises(m.WaylandGuardianError, match=error):
        await guardian._receive("ready", timeout=1)


@pytest.mark.parametrize("cmd", ["", "X", "M\n", "M\r", "M\0", None])
async def test_r10_invalid_action(cmd):
    guardian = m.WaylandGuardian("/fake", 1000)
    with pytest.raises(m.WaylandGuardianError, match="invalid_action"):
        await guardian.act(cmd)


async def test_r10_inactive_and_failed_action_cleanup():
    guardian = m.WaylandGuardian("/fake", 1000)
    for operation in (guardian.select("mapping"), guardian.act("M 1 2")):
        with pytest.raises(m.WaylandGuardianError, match="not_active"):
            await operation
    guardian._child = NS(returncode=None)
    guardian._send = AsyncMock(side_effect=OSError("pipe"))
    guardian.close = AsyncMock()
    with pytest.raises(m.WaylandGuardianError, match="wayland_guardian_input_path_lost") as error:
        await guardian.act("M 1 2")
    assert error.value.details == {
        "input_was_sent": None,
        "diagnostics": {
            "phase": "dispatch",
            "steps_planned": 0,
            "steps_completed": 0,
            "release": "unknown",
            "reason": "wayland_guardian_input_path_lost",
        },
    }
    guardian.close.assert_awaited_once()


async def test_r10_missing_waiter_cannot_claim_release():
    guardian = m.WaylandGuardian("/fake", 1000)
    guardian._child = NS(stdin=NS(close=Mock()), returncode=None)
    guardian._send = AsyncMock(side_effect=OSError())
    assert await guardian.close() == {
        "process_reaped": False,
        "release_submitted": False,
        "input_was_sent": False,
    }


async def test_r10_identity_async_and_start_refusals(monkeypatch):
    callback = AsyncMock()
    guardian = m.WaylandGuardian("/fake", 1000, callback)
    await guardian._identity(None)
    callback.assert_awaited_once_with(None)
    monkeypatch.setattr(m, "trusted_binary", lambda p: None)
    close = Mock()
    monkeypatch.setattr(m.os, "close", close)
    guardian._closing = True
    with pytest.raises(m.WaylandGuardianError, match="single_use"):
        await guardian.start(123, "mapping")
    guardian._closing = False
    monkeypatch.setattr(m.os, "geteuid", lambda: 2000)
    with pytest.raises(m.WaylandGuardianError, match="uid_unavailable"):
        await guardian.start(124, "mapping")
    assert close.call_count == 2
