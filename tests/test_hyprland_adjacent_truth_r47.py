"""Unique contracts for adjacent Hyprland qualification truth repairs."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUARDIAN = ROOT / "assets/hyprland-input/guardian.c"
RECEIVER = ROOT / "scripts/computer-feasibility/hyprland-wire-receiver.c"
HARNESS = ROOT / "scripts/computer-feasibility/hyprland-live-qualification.py"


def test_definitive_refusal_does_not_weaken_ambiguous_cleanup():
    source = GUARDIAN.read_text()
    assert 'if (!renew) g->arm_definitively_refused = false;' in source
    assert 'if (!renew) g->arm_definitively_refused = true;' in source
    branch = source[source.index("if (g->arm_definitively_refused)") :]
    branch = branch[: branch.index("struct scope_reply r")]
    assert 'g->release_acknowledged = false;' in branch
    assert 'g->release_ack = "not_attempted";' in branch
    assert "scope_call" not in branch
    assert "scope_bound" not in source
    assert "not_bound" not in source


def test_missing_counter_invalidates_ack_changed_counter_does_not():
    source = GUARDIAN.read_text()
    missing = source[source.index("if (ack && !r.have_rejected)") :]
    missing = missing[: missing.index("} else if")]
    assert "g->release_acknowledged = false;" in missing
    changed = source[source.index("} else if (ack && r.rejected != g->rejected)") :]
    changed = changed[: changed.index("}", 2) + 1]
    assert "g->release_acknowledged = false" not in changed
    assert 'g->scope_operation = "release_all";' in changed


def test_receiver_barrier_and_harness_ordering_contract():
    receiver = RECEIVER.read_text()
    harness = HARNESS.read_text()
    assert 'event_start("receiver_barrier")' in receiver
    assert "wl_display_sync(a->display)" in receiver
    assert "stdin=subprocess.PIPE" in harness
    assert "barrier=receiver_barrier(p,path,0)" in harness
    assert "barrier=receiver_barrier(p,path,barrier)" in harness
    assert "stale input reached receiver before drain barrier" in harness


def test_harness_preserves_unknown_release_and_exact_terminals():
    source = HARNESS.read_text()
    assert "if input_possible or self.action_submitted:" in source
    assert "guardian retained after possible input; refusing SIGKILL" in source
    assert 'result["terminal_cleanup"]=g.close_verified()' in source
    assert 'closed.get("reason")=="scope-refused"' in source
    assert 'native.get("terminal_cause")=="signal_cancel"' in source
