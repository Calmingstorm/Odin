"""Real guardian + real xkbcommon, fake EI only. Never opens a desktop."""
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "guardian_r8_fixture", ROOT / "tests/test_computer_wayland_guardian_r8.py"
)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
binaries = base.binaries
guardian = base.guardian


@pytest.mark.parametrize("button", [272, 273, 274])
def test_double_click_release_order(guardian, button):
    g = guardian()
    g.send(f"B 2000\nQ {button} 12 13\n".encode())
    g.event("action_done")
    assert g.inputs() == [["BUTTON", str(button), str(d)] for d in (1, 0, 1, 0)]


@pytest.mark.parametrize("direction,axis", [("up", "0 -120"), ("down", "0 120"),
                                           ("left", "-120 0"), ("right", "120 0")])
def test_scroll(guardian, direction, axis):
    g = guardian()
    g.send(f"B 2000\nW {direction} 3 12 13\n".encode())
    g.event("action_done")
    assert [s for s in g.lines if s.startswith("SCROLL")] == [f"SCROLL {axis}"] * 3
    assert not g.inputs()


@pytest.mark.parametrize("chord", ["F12", "ctrl+alt+Delete", "shift+Tab", "KP_Enter", "Shift_L"])
def test_generic_keys(guardian, chord):
    g = guardian()
    g.send(f"B 2000\nJ {chord}\n".encode())
    g.event("action_done")
    assert any(row[2] == "1" for row in g.inputs())
    assert sum(row[2] == "1" for row in g.inputs()) == sum(row[2] == "0" for row in g.inputs())


def test_unicode_active_german_layout(guardian, monkeypatch):
    monkeypatch.setenv("FAKE_LAYOUT", "de")
    g = guardian()
    g.send(f"B 2000\nT {'äÖ€'.encode().hex()}\n".encode())
    g.event("action_done")
    assert g.inputs()[:6] == [["KEY", str(key), str(down)] for key, down in [
        (40, 1), (40, 0), (42, 1), (39, 1), (39, 0), (42, 0),
    ]]
    # XKB may expose Level3 via the synthetic LVL3 key or physical RALT.
    level3 = g.inputs()[6][1]
    assert level3 in {"84", "100"}
    assert g.inputs()[6:] == [["KEY", level3, "1"], ["KEY", "18", "1"],
                              ["KEY", "18", "0"], ["KEY", level3, "0"]]


def test_unsupported_whole_chunk_no_partial_input(guardian):
    g = guardian()
    g.send(f"B 2000\nT {'abc🙂é'.encode().hex()}\n".encode())
    row = g.event("action_rejected")
    assert row["reason"] == "unsupported_character"
    assert row["characters"] == [{"index": 3, "codepoint": 128578}, {"index": 4, "codepoint": 233}]
    assert row["input_was_sent"] is False
    assert not g.inputs()
    g.send(b"B 2000\nJ F12\n")
    g.event("action_done")


def test_maximum_unsupported_report_complete(guardian):
    g = guardian()
    g.send(f"B 2000\nT {('🙂' * 256).encode().hex()}\n".encode())
    row = g.event("action_rejected")
    assert len(row["characters"]) == 256
    assert row["characters"][-1] == {"index": 255, "codepoint": 128578}
    assert not g.inputs()


@pytest.mark.parametrize("chord", ["Not_A_Keysym", "ctrl+ctrl+a", "meta+a", "ctrl+"])
def test_unsupported_key_is_precise_and_sends_nothing(guardian, chord):
    g = guardian()
    g.send(f"B 2000\nJ {chord}\n".encode())
    assert g.event("action_rejected")["reason"] == "unsupported_key"
    assert not g.inputs()


@pytest.mark.parametrize("command", ["W up 0 12 13", "W up 21 12 13", "W diagonal 1 12 13",
                                     "Q 272 -1 13", "Q 280 12 13"])
def test_pointer_validation_prevents_partial_dispatch(guardian, command):
    g = guardian()
    g.send(f"B 2000\n{command}\n".encode())
    code, _rows = g.finish()
    assert code != 0
    assert not g.inputs()


@pytest.mark.parametrize("button", [273, 274])
def test_right_middle_click(guardian, button):
    g = guardian()
    g.send(f"B 2000\nP {button} 12 13\n".encode())
    g.event("action_done")
    assert g.inputs() == [["BUTTON", str(button), str(d)] for d in (1, 0)]


@pytest.mark.asyncio
async def test_transport_rejection_is_detailed_and_does_not_close():
    from unittest.mock import AsyncMock, Mock

    from src.computer.runtime.wayland_guardian import WaylandGuardian, WaylandGuardianError

    g = WaylandGuardian("/unused", 123)
    g._child = Mock(returncode=None)
    g._send = AsyncMock()
    g.close = AsyncMock()
    row = {"event": "action_rejected", "reason": "unsupported_character",
           "characters": [{"index": 0, "codepoint": 128578}], "input_was_sent": False}
    g._events.put_nowait(row)
    with pytest.raises(WaylandGuardianError, match="unsupported_character") as error:
        await g.act("T f09f9982")
    assert error.value.details == row
    assert not g._active
    g.close.assert_not_awaited()


@pytest.mark.parametrize("hextext", ["c080", "eda080", "f4908080", "e282", "61" * 257])
def test_invalid_utf8_and_bound_rejected(guardian, hextext):
    g = guardian()
    g.send(f"B 2000\nT {hextext}\n".encode())
    code, _rows = g.finish()
    assert code != 0
    assert not g.inputs()
