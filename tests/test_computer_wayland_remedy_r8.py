from src.computer.admission import CompositorIdentity
from src.computer.runtime.wayland_probe import _behavior_refusal


def test_measured_button_failure_names_defect_and_operator_fix():
    compositor = CompositorIdentity("gnome-shell", "46.0", "x11-nested", "a" * 64)
    report = _behavior_refusal(compositor, "compositor_held_button_eof_release_failed")
    assert report.state == "refused" and report.compositor == compositor
    assert "key instead of button" in report.reason
    assert "4ae305f19e391edda1aab0f9a9c47b01062f6330" in report.remedy
    assert "will not patch or restart" in report.remedy
    assert report.probe_scope == "same_stack_disposable"


def test_other_unknown_probe_failure_does_not_claim_known_defect():
    compositor = CompositorIdentity("gnome-shell", "48.7", "native", "a" * 64)
    report = _behavior_refusal(compositor, "receiver_focus_unavailable")
    assert "index defect" not in report.reason
    assert "upstream fix" not in report.remedy
    assert report.state == "refused"
