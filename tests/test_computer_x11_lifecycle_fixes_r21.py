"""Native-shaped protocol regressions, with no display connection or input."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.runtime import x11_app_scope
from tests.test_computer_x11_app_scope_r5 import Display, Window
from tests.test_computer_x11_attached_r5 import backend, reply, sources


def text_property(value, encoding):
    return SimpleNamespace(format=8, bytes_after=0, value=value, property_type=encoding)


@pytest.fixture
def native(monkeypatch):
    display = Display()
    # Real GetProperty replies declare a type, including legacy STRING.
    display.target.props["WM_CLASS"] = text_property(b"xed\0Xed\0", "STRING")
    display.target.props["WM_NAME"] = text_property(b"Untitled", "STRING")
    monkeypatch.setattr(
        x11_app_scope, "_process_identity", lambda pid: {"pid": pid, "start_ticks": 101}
    )
    checker = x11_app_scope.AppScope(display)
    monitor = SimpleNamespace(x=0, y=0, width=800, height=600)
    return display, checker, monitor


@pytest.mark.parametrize("modern", [True, False])
def test_latin1_legacy_title_remains_eligible(native, modern):
    display, checker, monitor = native
    display.target.props["WM_NAME"] = text_property(b"Caf\xe9", "STRING")
    display.target.props["WM_CLASS"] = text_property(b"caf\xe9\0Caf\xe9\0", "STRING")
    if modern:
        display.target.props["_NET_WM_NAME"] = text_property("Café modern".encode(), "UTF8_STRING")
    binding, reason = checker.inspect(monitor)
    assert reason is None and binding["focused"] is True
    assert binding["wm_class"] == "café Café"
    assert checker._metadata(display.target)[0] == ("Café modern" if modern else "Café")


@pytest.mark.parametrize(
    "name,value,encoding",
    [
        ("_NET_WM_NAME", b"Caf\xe9", "UTF8_STRING"),
        ("WM_NAME", b"Caf\xe9", "UTF8_STRING"),
        ("WM_NAME", b"title", "COMPOUND_TEXT"),
        ("_NET_WM_NAME", b"title", "STRING"),
    ],
)
def test_title_encoding_is_not_guessed_or_lossily_decoded(native, name, value, encoding):
    display, checker, monitor = native
    display.target.props[name] = text_property(value, encoding)
    assert checker.inspect(monitor) == (None, "application_scope_unavailable")


class TopologyWorker:
    """Pipe endpoint that emits a final census only when its owner closes stdin."""

    def __init__(self, census):
        self.stdin = self.stdout = self
        self.returncode = None
        self.closed = asyncio.Event()
        self.reads = 0
        self.census = census

    def write(self, _data):
        pass

    async def drain(self):
        pass

    def close(self):
        self.returncode = 0
        self.closed.set()

    async def wait(self):
        await self.closed.wait()
        return self.returncode

    async def readline(self):
        self.reads += 1
        if self.reads == 1:
            return (
                json.dumps(
                    {
                        "ok": True,
                        "event": "topology_ready",
                        "topology_revision": 1,
                        "power_status": "on",
                        "sources": [],
                    }
                ).encode()
                + b"\n"
            )
        await self.closed.wait()
        if self.reads == 2 and self.census is not None:
            return json.dumps(self.census).encode() + b"\n"
        return b""


def census(ok=True):
    return {"event": "shared_identity_at_close", "ok": ok, "device_identity": [11, 12]}


@pytest.mark.asyncio
async def test_failed_census_invalidates_prior_success():
    value = backend(input_enabled=True)
    value._device_identity = [11, 12]
    value._accept_shutdown_identity(json.dumps(census()))
    value._accept_shutdown_identity(json.dumps(census(False)))
    receipt = await value.detach()
    assert receipt["released"] is False and receipt["state"] == "quarantined"


@pytest.mark.asyncio
@pytest.mark.parametrize("final", [None, False, True])
async def test_resume_requires_current_watcher_shutdown_census(monkeypatch, final):
    value = backend(input_enabled=True)
    value._started = True
    value._device_identity = [11, 12]
    workers = [TopologyWorker(census()), TopologyWorker(None if final is None else census(final))]
    spawn = AsyncMock(side_effect=workers)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(value, "_record_spawn", lambda *args, **kwargs: None)
    await value._start_topology()
    assert (await value.pause())["released"] is True
    assert value._shared_cleanup_identity == [11, 12]
    assert (await value.resume(consent_generation=2))["resumed"] is True
    receipt = await value.detach()
    assert spawn.await_count == 2
    assert all(worker.closed.is_set() for worker in workers)
    assert receipt["no_inflight_input"] is True
    assert receipt["stopped"] is (final is True)
    assert receipt["released"] is (final is True)
    assert receipt["state"] == ("closed" if final is True else "quarantined")


@pytest.mark.asyncio
@pytest.mark.parametrize("sequence,modal", [(False, False), (True, False), (False, True)])
async def test_native_focus_settles_only_outside_sequences_and_modals(
    native, monkeypatch, sequence, modal
):
    display, checker, monitor = native
    previous = checker.snapshot(monitor)
    assert previous["modal"] is False
    other = Window(display, 30, display.root)
    other.props = dict(display.target.props)
    display.windows[30], display.owners[30] = other, 1234
    display.focus = other
    if modal:
        atom = checker._atom
        monkeypatch.setattr(
            checker, "_atom", lambda name: 700 if name == "_NET_WM_STATE_MODAL" else atom(name)
        )
        other.props["_NET_WM_STATE"] = [700]
    excursion = checker.snapshot(monitor)
    assert excursion != previous and excursion["modal"] is modal
    value = backend(input_enabled=True)
    value._started = True
    value._selected = "monitor"
    value._sources = {"monitor": sources()[0]}
    value._scope = previous
    capture = AsyncMock(
        side_effect=[{**reply(), "input_scope": excursion}, {**reply(), "input_scope": previous}]
    )
    monkeypatch.setattr(value, "_read_worker", capture)
    frame = await (value.observe_sequence() if sequence else value.observe())
    settle = not sequence and not modal
    assert capture.await_count == (2 if settle else 1)
    assert value._scope == (previous if settle else excursion)
    assert (frame.modal is not None) is modal


@pytest.mark.asyncio
async def test_native_focus_settling_has_a_bounded_capture_budget(native, monkeypatch):
    display, checker, monitor = native
    previous = checker.snapshot(monitor)
    display.focus = display.target
    changed = checker.snapshot(monitor)
    value = backend(input_enabled=True)
    value._started = True
    value._selected = "monitor"
    value._sources = {"monitor": sources()[0]}
    value._scope = previous
    capture = AsyncMock(return_value={**reply(), "input_scope": changed})
    monkeypatch.setattr(value, "_read_worker", capture)
    await value.observe()
    assert capture.await_count == 4
    assert value._scope == changed
