"""Read-only discovery never publishes raced or over-budget native handles."""

from types import SimpleNamespace

import pytest

from src.computer.runtime import x11_accessibility, x11_app_scope
from src.computer.runtime import x11_attached_worker as worker
from tests.test_computer_x11_attached_worker_r10_extra import native, request  # noqa: F401


@pytest.fixture
def discovery(native, monkeypatch):  # noqa: F811 - imported pytest fixture
    state = SimpleNamespace(clock=0.0, events=[], hook=lambda phase: None, closed=0)
    original = x11_app_scope.AppScope.assert_snapshot

    def assert_snapshot(self, binding, monitor):
        state.events.append("scope")
        state.hook("scope")
        return original(self, binding, monitor)

    class Accessibility:
        def __init__(self, *args):
            pass

        def capture(self, guard):
            state.events.append("capture")
            for _ in range(337):
                guard()
            state.hook("capture")
            guard()
            return [{"handle": "original"}], "available", {"original": {"identity": "pinned"}}

        def stable(self, guard):
            state.events.append("stable")
            for _ in range(128):
                guard()
            state.hook("stable")
            guard()

        def close(self):
            state.closed += 1

    monkeypatch.setattr(x11_app_scope.AppScope, "assert_snapshot", assert_snapshot)
    monkeypatch.setattr(x11_accessibility, "AttachedAccessibility", Accessibility)
    monkeypatch.setattr(x11_accessibility, "public_nodes", lambda nodes, *args: nodes)
    monkeypatch.setattr(worker.time, "monotonic", lambda: state.clock)
    monkeypatch.setattr(worker.time, "sleep", lambda _: None)
    selected = worker.run(request())["sources"][0]
    state.run = lambda: worker.run(request("capture", selected=selected, input_enabled=True))
    return state


def test_discovery_and_stability_require_full_scope_brackets(discovery):
    reply = discovery.run()
    assert discovery.events == ["scope", "capture", "scope", "scope", "stable", "scope"]
    assert reply["accessibility_private"] == {"original": {"identity": "pinned"}}
    assert reply["accessibility"] == [{"handle": "original"}]
    assert discovery.closed == 1


@pytest.mark.parametrize("phase", ["capture", "stable"])
def test_scope_changed_during_read_rejected_not_published(native, discovery, phase):  # noqa: F811
    def change_scope(at):
        if at == phase:
            native.display.focus = (
                native.display.target
                if native.display.focus is native.display.leaf
                else native.display.leaf
            )

    discovery.hook = change_scope
    with pytest.raises(ValueError, match="application changed during capture"):
        discovery.run()
    assert discovery.closed == 3
    assert native.images == 3


@pytest.mark.parametrize("phase", ["capture", "stable"])
def test_original_one_second_deadline_still_discards_handles(discovery, phase):
    def expire(at):
        if at == phase:
            discovery.clock = 1.0

    discovery.hook = expire
    reply = discovery.run()
    assert reply["accessibility"] == []
    assert reply["accessibility_private"] == {}
    assert reply["accessibility_status"] == "unavailable"
    assert discovery.closed == 1


@pytest.mark.parametrize("failed_check", [1, 2, 3, 4])
def test_any_full_scope_assertion_failure_withholds_authority(discovery, failed_check):
    def fail(at):
        if at == "scope" and discovery.events.count("scope") == failed_check:
            raise ValueError("native scope no longer valid")

    discovery.hook = fail
    reply = discovery.run()
    assert reply["accessibility"] == []
    assert reply["accessibility_private"] == {}
    assert reply["accessibility_status"] == "unavailable"


def test_deadline_checked_after_full_scope_assertion(discovery):
    def expire(at):
        if at == "scope" and discovery.events.count("scope") == 4:
            discovery.clock = 1.0

    discovery.hook = expire
    reply = discovery.run()
    assert reply["accessibility_private"] == {}
    assert reply["accessibility"] == []


def test_final_raster_scope_comparison_still_required(native, discovery, monkeypatch):  # noqa: F811
    original = x11_app_scope.AppScope.snapshot
    count = 0

    def snapshot(self, monitor):
        nonlocal count
        count += 1
        result = original(self, monitor)
        # Initial binding plus four full assertions precede the final raster
        # comparison, which must reject even after stable() succeeded.
        if count % 6 == 0:
            return {**result, "fingerprint": "changed-at-final-read"}
        return result

    monkeypatch.setattr(x11_app_scope.AppScope, "snapshot", snapshot)
    with pytest.raises(ValueError, match="application changed during capture"):
        discovery.run()
    assert discovery.closed == 3
    assert native.images == 3
