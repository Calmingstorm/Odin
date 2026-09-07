"""R5 ownership/attached-input contract stubs. Never open a display or spawn X."""
import asyncio
import base64
import copy
import json
from types import SimpleNamespace

import pytest

from src.computer.geometry import AffineTransform
from src.computer.runtime import x11_attached as attached
from src.computer.runtime import x11_guardian as guardian


@pytest.fixture(autouse=True)
def prohibit_real_children(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("unit contract test attempted a real process")
    monkeypatch.setattr(guardian.subprocess, "Popen", forbidden)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", forbidden)


class Native:
    def __init__(self):
        self.keys, self.buttons = set(), set()
        self.physical_keys, self.physical_buttons = set(), set()
        self.events = []
        self.calls = []
        self.fail_release = False

    def held(self):
        return {"keys": set(self.keys), "buttons": set(self.buttons)}

    def physical_held(self):
        return {"keys": set(self.physical_keys), "buttons": set(self.physical_buttons)}

    def physical_events(self):
        events, self.events = self.events, []
        return events

    def identity(self):
        return (11, 12)

    def key(self, code, down):
        self._input("key", self.keys, code, down)

    def button(self, code, down):
        self._input("button", self.buttons, code, down)

    def _input(self, kind, codes, code, down):
        self.calls.append((kind, code, down))
        if not down and self.fail_release:
            raise RuntimeError("stub release failure")
        (codes.add if down else codes.discard)(code)

    def sync(self):
        pass


class Helper:
    def __init__(self, native):
        self.native = native
        self.exitcode = None
        self.process = SimpleNamespace(poll=lambda: self.exitcode)
        self.after_send = lambda: None
        self.before_send = lambda command: None
        self.fenced = False
        self.fence_result = True

    def exchange(self, command, guard):
        guard()
        self.before_send(command)
        getattr(self.native, command["op"])(*command["args"])
        self.after_send()

    def fence(self):
        self.fenced = True
        self.native.calls.append(("fence",))
        return self.fence_result


def rig(**kwargs):
    native = Native()
    helper = Helper(native)
    guard = guardian.Guardian(native, helper, kwargs.pop("validate", lambda step: None),
                              controller_fd=kwargs.pop("controller_fd", None), **kwargs)
    return native, helper, guard


@pytest.mark.parametrize("kind,code", [("key", 38), ("button", 1)])
def test_potential_down_is_owned_before_send_even_if_ack_is_lost(kind, code):
    native, helper, guard = rig()

    def before(command):
        assert code in (guard.ledger.keys if kind == "key" else guard.ledger.buttons)
        assert not native.calls

    def lost_ack():
        raise guardian.GuardianFailure("input_helper_eof")

    helper.before_send, helper.after_send = before, lost_ack
    receipt = guard.run([(kind, code, True)])
    assert receipt["status"] == "unknown" and receipt["released"]
    assert native.calls == [(kind, code, True), ("fence",), (kind, code, False)]


def test_release_is_ledger_only_not_blanket_and_empty_ledger_sends_nothing():
    native = Native()
    native.keys = {50, 64}
    native.buttons = {2, 3}
    ledger = guardian.OwnedLedger(native)
    assert ledger.release() and native.calls == []
    ledger.prepare("key", 38, True)
    ledger.prepare("button", 1, True)
    native.keys.add(38)
    native.buttons.add(1)
    assert ledger.release()
    assert native.calls == [("button", 1, False), ("key", 38, False)]
    assert native.keys == {50, 64} and native.buttons == {2, 3}


@pytest.mark.parametrize("kind,code", [("key", 38), ("button", 1)])
@pytest.mark.parametrize("held_by", ["server", "ledger"])
def test_down_admission_rejects_preheld_or_duplicate_intent(kind, code, held_by):
    native = Native()
    ledger = guardian.OwnedLedger(native)
    target = native if held_by == "server" else ledger
    getattr(target, "keys" if kind == "key" else "buttons").add(code)
    with pytest.raises(guardian.GuardianFailure, match="synthetic_code_already_held"):
        ledger.prepare(kind, code, True)
    assert not native.calls


def test_unowned_up_rejected_and_ack_only_clears_verified_release():
    native = Native()
    ledger = guardian.OwnedLedger(native)
    with pytest.raises(guardian.GuardianFailure, match="release_without_owned_intent"):
        ledger.prepare("key", 38, False)
    ledger.prepare("key", 38, True)
    native.keys.add(38)
    ledger.acknowledged("key", 38, False)
    assert ledger.keys == {38}
    native.keys.clear()
    ledger.acknowledged("key", 38, False)
    assert not ledger.keys


@pytest.mark.parametrize("trigger,reason", [
    ("eof", "controller_eof"), ("cancel", "controller_cancel"),
    ("lease", "input_lease_expired"), ("helper_normal", "input_helper_eof"),
    ("helper_abrupt", "input_helper_eof"),
])
def test_interruption_fences_before_owned_release(monkeypatch, trigger, reason):
    now, readable = [10.0], [False]
    native, helper, guard = rig(controller_fd=987, clock=lambda: now[0])
    monkeypatch.setattr(guardian.select, "select",
                        lambda *args: ([987] if readable[0] else [], [], []))
    monkeypatch.setattr(guardian.os, "read",
                        lambda *args: b"cancel" if trigger == "cancel" else b"")

    def interrupt():
        if trigger in {"eof", "cancel"}:
            readable[0] = True
        elif trigger == "lease":
            now[0] = guard.deadline
        else:
            helper.exitcode = 0 if trigger == "helper_normal" else -9

    helper.after_send = interrupt
    receipt = guard.run([("key", 38, True), ("key", 38, False)])
    assert receipt["reason"] == reason and receipt["status"] == "unknown"
    assert receipt["released"] and helper.fenced and not native.keys
    assert native.calls == [("key", 38, True), ("fence",), ("key", 38, False)]


def test_same_key_physical_race_is_unknown_and_never_repairs_physical_state():
    native, helper, guard = rig()
    helper.after_send = lambda: native.physical_keys.add(38)
    receipt = guard.run([("key", 38, True), ("key", 38, False)])
    assert receipt["status"] == "unknown" and receipt["overlap_uncertain"]
    assert receipt["reason"] == "human_input_overlap" and receipt["released"]
    assert native.physical_keys == {38} and native.keys == set()


def test_app_scope_failure_blocks_next_down_and_releases_previously_owned_input():
    count = [0]

    def validate(step):
        count[0] += 1
        if count[0] == 2:
            raise RuntimeError("scope changed")

    native, helper, guard = rig(validate=validate)
    receipt = guard.run([("button", 1, True), ("key", 38, True)])
    assert receipt["reason"] == "input_scope_or_native_failed"
    assert receipt["status"] == "unknown" and receipt["released"]
    assert not native.buttons and helper.fenced


def test_ctrl_s_modal_on_down_allows_only_own_tracked_releases():
    changed = [False]
    def validate(step):
        if changed[0]:
            raise RuntimeError("modal changed old snapshot")
    native, helper, guard = rig(validate=validate)
    helper.after_send = lambda: changed.__setitem__(0, changed[0] or 39 in native.keys)
    receipt = guard.run([("key", 37, True), ("key", 39, True),
                         ("key", 39, False), ("key", 37, False)])
    assert receipt["status"] == "executed" and receipt["released"]
    assert not native.keys and not guard.ledger.keys and helper.fenced
    assert native.calls == [("key", 37, True), ("key", 39, True),
                            ("key", 39, False), ("key", 37, False), ("fence",)]


def test_dispatch_budget_does_not_extend_native_lease():
    now = [10.0]
    native, helper, guard = rig(clock=lambda: now[0])
    helper.after_send = lambda: now.__setitem__(0, 11.8)
    receipt = guard.run([("key", 38, True), ("key", 38, False), ("key", 39, True)])
    assert receipt["reason"] == "input_dispatch_expired"
    assert receipt["status"] == "unknown" and receipt["released"]
    assert ("key", 39, True) not in native.calls and not native.keys
    assert guard.deadline == 12.0 and guard.dispatch_deadline == 11.75


@pytest.mark.parametrize("failure", ["release", "fence"])
def test_release_failure_is_false_never_success(failure):
    native, helper, guard = rig()
    native.fail_release = failure == "release"
    helper.fence_result = failure != "fence"
    receipt = guard.run([("key", 38, True)])
    assert receipt["released"] is False and receipt["status"] == "unknown"
    assert guard.ledger.keys == {38}
    if failure == "fence":
        assert ("key", 38, False) not in native.calls


def test_normal_completion_has_empty_ledger_after_verified_up():
    native, helper, guard = rig()
    receipt = guard.run([("key", 38, True), ("key", 38, False)])
    assert receipt["status"] == "executed" and receipt["released"]
    assert not guard.ledger.keys
    assert native.calls.count(("key", 38, False)) == 1


def backend(**kwargs):
    return attached.X11AttachedBackend(enabled=True, display_name=":177",
                                       monitor_names=["fixture"], **kwargs)


async def observed(monkeypatch):
    b = backend(input_enabled=True)
    state = {"binding": {"focused": True, "modal": None, "modal_kind": None,
                         "process": {"pid": 17, "start_ticks": 300}, "window": 90,
                         "topology": "fixture", "source_rect": [100, 200, 40, 20],
                         "transient_chain": [],
                         "rect": [100, 200, 40, 20], "source_origin": [100, 200]},
             "image": b"before"}
    monitor = {"name": "fixture", "width": 40, "height": 20, "index": 0}

    async def read(operation, **kwargs):
        if operation == "sources":
            return {"sources": [monitor]}
        return {"ok": True, "source_width": 40, "source_height": 20,
                "width": 20, "height": 10, "resize_scale": [1, 2],
                "delivered_to_source": AffineTransform(a=2, e=2).public(),
                "input_scope": copy.deepcopy(state["binding"]),
                "image": base64.b64encode(state["image"]).decode()}

    monkeypatch.setattr(b, "_read_worker", read)
    await b.start("guardian-stub")
    return b, state, await b.observe()


def click(frame):
    return {"type": "click", "source_id": frame.source.source_id,
            "source_revision": frame.source.source_revision,
            "consent_generation": frame.source.consent_generation,
            "expected": {"type": "visual_change"}, "x": 3, "y": 4}


@pytest.mark.asyncio
async def test_backend_input_defaults_disabled_even_if_public_flag_changes():
    b = backend()
    assert not b.input_supported and b.input_blocker == attached.INPUT_BLOCKER
    b.input_supported = True
    with pytest.raises(attached.AttachedFailure, match=attached.INPUT_BLOCKER):
        await b.act({"type": "click"})


@pytest.mark.asyncio
async def test_raster_changes_keep_revision_but_scope_changes_invalidate(monkeypatch):
    b, state, first = await observed(monkeypatch)
    state["image"] = b"ordinary paint changed"
    second = await b.observe()
    assert first.source.source_revision == second.source.source_revision
    assert first.image_bytes != second.image_bytes
    state["binding"]["rect"][0] += 1
    third = await b.observe()
    assert third.source.source_revision == second.source.source_revision + 1
    with pytest.raises(attached.AttachedFailure, match="stale_source_binding"):
        await b.act(click(second))


@pytest.mark.asyncio
async def test_actor_maps_delivered_pixels_through_source_then_private_origin(monkeypatch):
    b, state, frame = await observed(monkeypatch)
    seen = []

    async def act(request):
        assert b._frame is None
        seen.append(request)
        return {"status": "executed", "released": True}

    monkeypatch.setattr(b, "_input_worker", act)
    result = await b.act(click(frame))
    # Delivered integer coordinates address pixel centers before scaling.
    assert seen[0]["action"] == {"type": "click", "x": 107, "y": 209}
    assert seen[0]["scope"]["source_origin"] == [100, 200]
    assert result["postcondition"]["status"] == "observed"
    with pytest.raises(attached.AttachedFailure, match="fresh_app_scoped"):
        await b.act(click(frame))


@pytest.mark.asyncio
async def test_safe_modal_transition_verifies_same_app_but_consumes_old_binding(monkeypatch):
    b, state, frame = await observed(monkeypatch)
    async def act(request):
        state["binding"].update(window=91, transient_chain=[90], modal=True,
                                modal_kind="safe_application", rect=[100, 200, 30, 10])
        state["image"] = b"dialog appeared"
        return {"status": "executed", "released": True}
    monkeypatch.setattr(b, "_input_worker", act)
    result = await b.act(click(frame))
    assert result["postcondition"]["target_application_matches"] is True
    fresh = await b.observe()
    assert fresh.modal is not None and fresh.modal_kind == "safe_application"
    assert fresh.source.source_revision > frame.source.source_revision
    with pytest.raises(attached.AttachedFailure, match="stale_source_binding"):
        await b.act(click(frame))
    with pytest.raises(attached.AttachedFailure, match="unexpected_modal"):
        await b.act(click(fresh))


@pytest.mark.parametrize("change", [
    {"process": {"pid": 18, "start_ticks": 300}},
    {"process": {"pid": 17, "start_ticks": 301}},
    {"window": 92, "transient_chain": []}, {"topology": "changed"},
    {"source_rect": [0, 0, 40, 20]}, {"source_origin": [0, 0]},
    {"modal_kind": "unrecognized"}, {"focused": False}, {"process": None},
])
async def test_postcondition_rejects_other_app_or_source_or_unknown_modal(monkeypatch, change):
    _, state, _ = await observed(monkeypatch)
    before = state["binding"]
    after = {**before, "window": 91, "transient_chain": [90],
             "modal": True, "modal_kind": "safe_application", **change}
    assert not attached.same_application_scope(before, after)


@pytest.mark.asyncio
@pytest.mark.parametrize("receipt", [{"status": "unknown", "released": False},
                                     {"status": "unknown"}])
async def test_unverified_release_receipt_quarantines_backend(monkeypatch, receipt):
    b, state, frame = await observed(monkeypatch)

    async def act(request):
        return dict(receipt)

    monkeypatch.setattr(b, "_input_worker", act)
    await b.act(click(frame))
    assert b._release_failed and b._paused
    with pytest.raises(attached.AttachedFailure, match="owned_release_unverified"):
        await b.resume(consent_generation=2)
    result = await b.detach()
    assert result["state"] == "quarantined" and result["released"] is False


class AsyncGuardian:
    def __init__(self, malformed=False):
        self.stdin = self.stdout = self
        self.returncode = None
        self.reading = asyncio.Event()
        self.closed = asyncio.Event()
        self.can_exit = asyncio.Event()
        self.malformed = malformed
        self.reads = 0
        self.wait_finished = False

    def write(self, data):
        self.request = json.loads(data)

    async def drain(self):
        pass

    def close(self):
        self.closed.set()

    async def readline(self):
        self.reads += 1
        self.reading.set()
        if self.malformed:
            return b"invalid receipt\n"
        if self.reads == 1:
            await asyncio.Event().wait()
        return b'{"status":"unknown","released":true}\n'

    async def wait(self):
        await self.can_exit.wait()
        self.returncode = 0
        self.wait_finished = True
        return 0

    def terminate(self):
        pytest.fail("must not terminate the release supervisor")

    kill = terminate


@pytest.mark.asyncio
@pytest.mark.parametrize("malformed", [False, True])
async def test_cancel_awaits_guardian_or_bad_receipt_quarantines(monkeypatch, malformed):
    b, child = backend(input_enabled=True), AsyncGuardian(malformed)

    async def spawn(*args, **kwargs):
        assert args[1] == "-I" and args[2].endswith("x11_guardian.py")
        return child

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    task = asyncio.create_task(b._input_worker({"fixture": True}))
    await asyncio.wait_for(child.reading.wait(), 1)
    if malformed:
        child.can_exit.set()
        with pytest.raises(attached.AttachedFailure, match="input_outcome_unknown"):
            await asyncio.wait_for(task, 1)
        assert b._release_failed
    else:
        task.cancel()
        await asyncio.wait_for(child.closed.wait(), 1)
        assert not task.done() and not child.wait_finished
        child.can_exit.set()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, 1)
        assert child.wait_finished and not b._release_failed
    assert not b._guardians
