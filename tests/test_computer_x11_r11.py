"""R11 native capability and guardian release tests; no desktop access."""
import pytest

from src.computer.runtime import x11_guardian as g
from src.computer.runtime import x11_owned_device as d
from tests.test_computer_x11_guardian_r5 import rig


@pytest.mark.parametrize("kind,button,count", [
    ("click", 1, 1), ("double_click", 1, 2), ("right_click", 3, 1),
    ("middle_click", 2, 1),
])
def test_click_variants(kind, button, count):
    steps = g.input_steps({"type": kind, "x": 10, "y": 20}, None)
    assert steps[0] == ("move", 10, 20)
    assert steps.count(("button", button, True)) == count
    assert steps.count(("button", button, False)) == count


@pytest.mark.parametrize("direction,button", [("up", 4), ("down", 5), ("left", 6), ("right", 7)])
def test_scroll(direction, button):
    steps = g.input_steps({"type": "scroll", "x": 1, "y": 2,
                           "direction": direction, "count": 20}, None)
    assert steps.count(("button", button, True)) == 20
    assert sum(s[1] for s in steps if s[0] == "wait") < 1


@pytest.mark.parametrize("count", [0, 21, True, 1.5])
def test_scroll_bound(count):
    with pytest.raises(g.GuardianFailure, match="invalid_scroll_count"):
        g.input_steps({"type": "scroll", "x": 1, "y": 2, "direction": "up", "count": count}, None)


@pytest.mark.parametrize("failure", ["none", "ack", "fence", "release"])
def test_persistent_receipt_requires_verified_ledger_and_fence(failure):
    native, helper, guardian = rig()
    native.independent_pointer = True
    native.owned_release_state = native.held
    if failure == "ack":
        def fail():
            raise g.GuardianFailure("input_helper_eof")
        helper.after_send = fail
    helper.fence_result = failure != "fence"
    native.fail_release = failure == "release"
    result = guardian.run([("button", 1, True)])
    assert result["pointer"] == "independent"
    assert result["persistent_input_devices"]
    assert result["owned_devices"] == ("persistent_idle" if failure in {"none", "ack"}
                                        else "persistent_release_unverified")


def test_unicode_keysym_conversion():
    assert d._keysym_character(0xE9) == "é"
    assert d._keysym_character(0x010003BB) == "λ"
    assert d._keysym_character(0) is None


def test_fallback_is_only_explicit_or_creation_unavailable(monkeypatch):
    def denied(name):
        raise d.HierarchyAddUnavailableError("denied")
    monkeypatch.setattr(d, "PersistentXTest", denied)
    monkeypatch.setattr(d, "ExistingXTest", lambda name: ("shared", name))
    assert d.open_input(":193") == ("shared", ":193")
    with pytest.raises(d.X11DeviceError):
        d.open_input(":193", mode="independent")
