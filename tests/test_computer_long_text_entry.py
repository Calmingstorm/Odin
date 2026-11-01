"""Long text entries type across input leases, ending each between whole characters.

On 2026-11-01 Odin's replace_field_pixels into Krita's file dialog filename
field stopped after its pointer move as input_dispatch_expired, twice: 1 of 84
and 1 of 60 steps. Each key runs the guardian's full checks (about 25 ms), so
the whole entry did not fit one 1.75 s dispatch lease. Plain typing had the same
cap, failing partway through. Fake transports only.
"""

import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.computer.policy import MAX_ACTION_RPC_SECONDS, action_rpc_seconds
from src.computer.runtime import x11_guardian as g
from src.computer.runtime import x11_owned_device as devices
from src.computer.runtime.pixel_fields import pixel_field_steps
from src.computer.runtime.x11_attached import X11AttachedBackend, merge_text_receipts
from tests.test_computer_adapters_r11 import backend
from tests.test_computer_dispatch_cleanup_r19 import Helper, Native
from tests.test_computer_x11_guardian_r10_extra import native as mock_native

PREFIX = [("move", 5, 5), ("button", 1, True), ("button", 1, False), ("wait", 0.05),
          ("key", 37, True), ("key", 38, True), ("key", 38, False), ("key", 37, False)]


class Keyboard(Native):
    def __init__(self):
        super().__init__()
        self.typed = []

    def key(self, code, down):
        (self.keys.add if down else self.keys.discard)(code)
        if down and code >= 100:
            self.typed.append(code)


def chords(codes):
    return [event for code in codes for event in (("key", code, True), ("key", code, False))]


def lease(native, now, latency=0.03):
    helper = Helper(native, now, startup=0.1, move_latency=latency)
    return g.Guardian(native, helper, lambda step: None, controller_fd=None,
                      clock=lambda: now[0]), helper


@pytest.fixture
def clock(monkeypatch):
    now = [0.0]
    monkeypatch.setattr(g.time, "sleep", lambda seconds: now.__setitem__(0, now[0] + seconds))
    return now


def test_a_long_field_entry_types_every_character_once_across_leases(clock):
    """The 1-of-60 refusal: 40 characters at 30 ms a step no longer fit one lease."""
    native, codes = Keyboard(), list(range(100, 140))
    plan = PREFIX + chords(codes)
    leases = 0
    remaining = codes
    while True:
        leases += 1
        guardian, _ = lease(native, clock)
        steps = plan if leases == 1 else [("move", 5, 5)] + chords(remaining)
        receipt = guardian.run(steps, text_chords=[2] * len(remaining))
        assert receipt["status"] == "executed" and receipt["released"] is True
        assert not native.keys and not native.buttons  # every lease ends all-up
        done = receipt["text_chords_completed"]
        if not receipt["text_lease_yielded"]:
            assert done == len(remaining)
            break
        assert 0 < done < len(remaining)
        assert receipt["diagnostics"]["steps_completed"] == len(steps) - 2 * (len(remaining) - done)
        remaining = remaining[done:]
    assert leases > 1 and native.typed == codes


def test_a_long_entry_is_admitted_by_its_start(clock):
    """200 characters: the whole plan's floor estimate alone exceeds one lease."""
    native = Keyboard()
    guardian, _ = lease(native, clock, latency=0.003)
    steps = PREFIX + chords(range(100, 300))
    assert g.dispatch_budget(steps) >= g.DISPATCH_SECONDS - 0.2
    receipt = guardian.run(steps, text_chords=[2] * 200)
    assert receipt["status"] == "executed" and native.typed[:3] == [100, 101, 102]


def test_other_plans_still_need_the_whole_plan_to_fit(clock):
    """Only text can resume. A long click-then-keys plan without chords is refused."""
    native = Keyboard()
    guardian, helper = lease(native, clock)
    receipt = guardian.run(PREFIX + chords(range(100, 140)))
    assert receipt["status"] == "unknown" and receipt["reason"] == "input_dispatch_expired"
    assert receipt["diagnostics"]["steps_completed"] == 1  # the move only
    assert "text_chords_completed" not in receipt


def test_text_must_still_fit_its_start(clock):
    native = Keyboard()
    guardian, helper = lease(native, clock, latency=0.5)  # even one chord cannot fit
    receipt = guardian.run(PREFIX + chords([100, 101]), text_chords=[2, 2])
    assert receipt["reason"] == "input_dispatch_expired" and not native.typed


def test_chord_sizes_read_back_from_the_plan():
    shift_q = [("key", 50, True), ("key", 24, True), ("key", 24, False), ("key", 50, False)]
    assert g.trailing_chord_sizes(PREFIX + shift_q + chords([100]), 2) == [4, 2]
    assert g.trailing_chord_sizes(chords([100, 101]), 0) == []
    for broken in ([("move", 1, 1)], [("key", 1, False)], [("key", 2, True), ("key", 1, False)]):
        with pytest.raises(g.GuardianFailure, match="invalid_text"):
            g.trailing_chord_sizes(broken, 1)


class Keys:
    def key_plan(self, modifiers, symbol):
        return [37, 38] if symbol == "a" else [22]

    def text_keys(self, text):
        return [[100 + i] for i, _ in enumerate(text)]


def test_a_continuation_plan_types_without_clicking_or_selecting():
    region = {"x": 10, "y": 20, "width": 9, "height": 5}
    steps = pixel_field_steps({"region": region, "text": "ab", "continuation": True}, Keys(),
                              error=ValueError)
    assert steps == [("move", 14, 22)] + chords([100, 101])
    first = pixel_field_steps({"region": region, "text": "ab"}, Keys(), error=ValueError)
    assert first[1:3] == [("button", 1, True), ("button", 1, False)]
    with pytest.raises(ValueError, match="invalid_text"):
        pixel_field_steps({"region": region, "text": "", "continuation": True}, Keys(),
                          error=ValueError)


def test_execute_admits_long_text_by_its_start_and_passes_its_chords(monkeypatch):
    """512 characters once failed the whole-plan precheck before any input."""
    n, connection, scope, helper = mock_native(), Mock(), Mock(unsafe=True), Mock()
    topology = SimpleNamespace(monitors=[SimpleNamespace(x=0, y=0, width=100, height=100)])
    connection.topology.return_value = topology
    connection.named_sources.return_value = [{"index": 0}]
    helper.process.poll.return_value = None
    config = dict(display_name=":fake", xauthority=None, monitor_names=["fake"], app_profile="xed")
    for name, module in {
        "x11_attached": SimpleNamespace(
            attachment_configuration=lambda *a: config, worker_environment=lambda *a: {}),
        "x11_attached_worker": SimpleNamespace(AttachedConnection=lambda *a: connection),
        "x11_owned_device": SimpleNamespace(
            open_input=lambda *a, **k: n, UnsupportedCharacters=devices.UnsupportedCharacters,
            X11DeviceError=devices.X11DeviceError),
        "x11_app_scope": SimpleNamespace(AppScope=lambda *a: scope),
    }.items():
        monkeypatch.setitem(sys.modules, "src.computer.runtime." + name, module)
    monkeypatch.setattr(g, "InjectionHelper", lambda *a, **k: helper)
    text = "x" * 512
    monkeypatch.setattr(g, "input_steps", lambda *a: chords(range(100, 612)))
    seen = {}

    class Exerciser:
        def __init__(self, native, child, validate, **kwargs):
            pass

        def run(self, steps, *, paced=False, text_chords=()):
            seen.update(steps=len(steps), chords=list(text_chords))
            return {"status": "executed"}

    monkeypatch.setattr(g, "Guardian", Exerciser)
    g.execute(dict(config, selected={"index": 0}, scope={"rect": [0, 0, 50, 50]},
                   action={"type": "type", "text": text}, input_mode="shared",
                   expected_device_identity=[11, 12]))
    assert seen == {"steps": 1024, "chords": [2] * 512}


def receipt(status="executed", injected=True, planned=60, completed=60, yielded=None,
            done=None, phase="complete", reason="complete"):
    result = {"status": status, "injected": injected, "released": True, "reason": reason,
              "motion_only": False, "overlap_uncertain": False,
              "diagnostics": {"phase": phase, "steps_planned": planned,
                              "steps_completed": completed, "release": "confirmed",
                              "reason": reason}}
    if yielded is not None:
        result.update(text_lease_yielded=yielded, text_chords_completed=done)
    return result


def test_merged_receipt_is_one_complete_entry():
    merged = merge_text_receipts([
        receipt(planned=60, completed=28, yielded=True, done=10),
        receipt(planned=33, completed=33, yielded=False, done=16),
    ])
    assert merged["status"] == "executed" and merged["injected"] is True
    assert merged["diagnostics"]["steps_planned"] == merged["diagnostics"]["steps_completed"] == 61
    assert merged["diagnostics"]["text_leases"] == 2
    assert "text_lease_yielded" not in merged and "text_chords_completed" not in merged
    single = merge_text_receipts([receipt(yielded=False, done=26)])
    assert single == receipt()


def test_a_later_lease_refused_before_input_leaves_a_partial_entry():
    merged = merge_text_receipts([
        receipt(planned=60, completed=28, yielded=True, done=10),
        receipt(status="unavailable", injected=False, planned=33, completed=0, yielded=False,
                done=0, phase="preflight", reason="keyboard_modifiers_busy"),
    ])
    assert merged["status"] == "unknown" and merged["injected"] is True
    assert merged["reason"] == "keyboard_modifiers_busy"
    assert merged["diagnostics"]["phase"] == "dispatch"
    assert merged["diagnostics"]["steps_completed"] == 28
    assert merged["diagnostics"]["steps_planned"] == 61


def test_an_entry_that_ran_out_of_leases_is_not_complete():
    merged = merge_text_receipts([receipt(planned=60, completed=28, yielded=True, done=10)])
    assert merged["status"] == "unknown" and merged["reason"] == "input_dispatch_expired"
    assert merged["diagnostics"]["reason"] == "input_dispatch_expired"


@pytest.mark.parametrize("kind", ["type", "replace_field_pixels"])
async def test_backend_resumes_the_rest_in_fresh_leases(kind):
    b = backend()
    text = "/tmp/odin-stormy-sea-2.png"
    sent, replies = [], [receipt(planned=60, completed=28, yielded=True, done=10),
                         receipt(planned=33, completed=20, yielded=True, done=9),
                         receipt(planned=15, completed=15, yielded=False, done=7)]

    async def worker(request):
        sent.append(request["action"])
        return replies[len(sent) - 1]

    b._input_worker = worker
    request = {"action": {"type": kind, "text": text, "region": {"x": 1}}}
    merged = await b._resume_text(request, await worker(request))
    assert [a["text"] for a in sent] == [text, text[10:], text[19:]]
    assert all(a.get("continuation") is (True if kind == "replace_field_pixels" else None)
               for a in sent[1:])
    assert merged["status"] == "executed" and merged["diagnostics"]["text_leases"] == 3


async def test_backend_resumes_at_most_once_per_character_and_stops_when_paused():
    b = backend()
    calls = []

    async def worker(request):
        calls.append(request)
        left = len(request["action"]["text"])
        return receipt(planned=60, completed=4, yielded=left > 1, done=1)

    b._input_worker = worker
    request = {"action": {"type": "type", "text": "x" * 100}}
    merged = await b._resume_text(request, await worker(request))
    assert len(calls) == 100 and merged["status"] == "executed"
    b._paused, calls[:] = True, []
    merged = await b._resume_text(request, await worker(request))
    assert len(calls) == 1 and merged["status"] == "unknown"


PARAGRAPH = ("PLEASE SAVE THE FINAL EDITOR DOCUMENT BEFORE CLOSING THE WINDOW. "
             "THE RELEASE NOTES SHOULD DESCRIBE EVERY VERIFIED CHANGE CLEARLY. ")


class Shifted(Keyboard):
    """Odin's PR #753 reproducer mapping: capitals and underscore need Shift."""

    def key(self, code, down):
        (self.keys.add if down else self.keys.discard)(code)
        if down and code >= 1000:
            self.typed.append(chr(code - 1000))

    def text_keys(self, text):
        return [([50] if c.isupper() or c == "_" else []) + [1000 + ord(c)] for c in text]

    def key_plan(self, modifiers, symbol):
        return [37, 38]


class Timed(Helper):
    """Measured costs: key down 30 ms, key up 20 ms, move 25 ms, 100 ms per lease start."""

    def exchange(self, command, guard):
        self.move_latency = ((0.03 if command["args"][-1] else 0.02)
                             if command["op"] == "key" else 0.025)
        return super().exchange(command, guard)


async def entry(kind, text, clock):
    native = Shifted()
    b = X11AttachedBackend(display_name=":177", monitor_names=["fake"])
    action = {"type": kind, "text": text, "region": {"x": 10, "y": 20, "width": 20, "height": 10}}

    async def worker(request):
        act = request["action"]
        steps = (pixel_field_steps(act, native, error=ValueError) if kind != "type"
                 else [e for c in native.text_keys(act["text"]) for e in
                       [("key", k, True) for k in c] + [("key", k, False) for k in reversed(c)]])
        guardian = g.Guardian(native, Timed(native, clock, startup=0.1), lambda step: None,
                              controller_fd=None, clock=lambda: clock[0])
        result = guardian.run(steps, text_chords=g.trailing_chord_sizes(steps, len(act["text"])))
        assert not native.keys and not native.buttons
        return result

    b._input_worker = worker
    merged = await b._resume_text({"action": action}, await worker({"action": action}))
    return merged, "".join(native.typed)


async def test_a_512_character_shifted_field_value_finishes_exactly_once(clock):
    """Odin's finding 2: a 32-lease ceiling stopped this at 510 of 512."""
    text = (PARAGRAPH * 5)[:512].replace(" ", "_").replace(".", "_")
    merged, typed = await entry("replace_field_pixels", text, clock)
    assert merged["status"] == "executed" and typed == text
    assert merged["diagnostics"]["text_leases"] > 32


async def test_the_act_bound_covers_a_long_shifted_paragraph(clock):
    """Odin's finding 1: 400 capitals took 39.2 s against a 37 s allowance."""
    text = (PARAGRAPH * 4)[:400]
    merged, typed = await entry("type", text, clock)
    assert merged["status"] == "executed" and typed == text
    assert clock[0] < action_rpc_seconds({"type": "type", "text": text})


def test_act_bound_grows_with_typed_text():
    assert action_rpc_seconds({"type": "click"}) == MAX_ACTION_RPC_SECONDS
    assert action_rpc_seconds(None) == MAX_ACTION_RPC_SECONDS
    long = action_rpc_seconds({"type": "replace_field_pixels", "text": "x" * 60})
    assert long == pytest.approx(MAX_ACTION_RPC_SECONDS + 60 * 0.15)
