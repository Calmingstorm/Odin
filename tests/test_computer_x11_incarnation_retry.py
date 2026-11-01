"""Fake-only enduring incarnation retry and IPC namespace regression checks."""

import asyncio
import ctypes
import io
import json
import subprocess
from types import SimpleNamespace

import pytest

from src.computer.runtime import x11_attached_worker as worker
from src.computer.runtime import x11_recovery as recovery


@pytest.fixture(autouse=True)
def no_native(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Native desktop/process access forbidden")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(ctypes, "CDLL", forbidden)


class Clock:
    now = 0.0

    def __call__(self):
        return self.now


class Watch:
    def __init__(self, *epochs):
        self.epochs = iter(epochs)
        self.closed = False

    def drain(self):
        epoch = next(self.epochs)
        if isinstance(epoch, Exception):
            raise epoch
        return epoch

    def close(self):
        self.closed = True


def test_failed_subscription_retries_with_new_namespace_and_cooldown():
    clock = Clock()
    first = Watch(1, 1, 2, RuntimeError("BadWindow"))
    second = Watch(1, 1, 2)
    watches = iter([first, second])
    calls = []

    def factory(display):
        calls.append(display)
        return next(watches)

    enduring = recovery.EnduringIncarnationWatch(":fake", factory=factory, clock=clock)
    assert enduring.drain() == 1
    assert enduring.drain() == 1
    assert enduring.drain() == 2
    assert enduring.drain() is None
    assert first.closed
    clock.now = .999
    assert enduring.drain() is None
    assert len(calls) == 1
    clock.now = 1
    assert enduring.drain() == 3  # Native epoch reset to 1 never revives proof 1.
    assert enduring.drain() == 3
    assert enduring.drain() == 4
    enduring.close()
    assert second.closed
    clock.now = 100
    assert enduring.drain() is None
    assert len(calls) == 2


def test_subscription_attempts_are_bounded_even_after_long_success():
    clock = Clock()
    calls = []

    def factory(display):
        calls.append(display)
        raise RuntimeError("subscription unavailable")

    enduring = recovery.EnduringIncarnationWatch(":fake", factory=factory, clock=clock)
    for now in [0, .5, 1, 1.5, 2, 2.5, 3, 4, 1000]:
        clock.now = now
        assert enduring.drain() is None
    assert len(calls) == 4


def test_drain_failure_on_replacement_closes_partial_watch():
    clock = Clock()
    failed = Watch(RuntimeError("tree changed during traversal"))
    enduring = recovery.EnduringIncarnationWatch(
        ":fake", factory=lambda _: failed, clock=clock)
    assert enduring.drain() is None
    assert failed.closed


def test_watcher_ipc_revokes_before_new_namespace_and_null_barriers(monkeypatch, capsys):
    clock = Clock()
    first = Watch(1, RuntimeError("BadWindow"))
    replacement = Watch(1)
    watches = iter([first, replacement])
    enduring = recovery.EnduringIncarnationWatch(
        ":fake", factory=lambda _: next(watches), clock=clock)
    monkeypatch.setattr(recovery, "EnduringIncarnationWatch", lambda _: enduring)
    config = {"display_name": ":fake", "xauthority": "/fake", "monitor_names": ["fake"]}
    monkeypatch.setattr(worker, "attachment_configuration", lambda *args: config)
    capture = SimpleNamespace(close=lambda: None)
    monkeypatch.setattr(worker, "X11MonitorCapture", lambda *args, **kwargs: capture)
    monkeypatch.setattr(worker, "safe_run", lambda *args: {"ok": True})
    monkeypatch.setattr(worker.signal, "alarm", lambda _: None)
    commands = b"".join(json.dumps({"incarnation_barrier": token * 32}).encode() + b"\n"
                        for token in ["a", "b", "c"])
    monkeypatch.setattr(worker.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(commands)))

    def select(read, write, errors, timeout):
        clock.now += .5
        return read, [], []

    monkeypatch.setattr(worker.select, "select", select)
    worker.watch_topology(config)
    records = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    incarnation = [row for row in records if row.get("event", "").startswith("incarnation_")]
    assert incarnation == [
        {"ok": True, "event": "incarnation_changed", "incarnation_epoch": 1, "touched": None},
        {"ok": True, "event": "incarnation_unavailable"},
        {"ok": True, "event": "incarnation_barrier", "barrier": "a" * 32,
         "incarnation_epoch": None},
        {"ok": True, "event": "incarnation_barrier", "barrier": "b" * 32,
         "incarnation_epoch": None},
        {"ok": True, "event": "incarnation_changed", "incarnation_epoch": 2, "touched": None},
        {"ok": True, "event": "incarnation_barrier", "barrier": "c" * 32,
         "incarnation_epoch": 2},
    ]
    assert first.closed and replacement.closed
