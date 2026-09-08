"""R17 release-evidence regression: no desktop or native input."""
# ruff: noqa: N802 -- Fake libX11 exposes the native API spellings.
import asyncio
import ctypes
import json
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import x11_owned_device as device
from src.computer.runtime.pixel_fields import pixel_field_steps
from src.computer.runtime.x11_attached import AttachedFailure, X11AttachedBackend


@pytest.mark.parametrize("locks,works", [(0, True), (16, True), (2, False), (64, False)])
def test_keyplan_numlock_is_not_held_input(monkeypatch, locks, works):
    class Keymap:
        def XkbGetState(self, display, keyboard, out):
            out._obj.locked_mods = locks
            return 0

        def XStringToKeysym(self, value):
            return {b"Control_L": 65507, b"n": 110}[value]

        def XKeysymToKeycode(self, display, symbol):
            return {65507: 37, 110: 57}[symbol]

        def XkbLookupKeySym(self, display, code, mask, consumed, actual):
            assert mask == locks  # Actual lock state must participate in lookup.
            actual._obj.value = 65507 if code == 37 else (78 if mask & 2 else 110)
            return 1

        def XGetModifierMapping(self, display):
            self.slots = (ctypes.c_ubyte * 8)(50, 66, 37, 64, 77, 0, 133, 0)
            self.mapping = device._ModifierMap(1, self.slots)
            return ctypes.pointer(self.mapping)

        def XFreeModifiermap(self, mapping):
            pass

    proof = []
    monkeypatch.setattr(device, "_prove_modifier_effects", lambda *args: proof.append(args))
    if works:
        assert device.resolve_key_plan(Keymap(), None, 256, ["ctrl"], "n") == [37, 57]
        assert proof[-1][-1] == locks
    else:
        with pytest.raises(device.X11DeviceError, match="unsupported_key"):
            device.resolve_key_plan(Keymap(), None, 256, ["ctrl"], "n")


class Child:
    pid = 701

    def __init__(self, receipt):
        self.lines = iter([json.dumps(receipt).encode() + b"\n"])
        self.stdin = self.stdout = self
        self.returncode = None
        self.writes = []

    async def readline(self):
        return next(self.lines, b"")

    def write(self, value):
        self.writes.append(json.loads(value))

    async def drain(self):
        pass

    async def wait(self):
        self.returncode = 0
        return 0

    def close(self):
        pass


@pytest.mark.asyncio
@pytest.mark.parametrize("released", [True, False])
async def test_privileged_preflight_terminal_receipt_is_not_injector_ready(monkeypatch, released):
    receipt = {"status": "unavailable", "injected": False, "released": released,
               "reason": "unsupported_key", "device_identity": ["pinned"],
               "persistent_input_devices": False,
               "diagnostics": {"phase": "preflight", "steps_completed": 0}}
    child = Child(receipt)
    backend = X11AttachedBackend(enabled=True, display_name=":177", monitor_names=["fake"],
                                 runtime_sudo=True)
    backend._device_identity = ["pinned"]
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=child))
    ready = AsyncMock(return_value={"pid": 701, "start_ticks": 1})
    monkeypatch.setattr(backend, "_worker_ready", ready)
    monkeypatch.setattr(backend, "_identities_gone", AsyncMock(return_value=True))
    actual = await backend._input_worker({"action": {"type": "key", "chord": "ctrl+n"}})
    assert actual == receipt
    assert ready.await_count == 1  # Guardian only; no injector existed.
    assert len(child.writes) == 1  # Request only; no ACK or replay.
    assert backend._release_failed is (not released)
    assert not backend._guardians


@pytest.mark.asyncio
async def test_preflight_receipt_cannot_certify_living_guardian(monkeypatch):
    receipt = {"status": "unavailable", "injected": False, "released": True,
               "input_opened": False,
               "diagnostics": {"phase": "preflight", "steps_completed": 0}}
    child = Child(receipt)
    backend = X11AttachedBackend(enabled=True, display_name=":177", monitor_names=["fake"],
                                 runtime_sudo=True)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=child))
    monkeypatch.setattr(backend, "_worker_ready",
                        AsyncMock(return_value={"pid": 701, "start_ticks": 1}))
    monkeypatch.setattr(backend, "_identities_gone", AsyncMock(return_value=False))
    with pytest.raises(AttachedFailure, match="input_outcome_unknown"):
        await backend._input_worker({"action": {"type": "key", "chord": "ctrl+n"}})
    assert backend._release_failed
    assert len(child.writes) == 1


def test_pixel_field_preflights_entire_text_without_injection():
    class Native:
        def key_plan(self, modifiers, symbol):
            return [37, 38]

        def text_keys(self, text):
            assert text == "abc"
            return [[38], [56], [54]]

    action = {"region": {"x": 10, "y": 20, "width": 81, "height": 21}, "text": "abc"}
    plan = pixel_field_steps(action, Native(), error=ValueError)
    assert plan[:4] == [("move", 50, 30), ("button", 1, True), ("button", 1, False),
                        ("wait", .05)]
    assert plan[4:8] == [("key", 37, True), ("key", 38, True),
                         ("key", 38, False), ("key", 37, False)]
    assert plan[-1] == ("key", 54, False)


@pytest.mark.parametrize("text", ["abc\n", "\t", "\x00", "\x7f"])
def test_pixel_field_rejects_submission_controls_before_any_keys(text):
    action = {"region": {"x": 10, "y": 20, "width": 81, "height": 21}, "text": text}
    with pytest.raises(ValueError, match="invalid_text"):
        pixel_field_steps(action, object(), error=ValueError)
