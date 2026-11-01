"""Live-test fixes from the 2026-10-31 seamless campaign (PR #749).

Exact same-app dialog recovery, paced stroke admission, measured own-ink
corridors, short-stroke continuation and the one-retry human yield.
"""

import math
import random
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw

from src.computer.controller import ComputerController
from src.computer.effects import human_preflight_refusal, human_yield_retryable, stroke_effect
from src.computer.grounding import accept_own_ink, pointer_target_stable
from src.computer.runtime import x11_attached as attached
from src.computer.runtime import x11_guardian as guardian
from src.computer.runtime.x11_recovery import recoverable_scope
from src.computer.sequences import _own_stroke_radius
from tests.test_computer_dispatch_cleanup_r19 import rig as paced_rig


def scope(**overrides):
    return {"window": 7, "process": [1, 2, 3], "modal": False, "window_kind": "normal",
            "modal_kind": None, "transient_chain": [], "transient_processes": [], **overrides}


def dialog(**overrides):
    return {**scope(modal=True, window_kind="dialog", modal_kind="safe_application",
                    transient_chain=[5], transient_processes=[[1, 2, 3]]), **overrides}


@pytest.mark.parametrize("candidate,expected", [
    (scope(), True),
    (dialog(), True),
    (dialog(transient_chain=[5, 4], transient_processes=[[1, 2, 3], [1, 2, 3]]), True),
    (scope(window_kind="menu"), False),
    (dialog(transient_processes=[[9, 9, 9]]), False),
    (dialog(transient_chain=[5, 4], transient_processes=[[1, 2, 3], [9, 9, 9]]), False),
    (dialog(transient_chain=[], transient_processes=[]), False),
    (dialog(modal_kind="unrecognized"), False),
    (scope(modal=True, transient_chain=[5], transient_processes=[[1, 2, 3]]), False),
    (dialog(process=None), False),
    (dialog(window=None), False),
    ("not a scope", False),
])
def test_only_normal_windows_and_same_process_dialogs_are_recoverable(candidate, expected):
    assert recoverable_scope(candidate) is expected


def backend():
    return attached.X11AttachedBackend(
        enabled=True, display_name=":177", monitor_names=["fixture"], app_profile="xed"
    )


def test_modal_token_survives_a_focus_round_trip_to_the_same_dialog():
    b = backend()
    b._frame_incarnation_epoch = 4
    first = b._modal_token(dialog())
    assert first and b._modal_token(scope()) is None  # focus moved to a normal window
    assert b._modal_token(dialog()) == first


@pytest.mark.parametrize("change", ["epoch", "window", "no_epoch", "foreign"])
def test_modal_token_rotates_for_any_other_change(change):
    b = backend()
    b._frame_incarnation_epoch = 4
    first = b._modal_token(dialog())
    later = dialog()
    if change == "epoch":
        b._frame_incarnation_epoch = 5
    elif change == "window":
        later = dialog(window=8)
    elif change == "no_epoch":
        b._frame_incarnation_epoch = None
    else:
        later = dialog(transient_processes=[[9, 9, 9]])
        b._modal_token(later)
    assert b._modal_token(later) != first


def bound(b, current_scope):
    b._frame = SimpleNamespace(focused=True)
    b._scope = current_scope
    b._frame_incarnation_epoch = b._incarnation_epoch = 3
    b._selected, b._sources = "s", {"s": {"name": "DP-0"}}
    return b.recovery_binding()


def test_recovery_binding_admits_same_process_dialogs_only():
    assert bound(backend(), dialog())["scope"]["window_kind"] == "dialog"
    assert bound(backend(), scope())["scope"]["window_kind"] == "normal"
    assert bound(backend(), dialog(transient_processes=[[9, 9, 9]])) is None


def test_dialog_recovery_is_opt_in_per_call_site():
    grant = SimpleNamespace(platform="x11", environment="existing_session")
    live = SimpleNamespace(backend=SimpleNamespace(recover_target=lambda binding: None,
                                                   recovery_matches=lambda binding: True))
    observed_dialog = SimpleNamespace(recovery_binding={"scope": dialog()}, modal="token")
    assert not ComputerController._x11_recovery_available(grant, live, observed_dialog)
    assert ComputerController._x11_recovery_available(grant, live, observed_dialog, modal=True)
    unbound = SimpleNamespace(recovery_binding=None, modal="token")
    assert not ComputerController._x11_recovery_available(grant, live, unbound, modal=True)


def additive(steps, seconds):
    return sum(seconds + (math.ceil(s[1] / guardian.WAIT_QUANTUM_SECONDS)
                          * guardian.WAIT_QUANTUM_SECONDS if s[0] == "wait" else 0)
               for s in steps)


def stroke(points, duration):
    steps = [("move", 0, 0), ("button", 1, True)]
    for n in range(1, points):
        steps += [("wait", duration / (points - 1)), ("move", n, n)]
    return steps + [("button", 1, False)]


def test_unpaced_budget_is_unchanged():
    rng = random.Random(7)
    for _ in range(200):
        steps = stroke(rng.randint(2, 120), rng.random())
        seconds = rng.choice([0.005, 0.02, 0.04])
        assert guardian.dispatch_budget(steps, step_seconds=seconds) == pytest.approx(
            additive(steps, seconds))


@pytest.mark.parametrize("points", [16, 26, 40, 60])
@pytest.mark.parametrize("latency", [0.02, 0.04, 0.06])
def test_paced_budget_bounds_the_timeline_and_is_tighter(points, latency):
    rest = stroke(points, 1.0)[1:]
    quantum = math.ceil(1.0 / (points - 1) / guardian.WAIT_QUANTUM_SECONDS)
    wait = quantum * guardian.WAIT_QUANTUM_SECONDS
    now, target = latency, None  # button down
    for _ in range(points - 1):
        target = (now if target is None else target) + wait
        now = max(now, target) + latency
    timeline = now + latency  # button up
    paced = guardian.dispatch_budget(rest, step_seconds=latency, paced=True)
    assert timeline - 1e-9 <= paced < additive(rest, latency)


def test_long_paced_stroke_is_admitted_with_measured_latency(monkeypatch):
    native, helper, lease = paced_rig(monkeypatch, startup=0.1, move_latency=0.04)
    steps = guardian.input_steps(
        {"type": "polyline", "duration": 1.0, "points": [[n, n % 3] for n in range(26)]}, native
    )
    assert additive(steps[1:], 0.04) > lease.dispatch_deadline  # the old first-down estimate
    receipt = lease.run(steps, paced=True)
    assert receipt["status"] == "executed" and receipt["released"]
    assert receipt["diagnostics"]["steps_completed"] == len(steps) == 53
    assert not native.buttons


def test_oversized_paced_stroke_is_still_refused_before_any_move(monkeypatch):
    native, helper, lease = paced_rig(monkeypatch, startup=0.1, move_latency=0.04)
    steps = guardian.input_steps(
        {"type": "polyline", "duration": 1.0, "points": [[n, n % 3] for n in range(200)]}, native
    )
    receipt = lease.run(steps, paced=True)
    assert receipt["reason"] == "input_dispatch_expired"
    assert receipt["diagnostics"]["steps_completed"] == 0 and native.moves == []


def png(draw=None):
    image = Image.new("RGB", (400, 300), "white")
    if draw:
        draw(ImageDraw.Draw(image))
    stream = BytesIO()
    image.save(stream, "PNG")
    return stream.getvalue()


BODY = [(100, 150), (200, 150), (200, 250), (100, 250), (100, 150)]


def test_accepted_ink_admits_own_paint_and_refuses_any_later_change():
    base = png()
    inked = png(lambda d: d.line(BODY, fill="black", width=6))
    assert not pointer_target_stable(base, inked, 100, 150)
    reference = accept_own_ink(base, base, inked, BODY, 12)
    assert pointer_target_stable(reference, inked, 100, 150)
    # A later foreign change wholly INSIDE the accepted corridor still refuses.
    later = png(lambda d: (d.line(BODY, fill="black", width=6),
                           d.rectangle((95, 140, 115, 160), fill="red")))
    assert not pointer_target_stable(reference, later, 100, 150)
    popup = png(lambda d: (d.line(BODY, fill="black", width=6),
                           d.rectangle((105, 120, 140, 145), fill="gray")))
    assert not pointer_target_stable(reference, popup, 100, 150)
    wide = png(lambda d: d.line(BODY, fill="black", width=40))
    assert not pointer_target_stable(accept_own_ink(base, base, wide, BODY, 12), wide, 100, 150)
    assert pointer_target_stable(accept_own_ink(base, base, wide, BODY, 26), wide, 100, 150)


def test_foreign_pixels_predating_the_stroke_are_never_adopted():
    base = png()
    foreign = lambda d: d.rectangle((150, 140, 170, 146), fill="red")  # noqa: E731
    before_stroke = png(foreign)
    after_stroke = png(lambda d: (foreign(d), d.line(BODY, fill="black", width=6)))
    reference = accept_own_ink(base, before_stroke, after_stroke, BODY, 12)
    assert pointer_target_stable(reference, after_stroke, 100, 150)  # own ink accepted
    assert not pointer_target_stable(reference, after_stroke, 160, 143)  # foreign stays foreign
    unchanged = accept_own_ink(base, before_stroke, before_stroke, BODY, 12)  # no-raster stroke
    assert not pointer_target_stable(unchanged, before_stroke, 160, 143)


def test_accepted_ink_accumulates_over_overlapping_strokes():
    roof = [(100, 150), (150, 100), (200, 150)]
    base = png()
    first = png(lambda d: d.line(BODY, fill="black", width=6))
    both = png(lambda d: (d.line(BODY, fill="black", width=6), d.line(roof, fill="black", width=6)))
    reference = accept_own_ink(accept_own_ink(base, base, first, BODY, 12), first, both, roof, 12)
    assert pointer_target_stable(reference, both, 150, 100)
    assert pointer_target_stable(reference, both, 100, 150)


@pytest.mark.parametrize("evidence,radius", [
    ({"continuation_supported": True, "ink_radius_delivered_pixels": 26}, 26),
    ({"continuation_supported": True, "ink_radius_delivered_pixels": 400}, 48),
    ({"continuation_supported": True, "ink_radius_delivered_pixels": 2}, 12),
    ({"continuation_supported": False, "ink_radius_delivered_pixels": 26}, 12),
    ({"continuation_supported": True}, 12),
    (None, 12),
])
def test_own_stroke_radius_trusts_only_continuation_grade_evidence(evidence, radius):
    assert _own_stroke_radius(evidence) == radius


def raster_result():
    return {"status": "verified", "execution": {"injected": True, "released": True},
            "verification": {"status": "satisfied", "target_application_matches": True}}


def test_wide_brush_over_earlier_ink_continues_by_measured_corridor():
    roof = [[100, 150], [150, 100], [200, 150]]
    before = png(lambda d: d.line(BODY, fill="black", width=40))
    after = png(lambda d: (d.line(BODY, fill="black", width=40),
                           d.line([tuple(p) for p in roof], fill="black", width=40)))
    result = raster_result()
    stroke_effect(result, {"operation": "polyline", "points": roof}, before, after,
                  binding_matches=True)
    evidence = result["verification"]["path_evidence"]
    assert evidence["path_changed_pixels"] < evidence["changed_pixels"] * 0.1
    assert evidence["near_changed_pixels"] >= evidence["changed_pixels"] * 0.6
    assert evidence["continuation_supported"] is True
    assert 12 <= evidence["ink_radius_delivered_pixels"] <= 48


def test_change_away_from_a_long_stroke_still_stops_continuation():
    line = [[20, 40], [380, 40]]
    after = png(lambda d: (d.line([tuple(p) for p in line], fill="black", width=3),
                           d.rectangle((150, 120, 390, 290), fill="gray")))
    result = raster_result()
    stroke_effect(result, {"operation": "polyline", "points": line}, png(), after,
                  binding_matches=True)
    assert result["verification"]["path_evidence"]["continuation_supported"] is False


PROOF = {"kind": "shared_xtest_all_up_after_key_overlap", "helper_fenced": True,
         "ledger_empty": True, "synthetic_endpoints_all_up": True, "key_only_overlap": True}
INTERRUPTED = {
    "status": "unknown", "injected": True, "released": True, "reason": "human_input_overlap",
    "overlap_uncertain": True, "overlap_release_proof": PROOF, "shared_pointer": True,
    "shared_keyboard": True, "pointer": "shared", "keyboard_focus": "shared",
    "persistent_input_devices": False, "owned_devices": "not_created",
    "diagnostics": {"phase": "dispatch", "release": "confirmed", "reason": "human_input_overlap",
                    "steps_planned": 3, "steps_completed": 1},
}
REFUSED = {"status": "unavailable", "injected": False, "released": True,
           "reason": "human_input_overlap",
           "diagnostics": {"phase": "preflight", "steps_completed": 0,
                           "reason": "human_input_overlap"}}


@pytest.mark.parametrize("raw,expected", [
    (REFUSED, True),
    ({**INTERRUPTED, "motion_only": True}, True),
    ({**INTERRUPTED, "motion_only": False}, False),
    ({**INTERRUPTED}, False),
    ({**INTERRUPTED, "motion_only": True, "released": False}, False),
    ({**INTERRUPTED, "motion_only": True, "overlap_release_proof": None}, False),
    ({**REFUSED, "injected": True}, False),
    ({**REFUSED, "reason": "input_dispatch_expired",
      "diagnostics": {**REFUSED["diagnostics"], "reason": "input_dispatch_expired"}}, False),
    ({**REFUSED, "diagnostics": {**REFUSED["diagnostics"], "steps_completed": 1}}, False),
])
def test_only_unsent_or_motion_only_human_stops_are_retryable(raw, expected):
    assert human_yield_retryable(raw) is expected
    assert human_preflight_refusal(raw) is (raw is REFUSED)


MODIFIER_HELD = {**REFUSED, "reason": "keyboard_modifiers_busy",
                 "diagnostics": {**REFUSED["diagnostics"], "reason": "keyboard_modifiers_busy"}}


@pytest.mark.parametrize("raw,expected", [
    (MODIFIER_HELD, True),
    ({**MODIFIER_HELD, "injected": True}, False),
    ({**MODIFIER_HELD, "released": False}, False),
    ({**MODIFIER_HELD, "diagnostics": {**MODIFIER_HELD["diagnostics"], "phase": "dispatch"}},
     False),
    ({**MODIFIER_HELD, "diagnostics": {**MODIFIER_HELD["diagnostics"],
                                       "reason": "input_scope_or_native_failed"}}, False),
])
def test_a_held_modifier_before_typing_is_a_human_preflight_stop(raw, expected):
    """Live run 17 (2026-10-31): typing with Shift held refused with no yield."""
    assert human_preflight_refusal(raw) is expected
    assert human_yield_retryable(raw) is expected


class OverlapNative:
    def __init__(self):
        self.keys, self.buttons, self.moves, self.queue = set(), set(), [], []

    def identity(self):
        return (1, 2)

    def held(self):
        return {"keys": set(self.keys), "buttons": set(self.buttons)}

    def physical_held(self):
        return {"keys": set(), "buttons": set()}

    def physical_events(self):
        events, self.queue = self.queue, []
        return events

    def shared_release_all_up(self):
        return not self.keys and not self.buttons

    def move(self, x, y):
        self.moves.append((x, y))

    def button(self, code, down):
        (self.buttons.add if down else self.buttons.discard)(code)

    def sync(self):
        pass


class OverlapHelper:
    def __init__(self, native, overlap_after):
        self.native, self.overlap_after, self.sent = native, overlap_after, []
        self.process = SimpleNamespace(poll=lambda: None)

    def exchange(self, command, guard):
        guard()
        self.sent.append(command["op"])
        getattr(self.native, command["op"])(*command["args"])
        if len(self.sent) == self.overlap_after:
            self.native.queue.append(("keys", 50, True))  # a person taps Shift

    def fence(self):
        return True


@pytest.mark.parametrize("overlap_after,motion_only", [(1, True), (2, False)])
def test_guardian_reports_motion_only_until_a_button_is_handed_over(overlap_after,
                                                                    motion_only):
    native = OverlapNative()
    helper = OverlapHelper(native, overlap_after)
    lease = guardian.Guardian(native, helper, lambda step: None, controller_fd=None)
    receipt = lease.run(guardian.input_steps({"type": "click", "x": 5, "y": 5}, native))
    assert receipt["reason"] == "human_input_overlap"
    assert receipt["motion_only"] is motion_only
    assert ("button" in helper.sent) is (not motion_only)
    if motion_only:
        assert receipt["released"] is True and human_yield_retryable(receipt)


def preflight_refusal(payload):
    return {
        "status": "unavailable", "injected": False, "released": True,
        "reason": "human_input_overlap",
        "diagnostics": {"phase": "preflight", "release": "confirmed",
                        "reason": "human_input_overlap", "steps_planned": 3,
                        "steps_completed": 0},
        "postcondition": {
            "type": "visual_change",
            **{k: payload[k] for k in ("source_id", "source_revision", "consent_generation")},
        },
    }


def click_request(binding, x=30, y=30):
    return {**binding, "action_id": "click-1", "operation": "click", "x": x, "y": y,
            "expect": {"type": "visual_change"}}


def enduring(backend, epoch):
    """Give the act rig's backend an exact X11 incarnation binding."""
    backend.recovery_binding = lambda: {"scope": {"window": 7}, "epoch": epoch[0]}
    backend.recovery_matches = lambda before, **_: before == backend.recovery_binding()


@pytest.fixture
def no_yield(monkeypatch):
    monkeypatch.setattr("src.computer.controller.HUMAN_YIELD_SECONDS", 0.0)


@pytest.mark.parametrize("sequence", [False, True])
async def test_human_preflight_refusal_yields_and_retries_once(tmp_path, monkeypatch, no_yield,
                                                              sequence):
    from tests.test_computer_gui_actions_r5 import changed
    from tests.test_computer_sequences_r19 import plan, raster
    from tests.test_computer_sequences_r19 import rig as act_rig

    async with act_rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        enduring(b, [1])

        async def perform(payload):
            if len(b.calls) == 1:
                return preflight_refusal(payload)
            state["image"] = raster((100, 100, 120, 120))
            return changed(payload)

        b.hook = perform
        request = (plan(binding, {k: v for k, v in click_request(binding).items()
                                  if k in {"action_id", "operation", "x", "y", "expect"}})
                   if sequence else click_request(binding))
        result = await c.act(ctx, request)
        assert len(b.calls) == 2 and b.calls[0] == b.calls[1]
        receipt = result["verification"]["steps"][0] if sequence else result
        assert receipt["verification"]["human_yield_retried"] is True
        # The receipt shows what the yielded first attempt sent: nothing.
        assert receipt["verification"]["human_yield_first_attempt"] == {
            "reason": "human_input_overlap", "phase": "preflight", "steps_completed": 0,
            "injected": False, "motion_only": False,
        }


@pytest.mark.parametrize("sequence", [False, True])
async def test_changed_pointer_target_vetoes_the_retry(tmp_path, monkeypatch, no_yield, sequence):
    """Odin F1: no keyboard exemption for pointer actions, single or sequence."""
    from tests.test_computer_sequences_r19 import click, plan, raster
    from tests.test_computer_sequences_r19 import rig as act_rig

    async with act_rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        enduring(b, [1])
        monkeypatch.setattr("src.computer.controller.native_keyboard_focus_trusted",
                            lambda *a, **k: True, raising=False)
        monkeypatch.setattr("src.computer.sequences.native_keyboard_focus_trusted",
                            lambda *a, **k: True)

        async def perform(payload):
            state["image"] = raster((10, 10, 50, 50))  # content changed under the click
            return preflight_refusal(payload)

        b.hook = perform
        request = plan(binding, click("click")) if sequence else {**binding, **click("click")}
        result = await c.act(ctx, request)
        assert len(b.calls) == 1
        receipt = result["verification"]["steps"][0] if sequence else result
        assert receipt["verification"]["human_yield_skipped"] == "anchor_pixels"
        assert "human_yield_retried" not in receipt["verification"]


async def test_changed_incarnation_vetoes_the_retry(tmp_path, monkeypatch, no_yield):
    """Odin F2: same pixels and revision, but a replacement window."""
    from tests.test_computer_sequences_r19 import rig as act_rig

    async with act_rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        epoch = [1]
        enduring(b, epoch)

        async def perform(payload):
            epoch[0] = 2
            return preflight_refusal(payload)

        b.hook = perform
        result = await c.act(ctx, click_request(binding))
        assert len(b.calls) == 1
        assert result["execution"]["injected"] is False
        assert result["verification"]["human_yield_skipped"] == "incarnation"


async def test_later_foreign_change_inside_prior_ink_still_refuses(tmp_path, monkeypatch):
    """Odin F3: accepted ink is pixels from the checkpoint, not a standing mask."""
    from tests.test_computer_sequences_r19 import changed, click, plan, rig, stroke_dispatch

    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        async def perform(payload):
            if payload["type"] == "polyline":
                return stroke_dispatch(payload, state)
            if len(b.calls) == 2:
                with Image.open(BytesIO(state["image"])) as image:
                    ImageDraw.Draw(image).rectangle((65, 70, 95, 90), fill="red")
                    stream = BytesIO()
                    image.save(stream, "PNG")
                    state["image"] = stream.getvalue()
            return changed(payload)

        b.hook = perform
        result = await c.act(ctx, plan(
            binding,
            {"action_id": "ink", "operation": "polyline", "points": [[20, 80], [160, 80]],
             "duration": 0.1, "expect": {"type": "visual_change"}},
            click("unrelated", x=210, y=130),
            click("stale-target", x=80, y=80),
        ))
        assert len(b.calls) == 2
        assert result["reason"] == "sequence_visual_target_changed"


@pytest.mark.parametrize("raw", [REFUSED, MODIFIER_HELD])
@pytest.mark.parametrize("operation", ["replace_field", "replace_field_pixels", "focus"])
async def test_field_and_other_actions_are_never_retried(operation, raw):
    """Odin F5: capture-local handles cannot be replayed after a recapture.

    A held modifier now reaches this gate too: a field entry stays refused.
    """
    controller = ComputerController.__new__(ComputerController)
    grant = SimpleNamespace(platform="x11", environment="existing_session")
    ready = await controller._human_yield_ready(
        None, grant, None, None, None, {"operation": operation}, {}, raw,
        attached_keyboard=True,
    )
    assert not ready and ready.reason == "operation"


async def test_a_held_modifier_yields_then_typing_retries_once(tmp_path, monkeypatch, no_yield):
    from tests.test_computer_gui_actions_r5 import changed
    from tests.test_computer_sequences_r19 import rig as act_rig

    async with act_rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        enduring(b, [1])

        async def perform(payload):
            if len(b.calls) == 1:
                return {**preflight_refusal(payload), "reason": "keyboard_modifiers_busy",
                        "diagnostics": {**preflight_refusal(payload)["diagnostics"],
                                        "reason": "keyboard_modifiers_busy"}}
            return changed(payload)

        b.hook = perform
        result = await c.act(ctx, {**binding, "action_id": "type-1", "operation": "type",
                                   "text": "hello", "expect": {"type": "visual_change"}})
        assert len(b.calls) == 2 and b.calls[0] == b.calls[1]
        assert result["verification"]["human_yield_retried"] is True
        assert result["verification"]["human_yield_first_attempt"] == {
            "reason": "keyboard_modifiers_busy", "phase": "preflight", "steps_completed": 0,
            "injected": False, "motion_only": False,
        }


@pytest.mark.parametrize("sequence", [False, True])
async def test_retry_setup_failure_keeps_the_first_release(tmp_path, monkeypatch, no_yield,
                                                          sequence):
    """Odin F6: an auth failure while preparing a retry is not unknown release."""
    from src.computer.models import ComputerError
    from tests.test_computer_sequences_r19 import click, plan
    from tests.test_computer_sequences_r19 import rig as act_rig

    async with act_rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        enduring(b, [1])

        async def perform(payload):
            return preflight_refusal(payload)

        b.hook = perform
        capture = c._capture

        async def failing_capture(*args, **kwargs):
            if b.calls:
                raise ComputerError("grant_revoked")
            return await capture(*args, **kwargs)

        monkeypatch.setattr(c, "_capture", failing_capture)
        request = plan(binding, click("click")) if sequence else {**binding, **click("click")}
        try:
            await c.act(ctx, request)
        except ComputerError:
            pass
        assert len(b.calls) == 1
        assert c.store.get_session(binding["session_id"]).state != "quarantined"
        receipt = c.store.db.execute(
            "SELECT result FROM receipts WHERE action_id='click'"
        ).fetchone()
        import json
        assert json.loads(receipt[0])["execution"]["released"] is True


def validating_rig(monkeypatch, validation):
    native, helper, lease = paced_rig(monkeypatch, startup=0.0, move_latency=0.0)
    now = helper.now

    def validate(step):
        now[0] += validation

    lease.validate = validate
    return native, helper, lease


def test_paced_admission_counts_sequential_validation():
    """Odin F4: 17 vertices, 80 ms, uniform 55 ms validation never presses."""
    import pytest as _pytest

    monkeypatch = _pytest.MonkeyPatch()
    try:
        native, helper, lease = validating_rig(monkeypatch, 0.055)
        steps = guardian.input_steps(
            {"type": "polyline", "duration": 0.08, "points": [[n, 0] for n in range(17)]}, native
        )
        receipt = lease.run(steps, paced=True)
        assert receipt["reason"] == "input_dispatch_expired"
        assert not any(c["op"] == "button" for c in helper.commands)
        assert receipt["released"]
        native, helper, lease = validating_rig(monkeypatch, 0.005)
        steps = guardian.input_steps(
            {"type": "polyline", "duration": 1.0, "points": [[n, n % 3] for n in range(26)]},
            native,
        )
        receipt = lease.run(steps, paced=True)
        assert receipt["status"] == "executed"
        assert receipt["diagnostics"]["steps_completed"] == len(steps)
    finally:
        monkeypatch.undo()


def edit(state, draw):
    with Image.open(BytesIO(state["image"])) as image:
        draw(ImageDraw.Draw(image))
        stream = BytesIO()
        image.save(stream, "PNG")
        state["image"] = stream.getvalue()


async def test_reverted_checkpoint_does_not_bypass_the_reference(tmp_path, monkeypatch):
    """Odin re-review: a later revert of the plan's own ink still differs."""
    from tests.test_computer_sequences_r19 import changed, click, plan, rig, stroke_dispatch

    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        model_image = state["image"]

        async def perform(payload):
            if payload["type"] == "polyline":
                return stroke_dispatch(payload, state)
            if len(b.calls) == 2:
                state["image"] = model_image
            return changed(payload)

        b.hook = perform
        result = await c.act(ctx, plan(
            binding,
            {"action_id": "ink", "operation": "polyline", "points": [[20, 80], [160, 80]],
             "duration": 0.1, "expect": {"type": "visual_change"}},
            click("unrelated", x=210, y=130),
            click("stale-target", x=80, y=80),
        ))
        assert len(b.calls) == 2
        assert result["reason"] == "sequence_visual_target_changed"


async def test_checkpoint_does_not_launder_foreign_pixels_predating_the_stroke(tmp_path,
                                                                                monkeypatch):
    """Odin re-review F3: only the stroke's own pre/post change is accepted."""
    from tests.test_computer_sequences_r19 import changed, click, plan, rig, stroke_dispatch

    async with rig(tmp_path, monkeypatch) as (c, b, ctx, binding, state):
        model_image = state["image"]

        async def perform(payload):
            if payload["type"] == "polyline":
                return stroke_dispatch(payload, state)
            if len(b.calls) == 1:
                edit(state, lambda d: d.rectangle((75, 72, 95, 76), fill="red"))
                assert not pointer_target_stable(model_image, state["image"], 85, 74)
                assert pointer_target_stable(model_image, state["image"], 20, 80)
            return changed(payload)

        b.hook = perform
        result = await c.act(ctx, plan(
            binding,
            click("unrelated", x=210, y=130),
            {"action_id": "ink", "operation": "polyline", "points": [[20, 80], [160, 80]],
             "duration": 0.1, "expect": {"type": "visual_change"}},
            click("foreign-target", x=85, y=74),
        ))
        assert len(b.calls) == 2
        assert result["reason"] == "sequence_visual_target_changed"


def costed_rig(monkeypatch, *, identity, validation, exchange):
    """Real Guardian.run with constant native costs on every call."""
    native, helper, lease = paced_rig(monkeypatch, startup=0.0, move_latency=exchange)
    now = helper.now
    original_identity = native.identity

    def costly_identity():
        now[0] += identity
        return original_identity()

    def validate(step):
        now[0] += validation

    native.identity = costly_identity
    lease.validate = validate
    return native, helper, lease


def test_paced_admission_counts_repeated_guards(monkeypatch):
    """Odin re-review F4: 19 vertices, 0.5 s, 8 ms identity, 5 ms validate/exchange."""
    native, helper, lease = costed_rig(monkeypatch, identity=0.008, validation=0.005,
                                       exchange=0.005)
    steps = guardian.input_steps(
        {"type": "polyline", "duration": 0.5, "points": [[n, 0] for n in range(19)]}, native
    )
    receipt = lease.run(steps, paced=True)
    assert receipt["reason"] == "input_dispatch_expired"
    assert not any(c["op"] == "button" for c in helper.commands)
    assert receipt["released"]


def test_normal_paced_stroke_with_guard_costs_still_completes(monkeypatch):
    native, helper, lease = costed_rig(monkeypatch, identity=0.002, validation=0.002,
                                       exchange=0.002)
    steps = guardian.input_steps(
        {"type": "polyline", "duration": 1.0, "points": [[n, n % 3] for n in range(26)]}, native
    )
    receipt = lease.run(steps, paced=True)
    assert receipt["status"] == "executed" and receipt["released"]
    assert receipt["diagnostics"]["steps_completed"] == len(steps)
