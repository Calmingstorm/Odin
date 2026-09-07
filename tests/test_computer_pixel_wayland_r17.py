"""Real native planner with fake EI only; never opens a desktop."""
import importlib.util
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import pytest

from src.computer.runtime.wayland_guardian import WaylandGuardian, WaylandGuardianError

spec = importlib.util.spec_from_file_location(
    "pixel_guardian_fixture", Path(__file__).with_name("test_computer_wayland_guardian_r8.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
binaries = base.binaries
guardian = base.guardian


@pytest.mark.parametrize("value", ["61", "-"])
def test_native_pixel_plan_gates_and_releases(guardian, value):
    g = guardian()
    assert g.event("ready")["pixel_fields_v1"] is True
    g.send(f"B 2000\nE 12 13 {value}\n".encode())
    for index in range(1, 5):
        gate = g.event("pixel_gate", count=index)
        if index == 1:
            assert not g.inputs()
            assert not any(line.startswith("MOVE") for line in g.lines)
        if index == 3:
            assert g.inputs() == [["BUTTON", "272", "1"], ["BUTTON", "272", "0"]]
        g.send(f"G {gate['step']}\n".encode())
    done = g.event("action_done")
    assert done["diagnostics"]["release"] == "confirmed"
    assert done["diagnostics"]["steps_completed"] == done["diagnostics"]["steps_planned"]
    keys = [row for row in g.inputs() if row[0] == "KEY"]
    assert len(keys) == 6
    assert sum(row[2] == "1" for row in keys) == sum(row[2] == "0" for row in keys)


@pytest.mark.parametrize("value,reason", [("f09f9982", "unsupported_character"),
                                          ("61" * 100, "lease-expired")])
def test_whole_plan_refuses_before_click(guardian, value, reason):
    g = guardian()
    g.send(f"B 2000\nE 12 13 {value}\n".encode())
    assert g.event("action_rejected")["reason"] == reason
    assert not g.inputs()
    assert not any(line.startswith("MOVE") for line in g.lines)


def test_missing_permit_releases_without_typing(guardian):
    g = guardian()
    g.send(b"B 2000\nE 12 13 61\n")
    for index in (1, 2):
        gate = g.event("pixel_gate", count=index)
        g.send(f"G {gate['step']}\n".encode())
    g.event("pixel_gate", count=3)
    g.send(b"C\n")
    assert g.finish()[0] == 0
    assert g.inputs() == [["BUTTON", "272", "1"], ["BUTTON", "272", "0"]]


def test_stale_permit_not_replayed(guardian):
    g = guardian()
    g.send(b"B 2000\nE 12 13 61\n")
    gate = g.event("pixel_gate")
    g.send(f"G {gate['step']}\nG {gate['step']}\n".encode())
    assert g.finish()[0] != 0
    assert not g.inputs()


@pytest.mark.asyncio
async def test_transport_requires_fresh_guard_each_dispatch():
    g = WaylandGuardian("/unused", 123)
    g._child = Mock(returncode=None)
    g._send = AsyncMock()
    guard = AsyncMock()
    for step in (1, 2, 3, 4):
        g._events.put_nowait({"event": "pixel_gate", "step": step})
    g._events.put_nowait({"event": "action_done", "input_was_sent": True})
    await g.act("E 12 13 61", pixel_guard=guard)
    assert guard.await_count == 4
    assert [c.args[0] for c in g._send.await_args_list] == [
        "B 2000\nE 12 13 61\n", "G 1\n", "G 2\n", "G 3\n", "G 4\n"]


@pytest.mark.asyncio
async def test_guard_failure_cancels_no_retry():
    g = WaylandGuardian("/unused", 123)
    g._child = Mock(returncode=None)
    g._send = AsyncMock()
    g.close = AsyncMock()
    g._events.put_nowait({"event": "pixel_gate", "step": 1})
    with pytest.raises(WaylandGuardianError):
        await g.act("E 12 13 61", pixel_guard=AsyncMock(side_effect=ValueError("focus")))
    assert g._send.await_count == 1
    g.close.assert_awaited_once()
