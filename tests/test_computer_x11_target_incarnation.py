"""Per-target incarnation: another application's window never revokes a target proof.

On 2026-11-01 two Krita filter-box entries were refused before input as
x11_recovery_view_required while Krita stayed focused and unchanged. Any window
created or destroyed anywhere on the desktop advanced the one incarnation epoch
and voided the observation's proof. Live, one unmapped window created and
destroyed by a separate client between observe and act reproduced it each time.
Only a change naming the target's own windows (window, focus path, ancestors up
to the WM frame, transient chain) may revoke a proof. Fake-only: no display.
"""

import asyncio
import io
import json
import sys
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from src.computer.controller import ComputerController
from src.computer.error_guidance import input_outcome
from src.computer.models import RequestContext
from src.computer.runtime import x11_attached as attached
from src.computer.runtime import x11_attached_worker as worker
from src.computer.runtime import x11_recovery as recovery
from src.computer.store import ComputerStore
from tests.test_computer_adapters_r11 import backend, capture
from tests.test_computer_x11_attached_coverage_pr749 import Process, encoded, install_process
from tests.test_computer_x11_recovery_controller import RecoveryBackend

ROOT, FRAME, CLIENT, FOCUS, OTHER = 1, 10, 11, 12, 20
# The XID of the live reproduction's unmapped window.
UNRELATED = 0x5C00000
CREATE, DESTROY, REPARENT = 16, 17, 21


@pytest.fixture(autouse=True)
def fake_xlib(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Native desktop/process access forbidden")

    monkeypatch.delenv("DISPLAY", raising=False)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)
    constants = SimpleNamespace(StructureNotifyMask=1, SubstructureNotifyMask=2,
                                CreateNotify=CREATE, DestroyNotify=DESTROY,
                                ReparentNotify=REPARENT)
    monkeypatch.setitem(sys.modules, "Xlib", SimpleNamespace(X=constants))


def target_scope(**overrides):
    return {
        "window": CLIENT, "focus_window": FOCUS, "focus_path": [FOCUS, CLIENT],
        "ancestor_path": [FOCUS, CLIENT, FRAME], "process": {"pid": 20, "start_ticks": 5},
        "window_rect": [100, 200, 600, 400], "rect": [100, 200, 600, 400],
        "source_rect": [0, 0, 1000, 800], "source_origin": [0, 0], "topology": {"root": 1},
        "transient_chain": [], "transient_processes": [], "modal": False,
        "window_kind": "normal", "focused": True, "states": [], **overrides,
    }


# The X server's structure stream.

class Window:
    def __init__(self, xid, children=()):
        self.id = xid
        self.children = list(children)

    def change_attributes(self, **kwargs):
        pass

    def query_tree(self):
        return SimpleNamespace(children=self.children)


def watch_over(root):
    events = []
    watch = recovery.IncarnationWatch.__new__(recovery.IncarnationWatch)
    watch.epoch, watch.touched, watch._tops = 1, None, {}
    watch.display = SimpleNamespace(
        screen=lambda: SimpleNamespace(root=root), sync=lambda: None,
        pending_events=lambda: bool(events), next_event=lambda: events.pop(0))
    watch._subscribe()
    return watch, events


def desktop():
    root = Window(ROOT, [Window(FRAME, [Window(CLIENT, [Window(FOCUS)])]), Window(OTHER)])
    return root, *watch_over(root)


def event(kind, **windows):
    return SimpleNamespace(type=kind, **{k: Window(v) for k, v in windows.items()})


@pytest.mark.parametrize("change,touched", [
    # Another application's tooltip, menu or helper window opening or closing.
    (event(CREATE, parent=ROOT, window=UNRELATED), {UNRELATED}),
    (event(DESTROY, event=ROOT, window=OTHER), {OTHER}),
    # Anything inside the target's frame also names the frame.
    (event(DESTROY, event=CLIENT, window=FOCUS), {FOCUS, CLIENT, FRAME}),
    (event(CREATE, parent=CLIENT, window=UNRELATED), {UNRELATED, CLIENT, FRAME}),
    (event(REPARENT, event=CLIENT, window=CLIENT, parent=ROOT), {CLIENT, FRAME}),
])
def test_structure_change_names_its_windows_and_their_frame(change, touched):
    root, watch, events = desktop()
    events.append(change)
    assert watch.drain() == 2
    assert watch.touched == frozenset(touched)
    assert not watch.touched & {ROOT}


@pytest.mark.parametrize("change", [
    event(DESTROY),  # no window names its tree
    event(DESTROY, event=98, window=99),  # outside the walked tree
])
def test_unattributable_change_names_every_window(change):
    root, watch, events = desktop()
    events.extend([event(CREATE, parent=ROOT, window=UNRELATED), change])
    assert watch.drain() == 3
    assert watch.touched is None


def test_unbounded_change_names_every_window_and_new_windows_join_the_walk():
    root, watch, events = desktop()
    events.extend(event(CREATE, parent=ROOT, window=1000 + i)
                  for i in range(recovery.TOUCHED_LIMIT + 1))
    watch.drain()
    assert watch.touched is None
    root.children.append(Window(UNRELATED, [Window(UNRELATED + 1)]))
    events.append(event(CREATE, parent=ROOT, window=UNRELATED))
    watch.drain()
    assert watch._tops[UNRELATED + 1] == UNRELATED
    events.append(event(DESTROY, event=UNRELATED, window=UNRELATED + 1))
    watch.drain()
    assert watch.touched == {UNRELATED, UNRELATED + 1}


def test_quiet_drain_keeps_the_epoch():
    root, watch, events = desktop()
    events.append(SimpleNamespace(type=22))  # ConfigureNotify is not a structure change
    assert watch.drain() == 1 and watch.touched is None


class Watch:
    def __init__(self, *drains):
        self.drains = iter(drains)
        self.touched = None

    def drain(self):
        epoch, self.touched = next(self.drains)
        return epoch

    def close(self):
        pass


def test_enduring_serials_carry_touched_and_a_new_subscription_names_all():
    first = Watch((1, None), (2, frozenset({UNRELATED})), (3, {UNRELATED}), (3, None),
                  RuntimeError)
    replacement = Watch((1, None), (2, frozenset({CLIENT})))
    watches = iter([first, replacement])
    clock = SimpleNamespace(now=0.0)
    enduring = recovery.EnduringIncarnationWatch(
        ":fake", factory=lambda _: next(watches), clock=lambda: clock.now)
    assert (enduring.drain(), enduring.touched) == (1, None)
    assert (enduring.drain(), enduring.touched) == (2, {UNRELATED})
    # Only a frozen set is a bounded record. Anything else names every window.
    assert (enduring.drain(), enduring.touched) == (3, None)
    assert (enduring.drain(), enduring.touched) == (3, None)
    first.drains = iter([RuntimeError("BadWindow")])
    first.drain = lambda: (_ for _ in ()).throw(RuntimeError("BadWindow"))
    assert enduring.drain() is None
    clock.now = 1
    # Events between the two subscriptions were never seen.
    assert (enduring.drain(), enduring.touched) == (4, None)
    assert (enduring.drain(), enduring.touched) == (5, {CLIENT})


def test_topology_watcher_publishes_touched(monkeypatch, capsys):
    states = iter([(1, None), (2, frozenset({UNRELATED, OTHER})), (2, frozenset({OTHER}))])
    enduring = SimpleNamespace(touched=None, close=lambda: None)

    def drain():
        epoch, enduring.touched = next(states)
        return epoch

    enduring.drain = drain
    monkeypatch.setattr(recovery, "EnduringIncarnationWatch", lambda _: enduring)
    config = {"display_name": ":fake", "xauthority": "/fake", "monitor_names": ["fake"]}
    monkeypatch.setattr(worker, "attachment_configuration", lambda *args: config)
    monkeypatch.setattr(worker, "X11MonitorCapture",
                        lambda *args, **kwargs: SimpleNamespace(close=lambda: None))
    monkeypatch.setattr(worker, "safe_run", lambda *args: {"ok": True})
    monkeypatch.setattr(worker.signal, "alarm", lambda _: None)
    commands = b"".join(json.dumps({"incarnation_barrier": token * 32}).encode() + b"\n"
                        for token in ["a", "b"])
    monkeypatch.setattr(worker.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(commands)))
    monkeypatch.setattr(worker.select, "select", lambda read, *args: (read, [], []))
    worker.watch_topology(config)
    records = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert [row for row in records if row.get("event") == "incarnation_changed"] == [
        {"ok": True, "event": "incarnation_changed", "incarnation_epoch": 1, "touched": None},
        {"ok": True, "event": "incarnation_changed", "incarnation_epoch": 2,
         "touched": [OTHER, UNRELATED]},
    ]


# The backend's record of the stream.

async def watched(monkeypatch, events, *, jobs=None):
    b = backend()
    b._jobs = jobs or {}
    child = Process([encoded(row) for row in events])
    install_process(monkeypatch, b, child)
    ready = asyncio.get_running_loop().create_future()
    ready.set_result(True)
    revoke = asyncio.Event()
    child.on_read = lambda: revoke.set() if not child.lines else None
    await b._watch_topology(revoke, ready)
    return b


async def test_backend_records_touched_and_revokes_only_recoveries_of_that_target(monkeypatch):
    unrelated, target, unknown, unregistered = (asyncio.Event() for _ in range(4))
    jobs = {object(): ("recovery", event) for event in (unrelated, target, unknown)}
    jobs[object()] = ("recovery", unregistered)
    b = backend()
    b._recovery_scopes = {unrelated: target_scope(window=50, focus_path=[], ancestor_path=[],
                                                  focus_window=51),
                          target: target_scope(), unknown: target_scope()}

    async def watch(rows):
        child = Process([encoded(row) for row in rows])
        install_process(monkeypatch, b, child)
        ready = asyncio.get_running_loop().create_future()
        ready.set_result(True)
        revoke = asyncio.Event()
        child.on_read = lambda: revoke.set() if not child.lines else None
        await b._watch_topology(revoke, ready)

    b._jobs = jobs
    await watch([{"event": "incarnation_changed", "incarnation_epoch": 5,
                  "touched": [UNRELATED, FRAME]}])
    assert b._incarnation_epoch == 5 and b._incarnation_touched == {5: {UNRELATED, FRAME}}
    # The frame names the target's tree. A recovery of another window, of none
    # registered yet, or after a record naming every window, is revoked too.
    assert target.is_set() and unknown.is_set() and unregistered.is_set()
    assert not unrelated.is_set()
    await watch([{"event": "incarnation_changed", "incarnation_epoch": 6, "touched": None}])
    assert unrelated.is_set() and b._incarnation_touched[6] is None
    await watch([{"event": "incarnation_unavailable"}])
    assert b._incarnation_epoch is None and b._incarnation_touched == {}


@pytest.mark.parametrize("touched", [
    "11", [], [True], [-1], [1.5], list(range(recovery.TOUCHED_LIMIT + 1)),
])
async def test_backend_refuses_malformed_touched(monkeypatch, touched):
    b = backend()
    child = Process([encoded({"event": "incarnation_changed", "incarnation_epoch": 5,
                              "touched": touched})])
    install_process(monkeypatch, b, child)
    ready = asyncio.get_running_loop().create_future()
    await b._watch_topology(asyncio.Event(), ready)
    with pytest.raises(attached.AttachedFailure, match="incarnation_monitor_unavailable"):
        ready.result()
    assert b._topology_error == "topology_monitor_unavailable"


async def test_history_is_bounded(monkeypatch):
    rows = [{"event": "incarnation_changed", "incarnation_epoch": serial,
             "touched": [UNRELATED]} for serial in range(1, attached.INCARNATION_HISTORY + 3)]
    b = await watched(monkeypatch, rows)
    assert len(b._incarnation_touched) == attached.INCARNATION_HISTORY
    assert min(b._incarnation_touched) == 3


# Target proofs.

def proven(epoch=1, scope=None):
    b = backend()
    b._frame = SimpleNamespace(focused=True)
    b._scope = scope or target_scope()
    b._frame_incarnation_epoch = b._incarnation_epoch = epoch
    return b, b.recovery_binding()


def churn(b, *records):
    for touched in records:
        b._incarnation_epoch += 1
        b._incarnation_touched[b._incarnation_epoch] = (
            None if touched is None else frozenset(touched))


def test_other_applications_windows_keep_the_proof():
    b, before = proven()
    churn(b, {UNRELATED}, {OTHER}, {UNRELATED})
    assert b.recovery_binding()["incarnation_epoch"] == 1
    assert b.recovery_matches(before)
    assert b._incarnation_intact(1, before["scope"])


@pytest.mark.parametrize("records", [
    [{CLIENT}], [{FOCUS}], [{FRAME}], [{UNRELATED}, {CLIENT}], [None],
])
def test_a_change_naming_the_target_or_every_window_revokes_the_proof(records):
    b, before = proven()
    churn(b, *records)
    assert b.recovery_binding() is None
    assert not b.recovery_matches(before)


def test_transient_chain_window_change_revokes_a_dialog_proof():
    dialog = target_scope(modal=True, window_kind="dialog", modal_kind="safe_application",
                          transient_chain=[30], transient_processes=[{"pid": 20, "start_ticks": 5}])
    b, before = proven(scope=dialog)
    churn(b, {UNRELATED})
    assert b.recovery_matches(before)
    churn(b, {30})
    assert not b.recovery_matches(before)


def test_missing_or_stale_records_fail_closed():
    b, before = proven()
    b._incarnation_epoch = 3
    b._incarnation_touched = {2: frozenset({UNRELATED})}  # serial 3 was never recorded
    assert not b.recovery_matches(before)
    b, _ = proven()
    assert b._incarnation_intact(1, {})  # nothing changed since the proof
    churn(b, {UNRELATED})
    assert not b._incarnation_intact(1, {})  # a change, and no target windows to spare
    assert not b._incarnation_intact(3, target_scope())  # proof newer than the stream
    assert not b._incarnation_intact(None, target_scope())
    assert not b._incarnation_intact(True, target_scope())
    b._incarnation_epoch = None
    assert not b._incarnation_intact(1, target_scope())
    b, _ = proven()
    churn(b, *([{UNRELATED}] * (attached.INCARNATION_HISTORY + 1)))
    assert not b._incarnation_intact(1, target_scope())
    assert b._incarnation_intact(2, target_scope())


@pytest.mark.parametrize("touched,kept", [({UNRELATED}, True), ({CLIENT}, False), (None, False)])
async def test_capture_across_a_change_keeps_the_proof_only_when_it_spares_the_target(
        monkeypatch, touched, kept):
    b = backend()
    b._incarnation_epoch = 1

    async def barrier():
        # The change lands while the raster is read.
        if b._incarnation_epoch == 1 and barrier.calls:
            churn(b, touched)
        barrier.calls += 1
        return b._incarnation_epoch

    barrier.calls = 0
    monkeypatch.setattr(b, "_incarnation_barrier", barrier)
    reply = capture()
    reply["input_scope"] = target_scope()
    monkeypatch.setattr(b, "_read_worker", AsyncMock(return_value=reply))
    await b.observe()
    assert b._frame_incarnation_epoch == (2 if kept else None)
    assert (b.recovery_binding() is not None) is kept


async def test_recovery_proceeds_across_other_windows_and_refuses_target_changes(monkeypatch):
    b, before = proven()
    churn(b, {UNRELATED})
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=2))
    work = AsyncMock(return_value={"status": "recovered", "released": True,
                                  "focus_requested": True, "attempts": 1})
    monkeypatch.setattr(b, "_work", work)
    assert (await b.recover_target(before))["status"] == "recovered"
    assert work.await_args.args[0] == "recovery"
    assert work.await_args.args[2]["incarnation_epoch"] == 2

    b, before = proven()
    churn(b, {CLIENT})
    work = AsyncMock()
    monkeypatch.setattr(b, "_work", work)
    assert (await b.recover_target(before))["status"] == "unavailable"
    work.assert_not_awaited()


async def test_a_target_change_racing_the_recovery_barrier_is_target_changed(monkeypatch):
    b, before = proven()

    async def barrier():
        churn(b, {FRAME})
        return b._incarnation_epoch

    monkeypatch.setattr(b, "_incarnation_barrier", barrier)
    work = AsyncMock()
    monkeypatch.setattr(b, "_work", work)
    assert (await b.recover_target(before))["status"] == "target_changed"
    work.assert_not_awaited()


@pytest.mark.parametrize("touched,unavailable", [({UNRELATED}, False), ({CLIENT}, True)])
async def test_a_change_during_the_recovery_worker_is_checked_against_the_target(
        monkeypatch, touched, unavailable):
    b, before = proven()
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=1))
    reply = {"status": "recovered", "released": True, "focus_requested": True, "attempts": 1}

    async def work(kind, operation, request):
        churn(b, touched)
        return reply

    monkeypatch.setattr(b, "_work", work)
    result = await b.recover_target(before)
    assert result["status"] == ("unavailable" if unavailable else "recovered")


@pytest.mark.parametrize("touched,revoked", [({UNRELATED}, False), ({CLIENT}, True)])
async def test_worker_handshake_checks_the_target_not_the_desktop(monkeypatch, touched, revoked):
    b, before = proven()
    churn(b, touched)
    request = {"incarnation_epoch": 1, "scope": target_scope()}
    reply = {"ok": True, "released": True, "status": "recovered",
             "focus_requested": True, "attempts": 1}
    child = Process([encoded({"prepared": "recovery"}), encoded(reply)])
    install_process(monkeypatch, b, child)
    monkeypatch.setattr(b, "_incarnation_barrier", AsyncMock(return_value=2))
    gate = asyncio.Event()
    if revoked:
        with pytest.raises(attached.AttachedFailure, match="recovery_revoked"):
            await b._recovery_worker_owned(gate, request)
        assert child.stdin.messages == [request]
    else:
        assert await b._recovery_worker_owned(gate, request) == reply
        assert child.stdin.messages == [request, {"proceed": True}]
    assert gate not in b._recovery_scopes


def dialog(**overrides):
    return target_scope(modal=True, window_kind="dialog", modal_kind="safe_application",
                        transient_chain=[30], transient_processes=[{"pid": 20, "start_ticks": 5}],
                        **overrides)


@pytest.mark.parametrize("touched,same", [({UNRELATED}, True), ({30}, False), (None, False)])
def test_dialog_token_survives_other_windows_only(touched, same):
    b, _ = proven()
    first = b._modal_token(dialog())
    churn(b, touched)
    b._frame_incarnation_epoch = 2
    assert (b._modal_token(dialog()) == first) is same


# The refused Krita entry, end to end.

class EnduringBackend(RecoveryBackend):
    """The controller's view of a real X11 backend's exact-target proof."""

    def __init__(self):
        super().__init__()
        self.native, _ = proven()

    def recovery_binding(self):
        return self.native.recovery_binding()

    def recovery_matches(self, old):
        return self.native.recovery_matches(old)

    async def recover_target(self, old):
        self.recoveries += 1
        return await self.native.recover_target(old)


@asynccontextmanager
async def krita(tmp_path):
    backend = EnduringBackend()
    store = ComputerStore(tmp_path / "db", tmp_path / "evidence")
    controller = ComputerController(store, lambda _: backend, lambda _: True, enabled=True)
    context = RequestContext("owner", "channel", "turn", "host")
    try:
        session = await controller.session(context, {"operation": "start"})
        view = await controller.observe(context, {
            "session_id": session["session_id"], "generation": 1,
        })
        obs = controller._live[session["session_id"]].observations[view["observation_id"]]
        assert obs.recovery_binding is not None
        await controller.validate_observation_delivery(
            context, obs.frame_metadata, obs.image_sha256
        )
        action = {"session_id": session["session_id"], "generation": 1,
                  "source_id": "opaque", "source_revision": 1, "consent_generation": 1,
                  "observation_id": obs.observation_id, "action_id": "filter-entry",
                  "operation": "click", "x": 1, "y": 1,
                  "expect": {"type": "visual_change"}}
        yield controller, backend, context, action
    finally:
        await controller.close()
        store.close()


async def test_another_applications_window_between_observe_and_act_no_longer_refuses(tmp_path):
    async with krita(tmp_path) as (controller, backend, ctx, action):
        churn(backend.native, {UNRELATED})
        result = await controller.act(ctx, action)
        assert len(backend.actions) == 1 and backend.recoveries == 0
        assert input_outcome(result) != "not_dispatched"
        assert result.get("reason") != "x11_recovery_view_required"


@pytest.mark.parametrize("touched", [{CLIENT}, {FRAME}, None])
async def test_a_change_to_the_target_between_observe_and_act_still_refuses(tmp_path, touched):
    async with krita(tmp_path) as (controller, backend, ctx, action):
        churn(backend.native, {UNRELATED}, touched)
        result = await controller.act(ctx, action)
        assert not backend.actions
        assert result["reason"] == "x11_recovery_view_required"
        assert input_outcome(result) == "not_dispatched"
        assert result["verification"]["recovery"] == {
            "status": "unavailable", "focus_requested": False, "attempts": 0,
        }
